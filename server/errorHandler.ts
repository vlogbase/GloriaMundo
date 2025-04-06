import { Response } from "express";

// Error categories
export enum ErrorCategory {
  // Your App Errors
  INPUT_VALIDATION = "input_validation",
  INTERNAL_SERVER = "internal_server",
  CONFIGURATION = "configuration",
  NETWORK = "network",
  
  // OpenRouter Platform Errors
  AUTHENTICATION = "authentication",
  RATE_LIMIT = "rate_limit",
  OPENROUTER_SERVER = "openrouter_server",
  BAD_REQUEST = "bad_request",
  
  // Specific LLM Errors
  MODEL_NOT_FOUND = "model_not_found",
  MODEL_TIMEOUT = "model_timeout",
  MODEL_ERROR = "model_error",
  CONTENT_MODERATION = "content_moderation",
  CONTEXT_LENGTH_EXCEEDED = "context_length_exceeded",
  
  // General error
  UNKNOWN = "unknown"
}

// Error type interface
export interface ApiError {
  status: number;
  category: ErrorCategory;
  message: string;
  userMessage: string;
  details?: any;
}

/**
 * Parse an error from the OpenRouter API response
 */
export function parseOpenRouterError(statusCode: number, errorBody: string): ApiError {
  try {
    // Check if the error body is valid JSON
    const parsedError = JSON.parse(errorBody);
    const errorObj = parsedError.error || parsedError;
    const errorType = errorObj.type || '';
    const errorMessage = errorObj.message || errorObj.error || 'Unknown error';
    
    // Categorize based on HTTP status code and error message
    if (statusCode === 401 || statusCode === 403) {
      if (errorMessage.includes('insufficient') || errorMessage.toLowerCase().includes('funds')) {
        return {
          status: statusCode,
          category: ErrorCategory.AUTHENTICATION,
          message: `Authentication failed: Insufficient funds - ${errorMessage}`,
          userMessage: "Your account has insufficient funds. Please check your OpenRouter account balance.",
          details: parsedError
        };
      }
      
      return {
        status: statusCode,
        category: ErrorCategory.AUTHENTICATION,
        message: `Authentication failed: ${errorMessage}`,
        userMessage: "Authentication failed. Please check your API key or account status.",
        details: parsedError
      };
    }
    
    if (statusCode === 429) {
      return {
        status: statusCode,
        category: ErrorCategory.RATE_LIMIT,
        message: `Rate limit exceeded: ${errorMessage}`,
        userMessage: "You've reached the rate limit for API requests. Please try again in a few moments.",
        details: parsedError
      };
    }
    
    if (statusCode >= 500) {
      return {
        status: statusCode,
        category: ErrorCategory.OPENROUTER_SERVER,
        message: `OpenRouter server error: ${errorMessage}`,
        userMessage: "The service is currently experiencing issues. Please try again later.",
        details: parsedError
      };
    }
    
    // Handle specific LLM errors based on the error message
    const lowerCaseMessage = errorMessage.toLowerCase();
    
    if (lowerCaseMessage.includes('not found') || lowerCaseMessage.includes('unavailable')) {
      return {
        status: statusCode,
        category: ErrorCategory.MODEL_NOT_FOUND,
        message: `Model not found or unavailable: ${errorMessage}`,
        userMessage: "The selected AI model is currently unavailable. Please try another model.",
        details: parsedError
      };
    }
    
    if (lowerCaseMessage.includes('timeout')) {
      return {
        status: statusCode,
        category: ErrorCategory.MODEL_TIMEOUT,
        message: `Model timeout: ${errorMessage}`,
        userMessage: "The AI model took too long to respond. Please try a simpler query or a different model.",
        details: parsedError
      };
    }
    
    if (lowerCaseMessage.includes('content') && (lowerCaseMessage.includes('filter') || lowerCaseMessage.includes('moderation') || lowerCaseMessage.includes('policy'))) {
      return {
        status: statusCode,
        category: ErrorCategory.CONTENT_MODERATION,
        message: `Content moderation: ${errorMessage}`,
        userMessage: "Your request was flagged by content moderation systems. Please revise your input and try again.",
        details: parsedError
      };
    }
    
    if (lowerCaseMessage.includes('context') && lowerCaseMessage.includes('length')) {
      return {
        status: statusCode,
        category: ErrorCategory.CONTEXT_LENGTH_EXCEEDED,
        message: `Context length exceeded: ${errorMessage}`,
        userMessage: "Your conversation is too long for this model's capacity. Try starting a new conversation or using a model with a larger context window.",
        details: parsedError
      };
    }
    
    if (statusCode === 400) {
      return {
        status: statusCode,
        category: ErrorCategory.BAD_REQUEST,
        message: `Bad request to OpenRouter: ${errorMessage}`,
        userMessage: "There was an issue with the request format. Please try again with different parameters.",
        details: parsedError
      };
    }
    
    // Default error case
    return {
      status: statusCode,
      category: ErrorCategory.UNKNOWN,
      message: `OpenRouter error: ${errorMessage}`,
      userMessage: "An unexpected error occurred. Please try again or select a different model.",
      details: parsedError
    };
    
  } catch (e) {
    // Failed to parse JSON error response
    console.error("Failed to parse OpenRouter error response:", e);
    
    // Return a generic error based on status code
    if (statusCode === 401 || statusCode === 403) {
      return {
        status: statusCode,
        category: ErrorCategory.AUTHENTICATION,
        message: `Authentication failed with status ${statusCode}`,
        userMessage: "Authentication failed. Please check your API key."
      };
    } else if (statusCode === 429) {
      return {
        status: statusCode,
        category: ErrorCategory.RATE_LIMIT,
        message: `Rate limit exceeded with status ${statusCode}`,
        userMessage: "Rate limit exceeded. Please try again in a few moments."
      };
    } else if (statusCode >= 500) {
      return {
        status: statusCode,
        category: ErrorCategory.OPENROUTER_SERVER,
        message: `OpenRouter server error ${statusCode}`,
        userMessage: "The service is currently experiencing issues. Please try again later."
      };
    } else {
      return {
        status: statusCode,
        category: ErrorCategory.UNKNOWN,
        message: `Unknown error with status ${statusCode}: ${errorBody}`,
        userMessage: "An unexpected error occurred. Please try again or select a different model."
      };
    }
  }
}

