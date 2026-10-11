"use client";

import { usePathname } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";

/** 浏览器里要在绘制前重置滚动位置，服务端渲染时退回 useEffect 避免 React 警告 */
const useBrowserLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * 设置区的滚动容器。
 *
 * 存在两个目的：
 * 1. 分类之间切换时容器本身不重建，滚动条槽位与滚动位置都不会跳；
 * 2. 换分类后把滚动位置归零（瞬时，无动画），避免停在上一个分类的中间位置。
 *
 * resetKey 默认跟随路径；站点管理用查询参数切分类，所以要显式传进去。
 */
export function SettingsScrollArea({
  children,
  resetKey,
}: {
  children: ReactNode;
  resetKey?: string;
}) {
  const pathname = usePathname();
  const key = resetKey ?? pathname;
  const ref = useRef<HTMLDivElement>(null);

  useBrowserLayoutEffect(() => {
    const element = ref.current;
    if (element) element.scrollTop = 0;
  }, [key]);

  return (
    <div ref={ref} className="scroll-y min-h-0 flex-1 bg-canvas">
      {children}
    </div>
  );
}
