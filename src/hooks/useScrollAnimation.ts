import { useEffect, useRef, useState, useCallback } from "react";

interface UseScrollAnimationOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
}

export function useScrollAnimation<T extends HTMLElement = HTMLDivElement>({
  threshold = 0.1,
  rootMargin = "0px 0px -50px 0px",
  triggerOnce = true,
}: UseScrollAnimationOptions = {}) {
  const ref = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Check if element is already in view on mount
    const rect = element.getBoundingClientRect();
    const isInView = rect.top < window.innerHeight && rect.bottom > 0;
    if (isInView && triggerOnce) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (triggerOnce) {
            observer.unobserve(element);
          }
        } else if (!triggerOnce) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [threshold, rootMargin, triggerOnce]);

  return { ref, isVisible };
}

// Hook for staggered children animations
interface UseStaggeredAnimationOptions extends UseScrollAnimationOptions {
  staggerDelay?: number;
  childCount?: number;
}

export function useStaggeredAnimation<T extends HTMLElement = HTMLDivElement>({
  threshold = 0.1,
  rootMargin = "0px 0px -50px 0px",
  triggerOnce = true,
  staggerDelay = 100,
  childCount = 0,
}: UseStaggeredAnimationOptions = {}) {
  const { ref, isVisible } = useScrollAnimation<T>({ threshold, rootMargin, triggerOnce });

  const getChildDelay = useCallback((index: number) => {
    return isVisible ? index * staggerDelay : 0;
  }, [isVisible, staggerDelay]);

  const getChildStyle = useCallback((index: number) => ({
    transitionDelay: `${getChildDelay(index)}ms`,
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
  }), [isVisible, getChildDelay]);

  return { ref, isVisible, getChildDelay, getChildStyle };
}

// Hook for parallax scroll effect
export function useParallaxScroll(speed: number = 0.5) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const scrolled = window.innerHeight - rect.top;
      setOffset(scrolled * speed);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [speed]);

  return { ref, offset };
}
