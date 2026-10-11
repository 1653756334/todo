import {handler,readJson,requireUser} from "@/server/adapters/http";
import {updateProject} from "@/server/projects/service";
type Context={params:Promise<{id:string}>};
export const PATCH=handler<Context>(async(r,c)=>({project:await updateProject(await requireUser(),(await c.params).id,await readJson(r))}));
export const DELETE=handler<Context>(async(_r,c)=>({project:await updateProject(await requireUser(),(await c.params).id,{archived:true})}));
