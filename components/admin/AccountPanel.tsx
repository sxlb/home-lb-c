"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, User, Lock, KeyRound } from "lucide-react";

export default function AccountPanel() {
  const { data: session } = useSession();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    username: "",
    currentPassword: "",
    newPassword: "",
  });

  // 预填当前用户名
  useEffect(() => {
    if (session?.user?.name) {
      setForm((prev) => ({ ...prev, username: session.user!.name! }));
    }
  }, [session]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("账号信息已更新，请重新登录");
        setTimeout(() => signOut({ callbackUrl: "/admin/login" }), 1500);
      } else {
        toast.error(data.error || "保存失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="space-y-1">
          <CardTitle className="text-lg">账号设置</CardTitle>
          <CardDescription>
            修改登录账号和密码（首次登录后建议立即修改）
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-5">
          {/* 账号信息区域 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                <User className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm font-medium">账号信息</span>
            </div>
            <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-xs font-medium text-muted-foreground">
                  用户名
                </Label>
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="登录用户名"
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>

          {/* 密码设置区域 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Lock className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm font-medium">密码设置</span>
            </div>
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword" className="text-xs font-medium text-muted-foreground">
                  当前密码 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={form.currentPassword}
                  onChange={(e) =>
                    setForm({ ...form, currentPassword: e.target.value })
                  }
                  placeholder="输入当前密码以验证身份"
                  className="h-9 text-sm"
                  required
                />
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-dashed border-border" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-muted/20 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                    可选
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPassword" className="text-xs font-medium text-muted-foreground">
                  新密码
                </Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    value={form.newPassword}
                    onChange={(e) =>
                      setForm({ ...form, newPassword: e.target.value })
                    }
                    placeholder="输入新密码（至少 8 位）"
                    className="h-9 pr-9 text-sm"
                  />
                  <KeyRound className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  留空则不修改密码
                </p>
              </div>
            </div>
          </div>

          <Button type="submit" disabled={saving} className="w-full gap-1.5">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                保存中...
              </>
            ) : (
              "保存账号信息"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}