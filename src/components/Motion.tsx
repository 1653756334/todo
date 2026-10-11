"use client";

import {
  AnimatePresence,
  MotionConfig,
  motion,
  useIsPresent,
  useReducedMotion,
} from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export const UI_EASE = [0.22, 1, 0.36, 1] as const;

export function useUiMotion(duration = 0.18) {
  const reduced = useReducedMotion();
  return {
    reduced,
    transition: { duration: reduced ? 0 : duration, ease: UI_EASE },
  };
}

export function ContentTransition({
  children,
  stateKey,
  className,
}: {
  children: ReactNode;
  stateKey: string;
  className?: string;
}) {
  const { reduced, transition } = useUiMotion(0.14);
  return (
    <motion.div
      key={stateKey}
      className={className}
      initial={reduced ? false : { opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}

export function UiMotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 0.18, ease: UI_EASE }}
    >
      {children}
    </MotionConfig>
  );
}

/** Only animate real route changes; saves and refreshes must not move the editor. */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { transition } = useUiMotion();
  return (
    <motion.div
      key={transitionKey(pathname)}
      data-page-transition
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}

/**
 * 设置页之间只是换卡片，共用的设置导航和滚动容器不应该重建：
 * 重建会重置滚动位置与横向滚动的标签条，并且多播一次入场动效，看起来就是「整个页面在动」。
 */
function transitionKey(pathname: string) {
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return "/settings";
  return pathname;
}

/** Collapsing fields stay inert during exit, so Tab cannot reach hidden controls. */
export function AnimatedCollapse({
  open,
  children,
  className,
  id,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <CollapseContent key="expanded" className={className} id={id}>
          {children}
        </CollapseContent>
      ) : null}
    </AnimatePresence>
  );
}

function CollapseContent({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const { reduced, transition } = useUiMotion();
  const present = useIsPresent();
  return (
    <motion.div
      initial={reduced ? false : { height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={transition}
      className="overflow-hidden"
      data-collapse
      inert={!present}
    >
      <div id={id} className={className}>{children}</div>
    </motion.div>
  );
}
