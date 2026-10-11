import { z } from "zod";
export const linkSchema = z.object({ kind: z.enum(["repo", "file", "issue", "pr", "test", "other"]), url: z.string().trim().min(1).max(1000).refine(v => {
  if (/^https?:\/\//i.test(v)) { try { const u = new URL(v); return !!u.hostname && !u.username && !u.password; } catch { return false; } }
  return !/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^\/\//.test(v) && !/[\s<>"']/.test(v);
}, "链接或代码路径格式不正确"), label: z.string().trim().max(200).nullable().default(null) }).strict();
export const taskFields = z.object({ title: z.string().trim().min(1, "标题不能为空").max(300), notes: z.string().max(20000).nullable(), status: z.enum(["todo", "doing", "done"]), priority: z.enum(["low", "normal", "high"]), dueAt: z.iso.datetime({ offset: true }).nullable(), projectId: z.string().max(100).nullable(), remindEnabled: z.boolean(), remindLeadMin: z.number().int().min(1).max(20160), tags: z.array(z.string().trim().min(1).max(40)).max(12).transform(v => [...new Set(v)]), links: z.array(linkSchema).max(20).transform(v => v.filter((l,i) => v.findIndex(x => x.url === l.url) === i)) }).strict();
export const taskCreateSchema = taskFields.partial().extend({ title: taskFields.shape.title, clientMutationId: z.string().max(100).optional() }).strict();
export const taskPatchSchema = taskFields.partial().extend({ expectedRevision: z.number().int().positive(), clientMutationId: z.string().max(100).optional() }).strict();
export const bulkSchema = z.object({ action: z.enum(["complete", "reopen", "move", "delete"]), ids: z.array(z.string()).min(1).max(200).transform(v => [...new Set(v)]), revisions: z.record(z.string(), z.number().int().positive()), projectId: z.string().nullable().optional() }).strict();
