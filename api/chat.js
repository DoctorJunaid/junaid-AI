/**
 * Enhanced Vercel serverless function for professional AI chat handling
 * Includes robust error handling, security, rate limiting, and monitoring
 * v2.0 - Professional edition with comprehensive improvements
 */

export const config = {
  runtime: 'edge',
  maxDuration: 30,
};

// Security headers for production
const SECURITY_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGINS || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

// Rate limiting configuration
const RATE_LIMIT = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max requests per window
};

// Input validation and sanitization
function validateAndSanitizeInput(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid request body');
  }

  const { history, model, temperature, maxTokens } = data;

  // Validate conversation history
  if (!Array.isArray(history)) {
    throw new Error('History must be an array');
  }

  if (history.length > 50) {
    throw new Error('Conversation history too long (max 50 messages)');
  }

  // Validate and sanitize each message
  const sanitizedHistory = history.map((msg, index) => {
    if (!msg || typeof msg !== 'object') {
      throw new Error(`Invalid message at index ${index}`);
    }

    const { role, content } = msg;

    // Validate role
    if (!['user', 'assistant', 'system'].includes(role)) {
      throw new Error(`Invalid role "${role}" at index ${index}`);
    }

    // Validate content
    if (typeof content !== 'string') {
      throw new Error(`Invalid content type at index ${index}`);
    }

    // Sanitize content (remove potential script tags and limit length)
    const sanitizedContent = content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .substring(0, 4000); // Limit message length

    if (sanitizedContent.length === 0) {
      throw new Error(`Empty content at index ${index}`);
    }

    return { role, content: sanitizedContent };
  });

  // Validate optional parameters
  const validatedModel = model && typeof model === 'string' ? model : null;
  const validatedTemperature = temperature && typeof temperature === 'number' && temperature >= 0 && temperature <= 2 ? temperature : 0.7;
  const validatedMaxTokens = maxTokens && typeof maxTokens === 'number' && maxTokens > 0 && maxTokens <= 4000 ? maxTokens : 2000;

  return {
    history: sanitizedHistory,
    model: validatedModel,
    temperature: validatedTemperature,
    maxTokens: validatedMaxTokens,
  };
}

// Enhanced error handling
function createErrorResponse(error, statusCode = 500) {
  const isProduction = process.env.NODE_ENV === 'production';
  
  const errorResponse = {
    error: true,
    message: error.message || 'An internal server error occurred',
    timestamp: new Date().toISOString(),
    ...(isProduction ? {} : { stack: error.stack }),
  };

  return new Response(JSON.stringify(errorResponse), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...SECURITY_HEADERS,
    },
  });
}

