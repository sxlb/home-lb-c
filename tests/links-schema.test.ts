import { describe, it, expect } from "vitest";
import { siteLinkSchema, socialLinkSchema, announcementBatchSchema } from "@/lib/validation";

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

describe("announcementBatchSchema（公告批量保存）", () => {
  it("接受空数组（删除全部公告的提交）", () => {
    expect(announcementBatchSchema.safeParse([]).success).toBe(true);
  });

  it("接受混合：新增无 id + 更新带 id", () => {
    const payload = [
      { title: "新公告", content: "欢迎", pinned: false, enabled: true, sort: 0 },
      { id: 5, title: "旧公告", content: "更新", pinned: true, enabled: true, sort: 1 },
    ];
    const result = announcementBatchSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("拒绝缺 title 或缺 content 的项", () => {
    expect(announcementBatchSchema.safeParse([{ content: "缺标题", sort: 0 }]).success).toBe(false);
    expect(announcementBatchSchema.safeParse([{ title: "缺内容", sort: 0 }]).success).toBe(false);
  });

  it("拒绝非法 id（非正整数）", () => {
    expect(
      announcementBatchSchema.safeParse([{ id: -1, title: "x", content: "y" }]).success
    ).toBe(false);
  });
});
