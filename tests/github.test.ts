import { describe, expect, it } from "vitest";
import {
  GITHUB_USERNAME_RE,
  githubProfileUrl,
  parseGithubUsername,
} from "@/lib/github";

/**
 * 后台 GitHub 字段只让用户填用户名，链接由程序拼接。
 * 这里覆盖两类边界：用户名合法性（用于本地预校验）与各种写法的解析兼容。
 */
describe("GITHUB_USERNAME_RE（用户名规则）", () => {
  it.each(["sxlb", "a", "a-b", "user123", "User-Name", "abc-123-def"])(
    "接受合法用户名 %s",
    (name) => {
      expect(GITHUB_USERNAME_RE.test(name)).toBe(true);
    },
  );

  it.each([
    ["-abc", "不能以连字符开头"],
    ["abc-", "不能以连字符结尾"],
    ["abc--def", "不允许连续连字符"],
    ["a b", "不能含空格"],
    ["用户", "不能含中文"],
    ["abc_def", "不能含下划线"],
    ["", "不能为空"],
    ["a".repeat(40), "超过 39 字符"],
  ])("拒绝非法用户名 %s（%s）", (name) => {
    expect(GITHUB_USERNAME_RE.test(name)).toBe(false);
  });

  it("恰好 39 字符仍合法，40 字符越界", () => {
    expect(GITHUB_USERNAME_RE.test("a".repeat(39))).toBe(true);
    expect(GITHUB_USERNAME_RE.test("a".repeat(40))).toBe(false);
  });
});

describe("parseGithubUsername（兼容多种写法）", () => {
  it.each([
    ["sxlb", "sxlb"],
    ["  sxlb  ", "sxlb"],
    ["@sxlb", "sxlb"],
    ["https://github.com/sxlb", "sxlb"],
    ["http://github.com/sxlb", "sxlb"],
    ["https://www.github.com/sxlb", "sxlb"],
    ["github.com/sxlb", "sxlb"],
    ["https://github.com/sxlb/repo", "sxlb"],
    ["https://github.com/sxlb?tab=repos", "sxlb"],
    ["https://github.com/sxlb#readme", "sxlb"],
  ])("从 %s 解析出 %s", (input, expected) => {
    expect(parseGithubUsername(input)).toBe(expected);
  });

  it("空输入返回空字符串", () => {
    expect(parseGithubUsername("")).toBe("");
    expect(parseGithubUsername("   ")).toBe("");
  });

  it("解析结果可直接回写为完整主页地址", () => {
    expect(githubProfileUrl(parseGithubUsername("github.com/sxlb"))).toBe(
      "https://github.com/sxlb",
    );
  });
});

describe("githubProfileUrl", () => {
  it("拼接标准主页地址", () => {
    expect(githubProfileUrl("sxlb")).toBe("https://github.com/sxlb");
  });
});
