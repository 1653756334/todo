import {prisma} from "@/server/infra/db";
import {handler,requireUser} from "@/server/adapters/http";
import {assert} from "@/shared/errors";
type Context={params:Promise<{id:string}>};
export const POST=handler<Context>(async(_r,c)=>{
 const u=await requireUser();const {id}=await c.params;
 await prisma.$transaction(async tx=>{
  const r=await tx.reminder.findFirst({where:{id,recipientUserId:u.id},include:{task:{include:{project:true}},deliveries:{include:{channel:true}}}});
  assert(r,404,"提醒不存在");assert(r.task.status!=="done" && r.task.remindEnabled && !r.task.project?.archivedAt && r.planVersion===r.task.reminderVersion,409,"当前任务不允许重试");
  const failed=r.deliveries.filter(d=>d.status==="FAILED" && d.channel?.enabled);assert(failed.length,409,"没有可重试的失败渠道");
  for(const d of failed){const result=await tx.notificationDelivery.updateMany({where:{id:d.id,status:"FAILED",dispatchVersion:d.dispatchVersion},data:{status:"PENDING",attempt:0,errorCode:null,dispatchVersion:{increment:1},nextAttemptAt:new Date()}});assert(result.count===1,409,"投递状态已改变");await tx.jobOutbox.create({data:{kind:"DELIVERY",targetId:d.id,dispatchVersion:d.dispatchVersion+1,availableAt:new Date()}});}
  await tx.reminder.update({where:{id},data:{status:"pending"}});
 });return {ok:true};
});
