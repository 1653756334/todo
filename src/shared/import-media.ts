/** Shared limits for text and image imports. Safe to import in the browser. */
export const MAX_IMPORT_TEXT = 20000;
export const MAX_IMPORT_IMAGES = 5;
export const MAX_IMPORT_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_TOTAL_BYTES = 10 * 1024 * 1024;
export const IMPORT_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";
export type ImportImageInput = { name: string; dataUrl: string };
