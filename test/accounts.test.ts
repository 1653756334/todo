import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/server/infra/db";
import { login, createToken, consumeToken, updateUser, revokeSessions } from "../src/server/auth/accounts";
import { hashPasswordAsync } from "../src/server/auth/crypto.mjs";
import type { Actor } from "../src/server/auth/permissions";
test("account isolation, token replay, session revocation and last-admin protection", async () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
  const admin = await prisma.user.create({ data: { username: `admin${suffix}`, displayName: "Admin", passwordHash: await hashPasswordAsync("account-test-password"), role: "ADMIN", preference: { create: {} } } });
  let invitedId: string | undefined;
  try {
    assert.equal((await login({ username: admin.username, password: "account-test-password" }, suffix)).id, admin.id);
    await assert.rejects(login({ username: admin.username, password: "bad" }, suffix));
    const t = await createToken("INVITE", null);
    const u = await consumeToken({ token: t, username: `user${suffix}`, password: "account-test-password" }); invitedId = u.id;
    assert.equal(u.role, "USER"); assert.equal(u.accountEmail, null);
    await assert.rejects(consumeToken({ token: t, username: `other${suffix}`, password: "account-test-password" }));
    await assert.rejects(updateUser(u as Actor, admin.id, { role: "USER" }));
    // Fresh integration database has exactly this one ADMIN.
    const activeAdmins = await prisma.user.count({ where: { role: "ADMIN", status: "ACTIVE" } });
    if (activeAdmins === 1) await assert.rejects(updateUser(admin as Actor, admin.id, { status: "DISABLED" }));
    await revokeSessions(u as Actor); await revokeSessions(u as Actor);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).sessionVersion, u.sessionVersion + 2);
  } finally { await prisma.accountToken.deleteMany({ where: { userId: invitedId } }); await prisma.user.deleteMany({ where: { id: { in: [admin.id, ...(invitedId ? [invitedId] : [])] } } }); await prisma.loginAttempt.deleteMany({ where: { ip: suffix } }); }
});
test.after(async () => { await prisma.$disconnect(); });
