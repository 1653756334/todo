import {z} from "zod";
import {handler,requireUser,readJson} from "@/server/adapters/http";
import {prisma} from "@/server/infra/db";
import {smtpConfig,readGroup} from "@/server/settings/service";
import {sendTestMail} from "@/server/notifications/transports/email";
import {publishBot} from "@/server/notifications/transports/webhook.mjs";
import {decryptSecret} from "@/server/auth/crypto.mjs";
import {encryptionKey} from "@/server/infra/env";
import {createToken} from "@/server/auth/accounts";
import {sendAccountMail} from "@/server/auth/account-mail";
import {assert,AppError} from "@/shared/errors";
export const POST=handler(async request=>{
 const actor=await requireUser();const b=z.object({id:z.string(),action:z.enum(["verify","test"])}).strict().parse(await readJson(request));
 const c=await prisma.notificationChannel.findFirst({where:{id:b.id,ownerId:actor.id}});assert(c,404,"渠道不存在");
 const key=`@channel-test:${actor.id}`;assert(await prisma.loginAttempt.count({where:{username:key,createdAt:{gte:new Date(Date.now()-60000)}}})<3,429,"操作频繁，请稍后重试");await prisma.loginAttempt.create({data:{username:key,ip:"internal",succeeded:true}});
 if(b.action==="verify"){assert(c.type==="EMAIL" && c.email,400,"请先填写邮件地址");const t=await createToken("VERIFY_CHANNEL",actor.id,c.email,c.id);await sendAccountMail(c.email,"VERIFY_CHANNEL",t);return {ok:true};}
 const {value:p}=await readGroup("policy");assert(c.type==="EMAIL"?p.emailAllowed:p.webhookAllowed,403,"管理员已暂停该通知类型");
 try{
 if(c.type==="EMAIL"){const smtp=await smtpConfig();assert(smtp && c.email,400,"邮件服务或地址未配置");await sendTestMail({...smtp,toAddress:c.email});}
 else{assert(c.webhookEncrypted,400,"Webhook 未配置");await publishBot({webhook:decryptSecret(c.webhookEncrypted,encryptionKey()),secret:c.signSecretEncrypted?decryptSecret(c.signSecretEncrypted,encryptionKey()):undefined,title:"Todo 测试通知",lines:["收到此消息说明通知渠道可用。"]});}
 await prisma.notificationChannel.update({where:{id:c.id},data:{lastTestAt:new Date(),lastErrorCode:null}});return {ok:true};
 }catch(e){if(e instanceof AppError)throw e;throw new AppError(502,"测试投递失败，请检查地址、凭据和服务状态","TEST_FAILED");}
});
