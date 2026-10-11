// PWA 清单的内容。放在 lib 里，供带版本号的 /manifest.webmanifest 路由使用。
//
// 为什么不用 Next 的 app/manifest.ts 约定：那个约定会把 /manifest.webmanifest
// 硬编码进页面，我们没法给 URL 加版本号。手机浏览器会把旧清单按 max-age 存住，
// 换了图标也照样用旧的（开屏图就跟着不更新），所以这里自己出清单，URL 由
// layout.tsx 里的 metadata.manifest 带上版本号。
import type { MetadataRoute } from "next";

// 快捷方式图标：512 也够，但桌面只按小尺寸显示，192 已经超出需要，体积还小。
const SHORTCUT_ICON = (name: "today" | "inbox" | "all") => ({
  src: `/icons/shortcut-${name}.png`,
  sizes: "192x192",
  type: "image/png",
});

export const PWA_MANIFEST: MetadataRoute.Manifest = {
  name: "Todo · 自托管任务管理",
  short_name: "Todo",
  description: "记录任务、整理项目、安排截止时间。",
  lang: "zh-CN",
  dir: "ltr",
  start_url: "/today",
  scope: "/",
  display: "standalone",
  background_color: "#f6f8fb",
  theme_color: "#f6f8fb",
  categories: ["productivity"],
  // Chrome 的开屏图会优先选 maskable，部分版本会把它原样显示成满底方图，
  // 与桌面上被系统裁成圆角的图标对不上。所以清单只声明自带圆角的 any 图标。
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  ],
  // 长按桌面图标弹出的菜单。每项都配一张图标（scripts/generate-icons.mjs 生成）：
  // 不写 icons 的话安卓会退回用应用图标，三个入口长得一模一样，分不清。
  shortcuts: [
    { name: "今天", short_name: "今天", url: "/today", icons: [SHORTCUT_ICON("today")] },
    { name: "收件箱", short_name: "收件箱", url: "/inbox", icons: [SHORTCUT_ICON("inbox")] },
    { name: "全部任务", short_name: "全部任务", url: "/tasks", icons: [SHORTCUT_ICON("all")] },
  ],
};
