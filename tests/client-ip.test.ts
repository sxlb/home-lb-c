import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { getClientIp, isValidIp } from "@/lib/server";

describe("isValidIp（IPv4/IPv6 校验）", () => {
  it("接受合法 IPv4 / IPv6", () => {
    expect(isValidIp("127.0.0.1")).toBe(true);
    expect(isValidIp("2001:db8::1")).toBe(true);
  });
  it("拒绝越界段、非法字符与超长", () => {
    expect(isValidIp("999.1.1.1")).toBe(false);
    expect(isValidIp("evil<script>")).toBe(false);
    expect(isValidIp("a".repeat(100))).toBe(false);
  });
  it("空值返回 false", () => {
    expect(isValidIp("")).toBe(false);
  });
});

describe("getClientIp（来自请求头，非法被丢弃）", () => {
  it("合法 x-forwarded-for 取第一个值", () => {
    const req = new NextRequest("http://localhost/api/x", {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("203.0.113.5");
  });
  it("非法 x-forwarded-for 回退 x-real-ip", () => {
    const req = new NextRequest("http://localhost/api/x", {
      headers: { "x-forwarded-for": "not-an-ip", "x-real-ip": "198.51.100.7" },
    });
    expect(getClientIp(req)).toBe("198.51.100.7");
  });
  it("全部非法时返回空串", () => {
    const req = new NextRequest("http://localhost/api/x", {
      headers: { "x-forwarded-for": "hacker" },
    });
    expect(getClientIp(req)).toBe("");
  });
});