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
export const refreshSkimlinks = (options: {
  forceReload?: boolean;
  debug?: boolean;
} = {}): void => {
  const { forceReload = false, debug = false } = options;
  const log = debug ? console.log : console.debug;
  
  try {
    // Check if window is available (for SSR safety)
    if (typeof window === 'undefined') return;
    
    log('Refreshing Skimlinks...');
    
    // 1. Check if Skimlinks API is available
    const skimlinksAvailable = typeof (window as any).skimlinksAPI !== 'undefined';
    log('Skimlinks API available:', skimlinksAvailable);
    
    // 2. If requested or API not available, reload the script
    if (forceReload || !skimlinksAvailable) {
      log('Reloading Skimlinks script...');
      
      // Remove existing script(s) if present
      const existingScripts = document.querySelectorAll('script[src*="skimresources.com"]');
      existingScripts.forEach(script => {
        log('Removing existing script:', script);
        script.remove();
      });
      
      // Create and add fresh script
      const skimlinksScript = document.createElement('script');
      skimlinksScript.id = 'skimlinks-script';
      skimlinksScript.type = 'text/javascript';
      skimlinksScript.src = 'https://s.skimresources.com/js/44501X1766367.skimlinks.js';
      skimlinksScript.async = true;
      
      // Add data attribute to help with debugging
      skimlinksScript.setAttribute('data-loaded-at', new Date().toISOString());
      
      // Insert script before end of body for optimal load timing
      document.body.appendChild(skimlinksScript);
      log('Skimlinks script reloaded');
      
      // Return early - the newly loaded script will initialize itself
      return;
    }
    
    // 3. If API is available, try using official methods
    if (skimlinksAvailable) {
      const api = (window as any).skimlinksAPI;
      
      // Try to enable skimwords before reprocessing
      try {
        if (api.settings) {
          // Check if skimwords is already enabled
          const wasEnabled = !!api.settings.skimwords_enabled;
          
          // Force enable skimwords
          api.settings.skimwords_enabled = true;
          
          // Try to enable through API method if available
          if (typeof api.setOption === 'function') {
            api.setOption('skimwords_enabled', true);
          }
          
          log(`Skimwords was ${wasEnabled ? 'already' : 'not'} enabled, now set to enabled`);
        }
      } catch (settingsError) {
        console.error('Error trying to enable skimwords:', settingsError);
      }
      
      // Now try to reprocess with the API methods
      // Use the most specific method available
      if (typeof api.reprocess === 'function') {
        api.reprocess();
        log('Skimlinks reprocessed via reprocess()');
      } else if (typeof api.reinitialize === 'function') {
        api.reinitialize();
        log('Skimlinks reinitialized via reinitialize()');
      } else if (typeof api.init === 'function') {
        api.init();
        log('Skimlinks initialized via init()');
      } else {
        console.warn('No Skimlinks processing method found');
      }
      
      // Return the current state for debugging
      return;
    }
  } catch (error) {
    console.error('Error refreshing Skimlinks:', error);
  }
};
