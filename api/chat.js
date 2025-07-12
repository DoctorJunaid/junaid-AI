/**
 * Vercel serverless function to handle chat requests using the Mistral AI API.
 * This version correctly replicates the behavior of a Mistral Agent by calling
 * the base model with a specific system prompt and temperature.
 */
export default async function handler(request, response) {
  // Set CORS headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  // --- Environment Variable Validation ---
  const { API_KEY, API_MODEL, AGENT_SYSTEM_PROMPT } = process.env;

  if (!API_KEY || !API_MODEL) {
    console.error('CRITICAL: Server is not configured. Missing API_KEY or API_MODEL.');
    return response.status(500).json({ error: 'Server configuration error.' });
  }

  try {
    // --- Prepare Chat History for the API ---
    const { history } = request.body;

    if (!Array.isArray(history) || history.length === 0) {
      return response.status(400).json({ error: 'Invalid or empty conversation history.' });
    }

    // Construct the message payload for the Mistral API.
    // The system prompt is passed as the first message in the array.
    const messages = [
      {
        role: 'system',
        content: AGENT_SYSTEM_PROMPT || 'You are a helpful AI assistant.' // Default fallback
      },
      ...history.filter(msg => (msg.role === 'user' || msg.role === 'assistant') && msg.content)
    ];

    if (messages.length < 2 || messages[messages.length - 1].role !== 'user') {
        return response.status(400).json({ error: 'Invalid history. Must include a system prompt and a user message.' });
    }

    // --- Call the Mistral API ---
    const apiResponse = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
            model: API_MODEL,
            messages: messages,
            temperature: 0.77 // Using the temperature from your agent's configuration
        }),
    });

    if (!apiResponse.ok) {
        const errorBody = await apiResponse.json();
        console.error("API Error:", errorBody);
        throw new Error(errorBody.message || `API responded with status ${apiResponse.status}`);
    }

    const result = await apiResponse.json();
    
    if (!result.choices || result.choices.length === 0 || !result.choices[0].message?.content) {
        console.error("Invalid response structure from API:", result);
        throw new Error('AI returned an empty or invalid response.');
    }

    const aiContent = result.choices[0].message.content;

    // --- Send the AI's Response Back to the Frontend ---
    response.status(200).json({ content: aiContent });

  } catch (error) {
    console.error("Server function error:", error);
    
    let errorMessage = "An internal server error occurred. Please try again later.";
    if (error.message?.includes('API key')) {
      errorMessage = "Authentication error with the AI service. The API key may be invalid.";
    } else if (error.message?.includes('quota')) {
      errorMessage = "The AI service quota has been exceeded. Please try again later.";
    } else {
        errorMessage = "There was an issue with the AI service. Please check the server configuration."
    }
    
    response.status(500).json({ error: errorMessage });
  }
}
