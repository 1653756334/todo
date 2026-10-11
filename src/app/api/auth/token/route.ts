import { handler, readJson } from "@/server/adapters/http";
import { consumeToken, createToken } from "@/server/auth/accounts";
import { sendAccountMail } from "@/server/auth/account-mail";
export const POST = handler(async request => {
  const u = await consumeToken(await readJson(request));
  if (u.status === "PENDING" && u.accountEmail) { const t = await createToken("VERIFY_EMAIL", u.id, u.accountEmail); await sendAccountMail(u.accountEmail, "VERIFY_EMAIL", t); }
  return { ok: true, verificationRequired: u.status === "PENDING" };
});
