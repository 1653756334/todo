import {handler,requireUser,readJson} from "@/server/adapters/http";
import {commitDraft} from "@/server/imports/service";
export const POST=handler(async request=>commitDraft(await requireUser(),await readJson(request)));
