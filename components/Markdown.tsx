import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownProps {
  content: string;
}

/**
 * Markdown 正文渲染：Github 风格（表格/删除线/自动链接），
 * 样式通过 article-body 容器内的 CSS（globals.css）统一控制，避免组件内大量内联类。
 */
export function Markdown({ content }: MarkdownProps) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
}