import { describe, it, expect } from "vitest";
import { authOptions, checkRateLimit } from "@/lib/auth";

describe("authOptions 配置", () => {
  it("session 策略为 jwt", () => {
    expect(authOptions.session?.strategy).toBe("jwt");
  });

  it("登录页指向 /admin/login", () => {
    expect(authOptions.pages?.signIn).toBe("/admin/login");
  });

  it("使用 credentials provider", () => {
    const providers = authOptions.providers;
    expect(providers).toHaveLength(1);
    const provider = providers[0] as { id?: string; name?: string; type?: string };
    // NextAuth 保留 name 的原始大小写
    expect(provider.name).toBe("Credentials");
  });

  it("secret 来自环境变量", () => {
    expect(authOptions.secret).toBe(process.env.NEXTAUTH_SECRET);
  });
});

describe("checkRateLimit", () => {
  it("初始状态未锁定", () => {
    // checkRateLimit 默认 key 为 "admin"，初始状态应未锁定
    const result = checkRateLimit("test-initial-" + Date.now());
    expect(result.locked).toBe(false);
    expect(result.remainingMs).toBe(0);
  });
});
