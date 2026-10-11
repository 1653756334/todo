"use client";

import { createContext, useContext } from "react";

/**
 * 当前登录账号的角色。`(app)/layout.tsx` 已经拿到会话用户，直接通过
 * AppShell 注入，避免设置区布局为了显示「站点管理」入口而再做一次异步读取
 * （那会让整个设置外壳被骨架屏替换，重新引入跳动问题）。
 */
export const RoleContext = createContext<"USER" | "ADMIN">("USER");

export function useIsAdmin() {
  return useContext(RoleContext) === "ADMIN";
}
