import { OpenAI } from "openai";

/**
 * Vercel serverless function to handle chat requests.
 * It acts as a secure backend proxy to an AI service.
 */
export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  // Environment variable validation
  const { API_KEY, API_BASE_URL, API_MODEL, SYSTEM_PROMPT_CONTENT } = process.env;

  if (!API_KEY || !API_BASE_URL || !API_MODEL || !SYSTEM_PROMPT_CONTENT) {
    console.error('CRITICAL: Server is not configured. Missing one or more environment variables.');
    return response.status(500).json({ error: 'Server configuration error.' });
  }

  const systemPrompt = {
    role: "system",
    content: SYSTEM_PROMPT_CONTENT.trim()
  };

  try {
    let { history } = request.body;

    if (!Array.isArray(history) || history.length === 0) {
      return response.status(400).json({ error: 'Invalid or empty conversation history.' });
    }
    
    const latestUserMessage = history[history.length - 1]?.content;
    if (typeof latestUserMessage !== 'string' || latestUserMessage.length > 8192) {
      return response.status(413).json({ error: 'Message is too long or invalid.' });
    }

    const client = new OpenAI({
      baseURL: API_BASE_URL,
      apiKey: API_KEY,
    });

    const messagesForAI = [systemPrompt, ...history];

    const completion = await client.chat.completions.create({
      model: API_MODEL,
      messages: messagesForAI,
      temperature: 0.7,
      top_p: 1,
      frequency_penalty: 0.1,
      presence_penalty: 0.1,
      extra_headers: {
        "HTTP-Referer": "https://junaid-ai.vercel.app",
        "X-Title": "Junaid AI",
      },
    });

    const aiContent = completion?.choices?.[0]?.message?.content;

    if (!aiContent) {
      console.error('AI response format error. Payload:', JSON.stringify(completion));
      throw new Error('AI returned an unexpected response format.');
    }
    
    let finalContent = aiContent;

    // --- You can add custom logic here if needed in the future ---
    // For example, adding a promotional message every 10th response.
    // const { responseCount } = request.body;
    // if (responseCount && responseCount % 10 === 0) {
    //   finalContent += `\n\nBy the way, check out my creator's work! [muhammad.junaid1](https://www.instagram.com/muhammad.junaid1)`;
    // }

    response.status(200).json({ content: finalContent });

  } catch (error) {
    console.error("Server function error:", error);
    
    let errorMessage = "An internal server error occurred. Please try again later.";
    if(error.response) {
      console.error("API Error Response:", error.response.data);
      errorMessage = "There was an issue with the AI service.";
    } else if (error.request) {
      console.error("API No Response:", error.request);
      errorMessage = "Could not connect to the AI service.";
    }

    response.status(500).json({ error: errorMessage });
  }
}