// Using the official Google AI SDK
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

/**
 * Vercel serverless function to handle chat requests using Google's Generative AI.
 * This version includes a more robust, defensive fix for chat history validation.
 */
export default async function handler(request, response) {
  // Set CORS headers to allow requests from any origin
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests for CORS
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
    const model = genAI.getGenerativeModel({
      model: API_MODEL,
      systemInstruction: SYSTEM_PROMPT_CONTENT || "You are Junaid AI, a helpful and professional AI assistant from Pakistan.",
    });

    // --- Prepare and Sanitize Chat History for Gemini ---
    const { history } = request.body;

    if (!Array.isArray(history) || history.length === 0) {
      return response.status(400).json({ error: 'Invalid or empty conversation history.' });
    }

    // The last message in the history is the current user prompt.
    const currentUserPrompt = history.pop();

    if (!currentUserPrompt || currentUserPrompt.role !== 'user' || !currentUserPrompt.content) {
        return response.status(400).json({ error: 'The last message must be a valid prompt from the user.' });
    }

    // The rest of the array is the chat history for the session.
    // Convert it to the format Google's SDK expects.
    const conversationHistory = history
        .filter(msg => (msg.role === 'user' || msg.role === 'assistant') && msg.content)
        .map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

    // --- **ULTRA-ROBUST HISTORY SANITIZATION** ---
    // This logic rebuilds the history from scratch to guarantee correctness.
    const sanitizedHistory = [];
    let foundFirstUser = false;
    
    for (const msg of conversationHistory) {
        // We must skip any leading 'model' messages.
        if (!foundFirstUser && msg.role === 'user') {
            foundFirstUser = true;
        }

        // Once we've found the first user message, we can start building.
        if (foundFirstUser) {
            // Ensure roles alternate. If the current message has the same role as the last one, skip it.
            if (sanitizedHistory.length === 0 || msg.role !== sanitizedHistory[sanitizedHistory.length - 1].role) {
                sanitizedHistory.push(msg);
            }
        }
    }
    
    // --- Create Chat Session ---
    const chat = model.startChat({
      history: sanitizedHistory, // Use the fully sanitized history
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

    // --- Send Message to Gemini ---
    const result = await chat.sendMessage(currentUserPrompt.content);
    const aiResponse = await result.response;
    const aiContent = aiResponse.text();

    if (!aiContent) {
      throw new Error('AI returned an empty or invalid response.');
    }
    
    // --- Send the AI's Response Back to the Frontend ---
    response.status(200).json({ content: aiContent });

  } catch (error) {
    console.error("Server function error:", error);
    
    // Provide more specific and helpful error messages to the client
    let errorMessage = "An internal server error occurred. Please try again later.";
    if (error.message?.includes('GoogleGenerativeAI')) {
      errorMessage = "There was an issue with the AI service. Please check the server configuration.";
    } else if (error.message?.includes('API key')) {
      errorMessage = "Authentication error with the AI service. The API key may be invalid.";
    } else if (error.message?.includes('quota')) {
      errorMessage = "The AI service quota has been exceeded. Please try again later.";
    } else if (error.message?.includes('safety')) {
      errorMessage = "Your message was blocked by the AI's safety filters. Please rephrase your prompt.";
    }
    
    response.status(500).json({ error: errorMessage });
  }
}
