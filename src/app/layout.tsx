import type { Metadata, Viewport } from "next";
import { UiMotionProvider } from "@/components/Motion";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Todo · 自托管任务管理", template: "%s · Todo" },
  description: "记录任务、整理项目、安排截止时间。",
  applicationName: "Todo",
  // 清单 URL 带版本号：旧响应可能带着 max-age 躺在手机缓存里，换 URL 才能保证
  // 手机一定重新拉取图标定义。改了图标（或想强制手机重新生成安装包）就把版本号加一。
  manifest: "/manifest.webmanifest?v=5",
  // 装到桌面后由系统控制外观，这里补充 iOS 需要的声明。
  appleWebApp: { capable: true, title: "Todo", statusBarStyle: "default" },
  // 新版 Next 只输出标准的 mobile-web-app-capable，旧版 iOS 仍认 Apple 这个名字。
  other: { "apple-mobile-web-app-capable": "yes" },
  formatDetection: { telephone: false, email: false, address: false },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
      { url: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    apple: {
      url: "/apple-touch-icon.png",
      sizes: "180x180",
      type: "image/png",
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 装了桌面图标后要铺到刘海和圆角下面，靠 safe-area 内边距避开。
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8fb" },
    { media: "(prefers-color-scheme: dark)", color: "#11151c" },
  ],
};

const THEME_SCRIPT = `(function(){try{var m=localStorage.getItem("todo-theme")||"system";var d=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <UiMotionProvider>{children}</UiMotionProvider>
      </body>
    </html>
  );
}
