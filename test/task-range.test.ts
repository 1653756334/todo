import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {prisma} from "../src/server/infra/db";
import {createTask,updateTask} from "../src/server/tasks/service";
import {taskDetail,queryTasks} from "../src/server/tasks/queries";
import {reminderIntents,parsePlanFingerprint} from "../src/server/notifications/plan";
import {saveChannel} from "../src/server/settings/service";
import {startOfDayInZone} from "../src/shared/time";
import {taskIsActive} from "../src/shared/types";
import type {Actor} from "../src/server/auth/permissions";
let user:Actor;
const key=randomUUID().slice(0,8);
test.before(async()=>{
 user=await prisma.user.create({data:{username:`range-user${key}`,displayName:"Range",passwordHash:"test",preference:{create:{}}}}) as Actor;
 await saveChannel(user,{type:"WEBHOOK",label:"range hook",enabled:true,minPriority:"low",webhook:"https://example.com/range-hook"});
});
test("纯函数：区间排两条提醒，单点只排一条，已过的时间不补提醒",()=>{
 const now=new Date("2026-01-01T00:00:00.000Z");
 const base={status:"todo",remindEnabled:true,remindLeadMin:60,remindStartLeadMin:15,startAt:null,dueAt:null};
 const ranged=reminderIntents({...base,startAt:new Date("2026-01-01T10:00:00Z"),dueAt:new Date("2026-01-01T12:00:00Z")},false,1,now);
 assert.deepEqual(ranged.map(i=>i.slot),["start","end"]);
 assert.deepEqual(ranged.map(i=>i.triggerAt.toISOString()),["2026-01-01T09:45:00.000Z","2026-01-01T11:00:00.000Z"]);
 assert.deepEqual(ranged.map(i=>i.anchorAt.toISOString()),["2026-01-01T10:00:00.000Z","2026-01-01T12:00:00.000Z"]);
 const single=reminderIntents({...base,dueAt:new Date("2026-01-01T12:00:00Z")},false,1,now);
 assert.deepEqual(single.map(i=>i.slot),["end"]);
 const past=reminderIntents({...base,startAt:new Date("2025-12-31T10:00:00Z"),dueAt:new Date("2026-01-01T12:00:00Z")},false,1,now);
 assert.deepEqual(past.map(i=>i.slot),["end"]);
 const done=reminderIntents({...base,status:"done",dueAt:new Date("2026-01-01T12:00:00Z")},false,1,now);
 assert.deepEqual(done,[]);
 const muted=reminderIntents({...base,remindEnabled:false,dueAt:new Date("2026-01-01T12:00:00Z")},false,1,now);
 assert.deepEqual(muted,[]);
 const noChannel=reminderIntents({...base,dueAt:new Date("2026-01-01T12:00:00Z")},false,0,now);
 assert.deepEqual(noChannel,[]);
});
test("旧版计划指纹归到截止槽，升级后不会重发已发出的提醒",()=>{
 assert.deepEqual(parsePlanFingerprint(JSON.stringify({intent:"2026-01-01T12:00:00.000Z/60"})),{intents:{end:"end:2026-01-01T12:00:00.000Z/60"}});
 assert.deepEqual(parsePlanFingerprint(JSON.stringify({intents:{start:"s",end:"e"}})),{intents:{start:"s",end:"e"}});
 assert.equal(parsePlanFingerprint(null),null);
 assert.equal(parsePlanFingerprint("{oops"),null);
});
test("区间任务的提醒、排序、「今天」判定与状态校验",async()=>{
 const timeZone=user.timezone;
 const now=Date.now();
 const day=startOfDayInZone(new Date(now),timeZone);
 // 与今天有关的时刻：从今天零点起算，不受当前钟点影响
 const fromDay=(hours:number)=>new Date(day.getTime()+hours*3600000).toISOString();
 // 一定在未来的时刻：给提醒断言用
 const fromNow=(hours:number)=>new Date(now+hours*3600000).toISOString();
 try{
  const ranged=await createTask(user,{title:"区间任务",startAt:fromNow(1),dueAt:fromNow(3),remindStartLeadMin:30,remindLeadMin:60});
  const single=await createTask(user,{title:"单点任务",dueAt:fromNow(5)});
  const rangedToday=await createTask(user,{title:"今天的区间",startAt:fromDay(1),dueAt:fromDay(9)});
  const singleToday=await createTask(user,{title:"今天的单点",dueAt:fromDay(2)});
  const ongoing=await createTask(user,{title:"跨天的区间",startAt:fromDay(-10),dueAt:fromDay(3)});
  const tomorrow=await createTask(user,{title:"明天的区间",startAt:fromDay(25),dueAt:fromDay(27)});

  // 提醒：区间两条（开始 / 截止），单点一条
  const reminders=await prisma.reminder.findMany({where:{taskId:ranged.id},orderBy:{slot:"asc"}});
  assert.deepEqual(reminders.map(r=>r.slot),["end","start"]);
  assert.deepEqual(reminders.find(r=>r.slot==="end")!.dueSnapshot.toISOString(),new Date(fromNow(3)).toISOString());
  assert.deepEqual(reminders.find(r=>r.slot==="start")!.dueSnapshot.toISOString(),new Date(fromNow(1)).toISOString());
  assert.equal(await prisma.reminder.count({where:{taskId:single.id}}),1);
  assert.equal((await prisma.reminder.findFirstOrThrow({where:{taskId:single.id}})).slot,"end");
  const detail=await taskDetail(user,ranged.id);
  assert.equal(detail.startAt,fromNow(1));
  assert.equal(detail.remindStartLeadMin,30);
  assert.equal(detail.reminders.start?.slot,"start");
  assert.equal(detail.reminders.end?.slot,"end");
  assert.equal((await taskDetail(user,single.id)).reminders.start,null);

  // 排序按开始时间：开始早的排前面，即使截止更晚
  const today=await queryTasks(user,{view:"today",timeZone,limit:50});
  const ids=today.tasks.map(t=>t.id);
  assert.ok(ids.indexOf(rangedToday.id)<ids.indexOf(singleToday.id),"有区间的任务按开始时间排在单点任务前");
  assert.ok(ids.includes(ongoing.id),"与今天有交集的区间任务算今天");
  assert.ok(!ids.includes(tomorrow.id),"明天的区间任务不算今天");

  // 「进行中」只是展示，不改状态
  assert.equal(taskIsActive({startAt:detail.startAt,dueAt:detail.dueAt,status:detail.status}),false);
  const nowIso=new Date().toISOString();
  assert.equal(taskIsActive({startAt:new Date(Date.now()-60000).toISOString(),dueAt:new Date(Date.now()+60000).toISOString(),status:"todo"}),true);
  assert.equal(taskIsActive({startAt:new Date(Date.now()-60000).toISOString(),dueAt:new Date(Date.now()+60000).toISOString(),status:"done"}),false);
  assert.equal(taskIsActive({startAt:null,dueAt:nowIso,status:"todo"}),false);
  assert.equal(detail.status,"todo");

  // 已发过的锚点不会因为改提前量而重发
  const startReminder=reminders.find(r=>r.slot==="start")!;
  await prisma.notificationDelivery.updateMany({where:{reminderId:startReminder.id},data:{status:"SENT",sentAt:new Date()}});
  await prisma.reminder.update({where:{id:startReminder.id},data:{status:"sent"}});
  const patched=await updateTask(user,ranged.id,{remindLeadMin:90,expectedRevision:detail.revision});
  assert.equal(patched.reminders.start?.id,startReminder.id);
  assert.equal(patched.reminders.start?.status,"sent");
  assert.equal(patched.reminders.end?.status,"pending");
  assert.equal(await prisma.reminder.count({where:{taskId:ranged.id,slot:"start"}}),1);
  // 再改一次（跨计划版本）也不会把「开始」重发一遍
  const again=await updateTask(user,ranged.id,{remindLeadMin:120,expectedRevision:patched.revision});
  assert.equal(again.reminders.start?.id,startReminder.id);
  assert.equal(await prisma.reminder.count({where:{taskId:ranged.id,slot:"start"}}),1);
  assert.equal(again.reminders.end?.status,"pending");

  // 校验：开始不能晚于截止，有开始就必须有截止
  await assert.rejects(createTask(user,{title:"乱序",startAt:fromNow(5),dueAt:fromNow(4)}),/开始时间要早于截止时间/);
  await assert.rejects(createTask(user,{title:"只有开始",startAt:fromNow(5)}),/设置开始时间时也要有截止时间/);
  const current=await taskDetail(user,ranged.id);
  await assert.rejects(updateTask(user,ranged.id,{dueAt:fromNow(0),expectedRevision:current.revision}),/开始时间要早于截止时间/);
  const fresh=await taskDetail(user,single.id);
  await assert.rejects(updateTask(user,single.id,{startAt:fresh.dueAt!,expectedRevision:fresh.revision}),/开始时间要早于截止时间/);

  // 清掉开始时间就回到单点
  const cleared=await updateTask(user,ranged.id,{startAt:null,expectedRevision:current.revision});
  assert.equal(cleared.startAt,null);
  assert.equal((await prisma.task.findUniqueOrThrow({where:{id:ranged.id}})).sortAt?.toISOString(),cleared.dueAt);

  // sortAt 由触发器兜底：绕过服务层写入也一致
  const raw=await prisma.task.create({data:{ownerId:user.id,title:"直接写入",startAt:new Date(fromDay(6)),dueAt:new Date(fromDay(8))}});
  assert.equal(raw.sortAt?.toISOString(),fromDay(6));
  const rawSingle=await prisma.task.create({data:{ownerId:user.id,title:"直接写入单点",dueAt:new Date(fromDay(7))}});
  assert.equal(rawSingle.sortAt?.toISOString(),fromDay(7));
 }finally{
  await prisma.task.deleteMany({where:{ownerId:user.id}});
 }
});
test.after(async()=>{
 await prisma.user.deleteMany({where:{id:user.id}});
 await prisma.$disconnect();
});
