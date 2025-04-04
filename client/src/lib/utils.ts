import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import Cookies from 'js-cookie';

/**
 * Combines class names using clsx and tailwind-merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date object to a time string (e.g., "11:24 AM")
 */
export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { 
    hour: "numeric", 
    minute: "2-digit" 
  });
}

/**
 * Truncate a string to a specified length
 */
export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}

/**
 * Create a debounced function that delays invoking the provided function
 * until after the specified wait time has elapsed since the last time it was invoked
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  ms = 300
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return function(this: any, ...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      fn.apply(this, args);
      timeoutId = null;
    }, ms);
  };
}

/**
 * Create a throttled function that only invokes the provided function
 * at most once per specified time interval
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  ms = 300
): (...args: Parameters<T>) => void {
  let isThrottled = false;
  let lastArgs: Parameters<T> | null = null;
  let lastThis: any = null;
  
  function wrapper(this: any, ...args: Parameters<T>) {
    if (isThrottled) {
      lastArgs = args;
      lastThis = this;
      return;
    }
    
    fn.apply(this, args);
    isThrottled = true;
    
    setTimeout(() => {
      isThrottled = false;
      
      if (lastArgs) {
        wrapper.apply(lastThis, lastArgs);
        lastArgs = null;
        lastThis = null;
      }
    }, ms);
  }
  
  return wrapper;
}

/**
 * Generate a random ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Parse error message from API response
 */
export function parseError(error: any): string {
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }
  
  if (error?.message) {
    return error.message;
  }
  
  return "An unexpected error occurred";
}

/**
 * Cookie utility functions for managing client-side storage
 */
export const cookieUtils = {
  // Set a cookie with the specified name and value
  set: (name: string, value: any, options?: Cookies.CookieAttributes) => {
    Cookies.set(name, JSON.stringify(value), {
      expires: 30, // 30 days by default
      sameSite: 'Lax',
      ...options
    });
  },
  
  // Get a cookie with the specified name
  get: <T>(name: string, defaultValue?: T): T | undefined => {
    const value = Cookies.get(name);
    if (!value) return defaultValue;
    
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`Error parsing cookie value for ${name}:`, error);
      return defaultValue;
    }
  },
  
  // Remove a cookie with the specified name
  remove: (name: string, options?: Cookies.CookieAttributes) => {
    Cookies.remove(name, options);
  }
};

/**
 * Utility to re-process Skimlinks after dynamic content is added
 * Triggers Skimlinks to process links that were added to the page after initial load
 */
export const refreshSkimlinks = (): void => {
  try {
    // Check if window is available (for SSR safety)
    if (typeof window !== 'undefined') {
      // Call the official reinitialize method if it exists
      if ((window as any).skimlinksAPI && typeof (window as any).skimlinksAPI.reprocess === 'function') {
        // Use the official reprocess method
        (window as any).skimlinksAPI.reprocess();
        console.debug('Skimlinks reprocessed successfully');
      } else if ((window as any).skimlinksAPI && typeof (window as any).skimlinksAPI.reinitialize === 'function') {
        // Fallback to reinitialize if reprocess isn't available
        (window as any).skimlinksAPI.reinitialize();
        console.debug('Skimlinks reinitialized successfully');
      } else {
        // Last resort: reload the script to process new links
        const existingScript = document.querySelector('script[src*="skimresources.com"]');
        if (existingScript) {
          existingScript.remove();
        }
        
        const skimlinksScript = document.createElement('script');
        skimlinksScript.type = 'text/javascript';
        skimlinksScript.src = 'https://s.skimresources.com/js/44501X1766367.skimlinks.js';
        skimlinksScript.async = true;
        document.body.appendChild(skimlinksScript);
        console.debug('Skimlinks script reloaded');
      }
    }
  } catch (error) {
    console.error('Error refreshing Skimlinks:', error);
  }
};