/**
 * Handle internal application errors
 */
export function handleInternalError(error: any, provider: string = "application"): ApiError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerCaseMessage = errorMessage.toLowerCase();
  
  // Categorize internal errors
  if (lowerCaseMessage.includes('network') || lowerCaseMessage.includes('connection') || lowerCaseMessage.includes('socket')) {
    return {
      status: 500,
      category: ErrorCategory.NETWORK,
      message: `Network error connecting to ${provider}: ${errorMessage}`,
      userMessage: "A network error occurred while connecting to the AI service. Please check your connection and try again."
    };
  }
  
  if (lowerCaseMessage.includes('timeout')) {
    return {
      status: 504,
      category: ErrorCategory.MODEL_TIMEOUT,
      message: `Request timed out: ${errorMessage}`,
      userMessage: "The request to the AI service timed out. Please try again with a simpler query."
    };
  }
  
  if (lowerCaseMessage.includes('validation') || lowerCaseMessage.includes('invalid')) {
    return {
      status: 400,
      category: ErrorCategory.INPUT_VALIDATION,
      message: `Validation error: ${errorMessage}`,
      userMessage: "Your input contains invalid data. Please check and try again."
    };
  }
  
  if (lowerCaseMessage.includes('api key') || lowerCaseMessage.includes('authentication') || lowerCaseMessage.includes('auth')) {
    return {
      status: 500,
      category: ErrorCategory.CONFIGURATION,
      message: `Configuration error: ${errorMessage}`,
      userMessage: "There's an issue with the API configuration. Please try a different model or contact support."
    };
  }
  
  // Default internal error
  return {
    status: 500,
    category: ErrorCategory.INTERNAL_SERVER,
    message: `Internal server error: ${errorMessage}`,
    userMessage: "An unexpected error occurred in the server. Please try again later."
  };
}

/**
 * Get a user-friendly message based on error category
 */
export function getUserMessageForCategory(category: ErrorCategory, modelType: string = "AI"): string {
  switch (category) {
    case ErrorCategory.NETWORK:
      return "There seems to be a network issue. Please check your connection and try again.";
      
    case ErrorCategory.AUTHENTICATION:
      return "There might be an issue with your account or API key. Please try a different model or check your account status.";
      
    case ErrorCategory.RATE_LIMIT:
      return "The rate limit has been exceeded. Please try again in a few moments or select a different model.";
      
    case ErrorCategory.OPENROUTER_SERVER:
    case ErrorCategory.INTERNAL_SERVER:
      return "The service is currently experiencing issues. Please try again later.";
      
    case ErrorCategory.MODEL_NOT_FOUND:
      return "The selected AI model is currently unavailable. Please try another model.";
      
    case ErrorCategory.MODEL_TIMEOUT:
      return "The AI model took too long to respond. Please try a simpler query or a different model.";
      
    case ErrorCategory.CONTENT_MODERATION:
      return "Your request was flagged by content moderation systems. Please revise your input and try again.";
      
    case ErrorCategory.CONTEXT_LENGTH_EXCEEDED:
      return "Your conversation is too long for this model's capacity. Try starting a new conversation or using a model with a larger context window.";
      
    case ErrorCategory.INPUT_VALIDATION:
      return "The request contains invalid data. Please try again with different parameters.";
      
    case ErrorCategory.CONFIGURATION:
      return "There's an issue with the service configuration. Please try a different model or contact support.";
      
    case ErrorCategory.MODEL_ERROR:
      return `The ${modelType} model encountered an internal error. Please try again or select a different model.`;
      
    case ErrorCategory.BAD_REQUEST:
      return "There was an issue with the request format. Please try again with different parameters.";
      
    case ErrorCategory.UNKNOWN:
    default:
      return "An unexpected error occurred. Please try again or select a different model.";
  }
}

/**
 * Send a standardized error response
 */
export function sendErrorResponse(res: Response, apiError: ApiError): void {
  // Log the detailed error message for debugging
  console.error(`[${apiError.category}] ${apiError.message}`, apiError.details || '');
  
  // Send a user-friendly response
  res.status(apiError.status).json({
    error: true,
    category: apiError.category,
    message: apiError.userMessage,
    status: apiError.status,
    // Include technical details in non-production environments
    ...(process.env.NODE_ENV !== 'production' && { 
      technicalDetails: apiError.message,
      details: apiError.details
    })
  });
}