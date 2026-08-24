"use client";

import { SessionProvider } from "next-auth/react";

/**
 * 后台布局：仅 /admin 下的页面注入 SessionProvider。
 * 主页不需要 session，避免每次访问发起 /api/auth/session 请求（控制台噪音）。
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionProvider>{children}</SessionProvider>;
}
