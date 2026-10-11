import {prisma} from "@/server/infra/db";
import {handler,requireUser} from "@/server/adapters/http";
export const GET=handler(async request=>{
 const u=await requireUser();const params=new URL(request.url).searchParams;const take=Math.min(Math.max(Number(params.get("take"))||20,1),100);
 const [rows,h]=await Promise.all([prisma.reminder.findMany({where:{recipientUserId:u.id,...(params.get("status")?{status:params.get("status")!}:{})},orderBy:{triggerAt:"desc"},take,include:{task:{select:{id:true,title:true}},deliveries:true}}),prisma.workerHeartbeat.findFirst({orderBy:{lastSeenAt:"desc"}})]);
 return {worker:{healthy:!!h && Date.now()-h.lastSeenAt.getTime()<120000,lastSeen:h?.lastSeenAt.toISOString()??null},reminders:rows.map(r=>({...r,taskTitle:r.task.title,deliveries:r.deliveries.map(d=>({id:d.id,label:d.labelSnapshot,type:d.channelType,status:d.status,attempt:d.attempt,errorCode:d.errorCode}))}))};
});
