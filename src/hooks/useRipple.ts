import { useState, useCallback, useRef } from "react";

interface Ripple {
  id: number;
  x: number;
  y: number;
  size: number;
}

export function useRipple() {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const idRef = useRef(0);

  const createRipple = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Calculate ripple size to cover the entire button
    const size = Math.max(rect.width, rect.height) * 2;
    
    const newRipple: Ripple = {
      id: idRef.current++,
      x: x - size / 2,
      y: y - size / 2,
      size,
    };

    setRipples((prev) => [...prev, newRipple]);

    // Remove ripple after animation completes
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
    }, 600);
  }, []);

  return { ripples, createRipple };
}

export type { Ripple };
