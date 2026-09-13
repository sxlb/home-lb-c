"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { GlobalSaveProvider, GlobalSaveFab } from "./GlobalSave";

/**
 * 后台客户端 Provider 容器（从 layout 拆出，让 layout 保持为服务端组件）。
 *
 * session 由服务端下发：客户端首屏 useSession 立刻是 authenticated，
 * 不必再等一次 /api/auth/session 往返（后台此前会先卡在「加载中...」再渲染）。
 * 路由保护仍由 middleware 负责，这里只解决首屏等待与状态闪烁。
 */
export default function AdminProviders({
  session,
  children,
}: {
  session: Session | null;
  children: React.ReactNode;
}) {
  return (
    <SessionProvider session={session}>
      <GlobalSaveProvider>
        {children}
        <GlobalSaveFab />
      </GlobalSaveProvider>
    </SessionProvider>
  );
}
