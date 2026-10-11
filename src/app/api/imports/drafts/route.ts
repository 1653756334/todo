import {handler,requireUser} from "@/server/adapters/http";
import {createDraft,cancelDraft} from "@/server/imports/service";
import {assert} from "@/shared/errors";
export const POST=handler(async request=>{
 const actor=await requireUser();const reader=request.body?.getReader();assert(reader,400,"请求内容为空");const chunks:Uint8Array[]=[];let size=0;
 for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>11*1024*1024){await reader.cancel();assert(false,413,"上传内容过大");}chunks.push(r.value);}
 const form=await new Response(Buffer.concat(chunks),{headers:{"content-type":request.headers.get("content-type")??""}}).formData();
 const files=form.getAll("images");assert(files.length<=5,400,"一次最多 5 张图片");const images=[];let total=0;
 for(const f of files){assert(f instanceof File && f.size<=5*1024*1024,413,"每张图片不能超过 5 MB");total+=f.size;assert(total<=10*1024*1024,413,"图片总大小不能超过 10 MB");images.push({name:f.name,dataUrl:`data:${f.type};base64,${Buffer.from(await f.arrayBuffer()).toString("base64")}`});}
 const d=await createDraft(actor,String(form.get("text")??""),images);return {draftId:d.id,expiresAt:d.expiresAt};
});
export const DELETE=handler(async request=>{const actor=await requireUser();const id=new URL(request.url).searchParams.get("id");assert(id,400,"缺少草稿 ID");await cancelDraft(actor,id);return {ok:true};});
