import {handler,readJson,requireUser} from "@/server/adapters/http";
import {projects,createProject} from "@/server/projects/service";
export const GET=handler(async r=>({projects:await projects(await requireUser(),new URL(r.url).searchParams.get("archived")==="1")}));
export const POST=handler(async r=>({project:await createProject(await requireUser(),await readJson(r))}));
