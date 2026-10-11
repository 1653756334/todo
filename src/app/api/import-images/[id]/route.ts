import {handler,requireUser} from "@/server/adapters/http";
import {prisma} from "@/server/infra/db";
import {getObject} from "@/server/infra/storage";
import {assert} from "@/shared/errors";
type Context={params:Promise<{id:string}>};
export const GET=handler<Context>(async(_r,c)=>{
 const u=await requireUser();const a=await prisma.importImage.findFirst({where:{id:(await c.params).id,ownerId:u.id,status:"READY"},include:{draft:true}});assert(a && (!a.draft || a.draft.status==="DRAFT" && a.draft.expiresAt>new Date()),404,"图片不存在");
 const body=await getObject(a.storageKey);
 return new Response(body.transformToWebStream() as ReadableStream,{headers:{"content-type":a.mimeType,"content-length":String(a.size),"cache-control":"private, no-store","x-content-type-options":"nosniff"}});
});
