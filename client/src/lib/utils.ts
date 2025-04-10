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
 * 
 * This enhanced version ensures Skimlinks is reprocessing links even when 
 * new content is dynamically added to the page, especially AI-generated content
 */
export const refreshSkimlinks = (): void => {
  try {
    // Check if window is available (for SSR safety)
    if (typeof window === 'undefined') return;
    
    // Initialize our API object if it doesn't exist
    window.skimlinksAPI = window.skimlinksAPI || {};
    
    // Ensure Skimlinks is loaded
    const ensureSkimlinksLoaded = (): Promise<void> => {
      return new Promise((resolve) => {
        // If Skimlinks is already loaded via the global window.__SKIMLINKS_INITIALIZED__ flag
        if ((window as any).__SKIMLINKS_INITIALIZED__) {
          resolve();
          return;
        }
        
        // Check if skimlinks script exists but hasn't fully initialized
        const existingScript = document.querySelector('script[src*="skimresources.com"]');
        if (existingScript) {
          // Poll for Skimlinks initialization
          const checkInterval = setInterval(() => {
            if ((window as any).__SKIMLINKS_INITIALIZED__) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 200);
          
          // Set a timeout in case it never initializes
          setTimeout(() => {
            clearInterval(checkInterval);
            // Load it anyway
            loadSkimlinks().then(resolve);
          }, 3000);
        } else {
          // No script exists, load it
          loadSkimlinks().then(resolve);
        }
      });
    };
    
    // Function to load the Skimlinks script
    const loadSkimlinks = (): Promise<void> => {
      return new Promise((resolve) => {
        // Remove any existing script to avoid duplicates
        const existingScript = document.querySelector('script[src*="skimresources.com"]');
        if (existingScript) {
          existingScript.remove();
        }
        
        // Create and append the script
        const skimlinksScript = document.createElement('script');
        skimlinksScript.type = 'text/javascript';
        skimlinksScript.src = 'https://s.skimresources.com/js/44501X1766367.skimlinks.js';
        skimlinksScript.async = true;
        
        // Resolve when loaded
        skimlinksScript.onload = () => {
          console.debug('Skimlinks script loaded successfully');
          resolve();
        };
        
        // Resolve even if there's an error, to avoid hanging
        skimlinksScript.onerror = () => {
          console.error('Failed to load Skimlinks script');
          resolve();
        };
        
        document.body.appendChild(skimlinksScript);
      });
    };
    
    // Main execution - ensures Skimlinks is loaded then attempts to reprocess links
    ensureSkimlinksLoaded().then(() => {
      try {
        // First try the official global skimlinks object
        if ((window as any).SKIMLINKS && typeof (window as any).SKIMLINKS.reprocess === 'function') {
          (window as any).SKIMLINKS.reprocess();
          console.debug('Skimlinks reprocessed via global SKIMLINKS object');
          return;
        }
        
        // Then try our custom API methods that might have been defined
        if ((window as any).skimlinksAPI) {
          if (typeof (window as any).skimlinksAPI.reprocess === 'function') {
            (window as any).skimlinksAPI.reprocess();
            console.debug('Skimlinks reprocessed via skimlinksAPI.reprocess');
            return;
          }
          
          if (typeof (window as any).skimlinksAPI.reinitialize === 'function') {
            (window as any).skimlinksAPI.reinitialize();
            console.debug('Skimlinks reinitialized via skimlinksAPI.reinitialize');
            return;
          }
        }
        
        // Last resort - trigger Skimlinks by simulating a DOM mutation event
        // This often causes Skimlinks to scan for new links
        const tempDiv = document.createElement('div');
        tempDiv.style.display = 'none';
        tempDiv.innerHTML = '<a href="https://example.com">trigger skimlinks</a>';
        document.body.appendChild(tempDiv);
        setTimeout(() => {
          document.body.removeChild(tempDiv);
        }, 500);
        
        console.debug('Attempted to trigger Skimlinks via DOM mutation');
      } catch (innerError) {
        console.error('Error invoking Skimlinks methods:', innerError);
      }
    });
  } catch (error) {
    console.error('Error refreshing Skimlinks:', error);
  }
};
