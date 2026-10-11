import {handler,readJson,requireUser} from "@/server/adapters/http";
import {queryTasks,type TaskView} from "@/server/tasks/queries";
import {createTask} from "@/server/tasks/service";
import {assert} from "@/shared/errors";
export const GET=handler(async request=>{
  const actor=await requireUser();const q=new URL(request.url).searchParams;
  const view=q.get("view") ?? "all";assert(["today","inbox","all","completed","project"].includes(view),400,"视图无效");
  return queryTasks(actor,{view:view as TaskView,timeZone:actor.timezone,projectId:q.get("projectId"),status:q.get("status"),priority:q.get("priority"),tag:q.get("tag"),query:q.get("q"),cursor:q.get("cursor"),sort:q.get("sort")});
});
export const POST=handler(async request=>({task:await createTask(await requireUser(),await readJson(request))}));
