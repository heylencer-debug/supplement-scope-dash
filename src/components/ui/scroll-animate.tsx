import { ReactNode, CSSProperties, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useScrollAnimation, useStaggeredAnimation } from "@/hooks/useScrollAnimation";

type AnimationVariant = 
  | "fade-up" 
  | "fade-down" 
  | "fade-left" 
  | "fade-right" 
  | "scale-up" 
  | "scale-down"
  | "flip-up"
  | "flip-left"
  | "zoom-in"
  | "blur-in";

interface ScrollAnimateProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  variant?: AnimationVariant;
  threshold?: number;
  once?: boolean;
}

const variantStyles: Record<AnimationVariant, { hidden: CSSProperties; visible: CSSProperties }> = {
  "fade-up": {
    hidden: { opacity: 0, transform: "translateY(30px)" },
    visible: { opacity: 1, transform: "translateY(0)" },
  },
  "fade-down": {
    hidden: { opacity: 0, transform: "translateY(-30px)" },
    visible: { opacity: 1, transform: "translateY(0)" },
  },
  "fade-left": {
    hidden: { opacity: 0, transform: "translateX(30px)" },
    visible: { opacity: 1, transform: "translateX(0)" },
  },
  "fade-right": {
    hidden: { opacity: 0, transform: "translateX(-30px)" },
    visible: { opacity: 1, transform: "translateX(0)" },
  },
  "scale-up": {
    hidden: { opacity: 0, transform: "scale(0.9)" },
    visible: { opacity: 1, transform: "scale(1)" },
  },
  "scale-down": {
    hidden: { opacity: 0, transform: "scale(1.1)" },
    visible: { opacity: 1, transform: "scale(1)" },
  },
  "flip-up": {
    hidden: { opacity: 0, transform: "perspective(1000px) rotateX(10deg) translateY(20px)" },
    visible: { opacity: 1, transform: "perspective(1000px) rotateX(0) translateY(0)" },
  },
  "flip-left": {
    hidden: { opacity: 0, transform: "perspective(1000px) rotateY(-10deg) translateX(20px)" },
    visible: { opacity: 1, transform: "perspective(1000px) rotateY(0) translateX(0)" },
  },
  "zoom-in": {
    hidden: { opacity: 0, transform: "scale(0.5)" },
    visible: { opacity: 1, transform: "scale(1)" },
  },
  "blur-in": {
    hidden: { opacity: 0, filter: "blur(10px)", transform: "translateY(10px)" },
    visible: { opacity: 1, filter: "blur(0)", transform: "translateY(0)" },
  },
};

export function ScrollAnimate({ 
  children, 
  className,
  delay = 0,
  duration = 600,
  variant = "fade-up",
  threshold = 0.1,
  once = true,
}: ScrollAnimateProps) {
  const { ref, isVisible } = useScrollAnimation({ 
    threshold, 
    triggerOnce: once,
    rootMargin: "0px 0px -80px 0px" 
  });

  const styles = variantStyles[variant];
  const currentStyle = isVisible ? styles.visible : styles.hidden;

  return (
    <div
      ref={ref}
      className={cn("will-change-transform", className)}
      style={{
        ...currentStyle,
        transitionProperty: "opacity, transform, filter",
        transitionDelay: `${delay}ms`,
        transitionDuration: `${duration}ms`,
        transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      }}
    >
      {children}
    </div>
  );
}

// Staggered children animation wrapper
interface ScrollStaggerProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
  duration?: number;
  variant?: AnimationVariant;
  threshold?: number;
}

export function ScrollStagger({
  children,
  className,
  staggerDelay = 100,
  duration = 600,
  variant = "fade-up",
  threshold = 0.1,
}: ScrollStaggerProps) {
  const { ref, isVisible } = useScrollAnimation({ 
    threshold, 
    triggerOnce: true,
    rootMargin: "0px 0px -50px 0px" 
  });

  const styles = variantStyles[variant];

  return (
    <div ref={ref} className={className}>
      {Array.isArray(children) ? children.map((child, index) => {
        const currentStyle = isVisible ? styles.visible : styles.hidden;
        return (
          <div
            key={index}
            className="will-change-transform"
            style={{
              ...currentStyle,
              transitionProperty: "opacity, transform, filter",
              transitionDelay: `${index * staggerDelay}ms`,
              transitionDuration: `${duration}ms`,
              transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            }}
          >
            {child}
          </div>
        );
      }) : children}
    </div>
  );
}

// Section wrapper with scroll animation for dashboard
interface ScrollSectionProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  variant?: AnimationVariant;
}

export function ScrollSection({
  children,
  className,
  delay = 0,
  variant = "fade-up",
}: ScrollSectionProps) {
  return (
    <ScrollAnimate
      variant={variant}
      delay={delay}
      duration={700}
      threshold={0.05}
      className={className}
    >
      {children}
    </ScrollAnimate>
  );
}

// Grid with staggered items
interface ScrollGridProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
}

export function ScrollGrid({
  children,
  className,
  staggerDelay = 100,
}: ScrollGridProps) {
  return (
    <ScrollStagger
      className={className}
      staggerDelay={staggerDelay}
      variant="scale-up"
      duration={500}
    >
      {children}
    </ScrollStagger>
  );
}

// Counter animation for numbers
interface ScrollCounterProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  decimals?: number;
}

export function ScrollCounter({
  value,
  duration = 2000,
  prefix = "",
  suffix = "",
  className,
  decimals = 0,
}: ScrollCounterProps) {
  const { ref, isVisible } = useScrollAnimation({ threshold: 0.5, triggerOnce: true });
  
  return (
    <span ref={ref} className={className}>
      {prefix}
      {isVisible ? (
        <CountUp value={value} duration={duration} decimals={decimals} />
      ) : (
        "0"
      )}
      {suffix}
    </span>
  );
}

// Internal counter component
function CountUp({ value, duration, decimals }: { value: number; duration: number; decimals: number }) {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    let startTime: number;
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      
      // Easing function (ease-out)
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(eased * value);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration]);

  return <>{count.toFixed(decimals)}</>;
}

// Re-export for convenience
export { useScrollAnimation, useStaggeredAnimation } from "@/hooks/useScrollAnimation";
