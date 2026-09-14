"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";

/**
 * 会话已被吊销时的兜底处理。
 *
 * 触发场景：管理员在别处修改了密码，或执行了「恢复默认状态」——两者都会自增
 * User.sessionVersion，使本设备持有的旧 JWT 立即失效。此时服务端把 session 置空
 * 并渲染本组件，由它调用 signOut 清除本地 Cookie。
 *
 * 为什么必须显式 signOut 而不是让页面自行跳转：middleware 看到"cookie 仍在"会把
 * /admin/login 重新导回 /admin，形成重定向循环；只有清掉 cookie 才能真正落地到登录页。
 */
export default function ForceSignOut() {
  useEffect(() => {
    void signOut({ callbackUrl: "/admin/login" });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center px-6 text-center">
      <p className="text-sm text-muted-foreground">登录状态已失效（密码已变更），正在退出…</p>
    </div>
  );
}
