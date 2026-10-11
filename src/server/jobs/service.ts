import {randomUUID} from "node:crypto";
import {prisma} from "@/server/infra/db";
import {jobQueue} from "@/server/infra/queue";
import {replanUser} from "@/server/notifications/service";
import {processDelivery} from "@/server/notifications/delivery";
import {recoverAi} from "@/server/ai/service";
import {cleanupAsset,cleanupImports} from "@/server/imports/service";
export async function dispatchOutbox() {
 const q=jobQueue();
 const rows=await prisma.jobOutbox.findMany({where:{publishedAt:null,processedAt:null,OR:[{lockedUntil:null},{lockedUntil:{lt:new Date()}}]},orderBy:{availableAt:"asc"},take:100});
 for(const row of rows){
  const token=randomUUID();const c=await prisma.jobOutbox.updateMany({where:{id:row.id,publishedAt:null,OR:[{lockedUntil:null},{lockedUntil:{lt:new Date()}}]},data:{claimToken:token,lockedUntil:new Date(Date.now()+30000)}});if(!c.count)continue;
  try{const jobId=`${row.kind.toLowerCase()}-${row.targetId}-g${row.dispatchVersion}`;const old=await q.getJob(jobId);const state=await old?.getState();if(state==="failed"||state==="completed")await old!.remove();await q.add(row.kind,{targetId:row.targetId,dispatchVersion:row.dispatchVersion,outboxId:row.id},{jobId,delay:Math.max(0,row.availableAt.getTime()-Date.now())});await prisma.jobOutbox.updateMany({where:{id:row.id,claimToken:token},data:{publishedAt:new Date(),claimToken:null,lockedUntil:null}});}
  catch{await prisma.jobOutbox.updateMany({where:{id:row.id,claimToken:token},data:{claimToken:null,lockedUntil:null}});throw new Error("QUEUE_UNAVAILABLE");}
 }
}
export async function runJob(kind:string,targetId:string,version:number) {
 if(kind==="DELIVERY")return processDelivery(targetId,version);
 if(kind==="REPLAN_USER")return replanUser(targetId);
 if(kind==="REPLAN_ALL"){for(const u of await prisma.user.findMany({select:{id:true}}))await replanUser(u.id);return;}
 if(kind==="DELETE_ASSET")return cleanupAsset(targetId);
 throw new Error("UNKNOWN_JOB_KIND");
}
export async function reconcile() {
 const unprocessed=await prisma.jobOutbox.findMany({where:{processedAt:null,publishedAt:{not:null}},orderBy:{availableAt:"asc"},take:500});
 for(const row of unprocessed){const job=await jobQueue().getJob(`${row.kind.toLowerCase()}-${row.targetId}-g${row.dispatchVersion}`);const state=await job?.getState();if(!job||state==="completed"||state==="failed")await prisma.jobOutbox.updateMany({where:{id:row.id,processedAt:null},data:{publishedAt:null}});}
 const expired=await prisma.notificationDelivery.findMany({where:{status:"SENDING",lockedUntil:{lt:new Date()}},take:200});
 for(const d of expired)await prisma.$transaction(async tx=>{
  const version=d.dispatchVersion+1;
  const c=await tx.notificationDelivery.updateMany({where:{id:d.id,status:"SENDING",claimToken:d.claimToken,lockedUntil:{lt:new Date()}},data:{status:"RETRY_WAIT",claimToken:null,lockedUntil:null,dispatchVersion:version,nextAttemptAt:new Date()}});
  if(c.count)await tx.jobOutbox.create({data:{kind:"DELIVERY",targetId:d.id,dispatchVersion:version,availableAt:new Date()}});
 });
 const waiting=await prisma.notificationDelivery.findMany({where:{status:{in:["PENDING","RETRY_WAIT"]}},orderBy:{nextAttemptAt:"asc"},take:500});
 for(const d of waiting){
  const job=await jobQueue().getJob(`delivery-${d.id}-g${d.dispatchVersion}`);const state=await job?.getState();
  if(!job || state==="completed" || state==="failed")await prisma.$transaction(async tx=>{
   const version=d.dispatchVersion+1;const c=await tx.notificationDelivery.updateMany({where:{id:d.id,dispatchVersion:d.dispatchVersion,status:{in:["PENDING","RETRY_WAIT"]}},data:{dispatchVersion:version}});
   if(c.count)await tx.jobOutbox.create({data:{kind:"DELIVERY",targetId:d.id,dispatchVersion:version,availableAt:d.nextAttemptAt}});
  });
 }
}
export async function maintenance() {
 await cleanupImports();
 await recoverAi();
 const old=new Date(Date.now()-30*86400000);
 await prisma.loginAttempt.deleteMany({where:{createdAt:{lt:old}}});
 await prisma.accountToken.deleteMany({where:{expiresAt:{lt:old}}});
 await prisma.jobOutbox.deleteMany({where:{processedAt:{lt:new Date(Date.now()-7*86400000)}}});
}
