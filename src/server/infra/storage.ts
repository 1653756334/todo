import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
let client: S3Client | undefined;
function config() {
  const { MINIO_ENDPOINT: endpoint, MINIO_ACCESS_KEY: accessKeyId, MINIO_SECRET_KEY: secretAccessKey, MINIO_BUCKET: bucket } = process.env;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) throw new Error("MinIO 配置不完整");
  return { endpoint, accessKeyId, secretAccessKey, bucket };
}
function storage() {
  const c = config();
  return client ??= new S3Client({ endpoint: c.endpoint, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey } });
}
export async function putObject(key: string, data: Uint8Array, mimeType: string) {
  await storage().send(new PutObjectCommand({ Bucket: config().bucket, Key: key, Body: data, ContentType: mimeType }));
}
export async function getObject(key: string) {
  const r = await storage().send(new GetObjectCommand({ Bucket: config().bucket, Key: key }));
  if (!r.Body) throw new Error("资源不可用");
  return r.Body;
}
export async function readObject(key: string) { return Buffer.from(await (await getObject(key)).transformToByteArray()); }
export async function deleteObject(key: string) { await storage().send(new DeleteObjectCommand({ Bucket: config().bucket, Key: key })); }
export async function storageReady() { await storage().send(new HeadBucketCommand({ Bucket: config().bucket })); }
