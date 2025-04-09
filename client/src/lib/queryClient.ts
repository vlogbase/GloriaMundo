import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Utility function to implement fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit, timeout = 30000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout exceeded. The server is taking too long to respond.');
    }
    throw error;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Determine if this is a chat API call using OpenRouter model
  // and increase timeout for specific models known to be slower
  let timeout = 30000; // default 30 second timeout
  
  // Check if this is a message API call
  if (url.includes('/conversations/') && url.includes('/messages')) {
    // Check if data contains modelType and modelId for OpenRouter
    if (data && typeof data === 'object') {
      const payload = data as any;
      
      // When using OpenRouter with specific models known to be slower, use extended timeout
      if (payload.modelType === 'openrouter') {
        // Increase timeout for OpenRouter models, especially for models known to be slower
        if (payload.modelId && (
          payload.modelId.includes('deepseek') || 
          payload.modelId.includes('llama') || 
          payload.modelId.includes('claude')
        )) {
          // Use 90-second timeout for slower models
          timeout = 90000; // 90 seconds for slower models
          console.log(`Extended timeout (90s) for slower OpenRouter model: ${payload.modelId}`);
        } else {
          // Use 60-second timeout for other OpenRouter models
          timeout = 60000; // 60 seconds for other OpenRouter models
          console.log(`Extended timeout (60s) for OpenRouter model: ${payload.modelId}`);
        }
      }
    }
  }

  const res = await fetchWithTimeout(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  }, timeout);

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetchWithTimeout(queryKey[0] as string, {
      credentials: "include",
    }, 15000); // 15 second timeout for queries

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
