// 生成 PWA 用的 PNG 图标（应用图标 + 长按图标弹出的快捷方式图标）。
// 改图标只需改这里的 SVG 再跑一次：
//   node scripts/generate-icons.mjs
// 生成的文件都提交进仓库，部署时不需要再跑（构建环境没有 sharp 也能正常部署）。
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const OUT_DIR = path.join(process.cwd(), "public");

// 与 public/favicon.svg 同一套字形：圆角蓝底 + 白色清单。
const GLYPH = `<g fill="none" stroke="#fff" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"><path d="m14 20 3 3 6-7M14 33l3 3 6-7M14 46l3 3 6-7M31 20h18M31 33h18M31 46h12"/></g>`;

/** 圆角底 + 字形（透明背景），用于 any 用途与 favicon 展示。 */
function roundedSquare(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#2563eb"/>${GLYPH}</svg>`;
}

/**
 * 满底 + 收进安全区的字形。maskable 图标会被裁成圆形、水滴等形状，
 * 所以背景必须铺满、内容必须留在中间 80% 的圆里，且不能有透明像素。
 */
function fullBleed(size, scale) {
  const offset = 32 * (1 - scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2563eb"/><g transform="translate(${offset} ${offset}) scale(${scale})">${GLYPH}</g></svg>`;
}

/**
 * 快捷方式图标：蓝底白字形，和 app 图标同一套配色，但字形各自区分
 * （今天＝带勾的日历，收件箱＝托盘，全部任务＝带勾的清单）。
 * 路径取自 lucide 的 24 网格（界面里用的也是这套图标），这里手抄一份，
 * 免得图标生成脚本依赖 lucide-react。
 */
const SHORTCUT_GLYPHS = {
  today: '<path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="m9 15 2 2 4-4"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  all: '<path d="M13 5h8"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/>',
};

/**
 * 满底 + 居中的白色字形。安卓把快捷方式图标裁成圆形/水滴，所以同样铺满背景、
 * 不留透明像素，字形收在中间（scale 0.72，落在 maskable 安全区内）。
 * 24 的网格被放大 s 倍，描边宽度要除回去，笔画粗细才和 app 图标一致。
 */
function shortcutIcon(glyph, scale = 0.72) {
  const s = (64 * scale) / 24;
  const offset = 32 - 12 * s;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2563eb"/><g transform="translate(${offset.toFixed(2)} ${offset.toFixed(2)}) scale(${s.toFixed(3)})" fill="none" stroke="#fff" stroke-width="${(3.8 / s).toFixed(3)}" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>`;
}

const targets = [
  { file: "icons/icon-192.png", size: 192, svg: roundedSquare(192) },
  { file: "icons/icon-512.png", size: 512, svg: roundedSquare(512) },
  // maskable 会被系统裁成圆形/水滴，必须满底、内容留在安全区、并且不带透明通道。
  { file: "icons/maskable-192.png", size: 192, svg: fullBleed(192, 0.74), opaque: true },
  { file: "icons/maskable-512.png", size: 512, svg: fullBleed(512, 0.74), opaque: true },
  // iOS 会自己加圆角，透明区域会露出黑底，所以这里同样用不带透明的满底版本。
  { file: "apple-touch-icon.png", size: 180, svg: fullBleed(180, 0.8), opaque: true },
  // 长按桌面图标弹出的快捷方式图标（manifest.shortcuts）。192 够用且体积小。
  { file: "icons/shortcut-today.png", size: 192, svg: shortcutIcon(SHORTCUT_GLYPHS.today), opaque: true },
  { file: "icons/shortcut-inbox.png", size: 192, svg: shortcutIcon(SHORTCUT_GLYPHS.inbox), opaque: true },
  { file: "icons/shortcut-all.png", size: 192, svg: shortcutIcon(SHORTCUT_GLYPHS.all), opaque: true },
];

for (const target of targets) {
  const outPath = path.join(OUT_DIR, target.file);
  await mkdir(path.dirname(outPath), { recursive: true });
  let pipeline = sharp(Buffer.from(target.svg)).resize(target.size, target.size);
  if (target.opaque) pipeline = pipeline.removeAlpha();
  const png = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  await writeFile(outPath, png);
  const meta = await sharp(png).metadata();
  console.log(
    `${target.file}  ${meta.width}x${meta.height}  ${(png.length / 1024).toFixed(1)} KB  alpha=${meta.hasAlpha}`,
  );
}
