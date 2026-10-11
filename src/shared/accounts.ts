import { z } from "zod";
export const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_.-]{2,39}$/, "用户名需为 3–40 位字母、数字、点、横线或下划线");
export const passwordSchema = z.string().min(10, "密码至少 10 个字符").max(256);
export const loginSchema = z.object({ username: usernameSchema, password: z.string().min(1).max(256), next: z.string().optional() }).strict();
export const tokenConsumeSchema = z.object({ token: z.string().min(32).max(256), username: usernameSchema.optional(), displayName: z.string().trim().min(1).max(80).optional(), password: passwordSchema.optional() }).strict();
