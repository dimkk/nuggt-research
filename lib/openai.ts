import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://bothub.chat/api/v2/openai/v1'
});

// Функция-помощник для создания чата
export const createChatCompletion = async (messages: any[]) => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages
    });
    return response;
  } catch (error) {
    console.error('Error in chat completion:', error);
    throw error;
  }
}; 