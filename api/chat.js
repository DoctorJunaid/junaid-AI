/**
 * Vercel serverless function to handle chat requests using a generic AI API.
 * This version abstracts away specific provider details (like Mistral)
 * and relies on generic environment variables for configuration.
 */
export default async function handler(request, response) {
  // Set CORS headers to allow requests from any origin
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests for CORS
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  // --- Generic Environment Variable Validation ---
  // These are configured on the server (e.g., Vercel dashboard).
  const { API_KEY, API_MODEL, API_ENDPOINT } = process.env;

  if (!API_KEY || !API_MODEL || !API_ENDPOINT) {
    console.error('CRITICAL: Server is not configured. Missing API_KEY, API_MODEL, or API_ENDPOINT.');
    return response.status(500).json({ error: 'Server configuration error.' });
  }

  try {
    // --- Prepare Chat History for the API ---
    const { history } = request.body;

    if (!Array.isArray(history) || history.length === 0) {
      return response.status(400).json({ error: 'Invalid or empty conversation history.' });
    }

    // The message format is standard for many chat completion APIs.
    const messages = history
        .filter(msg => (msg.role === 'user' || msg.role === 'assistant') && msg.content)
        .map(msg => ({
            role: msg.role,
            content: msg.content
        }));

    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
        return response.status(400).json({ error: 'The last message must be a valid prompt from the user.' });
    }

    // --- Call the configured AI API ---
    const apiResponse = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
            model: API_MODEL,
            messages: messages,
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
