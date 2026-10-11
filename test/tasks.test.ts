import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {prisma} from "../src/server/infra/db";
import {createTask,updateTask,bulkTasks} from "../src/server/tasks/service";
import {taskDetail,queryTasks,navCounts} from "../src/server/tasks/queries";
import {createProject,updateProject} from "../src/server/projects/service";
import type {Actor} from "../src/server/auth/permissions";
test("owned task writes, rollback, concurrent revision, idempotency and database ordering",async()=>{
 const key=randomUUID().slice(0,8);
 const a=await prisma.user.create({data:{username:`tasks-a${key}`,displayName:"A",passwordHash:"test",preference:{create:{}}}}) as Actor;
 const b=await prisma.user.create({data:{username:`tasks-b${key}`,displayName:"B",passwordHash:"test",preference:{create:{}}}}) as Actor;
 try{
  const p=await createProject(a,{name:"P"});
  const t=await createTask(a,{title:"task",projectId:p.id,tags:["old"],links:[{kind:"repo",url:"https://example.com"}],clientMutationId:key});
  assert.equal((await createTask(a,{title:"task",clientMutationId:key})).id,t.id);
  await assert.rejects(taskDetail(b,t.id));await assert.rejects(updateTask(b,t.id,{title:"stolen",expectedRevision:1}));
  await assert.rejects(createTask(b,{title:"bad",projectId:p.id}));
  await assert.rejects(updateTask(a,t.id,{title:" ",tags:[],expectedRevision:1}));
  assert.deepEqual((await taskDetail(a,t.id)).tags,["old"]);
  const result=await Promise.allSettled([updateTask(a,t.id,{notes:"first",expectedRevision:1}),updateTask(a,t.id,{notes:"second",expectedRevision:1})]);assert.equal(result.filter(x=>x.status==="fulfilled").length,1);
  const current=await taskDetail(a,t.id);const done=await updateTask(a,t.id,{status:"done",expectedRevision:current.revision});const again=await updateTask(a,t.id,{status:"done",expectedRevision:done.revision});assert.equal(done.completedAt,again.completedAt);assert.equal(done.revision,again.revision);
  const other=await createTask(b,{title:"private"});
  await assert.rejects(bulkTasks(a,{action:"reopen",ids:[t.id,other.id],revisions:{[t.id]:done.revision,[other.id]:1}}));assert.equal((await taskDetail(a,t.id)).status,"done");
  await prisma.task.createMany({data:Array.from({length:320},(_,i)=>({ownerId:a.id,title:`filler ${i}`,dueAt:new Date(Date.now()+86400000+i*60000)}))});
  const earliest=await createTask(a,{title:"earliest",dueAt:new Date(Date.now()+3600000).toISOString(),tags:["match"]});
  assert.equal((await queryTasks(a,{view:"all",timeZone:a.timezone,limit:1})).tasks[0].id,earliest.id);
  assert.equal((await queryTasks(a,{view:"all",timeZone:a.timezone,tag:"match"})).tasks.length,1);
  assert.equal((await navCounts(b)).all,1);
  await updateProject(a,p.id,{archived:true});await assert.rejects(updateTask(a,t.id,{notes:"blocked",expectedRevision:done.revision}));
 }finally{await prisma.task.deleteMany({where:{ownerId:{in:[a.id,b.id]}}});await prisma.user.deleteMany({where:{id:{in:[a.id,b.id]}}});}
});
test.after(async()=>{await prisma.$disconnect();});
