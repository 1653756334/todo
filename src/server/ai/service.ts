import {prisma} from "@/server/infra/db";
import type {Actor} from "@/server/auth/permissions";
import {aiConfig} from "@/server/settings/service";
import {assert,AppError} from "@/shared/errors";
import {draftImages} from "@/server/imports/service";
import {extractTasks,safeHost} from "./provider";
export async function reserveAi(actor:Actor) {
 const config=await aiConfig(actor);assert(config,403,"AI 暂未开放或配置不可用");
 const day=new Date(new Date().toISOString().slice(0,10)+"T00:00:00Z");
 const call=await prisma.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(72135414)`;
  const u=await tx.user.findUniqueOrThrow({where:{id:actor.id}});assert(u.status==="ACTIVE",403,"账号不可用");
  const quota=u.aiDailyQuotaOverride??config.dailyQuota;
  const budget=await tx.aiDailyBudget.upsert({where:{userId_dayUtc:{userId:u.id,dayUtc:day}},create:{userId:u.id,dayUtc:day},update:{}});
  assert(budget.used+budget.reserved<quota,429,"今日 AI 次数已用完", "AI_QUOTA");
  assert(await tx.aiCall.count({where:{status:{in:["RESERVED","SENDING"]},reservationExpiresAt:{gt:new Date()}}})<config.concurrency,429,"AI 正忙，请稍后重试","AI_BUSY");
  await tx.aiDailyBudget.update({where:{userId_dayUtc:{userId:u.id,dayUtc:day}},data:{reserved:{increment:1}}});
  return tx.aiCall.create({data:{userId:u.id,dayUtc:day,providerConfigRevision:config.revision,reservationExpiresAt:new Date(Date.now()+120000)}});
 });return {call,config};
}
export async function settleAi(id:string,status:"SUCCEEDED"|"FAILED"|"UNKNOWN") {
 await prisma.$transaction(async tx=>{
  const c=await tx.aiCall.findUnique({where:{id}});if(!c||!["RESERVED","SENDING"].includes(c.status))return;
  const result=await tx.aiCall.updateMany({where:{id,status:c.status},data:{status,finishedAt:new Date()}});if(!result.count)return;
  await tx.aiDailyBudget.update({where:{userId_dayUtc:{userId:c.userId,dayUtc:c.dayUtc}},data:{reserved:{decrement:1},...(["SUCCEEDED","UNKNOWN"].includes(status)?{used:{increment:1}}:{})}});
 });
}
export async function extractDraft(actor:Actor,draftId:string,signal?:AbortSignal){
 const {draft,images}=await draftImages(actor,draftId);
 const {call,config}=await reserveAi(actor);
 try{
  await prisma.aiCall.update({where:{id:call.id},data:{status:"SENDING"}});
  const projects=await prisma.project.findMany({where:{ownerId:actor.id,archivedAt:null},select:{id:true,name:true}});
  const candidates=await extractTasks({...config,signal},draft.rawText,{now:new Date(),timeZone:actor.timezone,projects},images);
  await settleAi(call.id,"SUCCEEDED");
  await prisma.importDraft.updateMany({where:{id:draft.id,ownerId:actor.id,status:"DRAFT"},data:{provider:safeHost(config.baseUrl),model:config.model}});
  return {candidates,provider:safeHost(config.baseUrl),model:config.model,timeZone:actor.timezone,draftId};
 }catch(e){const unknown=signal?.aborted || e instanceof AppError && (e.status===504 || e.code==="UPSTREAM_UNKNOWN");await settleAi(call.id,unknown?"UNKNOWN":"FAILED");throw e;}
}
export async function recoverAi(){for(const c of await prisma.aiCall.findMany({where:{status:{in:["RESERVED","SENDING"]},reservationExpiresAt:{lt:new Date()}},take:100}))await settleAi(c.id,c.status==="SENDING"?"UNKNOWN":"FAILED");}
