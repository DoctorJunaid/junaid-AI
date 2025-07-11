// Using the official Google AI SDK
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

/**
 * Vercel serverless function to handle chat requests using Google's Generative AI.
 * This version fixes the role mapping and chat history issues.
 */
export default async function handler(request, response) {
  // Set CORS headers to allow requests from any origin
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  // --- Environment Variable Validation ---
  const { API_KEY, API_MODEL, SYSTEM_PROMPT_CONTENT } = process.env;

  if (!API_KEY || !API_MODEL) {
    console.error('CRITICAL: Server is not configured. Missing API_KEY or API_MODEL.');
    return response.status(500).json({ error: 'Server configuration error.' });
  }

  try {
    // --- Initialize Google Generative AI Client ---
    const genAI = new GoogleGenerativeAI(API_KEY);

    // The API_MODEL variable now holds the name of the Gemini model.
    const model = genAI.getGenerativeModel({
      model: API_MODEL,
      systemInstruction: SYSTEM_PROMPT_CONTENT || "You are Junaid AI, a helpful and professional AI assistant from Pakistan.",
    });

    // --- Prepare Chat History for Gemini ---
    const { history } = request.body;

    if (!Array.isArray(history)) {
      return response.status(400).json({ error: 'Invalid or empty conversation history.' });
    }

    // Filter out any system messages from history since we use systemInstruction
    const filteredHistory = history.filter(msg => msg.role !== 'system');

    // Convert to Google's format, ensuring proper role mapping
    const googleFormatHistory = filteredHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
    }));

    // Extract the last message (should be from user)
    const userPrompt = googleFormatHistory.pop(); 
    
    if (!userPrompt || userPrompt.role !== 'user') {
        return response.status(400).json({ error: 'The last message must be from the user.' });
    }

    // --- Handle empty history case ---
    let chat;
    if (googleFormatHistory.length === 0) {
      // For the first message, start chat without history
      chat = model.startChat({
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.7,
          topP: 1,
        },
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
      });
    } else {
      // For subsequent messages, include the history
      chat = model.startChat({
        history: googleFormatHistory,
        generationConfig: {
          maxOutputTokens: 2048,
          temperature: 0.7,
          topP: 1,
        },
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ],
      });
    }

    // --- Send Message to Gemini ---
    const result = await chat.sendMessage(userPrompt.parts[0].text);
    const aiResponse = await result.response;
    const aiContent = aiResponse.text();

    if (!aiContent) {
      throw new Error('AI returned an empty or invalid response.');
    }
    
    // --- Send the AI's Response Back to the Frontend ---
    response.status(200).json({ content: aiContent });

  } catch (error) {
    console.error("Server function error:", error);
    
    // More specific error handling
    let errorMessage = "An internal server error occurred. Please try again later.";
    
    if (error.message?.includes('GoogleGenerativeAI Error')) {
      errorMessage = "There was an issue with the AI service configuration.";
    } else if (error.message?.includes('API key')) {
      errorMessage = "Authentication error with the AI service.";
    } else if (error.message?.includes('quota')) {
      errorMessage = "AI service is temporarily unavailable. Please try again later.";
    } else if (error.message?.includes('safety')) {
      errorMessage = "Your message was blocked by safety filters. Please try rephrasing.";
    }
    
    response.status(500).json({ error: errorMessage });
  }
}