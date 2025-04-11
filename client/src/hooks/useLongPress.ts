import { useCallback, useRef } from 'react';

/**
 * Custom hook for detecting long press events
 * @param onLongPress - Callback to execute on long press
 * @param onClick - Callback to execute on normal click 
 * @param options - Options for configuring the long press behavior
 * @returns Props to spread onto the target element
 */
export function useLongPress(
  onLongPress: (e: React.MouseEvent | React.TouchEvent) => void,
  onClick?: (e: React.MouseEvent | React.TouchEvent) => void,
  options?: {
    delay?: number;
    shouldPreventDefault?: boolean;
  }
) {
  const { delay = 500, shouldPreventDefault = true } = options || {};
  const timeout = useRef<ReturnType<typeof setTimeout>>();
  const target = useRef<EventTarget>();

  const clear = useCallback(() => {
    if (timeout.current) {
      clearTimeout(timeout.current);
      timeout.current = undefined;
    }
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (shouldPreventDefault && e.target) {
      e.target.addEventListener('touchend', preventDefault, { passive: false });
      target.current = e.target;
    }
    
    clear();
    timeout.current = setTimeout(() => onLongPress(e), delay);
  }, [onLongPress, delay, clear, shouldPreventDefault]);

  const onMouseUp = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (shouldPreventDefault && target.current) {
      (target.current as HTMLElement).removeEventListener('touchend', preventDefault);
    }
    
    clear();
    
    if (onClick && e.target === target.current) {
      onClick(e);
    }
  }, [onClick, clear, shouldPreventDefault]);

  const onMouseLeave = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (shouldPreventDefault && target.current) {
      (target.current as HTMLElement).removeEventListener('touchend', preventDefault);
    }
    
    clear();
  }, [clear, shouldPreventDefault]);

  return {
    onMouseDown,
    onTouchStart: onMouseDown,
    onMouseUp,
    onMouseLeave,
    onTouchEnd: onMouseUp,
  };
}

/**
 * Helper function to prevent default event behavior
 */
const preventDefault = (e: Event) => {
  if (e && e.preventDefault) {
    e.preventDefault();
  }
};