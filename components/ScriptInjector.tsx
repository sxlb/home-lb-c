"use client";

import { useEffect } from "react";

/**
 * 后台配置的脚本/标签注入器：
 * - analyticsScript：统计代码（百度统计 / Umami / 51LA 等）
 * - headScript：自定义 head 内容（站长验证 meta、第三方 script 等）
 *
 * 支持三类输入：
 * 1. 带 <script> 标签的完整片段（统计服务复制来的代码通常自带标签）
 * 2. <meta> / <link> / <style> 等任意 head 标签
 * 3. 裸 JS 代码（无任何标签时视为脚本正文）
 * 页面挂载后注入 <head>，卸载时移除。
 */
export default function ScriptInjector({ scripts }: { scripts: string[] }) {
  useEffect(() => {
    const nodes: Element[] = [];

    for (const code of scripts) {
      const injected = injectSnippet(code);
      nodes.push(...injected);
    }

    return () => {
      for (const node of nodes) {
        node.parentNode?.removeChild(node);
      }
    };
  }, [scripts]);

  return null;
}

/** 解析片段并返回需要追加到 <head> 的节点 */
function injectSnippet(code: string): Element[] {
  const trimmed = code.trim();
  if (!trimmed) return [];

  // 无任何标签的裸 JS：直接作为脚本正文
  if (!/<[\w-]/.test(trimmed)) {
    return [createScript(trimmed)];
  }

  // 含标签：用 DOMParser 解析，保留 head 中全部有效元素（script/meta/link/style 等）
  const doc = new DOMParser().parseFromString(trimmed, "text/html");
  const nodes: Element[] = [];
  for (const child of Array.from(doc.head.childNodes)) {
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as Element;
    if (el.tagName.toLowerCase() === "script") {
      const script = createScript(el.textContent || "");
      // 保留外部脚本的 src 属性（<script src="...">）
      if (el.getAttribute("src")) {
        script.src = el.getAttribute("src") || "";
        script.textContent = "";
      }
      nodes.push(script);
    } else if (el.tagName.toLowerCase() === "style") {
      const style = document.createElement("style");
      style.textContent = el.textContent || "";
      nodes.push(style);
    } else {
      // meta / link / 其他自闭合标签
      const node = document.createElement(el.tagName);
      for (const attr of Array.from(el.attributes)) {
        node.setAttribute(attr.name, attr.value);
      }
      nodes.push(node);
    }
  }
  return nodes;
}

/** 创建可执行的 <script> 元素 */
function createScript(body: string): HTMLScriptElement {
  const el = document.createElement("script");
  el.textContent = body;
  return el;
}
