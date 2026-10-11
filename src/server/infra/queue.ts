import { Redis } from "ioredis";
import { Queue } from "bullmq";
export const QUEUE_NAME = "todo-jobs";
let queue: Queue | undefined;
let connection: Redis | undefined;
export function redisConnection() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL 未设置");
  return new Redis(url, { maxRetriesPerRequest: null, enableReadyCheck: true });
}
export function jobQueue() {
  return queue ??= new Queue(QUEUE_NAME, { connection: connection ??= redisConnection(), defaultJobOptions: { attempts: 1, removeOnComplete: { age: 86400, count: 10000 }, removeOnFail: { age: 604800, count: 10000 } } });
}
export async function closeQueue() { if (queue) { await queue.close(); connection?.disconnect(); queue = undefined; connection = undefined; } }
