import { describe, it, expect, beforeEach } from "vitest";
import { isRateLimited, resetRateLimiter } from "@/lib/server";

describe("isRateLimited（滑动窗口限流）", () => {
  beforeEach(() => {
    resetRateLimiter();
  });

  it("窗口内第 61 次请求被限流（默认 60/分钟）", () => {
    const key = "test-key";
    for (let i = 0; i < 60; i++) {
      expect(isRateLimited(key)).toBe(false);
    }
    expect(isRateLimited(key)).toBe(true);
  });

  it("不同 key 相互隔离", () => {
    for (let i = 0; i < 60; i++) isRateLimited("key-a");
    expect(isRateLimited("key-b")).toBe(false);
    expect(isRateLimited("key-a")).toBe(true);
  });

  it("自定义阈值生效", () => {
    const key = "custom";
    expect(isRateLimited(key, 2)).toBe(false);
    expect(isRateLimited(key, 2)).toBe(false);
    expect(isRateLimited(key, 2)).toBe(true);
  });

  it("窗口过期后重新计数", async () => {
    const key = "window";
    const max = 2;
    const windowMs = 1000;

    expect(isRateLimited(key, max, windowMs)).toBe(false);
    expect(isRateLimited(key, max, windowMs)).toBe(false);
    expect(isRateLimited(key, max, windowMs)).toBe(true);

    // 等待窗口过期后应重新放行
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(isRateLimited(key, max, windowMs)).toBe(false);
  });
});
