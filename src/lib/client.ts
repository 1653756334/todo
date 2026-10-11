"use client";
export class ApiError extends Error { constructor(message:string,public status:number,public code?:string){super(message);} }
type Options={method?:"GET"|"POST"|"PATCH"|"PUT"|"DELETE";body?:unknown;signal?:AbortSignal;};
export async function apiFetch<T>(path:string,options:Options={}):Promise<T>{
 const multipart=options.body instanceof FormData;
 let response:Response;
 try{response=await fetch(path,{method:options.method??"GET",headers:{...(multipart?{}:{"content-type":"application/json"}),"x-requested-with":"todo"},body:options.body===undefined?undefined:multipart?options.body as FormData:JSON.stringify(options.body),cache:"no-store",signal:options.signal});}
 catch(e){if((e as Error).name==="AbortError")throw e;throw new ApiError("网络连接中断，请检查后重试",0);}
 const raw=await response.text();let data:unknown=null;try{data=raw?JSON.parse(raw):{};}catch{}
 if(!response.ok){const b=data as {error?:string;code?:string}|null;throw new ApiError(b?.error??`请求失败（${response.status}）`,response.status,b?.code);}
 return (data??{}) as T;
}
