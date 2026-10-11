import { prisma } from "../src/server/infra/db";
import { hashPasswordAsync } from "../src/server/auth/crypto.mjs";
import { usernameSchema, passwordSchema } from "../src/shared/accounts";
const username = usernameSchema.parse(process.env.ADMIN_USERNAME);
const password = passwordSchema.parse(process.env.ADMIN_PASSWORD);
try {
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(72135412)`;
    if (await tx.user.count()) throw new Error("数据库已有账号，请使用账号管理；初始化不会覆盖现有用户。");
    await tx.user.create({ data: { username, displayName: process.env.ADMIN_DISPLAY_NAME ?? username, passwordHash: await hashPasswordAsync(password), role: "ADMIN", preference: { create: {} } } });
  });
  console.log(`管理员 ${username} 已建立。`);
} finally { await prisma.$disconnect(); }
