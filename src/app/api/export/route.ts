import {Readable,PassThrough} from "node:stream";
import {once} from "node:events";
import {ZipArchive} from "archiver";
import {handler,requireUser} from "@/server/adapters/http";
import {prisma} from "@/server/infra/db";
import {getObject} from "@/server/infra/storage";
async function* jsonExport(ownerId:string){
 yield '{"version":2,"exportedAt":'+JSON.stringify(new Date().toISOString())+',"projects":'+JSON.stringify(await prisma.project.findMany({where:{ownerId}}))+',"tasks":[';
 let cursor:string|undefined,first=true;
 for(;;){const rows=await prisma.task.findMany({where:{ownerId},orderBy:{id:"asc"},take:100,...(cursor?{cursor:{id:cursor},skip:1}:{}),include:{tags:true,links:true}});if(!rows.length)break;for(const t of rows){yield (first?"":",")+JSON.stringify(t);first=false;}cursor=rows.at(-1)!.id;}
 yield '],"imports":[';cursor=undefined;first=true;
 for(;;){const rows: Awaited<ReturnType<typeof prisma.import.findMany>> & { images?: unknown[] }[] = await prisma.import.findMany({where:{ownerId},orderBy:{id:"asc"},take:100,...(cursor?{cursor:{id:cursor},skip:1}:{}),include:{images:{where:{status:"READY"},select:{id:true,name:true,mimeType:true,size:true,sha256:true}}}});if(!rows.length)break;for(const s of rows){yield (first?"":",")+JSON.stringify(s);first=false;}cursor=rows.at(-1)!.id;}
 yield "]}";
}
export const GET=handler(async request=>{
 const u=await requireUser();const zip=new URL(request.url).searchParams.get("format")==="zip";
 if(!zip)return new Response(Readable.toWeb(Readable.from(jsonExport(u.id))) as ReadableStream,{headers:{"content-type":"application/json","content-disposition":"attachment; filename=todo-export.json"}});
 const archive=new ZipArchive({zlib:{level:5}}),output=new PassThrough();archive.pipe(output);archive.on("error",e=>output.destroy(e));
 void(async()=>{try{archive.append(Readable.from(jsonExport(u.id)),{name:"todo.json"});await once(archive,"entry");let cursor:string|undefined;for(;;){const images=await prisma.importImage.findMany({where:{ownerId:u.id,status:"READY",importId:{not:null}},take:100,orderBy:{id:"asc"},...(cursor?{cursor:{id:cursor},skip:1}:{})});if(!images.length)break;for(const i of images){const body=await getObject(i.storageKey);archive.append(Readable.fromWeb(body.transformToWebStream() as import("node:stream/web").ReadableStream),{name:`images/${i.id}.jpg`});await once(archive,"entry");}cursor=images.at(-1)!.id;}await archive.finalize();}catch(e){output.destroy(e as Error);archive.abort();}})();
 return new Response(Readable.toWeb(output) as ReadableStream,{headers:{"content-type":"application/zip","content-disposition":"attachment; filename=todo-export.zip"}});
});
