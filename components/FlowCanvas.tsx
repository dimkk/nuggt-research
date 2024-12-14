"use client";

import React, { useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  NodeTypes,
  OnNodesChange,
  OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
  MiniMap
} from "reactflow";
import "reactflow/dist/style.css";
import dagre from "dagre";
import ExpandableNode from "@/components/ExpandableNode";
import SpreadsheetNode from "@/components/SpreadsheetNode";
import ChatbotNode from "@/components/ChatbotNode";
import { useFlowStore, FlowNode, FlowEdge, IdeaNode } from "@/storage/store";
import ContextNode from '@/components/ContextNode';

interface FlowCanvasProps {
  showFlow: boolean;
  nodes: FlowNode[];
  edges: FlowEdge[];
  ideaNodesArray: IdeaNode[];
}

const nodeTypes: NodeTypes = {
  expandable: ExpandableNode,
  spreadsheet: SpreadsheetNode,
  chatbot: ChatbotNode,
  contextNode: ContextNode,
};

const nodeWidth = 200;
const nodeHeight = 50;

const FlowCanvas: React.FC<FlowCanvasProps> = ({
  showFlow,
  nodes,
  edges,
  ideaNodesArray,
}) => {
  const {
    setNodes,
    setEdges,
    updateNodePosition,
  } = useFlowStore();

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(nodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(edges);
  const [sources, setSources] = React.useState<{ [key: string]: any }>({});

  useEffect(() => {
    setRfNodes(nodes);
  }, [nodes, setRfNodes]);

  useEffect(() => {
    setRfEdges(edges);
  }, [edges, setRfEdges]);

  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      const updatedNodes = applyNodeChanges(changes, rfNodes);
      setRfNodes(updatedNodes);
      const nonPositionChanges = changes.filter(change => change.type !== 'position');

      if (nonPositionChanges.length > 0) {
        setNodes(updatedNodes);
      }
    },
    [rfNodes, setRfNodes, setNodes]
  );

  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      const updatedEdges = applyEdgeChanges(changes, rfEdges);
      setRfEdges(updatedEdges);
      setEdges(updatedEdges);
    },
    [rfEdges, setRfEdges, setEdges]
  );

  const updateNode = (
    nodeId: string,
    updates: {
      data?: any;
      style?: any;
      type?: string;
    }
  ) => {
    useFlowStore.setState((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              ...updates.data,
            },
            style: {
              ...node.style,
              ...updates.style,
            },
            type: updates.type || node.type,
          };
        }
        return node;
      }),
    }));
  };

  const processingRef = useRef(false);

  useEffect(() => {
    const processSearches = async () => {
      if (processingRef.current) {
        return;
      }

      const pendingIdeaNodes = ideaNodesArray.filter((ideaNode) => {
        const correspondingNode = rfNodes.find((n) => n.id === ideaNode.nodeId);
        return correspondingNode?.data.status === "waiting";
      });

      if (pendingIdeaNodes.length === 0) {
        return;
      }

      processingRef.current = true;

      for (const ideaNode of pendingIdeaNodes) {
        const { nodeId, searchQuery, rootNodeId } = ideaNode;

        updateNode(nodeId, {
          data: {
            status: "researching",
            displayLabel: `Researching on ${searchQuery}`,
          },
          style: {
            backgroundColor: "#ffd699",
          },
        });

        try {
          const response = await fetch("/api/researchIdea", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ideaNode: { nodeId, searchQuery },
              rootNodeId,
            }),
          });

          if (!response.ok) {
            throw new Error("Failed to fetch node content");
          }

          const result = await response.json();
          const { response: nodeResponse } = result;

          const { bulletPoints, sources: nodeSources } = nodeResponse;

          setSources((prevSources) => ({ ...prevSources, ...nodeSources }));

          updateNode(nodeId, {
            data: {
              status: "done",
              displayLabel: searchQuery,
              content: bulletPoints,
              sources: nodeSources,
            },
            type: "expandable",
            style: {
              backgroundColor: "#ffffff",
            },
          });
        } catch (error) {
          console.error("Error processing nodeId:", nodeId, error);
          updateNode(nodeId, {
            data: {
              status: "done",
              displayLabel: searchQuery,
              content: "Failed to fetch data.",
            },
            style: {
              backgroundColor: "#ffffff",
            },
          });
        }
      }

      processingRef.current = false;
    };

    processSearches();
  }, [ideaNodesArray, rfNodes]);

  const reLayoutExpandableNodes = () => {
    const allNodes = useFlowStore.getState().nodes;
    const allEdges = useFlowStore.getState().edges;

    const expandableNodes = allNodes.filter((node) => node.type === "expandable");
    const expandableNodeIds = new Set(expandableNodes.map((n) => n.id));
    const expandableEdges = allEdges.filter(
      (edge) => expandableNodeIds.has(edge.source) && expandableNodeIds.has(edge.target)
    );

    if (expandableNodes.length === 0) return;

    const { nodes: layoutNodes } = getLayoutedElements(
      expandableNodes,
      expandableEdges,
      "LR"
    );

    const updatedNodes = allNodes.map((node) => {
      if (node.type === "expandable") {
        const ln = layoutNodes.find((layoutNode) => layoutNode.id === node.id);
        if (ln) {
          return {
            ...node,
            position: ln.position,
          };
        }
      }
      return node;
    });

    setNodes(updatedNodes);
    setRfNodes(updatedNodes);
  };

  const getLayoutedElements = (nodes: FlowNode[], edges: FlowEdge[], direction = "LR") => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    dagreGraph.setGraph({
      rankdir: direction,
      nodesep: 100,
      ranksep: 200,
      marginx: 50,
      marginy: 50,
    });

    nodes.forEach((node) => {
      dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    edges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutNodes = nodes.map((node) => {
      const nodeWithPosition = dagreGraph.node(node.id);
      return {
        ...node,
        position: {
          x: nodeWithPosition.x - nodeWidth / 2,
          y: nodeWithPosition.y - nodeHeight / 2,
        },
      };
    });

    return { nodes: layoutNodes, edges };
  };

  useEffect(() => {
    (window as any).arrangeAllExpandableNodes = reLayoutExpandableNodes;
    return () => {
      (window as any).arrangeAllExpandableNodes = null;
    };
  }, []);

  const handleNodeDragStop = useCallback(
    (event, node) => {
      updateNodePosition(node.id, node.position);
      setNodes(rfNodes);
    },
    [rfNodes, updateNodePosition, setNodes]
  );

  return (
    <>
      {showFlow && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          style={{
            width: "100%",
            height: "100%",
            position: "absolute",
            top: 0,
            left: 0,
            zIndex: 10,
          }}
        >
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onNodeDragStop={handleNodeDragStop}
            nodesDraggable={true}
            elementsSelectable={true}
            //selectNodesOnDrag={true}
            //selectionOnDrag={true}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            connectionLineType="smoothstep"
            nodeTypes={nodeTypes}
            zoomOnScroll={false}
            panOnScroll={true}
            panOnDrag={false}
          >
            <MiniMap />
            <Controls />
            <Background
              variant="dots"
              gap={12}
              size={1}
              color="#000000"
              style={{ backgroundColor: "#f3f4f6" }}
            />
          </ReactFlow>
        </motion.div>
      )}
    </>
  );
};

export default FlowCanvas;
