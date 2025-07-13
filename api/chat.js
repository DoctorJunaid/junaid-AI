/**
 * Vercel serverless function to handle chat requests using the Mistral AI API with streaming.
 * This version is required for the interactive features of the frontend to work correctly.
 * v1.1 - Adds sanitization to prevent 422 errors.
 */

// We are using the Edge runtime for best performance with streaming.
export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  // Handle preflight requests for CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }
  
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
        status: 405, 
        headers: { 'Access-Control-Allow-Origin': '*' } 
    });
  }

  try {
    const { history } = await request.json();

    if (!Array.isArray(history)) {
      return new Response(JSON.stringify({ error: 'Invalid or empty conversation history.' }), { 
          status: 400,
          headers: { 'Access-Control-Allow-Origin': '*' } 
        });
    }

    const { API_KEY, API_MODEL, AGENT_SYSTEM_PROMPT } = process.env;

    if (!API_KEY || !API_MODEL) {
      console.error('CRITICAL: Server is not configured. Missing API_KEY or API_MODEL.');
      return new Response(JSON.stringify({ error: 'Server configuration error.' }), { 
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
    }

    // **FIX:** Sanitize the history to ensure only 'role' and 'content' are sent to the API.
    const sanitizedHistory = history.map(({ role, content }) => ({
        role,
        content
    }));

    // Construct the message payload for the Mistral API.
    const messages = [
      { role: 'system', content: AGENT_SYSTEM_PROMPT || 'You are a helpful AI assistant.' },
      ...sanitizedHistory,
    ];

    const payload = {
      model: API_MODEL,
      messages: messages,
      temperature: 0.7,
      stream: true, // Enable streaming
    };

    const apiResponse = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!apiResponse.ok) {
        // Mistral API might not return JSON for all errors, so we handle both cases.
        let errorBody;
        try {
            errorBody = await apiResponse.json();
        } catch (e) {
            errorBody = { message: await apiResponse.text() };
        }
        console.error("API Error:", errorBody);
        throw new Error(errorBody.message || `API responded with status ${apiResponse.status}`);
    }

    // Create a ReadableStream to pipe the response to the client.
    const stream = new ReadableStream({
      async start(controller) {
        const reader = apiResponse.body.getReader();
        const decoder = new TextDecoder();

        function push() {
          reader.read().then(({ done, value }) => {
            if (done) {
              controller.close();
              return;
            }
            // The response from Mistral comes in chunks. We process each line.
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(line => line.trim() !== '');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.substring(6);
                    if (data.trim() === '[DONE]') {
                        // End of stream signal from the API
                        continue;
                    }
                    try {
                        const json = JSON.parse(data);
                        const content = json.choices[0]?.delta?.content;
                        if (content) {
                            // Send just the content chunk to the client
                            controller.enqueue(new TextEncoder().encode(content));
                        }
                    } catch (e) {
                        console.error('Error parsing stream data:', e);
                    }
                }
            }
            push();
          }).catch(err => {
            console.error('Stream reading error:', err);
            controller.error(err);
          });
        }
        push();
      },
    });

    return new Response(stream, {
      headers: { 
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      },
    });

  } catch (error) {
    console.error("Server function error:", error);
    return new Response(JSON.stringify({ error: error.message || 'An internal server error occurred.' }), { 
        status: 500,
        headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });
  }
}
