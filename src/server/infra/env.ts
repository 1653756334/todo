function required(name: string, minimumLength = 1): string {
  const value = process.env[name];
  if (!value || value.trim().length < minimumLength) {
    throw new Error(
      `环境变量 ${name} 未设置或过短。请参考 .env.example 补全后重启。`,
    );
  }
  return value.trim();
}

export function appSecret(): string {
  return required("APP_SECRET", 16);
}

export function encryptionKey(): string {
  return required("ENCRYPTION_KEY", 16);
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:23330").replace(/\/$/, "");
}

/** 认证相关配置是否就绪，用于中间件与登录页给出明确提示 */
export function authConfigState(): { ready: boolean; reason?: string } {
  try {
    appSecret();
    encryptionKey();
    return { ready: true };
  } catch (error) {
    return { ready: false, reason: (error as Error).message };
  }
}
