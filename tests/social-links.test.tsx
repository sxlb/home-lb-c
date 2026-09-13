import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import SocialLinks from "@/components/SocialLinks";

const base = { tip: "", sort: 0, url: "https://example.com" };

describe("社交链接图标渲染（显示错误图标的回归）", () => {
  it("图片类图标（后台「从网站获取」写入的 favicon）渲染为图片，而不是兜底地球图标", () => {
    render(
      <SocialLinks
        initialLinks={[{ id: 1, name: "GitHub", icon: "https://favicon.im/github.com", ...base }]}
      />
    );
    const img = document.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://favicon.im/github.com");
    expect(img?.getAttribute("alt")).toBe("GitHub");
  });

  it("lucide 图标名渲染为 svg", () => {
    render(<SocialLinks initialLinks={[{ id: 2, name: "Email", icon: "mail", ...base }]} />);
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("svg")).not.toBeNull();
  });

  it("带 lucide: 前缀的值同样解析为 svg", () => {
    render(<SocialLinks initialLinks={[{ id: 3, name: "Twitter", icon: "lucide:twitter", ...base }]} />);
    expect(document.querySelector("svg")).not.toBeNull();
  });

  it("图片加载失败时回退为内置图标（不留空白）", () => {
    render(
      <SocialLinks
        initialLinks={[{ id: 4, name: "坏图标", icon: "https://example.com/not-found.png", ...base }]}
      />
    );
    const img = document.querySelector("img");
    expect(img).not.toBeNull();
    fireEvent.error(img!);
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("svg")).not.toBeNull();
  });

  it("空列表不渲染任何内容", () => {
    const { container } = render(<SocialLinks initialLinks={[]} />);
    expect(container.querySelector(".social-links-bar")).toBeNull();
  });
});
