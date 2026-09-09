import { describe, it, expect } from "vitest";
import { autoExcerpt, articleDataOf } from "@/lib/article";

describe("article（文章共享逻辑）", () => {
  it("autoExcerpt 剥离常见 Markdown 标记", () => {
    const md = "# 标题\n\n**加粗** 与 `code` 链接 [文字](url)";
    expect(autoExcerpt(md)).toBe("标题 加粗 与 code 链接 文字url");
  });

  it("autoExcerpt 压缩多余空白并截取 120 字符", () => {
    const long = "A".repeat(200);
    const out = autoExcerpt(`\n\n ${long} \n\n`);
    expect(out.length).toBe(120);
    expect(out).not.toMatch(/\s{2}/);
    expect(out).toMatch(/^A{120}$/);
  });

  it("autoExcerpt 空/纯空白输入返回空串，不抛异常", () => {
    expect(autoExcerpt("")).toBe("");
    expect(autoExcerpt("   \n\t ")).toBe("");
    expect(autoExcerpt("###")).toBe("");
  });

  it("articleDataOf 只透传白名单字段，丢弃多余字段", () => {
    const out = articleDataOf({
      title: "t", slug: "s", content: "", excerpt: "",
      cover: "", tags: "", published: true, pinned: false,
    } as never);
    expect(out).toEqual({
      title: "t", slug: "s", content: "", excerpt: "",
      cover: "", tags: "", published: true, pinned: false,
    });
  });
});