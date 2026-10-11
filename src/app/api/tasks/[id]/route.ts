import {handler,readJson,requireUser} from "@/server/adapters/http";
import {taskDetail} from "@/server/tasks/queries";
import {updateTask,deleteTask} from "@/server/tasks/service";
import {assert} from "@/shared/errors";
type Context={params:Promise<{id:string}>};
export const GET=handler<Context>(async (_r,c)=>({task:await taskDetail(await requireUser(),(await c.params).id)}));
export const PATCH=handler<Context>(async (r,c)=>({task:await updateTask(await requireUser(),(await c.params).id,await readJson(r))}));
export const DELETE=handler<Context>(async (r,c)=>{const u=await requireUser();const b=await readJson(r);assert(typeof b.expectedRevision === "number",400,"缺少版本");await deleteTask(u,(await c.params).id,b.expectedRevision);return {ok:true};});
