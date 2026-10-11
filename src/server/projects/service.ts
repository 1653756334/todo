import { prisma } from "@/server/infra/db";
import type { Actor } from "@/server/auth/permissions";
import { z } from "zod";
import { assert } from "@/shared/errors";
import { replanTask } from "@/server/notifications/service";
const fields=z.object({name:z.string().trim().min(1).max(100),repoUrl:z.union([z.literal(""),z.url()]).nullable().optional(),color:z.string().regex(/^#[a-f0-9]{6}$/i).nullable().optional()}).strict();
export async function projects(actor:Actor,includeArchived=false) {return prisma.project.findMany({where:{ownerId:actor.id,...(!includeArchived?{archivedAt:null}:{})},orderBy:{createdAt:"asc"}});}
export async function createProject(actor:Actor,input:unknown) {const b=fields.parse(input);return prisma.project.create({data:{...b,repoUrl:b.repoUrl||null,ownerId:actor.id}});}
export async function updateProject(actor:Actor,id:string,input:unknown) {
 const b=fields.partial().extend({archived:z.boolean().optional(),archivedAt:z.string().nullable().optional(),expectedRevision:z.number().int().optional()}).strict().parse(input);
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "Project" WHERE id=${id} AND "ownerId"=${actor.id} FOR UPDATE`;
  const p=await tx.project.findFirst({where:{id,ownerId:actor.id}});assert(p,404,"项目不存在");if(b.expectedRevision!==undefined)assert(p.revision===b.expectedRevision,409,"项目已改变");
  const archived=b.archived ?? (b.archivedAt!==undefined ? !!b.archivedAt : undefined);
  const {expectedRevision,archivedAt,...values}=b;delete values.archived;
  const updated=await tx.project.update({where:{id},data:{...values, ...(b.repoUrl!==undefined ? {repoUrl:b.repoUrl||null}:{}),...(archived!==undefined?{archivedAt:archived?new Date():null}:{}),revision:{increment:1}}});
  if(archived!==undefined) for(const t of await tx.task.findMany({where:{projectId:id},select:{id:true}})) { await tx.$queryRaw`SELECT id FROM "Task" WHERE id=${t.id} FOR UPDATE`;await replanTask(tx,t.id); }
  return updated;
 },{timeout:15000});
}
