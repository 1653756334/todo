import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import sharp from "sharp";
import {prisma} from "../src/server/infra/db";
import {saveGroup,readGroup,saveChannel} from "../src/server/settings/service";
import {createTask,updateTask} from "../src/server/tasks/service";
import {processDelivery} from "../src/server/notifications/delivery";
import {dispatchOutbox,reconcile} from "../src/server/jobs/service";
import {jobQueue,closeQueue} from "../src/server/infra/queue";
import {createDraft,commitDraft,cancelDraft,cleanupAsset} from "../src/server/imports/service";
import {readObject} from "../src/server/infra/storage";
import {reserveAi,settleAi} from "../src/server/ai/service";
import type {Actor} from "../src/server/auth/permissions";
let admin:Actor,user:Actor;
const oldGroups: Record<string,unknown>={};
test.before(async()=>{const suffix=randomUUID().slice(0,8);admin=await prisma.user.create({data:{username:`integration-admin${suffix}`,displayName:"Admin",role:"ADMIN",passwordHash:"fixture",preference:{create:{}}}}) as Actor;user=await prisma.user.create({data:{username:`integration-user${suffix}`,displayName:"User",passwordHash:"fixture",preference:{create:{}}}}) as Actor;for(const g of ['smtp','ai','policy'])oldGroups[g]=await prisma.systemSetting.findUnique({where:{group:g}});});
test("settings parse all values before committing; ordinary user cannot configure global AI",async()=>{
 const old=await readGroup('smtp');await assert.rejects(saveGroup(admin,'smtp',{host:'changed',port:1.5,fromAddress:'mail@example.com'},old.revision));assert.equal((await readGroup('smtp')).revision,old.revision);await assert.rejects(saveGroup(user,'ai',{enabled:true,baseUrl:'https://example.com',model:'test'},0));
});
test("delivery lease excludes duplicate workers, retries only failed channel, and outbox reconstructs Redis jobs",async()=>{
 const c1=await saveChannel(user,{type:'WEBHOOK',label:'same',enabled:true,minPriority:'low',webhook:'https://example.com/hook'});const c2=await saveChannel(user,{type:'WEBHOOK',label:'same',enabled:true,minPriority:'low',webhook:'https://example.com/hook2'});
 const t=await createTask(user,{title:'notification fixture',dueAt:new Date(Date.now()+3600000).toISOString(),remindLeadMin:1});
 const r=await prisma.reminder.findFirstOrThrow({where:{taskId:t.id},include:{deliveries:true}});
 for(const d of r.deliveries)await prisma.notificationDelivery.update({where:{id:d.id},data:{nextAttemptAt:new Date()}});
 let sends=0;const good=r.deliveries.find(d=>d.channelId===c1.id)!;
 await Promise.all([processDelivery(good.id,1,async()=>{sends++;await new Promise(r=>setTimeout(r,30));}),processDelivery(good.id,1,async()=>{sends++;})]);assert.equal(sends,1);
 const bad=r.deliveries.find(d=>d.channelId===c2.id)!;
 await processDelivery(bad.id,1,async()=>{throw new Error('fixture failure');});
 const failed=await prisma.notificationDelivery.findUniqueOrThrow({where:{id:bad.id}});assert.equal(failed.status,'RETRY_WAIT');assert.equal(failed.attempt,1);
 await processDelivery(good.id,1,async()=>{sends++;});assert.equal(sends,1);
 await dispatchOutbox();const job=await jobQueue().getJob(`delivery-${bad.id}-g${failed.dispatchVersion}`);assert(job);await job.remove();await reconcile();const restored=await prisma.notificationDelivery.findUniqueOrThrow({where:{id:bad.id}});assert.equal(restored.dispatchVersion,failed.dispatchVersion+1);assert(await prisma.jobOutbox.count({where:{targetId:bad.id,publishedAt:null}}));
 const updated=await updateTask(user,t.id,{status:'done',expectedRevision:t.revision});await processDelivery(bad.id,restored.dispatchVersion,async()=>{throw new Error('must not send');});assert.equal((await prisma.notificationDelivery.findUniqueOrThrow({where:{id:bad.id}})).status,'CANCELED');assert.equal(updated.status,'done');
});
test("MinIO drafts confirm exactly once under concurrent requests; independent identical images survive deletion",async()=>{
 const data=await sharp({create:{width:8,height:8,channels:3,background:'#fff'}}).png().toBuffer();const image={name:'fixture.png',dataUrl:`data:image/png;base64,${data.toString('base64')}`};
 const d1=await createDraft(user,'source',[image]);const d2=await createDraft(user,'other source',[image]);
 const [a,b]=await Promise.all([commitDraft(user,{draftId:d1.id,clientMutationId:'one',items:[{title:'imported'}]}),commitDraft(user,{draftId:d1.id,clientMutationId:'one',items:[{title:'imported'}]})]);assert.equal(a.importId,b.importId);assert.equal(await prisma.task.count({where:{sourceId:a.importId}}),1);
 await assert.rejects(commitDraft(admin,{draftId:d1.id,clientMutationId:'steal',items:[{title:'bad'}]}));
 const i1=await prisma.importImage.findFirstOrThrow({where:{importId:a.importId}});const i2=await prisma.importImage.findFirstOrThrow({where:{draftId:d2.id}});assert.notEqual(i1.storageKey,i2.storageKey);assert.equal(i1.sha256,i2.sha256);
 await cancelDraft(user,d2.id);await cleanupAsset(i2.id);assert((await readObject(i1.storageKey)).length>0);
 // Explicitly dispose only test-owned resources.
 await prisma.importImage.update({where:{id:i1.id},data:{status:'DELETING'}});await cleanupAsset(i1.id);
});
test("parallel AI reservations never exceed daily quota; UNKNOWN is charged once",async()=>{
 const prior=await readGroup('ai');await saveGroup(admin,'ai',{enabled:true,publicEnabled:true,baseUrl:'https://example.com/v1',model:'fixture',dailyQuota:1,concurrency:4},prior.revision);
 const outcomes=await Promise.allSettled([reserveAi(user),reserveAi(user)]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);const call=(outcomes.find(x=>x.status==='fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof reserveAi>>>).value.call;
 await settleAi(call.id,'UNKNOWN');await settleAi(call.id,'UNKNOWN');const budget=await prisma.aiDailyBudget.findUniqueOrThrow({where:{userId_dayUtc:{userId:user.id,dayUtc:call.dayUtc}}});assert.equal(budget.used,1);assert.equal(budget.reserved,0);await assert.rejects(reserveAi(user));
});
test.after(async()=>{await closeQueue();await prisma.task.deleteMany({where:{ownerId:{in:[admin.id,user.id]}}});await prisma.importDraft.deleteMany({where:{ownerId:{in:[admin.id,user.id]}}});await prisma.user.deleteMany({where:{id:{in:[admin.id,user.id]}}});for(const g of ['smtp','ai','policy']){const row=oldGroups[g] as {value:never;revision:number;updatedBy:string|null}|null;if(row)await prisma.systemSetting.upsert({where:{group:g},create:{group:g,...row},update:row});else await prisma.systemSetting.deleteMany({where:{group:g}});}await prisma.$disconnect();});
