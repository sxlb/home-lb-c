import { describe, it, expect } from "vitest";
import { siteLinkSchema, socialLinkSchema } from "@/lib/validation";

describe("siteLinkSchema（网站链接）", () => {
  it("接受 http/https/mailto/tel 链接", () => {
    for (const url of [
      "https://example.com",
      "http://example.com",
      "mailto:hi@example.com",
      "tel:10086",
    ]) {
      expect(siteLinkSchema.safeParse({ name: "博客", icon: "book-open", url }).success).toBe(true);
    }
  });

  it("接受 music: 伪协议（触发页面音乐播放器）", () => {
    const result = siteLinkSchema.safeParse({ name: "音乐", icon: "music", url: "music:" });
    expect(result.success).toBe(true);
  });

  it("拒绝非法协议与空链接", () => {
    expect(siteLinkSchema.safeParse({ name: "x", icon: "link", url: "ftp://example.com" }).success).toBe(false);
    expect(siteLinkSchema.safeParse({ name: "x", icon: "link", url: "javascript:alert(1)" }).success).toBe(false);
    expect(siteLinkSchema.safeParse({ name: "x", icon: "link", url: "" }).success).toBe(false);
  });
});

describe("socialLinkSchema（社交链接）", () => {
  it("不接受 music: 伪协议（社交链接无此语义）", () => {
    expect(socialLinkSchema.safeParse({ name: "音乐", icon: "music", url: "music:" }).success).toBe(false);
  });
});
