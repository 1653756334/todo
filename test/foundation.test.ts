import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/server/infra/db";
import { putObject, readObject, deleteObject, storageReady } from "../src/server/infra/storage";
import { redisConnection } from "../src/server/infra/queue";
import { hashPassword, hashPasswordAsync, verifyPasswordAsync } from "../src/server/auth/crypto.mjs";

test("PG enforces task/project ownership and unique email channel while webhook labels may repeat", async () => {
  const prefix = randomUUID().replaceAll("-", "").slice(0, 12);
  const a = await prisma.user.create({ data: { username: `a${prefix}`, displayName: "A", passwordHash: "test" } });
  const b = await prisma.user.create({ data: { username: `b${prefix}`, displayName: "B", passwordHash: "test" } });
  try {
    const p = await prisma.project.create({ data: { ownerId: a.id, name: "private" } });
    await assert.rejects(prisma.task.create({ data: { ownerId: b.id, projectId: p.id, title: "cross-owner" } }));
    await assert.rejects(prisma.task.create({ data: { ownerId: a.id, title: " " } }));
    await prisma.notificationChannel.create({ data: { ownerId: a.id, type: "EMAIL", label: "mail" } });
    await assert.rejects(prisma.notificationChannel.create({ data: { ownerId: a.id, type: "EMAIL", label: "second" } }));
    await prisma.notificationChannel.createMany({ data: [{ ownerId: a.id, type: "WEBHOOK", label: "same" }, { ownerId: a.id, type: "WEBHOOK", label: "same" }] });
  } finally { await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } }); }
});
test("private MinIO uses app credentials and preserves independent objects", async () => {
  await storageReady();
  const key = `tests/${randomUUID()}.txt`;
  await putObject(key, Buffer.from("fixture"), "text/plain");
  try {
    assert.equal((await readObject(key)).toString(), "fixture");
    const r = await fetch(`${process.env.MINIO_ENDPOINT}/${process.env.MINIO_BUCKET}/${key}`);
    assert.equal(r.status, 403);
  } finally { await deleteObject(key); }
});
test("Redis and compatible asynchronous password verification", async () => {
  const r = redisConnection();
  try { assert.equal(await r.ping(), "PONG"); } finally { r.disconnect(); }
  assert.equal(await verifyPasswordAsync("compatible-test", hashPassword("compatible-test")), true);
  const newHash = await hashPasswordAsync("a-long-test-password");
  assert.equal(await verifyPasswordAsync("a-long-test-password", newHash), true);
  assert.equal(await verifyPasswordAsync("wrong", newHash), false);
});
test.after(async () => { await prisma.$disconnect(); });
