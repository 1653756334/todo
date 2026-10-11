import { prisma } from "@/server/infra/db";
import type { Prisma, TaskPriority } from "@prisma/client";
import type { Actor } from "@/server/auth/permissions";
import { AppError, assert } from "@/shared/errors";
import { nextDayStartInZone } from "@/shared/time";
import type { TaskDTO } from "@/shared/types";
export type TaskView = "today" | "inbox" | "all" | "completed" | "project";
export const taskInclude = {
  project: { select: { id: true, name: true, color: true, repoUrl: true, archivedAt: true } },
  tags: { select: { tag: true } }, links: { select: { kind: true, url: true, label: true } },
  reminders: { orderBy: { planVersion: "desc" }, take: 1, select: { id: true, planVersion: true, status: true, triggerAt: true, sentAt: true, attempt: true, lastError: true } },
} satisfies Prisma.TaskInclude;
export const taskDetailInclude = { ...taskInclude, source: { select: { rawText: true, images: { where: { status: "READY" }, select: { id: true, name: true } } } } } satisfies Prisma.TaskInclude;
type Row = Prisma.TaskGetPayload<{ include: typeof taskInclude }> & { source?: { rawText: string; images: { id: string; name: string }[] } | null };
export function serializeTask(t: Row): TaskDTO {
  const r = t.reminders.find(r => r.planVersion === t.reminderVersion);
  return { id: t.id, title: t.title, notes: t.notes, status: t.status, priority: t.priority, dueAt: t.dueAt?.toISOString() ?? null, projectId: t.projectId, projectName: t.project?.name ?? null, projectColor: t.project?.color ?? null, tags: t.tags.map(x=>x.tag), links: t.links, remindEnabled: t.remindEnabled, remindLeadMin: t.remindLeadMin, sourceId: t.sourceId, sourceText: t.source?.rawText ?? null, sourceImages: t.source?.images.map(i=>({ ...i, url: `/api/import-images/${i.id}` })) ?? [], completedAt: t.completedAt?.toISOString() ?? null, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(), revision: t.revision, reminder: r ? { id: r.id, status: r.status, triggerAt: r.triggerAt.toISOString(), sentAt: r.sentAt?.toISOString() ?? null, attempt: r.attempt, lastError: r.lastError } : null };
}
export type ListOptions = { view: TaskView; timeZone: string; projectId?: string | null; status?: string | null; priority?: string | null; tag?: string | null; query?: string | null; now?: Date; limit?: number; cursor?: string | null; sort?: string | null };
function filter(actor: Actor, o: ListOptions): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = { ownerId: actor.id, OR: [{ projectId: null }, { project: { archivedAt: null } }] };
  if (o.status) assert(["todo","doing","done"].includes(o.status), 400, "状态无效");
  where.status = o.view === "completed" ? "done" : o.status ?? { not: "done" };
  if (o.view === "today") where.dueAt = { lt: nextDayStartInZone(o.now ?? new Date(), o.timeZone) };
  if (o.view === "inbox") where.projectId = null;
  if (o.view === "project") { assert(o.projectId, 400, "请选择项目"); where.projectId = o.projectId; delete where.OR; }
  if (o.priority) { assert(["low","normal","high"].includes(o.priority), 400, "优先级无效"); where.priority = o.priority as TaskPriority; }
  if (o.tag) where.tags = { some: { tag: o.tag } };
  if (o.query) where.AND = [{ OR: [{ title: { contains: o.query, mode: "insensitive" } }, { notes: { contains: o.query, mode: "insensitive" } }] }];
  return where;
}
export async function queryTasks(actor: Actor, o: ListOptions) {
  const where = filter(actor,o);
  const take = Math.min(Math.max(o.limit ?? 50, 1), 200);
  let orderBy: Prisma.TaskOrderByWithRelationInput[] = [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }, { id: "asc" }];
  if (o.view === "completed") orderBy = [{ completedAt: "desc" },{id:"asc"}];
  else if (o.sort === "priority") orderBy = [{priority:"asc"},{dueAt:{sort:"asc",nulls:"last"}},{id:"asc"}];
  else if (o.sort === "created") orderBy = [{createdAt:"desc"},{id:"asc"}];
  if (o.cursor) assert(await prisma.task.findFirst({ where: { id: o.cursor, ...where }, select: { id: true } }), 400, "分页位置已失效，请刷新");
  const rows = await prisma.task.findMany({ where, include: taskInclude, orderBy, take: take+1, ...(o.cursor ? { cursor: { id: o.cursor }, skip: 1 } : {}) });
  return { tasks: rows.slice(0,take).map(serializeTask), nextCursor: rows.length > take ? rows[take-1].id : null };
}
export async function listTasks(actor: Actor, options: ListOptions) { return (await queryTasks(actor, options)).tasks; }
export async function taskDetail(actor: Actor, id: string) {
  const row = await prisma.task.findFirst({ where: { id, ownerId: actor.id }, include: taskDetailInclude });
  assert(row, 404, "任务不存在"); return serializeTask(row);
}
export async function navCounts(actor: Actor, now = new Date()) {
  const base: Prisma.TaskWhereInput = { ownerId: actor.id, status: { not: "done" }, OR: [{projectId:null},{project:{archivedAt:null}}] };
  const [today,inbox,all,grouped] = await Promise.all([
    prisma.task.count({where:{...base,dueAt:{lt:nextDayStartInZone(now,actor.timezone)}}}), prisma.task.count({where:{...base,projectId:null}}), prisma.task.count({where:base}), prisma.task.groupBy({by:["projectId"],where:base,_count:{_all:true}}),
  ]);
  return { today,inbox,all,projects:Object.fromEntries(grouped.filter(x=>x.projectId).map(x=>[x.projectId!,x._count._all])) };
}
export function sortTasks(tasks: TaskDTO[]) { return [...tasks].sort((a,b)=>(a.dueAt ? Date.parse(a.dueAt) : Infinity)-(b.dueAt ? Date.parse(b.dueAt) : Infinity)||Date.parse(b.createdAt)-Date.parse(a.createdAt)||a.id.localeCompare(b.id)); }
export function splitTodayGroups(tasks: TaskDTO[], now = new Date()) { return { overdue: tasks.filter(t=>t.dueAt && Date.parse(t.dueAt)<now.getTime()), today: tasks.filter(t=>!t.dueAt || Date.parse(t.dueAt)>=now.getTime()) }; }
export { startOfDayInZone } from "@/shared/time";
export type NavCounts = Awaited<ReturnType<typeof navCounts>>;
