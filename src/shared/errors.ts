export class AppError extends Error {
  constructor(public status: number, message: string, public code = "INVALID_REQUEST", public fieldErrors?: Record<string, string[]>) { super(message); }
}
export function assert(condition: unknown, status: number, message: string, code?: string): asserts condition {
  if (!condition) throw new AppError(status, message, code);
}
