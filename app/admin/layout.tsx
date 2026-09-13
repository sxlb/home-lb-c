import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import AdminProviders from "@/components/admin/AdminProviders";
import "./admin.css";

/**
 * 后台布局：仅 /admin 下的页面注入 SessionProvider 与全局保存上下文。
 * 主页不需要 session，避免每次访问发起 /api/auth/session 请求（控制台噪音）。
 *
 * 这里刻意保持为**服务端组件**：会话在服务端取好后下发给 SessionProvider，
 * 客户端首屏即为已登录状态。此前由客户端 useSession 自行请求，
 * 后台要先渲染「加载中...」等该请求返回 —— 登录后表现为「点完登录卡一会儿才切换」。
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  return <AdminProviders session={session}>{children}</AdminProviders>;
}
