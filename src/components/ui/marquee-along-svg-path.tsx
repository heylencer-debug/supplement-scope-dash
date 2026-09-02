/**
 * MarqueeAlongSvgPath — vendor component (21st.dev / fancy-components style):
 * repeats its children along an SVG path via CSS motion path (offset-path /
 * offset-distance — a transform-class, compositor-friendly property).
 *
 * LOCAL FIX vs the pasted source: the original called hooks
 * (useTransform / useMotionValue / useEffect) inline inside `items.map()` in
 * the render body — a rules-of-hooks violation. The per-item render is
 * extracted into a proper child component (MarqueeePathItem) below; the
 * cssVariableInterpolation entries (originally `useTransform` inside a
 * `.map()` callback) are derived with the non-hook `transform()` mapper +
 * plain `motionValue`s kept in sync by a single subscription, preserving
 * identical behavior. The public API is unchanged.
 *
 * PORTED FROM getnoodle (2026-09-03), verbatim — this is the vendor
 * component ProcessingLoader.tsx depends on. No local changes.
 */
import React, { RefObject, useCallback, useEffect, useRef } from "react"
import {
  motion,
  MotionValue,
  SpringOptions,
  motionValue,
  transform,
  useAnimationFrame,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react"

import { cn } from "@/lib/utils"

// Custom wrap function
const wrap = (min: number, max: number, value: number): number => {
  const range = max - min
  return ((((value - min) % range) + range) % range) + min
}

type PreserveAspectRatioAlign =
  | "none"
  | "xMinYMin"
  | "xMidYMin"
  | "xMaxYMin"
  | "xMinYMid"
  | "xMidYMid"
  | "xMaxYMid"
  | "xMinYMax"
  | "xMidYMax"
  | "xMaxYMax"

interface CSSVariableInterpolation {
  property: string
  from: number | string
  to: number | string
}

type PreserveAspectRatioMeetOrSlice = "meet" | "slice"

type PreserveAspectRatio =
  | PreserveAspectRatioAlign
  | `${Exclude<PreserveAspectRatioAlign, "none">} ${PreserveAspectRatioMeetOrSlice}`

interface MarqueeAlongSvgPathProps {
  children: React.ReactNode
  className?: string
  path: string
  pathId?: string
  preserveAspectRatio?: PreserveAspectRatio
  showPath?: boolean
  width?: string | number
  height?: string | number
  viewBox?: string
  baseVelocity?: number
  direction?: "normal" | "reverse"
  easing?: (value: number) => number
  slowdownOnHover?: boolean
  slowDownFactor?: number
  slowDownSpringConfig?: SpringOptions
  useScrollVelocity?: boolean
  scrollAwareDirection?: boolean
  scrollSpringConfig?: SpringOptions
  scrollContainer?: RefObject<HTMLElement | null> | HTMLElement | null
  repeat?: number
  draggable?: boolean
  dragSensitivity?: number
  dragVelocityDecay?: number
  dragAwareDirection?: boolean
  grabCursor?: boolean
  enableRollingZIndex?: boolean
  zIndexBase?: number
  zIndexRange?: number
  cssVariableInterpolation?: CSSVariableInterpolation[]
  responsive?: boolean
}

/** Per-item renderer — hosts the hooks the vendor source called inside
 *  items.map() (rules-of-hooks fix; behavior identical). */
const MarqueeePathItem: React.FC<{
  child: React.ReactNode
  itemIndex: number
  repeatIndex: number
  itemCount: number
  path: string
  easing?: (value: number) => number
  baseOffset: MotionValue<number>
  calculateZIndex: (offsetDistance: number) => number | undefined
  enableRollingZIndex: boolean
  cssVariableInterpolation: CSSVariableInterpolation[]
  draggable: boolean
  grabCursor: boolean
  isHovered: React.MutableRefObject<boolean>
}> = ({
  child,
  itemIndex,
  repeatIndex,
  itemCount,
  path,
  easing,
  baseOffset,
  calculateZIndex,
  enableRollingZIndex,
  cssVariableInterpolation,
  draggable,
  grabCursor,
  isHovered,
}) => {
  // Calculate the offset for each item to ensure equal spacing
  const itemOffset = useTransform(baseOffset, (v) => {
    const position = (itemIndex * 100) / itemCount
    const wrappedValue = wrap(0, 100, v + position)
    return `${easing ? easing(wrappedValue / 100) * 100 : wrappedValue}%`
  })

  const currentOffsetDistance = useMotionValue(0)

  const zIndex = useTransform(currentOffsetDistance, (value) =>
    calculateZIndex(value)
  )

  useEffect(() => {
    const unsubscribe = itemOffset.on("change", (value: string) => {
      const percentage = parseFloat(value)
      if (!isNaN(percentage)) {
        currentOffsetDistance.set(percentage)
      }
    })
    return unsubscribe
  }, [itemOffset, currentOffsetDistance])

  // Original: `useTransform(currentOffsetDistance, [0, 100], [from, to])`
  // inside cssVariableInterpolation.map() — hooks in a callback. Same
  // interpolation via motion's transform() mapper + manual subscription.
  const interpolatedVariables = React.useMemo(
    () =>
      cssVariableInterpolation.map(({ property, from, to }) => {
        const mapper = transform([0, 100], [from, to])
        return { property, mapper, value: motionValue(mapper(0)) }
      }),
    [cssVariableInterpolation]
  )

  useEffect(() => {
    const update = (v: number) => {
      for (const entry of interpolatedVariables) entry.value.set(entry.mapper(v))
    }
    update(currentOffsetDistance.get())
    const unsubscribe = currentOffsetDistance.on("change", update)
    return unsubscribe
  }, [currentOffsetDistance, interpolatedVariables])

  const cssVariables = React.useMemo(
    () =>
      Object.fromEntries(
        interpolatedVariables.map((entry) => [entry.property, entry.value])
      ),
    [interpolatedVariables]
  )

  return (
    <motion.div
      className={cn(
        "absolute top-0 left-0",
        draggable && grabCursor && "cursor-grab"
      )}
      style={{
        offsetPath: `path('${path}')`,
        offsetDistance: itemOffset,
        zIndex: enableRollingZIndex ? zIndex : undefined,
        willChange: "offset-distance",
        backfaceVisibility: "hidden",
        ...cssVariables,
      }}
      aria-hidden={repeatIndex > 0}
      onMouseEnter={() => (isHovered.current = true)}
      onMouseLeave={() => (isHovered.current = false)}
    >
      {child}
    </motion.div>
  )
}

const MarqueeAlongSvgPath = ({
  children,
  className,
  path,
  pathId,
  preserveAspectRatio = "xMidYMid meet",
  showPath = false,
  width = "100%",
  height = "100%",
  viewBox = "0 0 100 100",
  baseVelocity = 5,
  direction = "normal",
  easing,
  slowdownOnHover = false,
  slowDownFactor = 0.3,
  slowDownSpringConfig = { damping: 50, stiffness: 400 },
  useScrollVelocity = false,
  scrollAwareDirection = false,
  scrollSpringConfig = { damping: 50, stiffness: 400 },
  scrollContainer,
  repeat = 3,
  draggable = false,
  dragSensitivity = 0.2,
  dragVelocityDecay = 0.96,
  dragAwareDirection = false,
  grabCursor = false,
  enableRollingZIndex = true,
  zIndexBase = 1,
  zIndexRange = 10,
  cssVariableInterpolation = [],
  responsive = false,
}: MarqueeAlongSvgPathProps) => {
  const container = useRef<HTMLDivElement>(null)
  const marqueeContainerRef = useRef<HTMLDivElement>(null)
  const baseOffset = useMotionValue(0)
  const pathRef = useRef<SVGPathElement>(null)
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  useEffect(() => {
    if (!responsive) return
    const [, , vbWidth, vbHeight] = viewBox.split(" ").map(Number)
    const originalWidth = vbWidth || 100
    const originalHeight = vbHeight || 100
    const updateScale = () => {
      const wrapper = container.current
      const marqueeContainer = marqueeContainerRef.current
      if (!wrapper || !marqueeContainer) return
      const wrapperWidth = wrapper.clientWidth
      const wrapperHeight = wrapper.clientHeight
      const scaleX = wrapperWidth / originalWidth
      const scaleY = wrapperHeight / originalHeight
      const scale = Math.min(scaleX, scaleY)
      const scaledWidth = originalWidth * scale
      const scaledHeight = originalHeight * scale
      const offsetX = (wrapperWidth - scaledWidth) / 2
      const offsetY = (wrapperHeight - scaledHeight) / 2
      marqueeContainer.style.width = `${originalWidth}px`
      marqueeContainer.style.height = `${originalHeight}px`
      marqueeContainer.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`
      marqueeContainer.style.transformOrigin = "top left"
    }
    updateScale()
    window.addEventListener("resize", updateScale)
    return () => window.removeEventListener("resize", updateScale)
  }, [responsive, viewBox])

  const items = React.useMemo(() => {
    const childrenArray = React.Children.toArray(children)
    return childrenArray.flatMap((child, childIndex) =>
      Array.from({ length: repeat }, (_, repeatIndex) => {
        const itemIndex = repeatIndex * childrenArray.length + childIndex
        const key = `${childIndex}-${repeatIndex}`
        return { child, childIndex, repeatIndex, itemIndex, key }
      })
    )
  }, [children, repeat])

  const calculateZIndex = useCallback(
    (offsetDistance: number) => {
      if (!enableRollingZIndex) return undefined
      const normalizedDistance = offsetDistance / 100
      return Math.floor(zIndexBase + normalizedDistance * zIndexRange)
    },
    [enableRollingZIndex, zIndexBase, zIndexRange]
  )

  const id = pathId || `marquee-path-${Math.random().toString(36).substring(7)}`

  const { scrollY } = useScroll({
    container: (scrollContainer as RefObject<HTMLDivElement | null>) || container,
  })
  const scrollVelocity = useVelocity(scrollY)
  const smoothVelocity = useSpring(scrollVelocity, scrollSpringConfig)

  const isHovered = useRef(false)
  const isDragging = useRef(false)
  const dragVelocity = useRef(0)
  const directionFactor = useRef(direction === "normal" ? 1 : -1)
  const hoverFactorValue = useMotionValue(1)
  const defaultVelocity = useMotionValue(1)
  const smoothHoverFactor = useSpring(hoverFactorValue, slowDownSpringConfig)

  const velocityFactor = useTransform(
    useScrollVelocity ? smoothVelocity : defaultVelocity,
    [0, 1000],
    [0, 5],
    { clamp: false }
  )

  useAnimationFrame((_, delta) => {
    if (isDragging.current && draggable) {
      baseOffset.set(baseOffset.get() + dragVelocity.current)
      dragVelocity.current *= 0.9
      if (Math.abs(dragVelocity.current) < 0.01) dragVelocity.current = 0
      return
    }
    if (isHovered.current) {
      hoverFactorValue.set(slowdownOnHover ? slowDownFactor : 1)
    } else {
      hoverFactorValue.set(1)
    }
    let moveBy =
      directionFactor.current * baseVelocity * (delta / 1000) * smoothHoverFactor.get()
    if (scrollAwareDirection && !isDragging.current) {
      if (velocityFactor.get() < 0) directionFactor.current = -1
      else if (velocityFactor.get() > 0) directionFactor.current = 1
    }
    moveBy += directionFactor.current * moveBy * velocityFactor.get()
    if (draggable) {
      moveBy += dragVelocity.current
      if (dragAwareDirection && Math.abs(dragVelocity.current) > 0.1) {
        directionFactor.current = Math.sign(dragVelocity.current)
      }
      if (!isDragging.current && Math.abs(dragVelocity.current) > 0.01) {
        dragVelocity.current *= dragVelocityDecay
      } else if (!isDragging.current) {
        dragVelocity.current = 0
      }
    }
    baseOffset.set(baseOffset.get() + moveBy)
  })

  const lastPointerPosition = useRef({ x: 0, y: 0 })
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!draggable) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    if (grabCursor) (e.currentTarget as HTMLElement).style.cursor = "grabbing"
    isDragging.current = true
    lastPointerPosition.current = { x: e.clientX, y: e.clientY }
    dragVelocity.current = 0
  }
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggable || !isDragging.current) return
    const currentPosition = { x: e.clientX, y: e.clientY }
    const deltaX = currentPosition.x - lastPointerPosition.current.x
    const deltaY = currentPosition.y - lastPointerPosition.current.y
    const delta = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
    const projectedDelta = deltaX > 0 ? delta : -delta
    dragVelocity.current = projectedDelta * dragSensitivity
    lastPointerPosition.current = currentPosition
  }
  const handlePointerUp = (e: React.PointerEvent) => {
    if (!draggable) return
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    isDragging.current = false
    if (grabCursor) (e.currentTarget as HTMLElement).style.cursor = "grab"
  }

  return (
    <div
      ref={container}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={cn("relative", className)}
    >
      <div ref={marqueeContainerRef} className="relative" style={{ contain: "layout style" }}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={width}
          height={height}
          viewBox={viewBox}
          preserveAspectRatio={preserveAspectRatio}
          className="w-full h-full"
        >
          <path id={id} d={path} stroke={showPath ? "currentColor" : "none"} fill="none" ref={pathRef} />
        </svg>
        {items.map(({ child, repeatIndex, itemIndex, key }) => (
          <MarqueeePathItem
            key={key}
            child={child}
            itemIndex={itemIndex}
            repeatIndex={repeatIndex}
            itemCount={items.length}
            path={path}
            easing={easing}
            baseOffset={baseOffset}
            calculateZIndex={calculateZIndex}
            enableRollingZIndex={enableRollingZIndex}
            cssVariableInterpolation={cssVariableInterpolation}
            draggable={draggable}
            grabCursor={grabCursor}
            isHovered={isHovered}
          />
        ))}
      </div>
    </div>
  )
}

export default MarqueeAlongSvgPath
