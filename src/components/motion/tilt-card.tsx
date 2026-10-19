"use client";

import { useRef, type HTMLAttributes, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";

import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

interface TiltCardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  children: ReactNode;
  /** Maximum rotation, in degrees, on each axis. */
  strength?: number;
  /** Paint a pointer-following brand glow across the surface. */
  spotlight?: boolean;
}

/**
 * Pointer-reactive card — the React Bits "Tilt / Spotlight" pattern, via GSAP.
 *
 * `quickTo` (rather than a fresh `gsap.to` per pointermove) is what keeps this
 * cheap: it reuses one interpolator per property instead of allocating a tween
 * on every mouse sample, so a moving pointer causes no GC churn while Lenis and
 * ScrollTrigger are also running frames.
 *
 * The whole behaviour is registered inside `gsap.matchMedia`, which means it
 * simply never exists for `prefers-reduced-motion: reduce` users or on touch
 * devices — a tilt that follows a finger is not an improvement.
 */
export function TiltCard({
  children,
  className,
  strength = 4,
  spotlight = true,
  ...rest
}: TiltCardProps) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const node = root.current;
      if (!node) return;

      const mm = gsap.matchMedia();

      mm.add(
        "(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)",
        () => {
          gsap.set(node, { transformPerspective: 1100 });

          const rotateX = gsap.quickTo(node, "rotationX", {
            duration: 0.55,
            ease: "power3.out",
          });
          const rotateY = gsap.quickTo(node, "rotationY", {
            duration: 0.55,
            ease: "power3.out",
          });

          const onPointerMove = (event: PointerEvent) => {
            const rect = node.getBoundingClientRect();
            if (!rect.width || !rect.height) return;

            const x = (event.clientX - rect.left) / rect.width;
            const y = (event.clientY - rect.top) / rect.height;

            rotateY((x - 0.5) * strength * 2);
            rotateX((0.5 - y) * strength * 2);

            // Consumed by the spotlight span below.
            node.style.setProperty("--sarh-spot-x", `${x * 100}%`);
            node.style.setProperty("--sarh-spot-y", `${y * 100}%`);
          };

          const onPointerLeave = () => {
            rotateX(0);
            rotateY(0);
          };

          node.addEventListener("pointermove", onPointerMove);
          node.addEventListener("pointerleave", onPointerLeave);

          return () => {
            node.removeEventListener("pointermove", onPointerMove);
            node.removeEventListener("pointerleave", onPointerLeave);
            gsap.set(node, { rotationX: 0, rotationY: 0 });
          };
        }
      );

      return () => mm.revert();
    },
    { scope: root }
  );

  return (
    <div
      ref={root}
      {...rest}
      className={cn("group relative [transform-style:preserve-3d]", className)}
    >
      {spotlight ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 [background:radial-gradient(240px_circle_at_var(--sarh-spot-x,50%)_var(--sarh-spot-y,0%),rgba(0,169,157,0.14),transparent_62%)]"
        />
      ) : null}
      {children}
    </div>
  );
}
