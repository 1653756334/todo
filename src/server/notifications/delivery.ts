import { randomUUID } from "node:crypto";
import { prisma } from "@/server/infra/db";
import { appUrl, encryptionKey } from "@/server/infra/env";
import { decryptSecret } from "@/server/auth/crypto.mjs";
import { readGroup, smtpConfig } from "@/server/settings/service";
import { buildTransport, fromHeader, renderReminderMail } from "./transports/email";
import { publishBot } from "./transports/webhook.mjs";
import { formatFullDateTime } from "@/shared/time";
export type SendDelivery = (data: Awaited<ReturnType<typeof loadDelivery>> & {}) => Promise<void>;
function loadDelivery(id:string) {return prisma.notificationDelivery.findUnique({where:{id},include:{channel:true,reminder:{include:{task:{include:{project:true}},recipient:{include:{preference:true}}}}}});}
async function send(d:NonNullable<Awaited<ReturnType<typeof loadDelivery>>>) {
 const c=d.channel!; const t=d.reminder.task,u=d.reminder.recipient;
 const anchorLabel=d.reminder.slot==="start"?"开始":"截止";
 if(c.type==="EMAIL") {
  const smtp=await smtpConfig(); if(!smtp || !c.email)throw new Error("CONFIG_ERROR");const transport=buildTransport(smtp);
  try {const m=renderReminderMail({title:t.title,projectName:t.project?.name,anchorAt:d.reminder.dueSnapshot,anchorLabel,timeZone:u.timezone,notes:c.brief?null:t.notes,taskId:t.id});await transport.sendMail({from:fromHeader(smtp),to:c.email,...(c.brief?{subject:`${anchorLabel}提醒：${t.title}`,text:`你有任务的${anchorLabel}时间快到了，请打开 ${appUrl()}/tasks?task=${t.id}`} :m),messageId:`<todo-${d.id}@todo.local>`});}finally{transport.close();}
 }else{
  if(!c.webhookEncrypted)throw new Error("CONFIG_ERROR");
  await publishBot({webhook:decryptSecret(c.webhookEncrypted,encryptionKey()),secret:c.signSecretEncrypted?decryptSecret(c.signSecretEncrypted,encryptionKey()):undefined,title:t.title,lines:[`${anchorLabel}：${formatFullDateTime(d.reminder.dueSnapshot,u.timezone)}`],clickUrl:`${appUrl()}/tasks?task=${t.id}`,brief:c.brief});
 }
}
export async function summarizeReminder(id:string) {
 const ds=await prisma.notificationDelivery.findMany({where:{reminderId:id}});
 if(!ds.length)return;
 const sent=ds.filter(x=>x.status==="SENT");const active=ds.some(x=>["PENDING","SENDING","RETRY_WAIT"].includes(x.status));
 const status=active?"pending":sent.length===ds.length?"sent":sent.length?"partial":ds.every(x=>x.status==="CANCELED")?"canceled":"failed";
 await prisma.reminder.updateMany({where:{id,status:{not:"canceled"}},data:{status,sentAt:sent[0]?.sentAt??null,attempt:Math.max(...ds.map(x=>x.attempt)),lastError:ds.find(x=>x.errorCode)?.errorCode??null}});
}
export async function processDelivery(id:string,dispatchVersion:number,sender:typeof send=send) {
 const now=new Date(),token=randomUUID();
 const claim=await prisma.notificationDelivery.updateMany({where:{id,dispatchVersion,status:{in:["PENDING","RETRY_WAIT"]},nextAttemptAt:{lte:now},OR:[{lockedUntil:null},{lockedUntil:{lt:now}}]},data:{status:"SENDING",claimToken:token,lockedUntil:new Date(Date.now()+60000)}});
 if(!claim.count)return;
 let d=await loadDelivery(id);if(!d)return;
 const {value:policy}=await readGroup("policy");
 const c=d.channel,r=d.reminder,t=r.task,u=r.recipient;
 const valid=c?.enabled && u.status==="ACTIVE" && t.ownerId===u.id && t.status!=="done" && t.remindEnabled && !t.project?.archivedAt && t.reminderVersion===r.planVersion && c.revision===d.channelRevision && (u.preference?.notificationVersion??1)===d.recipientVersion && (c.type==="EMAIL"?policy.emailAllowed && c.email && c.verifiedAt:policy.webhookAllowed && c.webhookEncrypted);
 const where={id,dispatchVersion,claimToken:token,status:"SENDING"};
 if(!valid || Date.now()-r.triggerAt.getTime()>policy.reminderGraceHours*3600000){await prisma.notificationDelivery.updateMany({where,data:{status:valid?"MISSED":"CANCELED",claimToken:null,lockedUntil:null}});await summarizeReminder(r.id);return;}
 // Re-read immediately before external IO; side effects cannot be atomically committed with PG.
 d=await loadDelivery(id);if(!d || d.claimToken!==token || d.status!=="SENDING")return;
 let errorCode:string|null=null;
 try{await sender(d);}catch(e){errorCode=e instanceof Error && /CONFIG|密文|密钥/.test(e.message)?"CONFIG_ERROR":e instanceof Error && /超时|Timeout/.test(e.message)?"TIMEOUT":"DELIVERY_FAILED";}
 await prisma.$transaction(async tx=>{
  const live=await tx.notificationDelivery.findFirst({where});if(!live)return;
  const attempt=live.attempt+1;
  if(!errorCode){await tx.notificationDelivery.update({where:{id},data:{status:"SENT",attempt,sentAt:new Date(),claimToken:null,lockedUntil:null,errorCode:null}});if(c)await tx.notificationChannel.updateMany({where:{id:c.id,revision:c.revision},data:{lastSuccessAt:new Date(),lastErrorCode:null}});}
  else{
   const retry=attempt<3 && errorCode!=="CONFIG_ERROR", nextAt=new Date(Date.now()+(attempt===1?60000:300000)),version=live.dispatchVersion+1;
   await tx.notificationDelivery.update({where:{id},data:{status:retry?"RETRY_WAIT":"FAILED",attempt,errorCode,claimToken:null,lockedUntil:null,nextAttemptAt:nextAt,dispatchVersion:version}});
   if(retry)await tx.jobOutbox.create({data:{kind:"DELIVERY",targetId:id,dispatchVersion:version,availableAt:nextAt}});
   if(c)await tx.notificationChannel.updateMany({where:{id:c.id},data:{lastErrorCode:errorCode}});
  }
 });
 await summarizeReminder(r.id);
}
