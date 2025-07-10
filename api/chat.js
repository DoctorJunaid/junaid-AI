import { OpenAI } from "openai";

/**
 * Vercel serverless function to handle chat requests.
 * It acts as a secure backend proxy to an AI service.
 */
export default async function handler(request, response) {
  // Enforce that only POST requests are accepted.
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  // --- START DEBUGGING ---
  // The following lines will print the status of your environment variables
  // to the Vercel logs for you to inspect.
  console.log("--- Checking Environment Variables ---");
  console.log(`API_KEY is present: ${!!process.env.API_KEY}`);
  console.log(`API_BASE_URL is present: ${!!process.env.API_BASE_URL}`);
  console.log(`API_MODEL is present: ${!!process.env.API_MODEL}`);
  const promptContent = process.env.SYSTEM_PROMPT_CONTENT;
  console.log(`SYSTEM_PROMPT_CONTENT is present: ${!!promptContent}`);
  if (promptContent) {
    console.log(`SYSTEM_PROMPT_CONTENT length: ${promptContent.length}`);
  }
  console.log("------------------------------------");
  // --- END DEBUGGING ---

  // Load API configuration securely from environment variables.
  const apiKey = process.env.API_KEY;
  const apiBaseURL = process.env.API_BASE_URL;
  const modelName = process.env.API_MODEL;
  const systemPromptContent = process.env.SYSTEM_PROMPT_CONTENT;

  // Verify that all required environment variables are set.
  if (!apiKey || !apiBaseURL || !modelName || !systemPromptContent) {
    console.error('CRITICAL: Server is not configured. Missing one or more environment variables.');
    return response.status(500).json({ error: 'Server configuration error.' });
  }

  // Construct the system prompt object for the AI model.
  const systemPrompt = {
    role: "system",
    content: systemPromptContent.trim()
  };

  try {
    // Extract conversation history from the request body.
    let { history, responseCount } = request.body;
    if (!Array.isArray(history)) {
      history = [];
    }

    // Basic security measure to prevent overly long messages.
    const latestUserMessage = history[history.length - 1]?.content;
    if (latestUserMessage && latestUserMessage.length > 4096) {
      return response.status(413).json({ error: 'Message is too long.' });
    }

    // Initialize the OpenAI client with the specified configuration.
    const client = new OpenAI({
      baseURL: apiBaseURL,
      apiKey: apiKey,
    });

    // Combine the system prompt with the ongoing conversation history.
    const messagesForAI = [
      systemPrompt,
      ...history
    ];

    // Send the request to the AI model.
    const completion = await client.chat.completions.create({
      model: modelName,
      messages: messagesForAI,
      extra_headers: {
        "HTTP-Referer": "https://junaid-ai.example.com", // Changed to Junaid AI
        "X-Title": "Junaid AI", // Changed from Jaweria AI
      },
    });

    // Safely extract the AI's response content.
    const aiContent = completion?.choices?.[0]?.message?.content;
    if (!aiContent) {
      throw new Error('AI returned an unexpected response format.');
    }

    // Append additional content based on custom logic.
    let finalContent = aiContent;
    if (responseCount && responseCount % 9 === 0) {
      finalContent += `

By the way, agar aap meri creator ko follow karna chahtay hain: https://www.instagram.com/muhammad.junaid1 , `;
      // Updated Instagram handle — change to your actual one
    }

    // Send the final response back to the client.
    response.status(200).json({ content: finalContent });

  } catch (error) {
    // Log the full error on the server for debugging purposes.
    console.error("Server function error:", error);
    // Respond to the client with a generic error message.
    response.status(500).json({ error: "An internal server error occurred. Please try again later." });
  }
}
