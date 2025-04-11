import { useState, useEffect } from 'react';

/**
 * Custom hook for media queries without polyfill dependencies
 * @param query The media query to check
 * @param defaultState Default state to use before the media query is evaluated
 * @returns Boolean indicating if the media query matches
 */
export function useMediaQuery(query: string, defaultState: boolean = false): boolean {
  const [state, setState] = useState(defaultState);
  
  useEffect(() => {
    let mounted = true;
    const mql = window.matchMedia(query);
    
    const onChange = () => {
      if (!mounted) return;
      setState(mql.matches);
    };
    
    // Set initial state
    setState(mql.matches);
    
    // Use the proper event listener method based on browser support
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
    } else {
      // Fallback for older browsers
      mql.addListener(onChange);
    }
    
    return () => {
      mounted = false;
      if (mql.removeEventListener) {
        mql.removeEventListener('change', onChange);
      } else {
        mql.removeListener(onChange);
      }
    };
  }, [query]);
  
  return state;
}