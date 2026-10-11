"use client";
import {apiFetch} from "@/lib/client";
import type {TaskDTO} from "@/shared/types";
const queues=new Map<string,Promise<unknown>>();
const versions=new Map<string,number>();
export function rememberRevision(task:TaskDTO){versions.set(task.id,Math.max(versions.get(task.id)??0,task.revision));}
export async function patchTask(task:TaskDTO,body:Record<string,unknown>):Promise<TaskDTO>{
 rememberRevision(task);
 const previous=queues.get(task.id)??Promise.resolve();
 const run=previous.catch(()=>{}).then(async()=>{
  const result=await apiFetch<{task:TaskDTO}>(`/api/tasks/${task.id}`,{method:"PATCH",body:{...body,expectedRevision:versions.get(task.id)??task.revision,clientMutationId:crypto.randomUUID()}});
  rememberRevision(result.task);return result.task;
 });queues.set(task.id,run);
 try{return await run;}finally{if(queues.get(task.id)===run)queues.delete(task.id);}
}