// API client with retry logic
async function callMistralAPI(payload, retryCount = 0) {
  const maxRetries = 3;
  const baseDelay = 1000;

  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.API_KEY}`,
        'User-Agent': 'JunaidAI/2.0',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'API request failed' }));
      
      // Handle rate limiting with exponential backoff
      if (response.status === 429 && retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        return callMistralAPI(payload, retryCount + 1);
      }

      throw new Error(`API Error (${response.status}): ${errorData.message || 'Unknown error'}`);
    }

    return response;
  } catch (error) {
    if (retryCount < maxRetries && error.name !== 'AbortError') {
      const delay = baseDelay * Math.pow(2, retryCount);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callMistralAPI(payload, retryCount + 1);
    }
    throw error;
  }
}

// Simple rate limiting (in-memory for Edge runtime)
const requestCounts = new Map();

function isRateLimited(clientId) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT.windowMs;
  
  // Clean old entries
  for (const [id, requests] of requestCounts.entries()) {
    const filteredRequests = requests.filter(time => time > windowStart);
    if (filteredRequests.length === 0) {
      requestCounts.delete(id);
    } else {
      requestCounts.set(id, filteredRequests);
    }
  }

  // Check current client
  const clientRequests = requestCounts.get(clientId) || [];
  const recentRequests = clientRequests.filter(time => time > windowStart);
  
  if (recentRequests.length >= RATE_LIMIT.max) {
    return true;
  }

  // Add current request
  recentRequests.push(now);
  requestCounts.set(clientId, recentRequests);
  
  return false;
}

// Main handler
export default async function handler(request) {
  const startTime = Date.now();
  
  try {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: SECURITY_HEADERS,
      });
    }

    // Only allow POST requests
    if (request.method !== 'POST') {
      return createErrorResponse(new Error('Method not allowed'), 405);
    }

    // Get client IP for rate limiting
    const clientIP = request.headers.get('CF-Connecting-IP') || 
                     request.headers.get('X-Forwarded-For') || 
                     request.headers.get('X-Real-IP') || 
                     'unknown';

    // Check rate limiting
    if (isRateLimited(clientIP)) {
      return createErrorResponse(new Error('Rate limit exceeded'), 429);
    }

    // Validate environment variables
    const { API_KEY, API_MODEL, AGENT_SYSTEM_PROMPT } = process.env;
    
    if (!API_KEY) {
      console.error('CRITICAL: API_KEY environment variable is not set');
      return createErrorResponse(new Error('Server configuration error'), 500);
    }

    if (!API_MODEL) {
      console.error('CRITICAL: API_MODEL environment variable is not set');
      return createErrorResponse(new Error('Server configuration error'), 500);
    }

    // Parse and validate request body
    let requestData;
    try {
      requestData = await request.json();
    } catch (error) {
      return createErrorResponse(new Error('Invalid JSON in request body'), 400);
    }

    // Validate and sanitize input
    const { history, model, temperature, maxTokens } = validateAndSanitizeInput(requestData);

    // Construct messages for API
    const messages = [
      { 
        role: 'system', 
        content: AGENT_SYSTEM_PROMPT || 'You are Junaid AI, a professional Pakistani AI assistant. Provide helpful, accurate, and culturally appropriate responses.' 
      },
      ...history,
    ];

    // Prepare API payload
    const payload = {
      model: model || API_MODEL,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
      safe_prompt: true, // Enable safety features
    };

    // Call Mistral API
    const apiResponse = await callMistralAPI(payload);

    // Create streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const reader = apiResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
              if (!line.trim()) continue;
              
              if (line.startsWith('data: ')) {
                const data = line.substring(6);
                
                if (data.trim() === '[DONE]') {
                  controller.close();
                  return;
                }

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content;
                  
                  if (content) {
                    // Additional content filtering for safety
                    const filteredContent = content
                      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                      .replace(/javascript:/gi, '');
                    
                    if (filteredContent) {
                      controller.enqueue(new TextEncoder().encode(filteredContent));
                    }
                  }
                } catch (parseError) {
                  console.error('Error parsing stream data:', parseError);
                  // Continue processing other chunks
                }
              }
            }
          }
        } catch (streamError) {
          console.error('Stream processing error:', streamError);
          controller.error(streamError);
        } finally {
          reader.releaseLock();
        }
      },
    });

    // Log successful request (for monitoring)
    const processingTime = Date.now() - startTime;
    console.log(`Chat request processed successfully in ${processingTime}ms for IP: ${clientIP}`);

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Processing-Time': `${processingTime}ms`,
        ...SECURITY_HEADERS,
      },
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`Chat request failed after ${processingTime}ms:`, error);
    
    // Handle specific error types
    if (error.name === 'AbortError') {
      return createErrorResponse(new Error('Request timeout'), 408);
    }

    if (error.message.includes('API Error (429)')) {
      return createErrorResponse(new Error('API rate limit exceeded. Please try again later.'), 429);
    }

    if (error.message.includes('API Error (401)')) {
      return createErrorResponse(new Error('Authentication failed'), 401);
    }

    return createErrorResponse(error, 500);
  }
}
