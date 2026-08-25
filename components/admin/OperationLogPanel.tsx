"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { RefreshCw, Loader2, ChevronDown, Clock, User, Globe } from "lucide-react";

interface OperationLog {
  id: number;
  module: string;
  action: string;
  username: string;
  summary: string;
  detail: string;
  ip: string;
  createdAt: string;
}

const MODULE_LABEL: Record<string, string> = {
  profile: "站点信息",
  "social-links": "社交链接",
  "site-links": "网站链接",
  account: "账号设置",
  "weather-setting": "天气设置",
};

/** 模块对应的标签颜色（tailwind 类名） */
const MODULE_COLOR: Record<string, string> = {
  profile: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  "social-links": "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  "site-links": "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  account: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "weather-setting": "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};

const ACTION_LABEL: Record<string, string> = {
  create: "创建",
  update: "修改",
  delete: "删除",
  batch_update: "批量保存",
};

/** 操作类型对应的颜色 */
const ACTION_COLOR: Record<string, string> = {
  create: "text-emerald-600 dark:text-emerald-400",
  update: "text-blue-600 dark:text-blue-400",
  delete: "text-red-600 dark:text-red-400",
  batch_update: "text-purple-600 dark:text-purple-400",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function OperationLogPanel() {
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // 请求序号：连点刷新时丢弃过期响应，防止旧响应覆盖新数据
  const seqRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function load() {
    const seq = ++seqRef.current;
    setLoading(true);
    try {
      const res = await fetch("/api/operation-logs?limit=100");
      if (!mountedRef.current || seq !== seqRef.current) return;
      if (res.ok) setLogs(await res.json());
      else toast.error("加载日志失败");
    } catch {
      if (mountedRef.current && seq === seqRef.current) toast.error("网络错误");
    } finally {
      if (mountedRef.current && seq === seqRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">操作日志</CardTitle>
            <CardDescription>
              最近 100 条后台增删改操作记录，用于排查问题
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            加载中...
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">暂无操作记录</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {logs.map((log) => {
              const expanded = expandedId === log.id;
              const moduleColor = MODULE_COLOR[log.module] || "bg-muted text-muted-foreground";
              const actionColor = ACTION_COLOR[log.action] || "text-muted-foreground";
              let detailText = "";
              try {
                if (log.detail) {
                  const obj = JSON.parse(log.detail);
                  detailText = JSON.stringify(obj, null, 2);
                }
              } catch {
                detailText = log.detail;
              }

              return (
                <div
                  key={log.id}
                  className="overflow-hidden rounded-xl border transition-all duration-200 hover:border-primary/30"
                >
                  <button
                    onClick={() => setExpandedId(expanded ? null : log.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
                  >
                    {/* 模块标签 */}
                    <span className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold ${moduleColor}`}>
                      {MODULE_LABEL[log.module] || log.module}
                    </span>
                    {/* 操作类型 */}
                    <span className={`shrink-0 text-xs font-medium ${actionColor}`}>
                      {ACTION_LABEL[log.action] || log.action}
                    </span>
                    {/* 摘要 */}
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">
                      {log.summary}
                    </span>
                    {/* 操作人 - 桌面端显示 */}
                    <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:flex">
                      <User className="h-3 w-3" />
                      {log.username}
                    </span>
                    {/* 时间 */}
                    <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground md:flex">
                      <Clock className="h-3 w-3" />
                      {formatTime(log.createdAt)}
                    </span>
                    {/* 展开箭头 */}
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>
                      <ChevronDown className="h-4 w-4" />
                    </div>
                  </button>

                  {/* 展开详情 */}
                  <div
                    className={`grid transition-all duration-300 ease-in-out ${
                      expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="border-t bg-muted/30 px-4 py-3">
                        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            操作人：{log.username}
                          </span>
                          <span className="flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            IP：{log.ip || "未知"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            时间：{formatTime(log.createdAt)}
                          </span>
                        </div>
                        {detailText ? (
                          <div className="overflow-hidden rounded-lg border bg-background/60">
                            <div className="border-b bg-muted/50 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              变更详情
                            </div>
                            <pre className="max-h-64 overflow-auto p-3 text-xs leading-relaxed">
                              {detailText}
                            </pre>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">无详细变更内容</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}