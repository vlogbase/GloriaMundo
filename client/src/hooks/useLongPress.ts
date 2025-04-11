import { useState, useEffect } from 'react';

/**
 * Custom hook for detecting long press gestures
 * @param callback Function to execute on long press
 * @param ms Duration of press in milliseconds
 * @returns Object with event handlers for mouse/touch events
 */
export const useLongPress = (callback: () => void, ms = 500) => {
  const [startLongPress, setStartLongPress] = useState(false);
  
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout>;
    if (startLongPress) {
      timerId = setTimeout(callback, ms);
    }
    
    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [callback, ms, startLongPress]);
  
  return {
    onMouseDown: () => setStartLongPress(true),
    onMouseUp: () => setStartLongPress(false),
    onMouseLeave: () => setStartLongPress(false),
    onTouchStart: () => setStartLongPress(true),
    onTouchEnd: () => setStartLongPress(false),
  };
};