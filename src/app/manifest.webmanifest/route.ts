import { PWA_MANIFEST } from "@/lib/pwa-manifest";

// 清单不能长期缓存：它决定了安装进手机的那张包用哪几张图标。
// 页面里引用的是 /manifest.webmanifest?v=N（见 src/app/layout.tsx）。
export function GET() {
  return Response.json(PWA_MANIFEST, {
    headers: {
      "content-type": "application/manifest+json",
      "cache-control": "no-cache, must-revalidate",
    },
  });
}
