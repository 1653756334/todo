import { prisma } from "@/server/infra/db";
import type { Prisma } from "@prisma/client";
import type { Actor } from "@/server/auth/permissions";
import { assert } from "@/shared/errors";
import { taskCreateSchema, taskPatchSchema, bulkSchema } from "@/shared/tasks";
import { replanTask } from "@/server/notifications/service";
import { taskInclude, serializeTask } from "./queries";
export async function checkProject(tx: Prisma.TransactionClient, actor: Actor, id: string | null | undefined) {
  if (!id) return;
  const p = await tx.project.findFirst({ where: { id, ownerId: actor.id } });
  assert(p && !p.archivedAt, 400, "所选项目不存在或已归档");
}
export async function createTaskTx(tx: Prisma.TransactionClient, actor: Actor, input: unknown, sourceId?: string) {
  const b = taskCreateSchema.parse(input); await checkProject(tx,actor,b.projectId);
  if (b.clientMutationId) { const existing = await tx.task.findFirst({ where: { ownerId: actor.id, clientMutationId: b.clientMutationId }, include: taskInclude }); if (existing) return serializeTask(existing); }
  const defaults = await tx.userPreference.findUnique({where:{userId:actor.id}});
  const {tags,links,dueAt,...fields}=b;
  const t=await tx.task.create({ data: { ...fields, ownerId:actor.id, dueAt:dueAt ? new Date(dueAt) : null, remindEnabled:b.remindEnabled ?? defaults?.remindEnabled ?? true, remindLeadMin:b.remindLeadMin ?? defaults?.remindLeadMin ?? 60, completedAt:b.status === "done" ? new Date() : null, sourceId, tags:{create:tags?.map(tag=>({tag})) ?? []},links:{create:links ?? []} } });
  await replanTask(tx,t.id); return serializeTask(await tx.task.findUniqueOrThrow({where:{id:t.id},include:taskInclude}));
}
export async function createTask(actor: Actor,input:unknown) {
  return prisma.$transaction(async tx => { await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.id}))`; return createTaskTx(tx,actor,input); });
}
export async function updateTaskTx(tx:Prisma.TransactionClient,actor:Actor,id:string,input:unknown) {
  const b=taskPatchSchema.parse(input);
  await tx.$queryRaw`SELECT id FROM "Task" WHERE id = ${id} AND "ownerId" = ${actor.id} FOR UPDATE`;
  const old=await tx.task.findFirst({where:{id,ownerId:actor.id},include:taskInclude}); assert(old,404,"任务不存在");
  if (b.clientMutationId && old.lastMutationId === b.clientMutationId) return serializeTask(old);
  assert(old.revision === b.expectedRevision,409,"任务已被修改，请加载最新内容", "CONFLICT");
  assert(!old.project?.archivedAt,409,"归档项目只读"); await checkProject(tx,actor,b.projectId);
  const {tags,links,dueAt,expectedRevision,clientMutationId,...fields}=b;
  const data: Prisma.TaskUncheckedUpdateInput={...fields};
  if(dueAt !== undefined) data.dueAt=dueAt ? new Date(dueAt) : null;
  if(b.status !== undefined && b.status !== old.status) data.completedAt=b.status === "done" ? new Date() : null;
  const changed = Object.entries(fields).some(([k,v])=>old[k as keyof typeof old] !== v) || dueAt !== undefined && (old.dueAt?.toISOString() ?? null) !== (dueAt ? new Date(dueAt).toISOString() : null) || tags !== undefined && JSON.stringify([...tags].sort()) !== JSON.stringify(old.tags.map(x=>x.tag).sort()) || links !== undefined && JSON.stringify(links) !== JSON.stringify(old.links);
  if(!changed) return serializeTask(old);
  await tx.task.update({where:{id},data:{...data,revision:{increment:1},lastMutationId:clientMutationId ?? null}});
  if(tags !== undefined) {await tx.taskTag.deleteMany({where:{taskId:id}}); if(tags.length) await tx.taskTag.createMany({data:tags.map(tag=>({taskId:id,tag}))});}
  if(links !== undefined) {await tx.taskLink.deleteMany({where:{taskId:id}}); if(links.length) await tx.taskLink.createMany({data:links.map(l=>({...l,taskId:id}))});}
  await replanTask(tx,id); return serializeTask(await tx.task.findUniqueOrThrow({where:{id},include:taskInclude}));
}
export async function updateTask(actor:Actor,id:string,input:unknown) { return prisma.$transaction(tx=>updateTaskTx(tx,actor,id,input)); }
export async function deleteTaskTx(tx:Prisma.TransactionClient,actor:Actor,id:string,revision:number) {
  const t=await tx.task.findFirst({where:{id,ownerId:actor.id},include:{project:true}});assert(t,404,"任务不存在");assert(t.revision===revision,409,"任务已改变，请刷新","CONFLICT");assert(!t.project?.archivedAt,409,"归档项目只读");
  const deleted=await tx.task.deleteMany({where:{id,ownerId:actor.id,revision}});assert(deleted.count===1,409,"任务已改变","CONFLICT");
  if(t.sourceId && !await tx.task.count({where:{sourceId:t.sourceId}})) await tx.import.update({where:{id:t.sourceId},data:{orphanedAt:new Date()}});
}
export async function deleteTask(actor:Actor,id:string,revision:number) {await prisma.$transaction(tx=>deleteTaskTx(tx,actor,id,revision));}
export async function bulkTasks(actor:Actor,input:unknown) {
  const b=bulkSchema.parse(input);
  return prisma.$transaction(async tx=>{
    const rows=await tx.task.findMany({where:{id:{in:b.ids},ownerId:actor.id}}); assert(rows.length===b.ids.length,404,"部分任务不存在或不可操作");
    if(b.action === "move") await checkProject(tx,actor,b.projectId);
    const tasks=[];
    for(const id of [...b.ids].sort()) {
      const expectedRevision=b.revisions[id]; assert(expectedRevision,400,"缺少任务版本");
      if(b.action === "delete") await deleteTaskTx(tx,actor,id,expectedRevision);
      else tasks.push(await updateTaskTx(tx,actor,id,{expectedRevision,...(b.action === "move" ? {projectId:b.projectId ?? null} : {status:b.action === "complete" ? "done" : "todo"})}));
    }
    return {succeeded:b.ids.length,failed:[],tasks};
  },{timeout:15000});
}
