import {createHash,randomUUID} from "node:crypto";
import sharp from "sharp";
import {z} from "zod";
import {prisma} from "@/server/infra/db";
import {putObject,readObject,deleteObject} from "@/server/infra/storage";
import type {Actor} from "@/server/auth/permissions";
import {prepareImportImages} from "./images";
import {assert} from "@/shared/errors";
import {MAX_IMPORT_TEXT} from "@/shared/import-media";
import {taskCreateSchema} from "@/shared/tasks";
import {createTaskTx} from "@/server/tasks/service";
import {serializeTask,taskInclude} from "@/server/tasks/queries";
export async function createDraft(actor:Actor,text:string,images:unknown) {
 assert(text.length<=MAX_IMPORT_TEXT,400,"原文超出长度上限");
 const prepared=await prepareImportImages(images);assert(text.trim()||prepared.length,400,"请输入文字或添加图片");
 const draft=await prisma.importDraft.create({data:{ownerId:actor.id,rawText:text,expiresAt:new Date(Date.now()+86400000)}});
 for(const image of prepared){const id=randomUUID();const key=`users/${actor.id}/imports/${draft.id}/${id}.jpg`;const m=await sharp(image.data).metadata();
  await prisma.importImage.create({data:{id,ownerId:actor.id,draftId:draft.id,name:image.name,mimeType:image.mimeType,storageKey:key,size:image.data.length,width:m.width!,height:m.height!,sha256:createHash("sha256").update(image.data).digest("hex"),expiresAt:draft.expiresAt}});
  await putObject(key,image.data,image.mimeType);await prisma.importImage.update({where:{id},data:{status:"READY"}});
 }
 return draft;
}
export async function loadDraft(actor:Actor,id:string){const d=await prisma.importDraft.findFirst({where:{id,ownerId:actor.id},include:{images:true}});assert(d && d.status==="DRAFT" && d.expiresAt>new Date(),404,"导入草稿已失效");assert(d.images.every(i=>i.status==="READY"),409,"图片尚未准备完成");return d;}
export async function draftImages(actor:Actor,id:string){const d=await loadDraft(actor,id);const images=[];for(const i of d.images){const data=await readObject(i.storageKey);images.push({name:i.name,dataUrl:`data:${i.mimeType};base64,${data.toString("base64")}`});}return {draft:d,images};}
export async function commitDraft(actor:Actor,input:unknown){
 const b=z.object({draftId:z.string(),clientMutationId:z.string().min(1).max(100),items:z.array(taskCreateSchema).min(1).max(50)}).strict().parse(input);
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "ImportDraft" WHERE id=${b.draftId} AND "ownerId"=${actor.id} FOR UPDATE`;
  const d=await tx.importDraft.findFirst({where:{id:b.draftId,ownerId:actor.id},include:{images:true}});assert(d,404,"草稿不存在");
  if(d.status==="COMMITTED" && d.committedImportId){const rows=await tx.task.findMany({where:{sourceId:d.committedImportId,ownerId:actor.id},include:taskInclude});return {created:rows.length,importId:d.committedImportId,tasks:rows.map(serializeTask)};}
  assert(d.status==="DRAFT" && d.expiresAt>new Date() && d.images.every(i=>i.status==="READY"),409,"草稿已失效或图片不可用");
  const source=await tx.import.create({data:{ownerId:actor.id,rawText:d.rawText,provider:d.provider,model:d.model}});
  await tx.importImage.updateMany({where:{draftId:d.id,ownerId:actor.id},data:{importId:source.id,draftId:null,expiresAt:null}});
  const tasks=[];for(const [index,item] of b.items.entries())tasks.push(await createTaskTx(tx,actor,{...item,clientMutationId:`draft-${d.id}-${index}`},source.id));
  await tx.importDraft.update({where:{id:d.id},data:{status:"COMMITTED",committedImportId:source.id,commitRequestId:b.clientMutationId}});
  return {created:tasks.length,importId:source.id,tasks};
 },{timeout:20000});
}
async function markAssets(ids:string[]){await prisma.$transaction(async tx=>{for(const id of ids){const c=await tx.importImage.updateMany({where:{id,status:{in:["READY","STAGING"]}},data:{status:"DELETING"}});if(c.count)await tx.jobOutbox.upsert({where:{kind_targetId_dispatchVersion:{kind:"DELETE_ASSET",targetId:id,dispatchVersion:1}},create:{kind:"DELETE_ASSET",targetId:id,dispatchVersion:1,availableAt:new Date()},update:{publishedAt:null}});}});}
export async function cancelDraft(actor:Actor,id:string){const d=await prisma.importDraft.findFirst({where:{id,ownerId:actor.id,status:"DRAFT"}});assert(d,404,"草稿不存在");await prisma.importDraft.update({where:{id},data:{status:"CANCELED",expiresAt:new Date()}});await markAssets((await prisma.importImage.findMany({where:{draftId:id},select:{id:true}})).map(i=>i.id));}
export async function cleanupAsset(id:string){const a=await prisma.importImage.findUnique({where:{id}});if(!a || a.status!=="DELETING")return;await deleteObject(a.storageKey);await prisma.importImage.deleteMany({where:{id,status:"DELETING"}});}
export async function cleanupImports(){
 const expired=await prisma.importImage.findMany({where:{status:{in:["READY","STAGING"]},expiresAt:{lt:new Date()}},take:100});await markAssets(expired.map(i=>i.id));
 const sources=await prisma.import.findMany({where:{orphanedAt:{lt:new Date(Date.now()-30*86400000)},tasks:{none:{}}},include:{images:true},take:100});
 for(const s of sources){await markAssets(s.images.map(i=>i.id));if(!s.images.length)await prisma.import.deleteMany({where:{id:s.id,tasks:{none:{}}}});}
 // Re-publish failed object cleanup jobs. Idempotent deletion tolerates missing objects.
 for(const a of await prisma.importImage.findMany({where:{status:"DELETING"},take:100}))await prisma.jobOutbox.upsert({where:{kind_targetId_dispatchVersion:{kind:"DELETE_ASSET",targetId:a.id,dispatchVersion:1}},create:{kind:"DELETE_ASSET",targetId:a.id,dispatchVersion:1,availableAt:new Date()},update:{publishedAt:null}});
 await prisma.importDraft.deleteMany({where:{expiresAt:{lt:new Date()},images:{none:{}},status:{not:"COMMITTED"}}});
}
