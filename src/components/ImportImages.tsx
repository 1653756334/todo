"use client";

import { ImagePlus, LoaderCircle, X } from "lucide-react";
import { useRef, useState } from "react";
import { Modal } from "@/components/Dialog";
import {
  IMPORT_IMAGE_ACCEPT,
  MAX_IMPORT_IMAGES,
  type ImportImageInput,
} from "@/shared/import-media";

export type ImportImageDraft = ImportImageInput & { key: string; size: number };

export function ImportImages({
  images,
  busy,
  reading,
  onAdd,
  onRemove,
}: {
  images: ImportImageDraft[];
  busy: boolean;
  reading: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const preview = images.find(image => image.key === previewKey);
  return (
    <>
    <Modal open={!!preview} onClose={() => setPreviewKey(null)} title="查看待识别图片" maxWidth={900}>
      {preview ? <><img src={preview.dataUrl} alt={preview.name} className="mx-auto max-h-[65dvh] max-w-full object-contain" /><p className="hint mt-3 break-words">{preview.name}</p></> : null}
    </Modal>
    <section aria-labelledby="import-images-label" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="import-images-label" className="text-[13px] font-medium">
            图片{" "}
            <span className="ml-1 font-normal text-muted">
              {images.length} / {MAX_IMPORT_IMAGES}
            </span>
          </h3>
          <p className="hint mt-1">
            可直接粘贴截图，或选择 PNG、JPG、WebP。单张 5 MB，共 10 MB。
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary min-h-10"
          disabled={busy || reading || images.length >= MAX_IMPORT_IMAGES}
          onClick={() => input.current?.click()}
        >
          {reading ? (
            <LoaderCircle
              size={16}
              className="animate-spin"
              aria-hidden="true"
            />
          ) : (
            <ImagePlus size={16} aria-hidden="true" />
          )}
          {reading ? "正在读取…" : "添加图片"}
        </button>
        <input
          ref={input}
          id="import-image-files"
          type="file"
          accept={IMPORT_IMAGE_ACCEPT}
          multiple
          hidden
          disabled={busy || reading}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length) onAdd(files);
          }}
        />
      </div>
      {images.length ? (
        <ul
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          aria-label="待解析图片"
        >
          {images.map((image, index) => (
            <li
              key={image.key}
              className="relative min-w-0 overflow-hidden rounded-lg border border-line bg-sunken"
            >
              <button type="button" className="block w-full" onClick={() => setPreviewKey(image.key)} aria-label={`放大查看图片 ${index + 1}：${image.name}`}>
                <img
                  src={image.dataUrl}
                  alt={`待识别图片 ${index + 1}：${image.name}`}
                  className="h-28 w-full object-contain"
                />
              </button>
              <div className="border-t border-line bg-surface px-3 py-2">
                <p className="truncate text-xs" title={image.name}>
                  {image.name}
                </p>
                <p className="mt-1 text-[11px] text-muted">
                  {Math.max(1, Math.round(image.size / 1024))} KB
                </p>
              </div>
              <button
                type="button"
                className="icon-button absolute top-1.5 right-1.5 h-8 w-8 border border-line bg-surface shadow-sm"
                disabled={busy || reading}
                aria-label={`移除图片 ${index + 1}：${image.name}`}
                onClick={() => onRemove(image.key)}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-line bg-sunken px-4 py-4 text-[13px] break-words text-muted">
          <ImagePlus
            size={22}
            strokeWidth={1.5}
            className="shrink-0"
            aria-hidden="true"
          />
          <span>邮件截图、需求图片都可以。文字和图片可一起解析。</span>
        </div>
      )}
      <p className="sr-only" role="status">
        {reading ? "正在读取图片" : `已添加 ${images.length} 张图片`}
      </p>
    </section>
    </>
  );
}

export function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("无法读取图片"));
    reader.onerror = () =>
      reject(new Error(`无法读取「${file.name}」，请重新选择`));
    reader.readAsDataURL(file);
  });
}
