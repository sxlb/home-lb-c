"use client";

import { SessionProvider } from "next-auth/react";
import {
  GlobalSaveProvider,
  GlobalSaveFab,
} from "@/components/admin/GlobalSave";
import "./admin.css";

/**
 * 后台布局：仅 /admin 下的页面注入 SessionProvider。
 * 主页不需要 session，避免每次访问发起 /api/auth/session 请求（控制台噪音）。
 *
 * 同时挂载全局保存上下文：各面板通过 useRegisterSave 注册自己的保存能力，
 * 悬浮按钮可以一次性提交所有面板的未保存改动（登录页无面板注册，按钮不显示）。
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <GlobalSaveProvider>
        {children}
        <GlobalSaveFab />
      </GlobalSaveProvider>
    </SessionProvider>
  );
}
