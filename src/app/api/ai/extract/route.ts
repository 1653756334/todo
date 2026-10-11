import {handler,readJson,requireUser} from "@/server/adapters/http";
import {extractDraft} from "@/server/ai/service";
import {z} from "zod";
export const runtime="nodejs";
export const maxDuration=120;
export const POST=handler(async request=>{const actor=await requireUser();const b=z.object({draftId:z.string()}).strict().parse(await readJson(request));return extractDraft(actor,b.draftId,request.signal);});
