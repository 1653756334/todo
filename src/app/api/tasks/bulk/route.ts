import {handler,readJson,requireUser} from "@/server/adapters/http";
import {bulkTasks} from "@/server/tasks/service";
export const POST=handler(async r=>bulkTasks(await requireUser(),await readJson(r)));
