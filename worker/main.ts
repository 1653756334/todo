import {randomUUID} from "node:crypto";
import {Worker} from "bullmq";
import {prisma} from "../src/server/infra/db";
import {QUEUE_NAME,redisConnection,closeQueue} from "../src/server/infra/queue";
import {dispatchOutbox,runJob,reconcile,maintenance} from "../src/server/jobs/service";
import {log} from "../src/server/infra/log";
const instanceId=randomUUID();const connection=redisConnection();let stopping=false;
const worker=new Worker(QUEUE_NAME,async job=>{await runJob(job.name,job.data.targetId,job.data.dispatchVersion);if(job.data.outboxId)await prisma.jobOutbox.updateMany({where:{id:job.data.outboxId},data:{processedAt:new Date()}});},{connection,concurrency:4});
worker.on("error",()=>log("worker_error"));worker.on("failed",job=>log("job_failed",{id:job?.id??null}));
async function loop(){let ticks=0;while(!stopping){try{await dispatchOutbox();if(ticks%30===0)await prisma.workerHeartbeat.upsert({where:{instanceId},create:{instanceId,lastSeenAt:new Date(),version:"multi-user-1"},update:{lastSeenAt:new Date()}});if(ticks%120===0)await reconcile();if(ticks%600===0)await maintenance();}catch{log("worker_maintenance_error");}ticks++;await new Promise(r=>setTimeout(r,1000));}}
const running=loop();
async function shutdown(){if(stopping)return;stopping=true;log("worker_stopping");const deadline=setTimeout(()=>process.exit(1),40000);deadline.unref();await running;await worker.close();connection.disconnect();await closeQueue();await prisma.workerHeartbeat.deleteMany({where:{instanceId}});await prisma.$disconnect();clearTimeout(deadline);}
process.on("SIGINT",()=>void shutdown());process.on("SIGTERM",()=>void shutdown());
log("worker_started",{instanceId});
