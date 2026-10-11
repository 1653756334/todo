"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";

/**
 * Next 自己维护跳转的 pending 状态（包括缓存命中和被打断的点击）。
 *
 * 提示元素必须完全脱离文档流：以前这里插的是行内 spinner，
 * 会把 flex 行里的其它元素顶开（设置页标签整排横向位移、侧栏数量徽标跑位）。
 * 现在它只负责无障碍播报，视觉上的「正在切换」由 globals.css 里的 :has() 变淡实现。
 */
export function NavigationLink({
  children,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      {children}
      <LinkPending />
    </Link>
  );
}

function LinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span className="navigation-pending" role="status">
      正在切换页面
    </span>
  );
}
