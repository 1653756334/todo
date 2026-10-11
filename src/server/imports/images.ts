import sharp from "sharp";
import { AppError as HttpError } from "@/shared/errors";
import {
  MAX_IMPORT_IMAGES,
  MAX_IMPORT_IMAGE_BYTES,
  MAX_IMPORT_TOTAL_BYTES,
  type ImportImageInput,
} from "@/shared/import-media";

// Base64 plus text/candidate overhead. Read incrementally even without Content-Length.
const MAX_REQUEST_BYTES =
  Math.ceil((MAX_IMPORT_TOTAL_BYTES * 4) / 3) + 2 * 1024 * 1024;

export async function readImportJson<T>(request: Request): Promise<T> {
  const length = Number(request.headers.get("content-length"));
  if (length > MAX_REQUEST_BYTES)
    throw new HttpError(413, "内容过大，图片总大小不能超过 10 MB");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "请求内容无法解析");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new HttpError(413, "内容过大，图片总大小不能超过 10 MB");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error("invalid");
    return body as T;
  } catch {
    throw new HttpError(400, "请求内容无法解析");
  }
}

export type PreparedImportImage = ImportImageInput & {
  mimeType: string;
  data: Buffer;
};

export async function prepareImportImages(
  value: unknown,
): Promise<PreparedImportImage[]> {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new HttpError(400, "图片内容格式不正确");
  if (value.length > MAX_IMPORT_IMAGES)
    throw new HttpError(400, "一次最多添加 5 张图片");
  let total = 0;
  const images: PreparedImportImage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || typeof item.dataUrl !== "string") {
      throw new HttpError(400, "图片内容格式不正确");
    }
    const match =
      /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
        item.dataUrl,
      );
    if (!match || match[2].length % 4 !== 0)
      throw new HttpError(400, "仅支持 PNG、JPG 和 WebP 图片");
    if (match[2].length > Math.ceil(MAX_IMPORT_IMAGE_BYTES / 3) * 4) {
      throw new HttpError(413, "每张图片不能超过 5 MB");
    }
    const data = Buffer.from(match[2], "base64");
    if (!data.length || data.toString("base64") !== match[2])
      throw new HttpError(400, "图片内容无效");
    if (data.length > MAX_IMPORT_IMAGE_BYTES)
      throw new HttpError(413, "每张图片不能超过 5 MB");
    total += data.length;
    if (total > MAX_IMPORT_TOTAL_BYTES)
      throw new HttpError(413, "图片总大小不能超过 10 MB");
    const name =
      typeof item.name === "string" && item.name.trim()
        ? item.name
            .trim()
            .replace(/[\u0000-\u001f\u007f]/g, "")
            .slice(0, 160)
        : `图片 ${images.length + 1}`;
    try {
      const image = sharp(data, {
        limitInputPixels: 25_000_000,
        failOn: "warning",
      });
      const metadata = await image.metadata();
      const formatMime: Record<string, string> = {
        png: "image/png",
        jpeg: "image/jpeg",
        webp: "image/webp",
      };
      const mime = formatMime[metadata.format ?? ""];
      if (
        mime !== match[1] ||
        !metadata.width ||
        !metadata.height ||
        (metadata.pages ?? 1) > 1
      ) {
        throw new Error("format");
      }
      // Strip metadata, decode fully, bound dimensions, and use a widely supported vision format.
      const normalized = await image
        .rotate()
        .resize({
          width: 2560,
          height: 2560,
          fit: "inside",
          withoutEnlargement: true,
        })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 90 })
        .toBuffer();
      images.push({
        name,
        mimeType: "image/jpeg",
        data: normalized,
        dataUrl: `data:image/jpeg;base64,${normalized.toString("base64")}`,
      });
    } catch {
      throw new HttpError(
        400,
        `无法读取「${name}」，请使用有效的静态 PNG、JPG 或 WebP 图片（不超过 2500 万像素）`,
      );
    }
  }
  return images;
}
