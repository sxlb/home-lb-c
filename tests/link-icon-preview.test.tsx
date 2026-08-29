import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { LinkIconPreview } from "@/components/admin/LinksPanel";

describe("LinkIconPreview 图标解析", () => {
  it("lucide: 前缀解析为 lucide 图标", () => {
    render(<LinkIconPreview icon="lucide:github" />);
    expect(document.querySelector("svg")).not.toBeNull();
  });

  it("icon- 前缀渲染 iconfont symbol", () => {
    render(<LinkIconPreview icon="icon-github" />);
    const use = document.querySelector("use");
    expect(use?.getAttribute("href")).toBe("#icon-github");
  });

  it("未知图标兜底 Globe", () => {
    render(<LinkIconPreview icon="unknown-xyz" />);
    expect(document.querySelector("svg")).not.toBeNull();
  });
});
