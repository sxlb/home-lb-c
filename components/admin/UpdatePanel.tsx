"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  RefreshCw,
  Rocket,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Loader2,
  GitCompareArrows,
  History,
  HardDrive,
  ExternalLink,
  DownloadCloud,
  AlertTriangle,
  FileClock,
  Sparkles,
} from "lucide-react";
import { PanelHeader, EmptyState, SectionBlock } from "./panel";

interface UpdateRecord {
  id: number;
  version: string;
  action: "update" | "rollback";
  method: "build" | "image";
  fromVersion: string;
  status: "pending" | "running" | "success" | "failed";
  message: string;
  description: string;
  triggeredBy: string;
  createdAt: string;
  finishedAt: string | null;
}

type UpdateMethod = "build" | "image";

interface ResultLike {
  id: string;
  action: "update" | "rollback";
  method?: UpdateMethod;
  version: string;
  status: "running" | "success" | "failed";
  message: string;
  at: string;
}

interface ExecState {
  kind: "pending" | "running" | "idle";
  request?: {
    id: string;
    action: string;
    method?: UpdateMethod;
    version: string;
    requestedBy: string;
    createdAt: string;
  };
  running?: ResultLike;
  lastResult?: ResultLike | null;
}

interface BackupSnapshot {
  version: string;
  file: string;
  at: number;
}

interface UpdateStatusData {
  currentVersion: string;
  repo: string;
  latestRelease: {
    tag: string;
    version: string;
    name: string;
    body: string;
    htmlUrl: string;
    publishedAt: string;
  } | null;
  latestError?: string;
  isUpdateAvailable: boolean;
  hostReady: boolean;
  exec: ExecState;
  versions: { currentVersion: string; updatedAt: string; history: { version: string; action: string; at: string }[] } | null;
  rollbackTargets: string[];
  backups: BackupSnapshot[];
  records: UpdateRecord[];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}
function formatTs(ts: number): string {
  return new Date(ts).toLocaleString("zh-CN", { hour12: false });
}

const STATUS_MAP: Record<UpdateRecord["status"], { label: string; className: string }> = {
  pending: { label: "排队中", className: "bg-warning/15 text-warning" },
  running: { label: "执行中", className: "bg-info/15 text-info" },
  success: { label: "成功", className: "bg-success/15 text-success" },
  failed: { label: "失败", className: "bg-error/15 text-error" },
};

const ACTION_MAP: Record<UpdateRecord["action"], { label: string; icon: typeof Rocket }> = {
  update: { label: "更新", icon: Rocket },
  rollback: { label: "回滚", icon: RotateCcw },
};

/** 更新方式说明：build=服务器自建构建 / image=拉取发布镜像 */
const METHOD_MAP: Record<UpdateMethod, { label: string; hint: string }> = {
  build: { label: "服务器自建构建", hint: "在服务器上拉取 git 代码并本地构建 Docker 镜像（依赖服务器 CPU/内存，耗时较长，无需对外发布镜像）" },
  image: { label: "拉取发布镜像", hint: "直接从镜像仓库拉取已发布的镜像并重启（速度快、服务器零构建压力，需 CI 已推送 GHCR 镜像）" },
};

/** 更新/回滚徽章 */
function ActionBadge({ action }: { action: UpdateRecord["action"] }) {
  const { label, icon: Icon } = ACTION_MAP[action];
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: UpdateRecord["status"] }) {
  const { label, className } = STATUS_MAP[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      {status === "running" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      {label}
    </span>
  );
}

/** 更新方式徽章：build=Server 构建 / image=拉取镜像 */
function MethodBadge({ method }: { method: UpdateMethod }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs ${
        method === "image" ? "text-info" : "text-foreground"
      }`}
    >
      {method === "image" ? "拉取镜像" : "自建构建"}
    </span>
  );
}

/**
 * 系统更新面板：
 * - 检测 GitHub 最新发布，展示当前版本 / 可更新版本 / 更新日志
 * - 手动触发更新（写入手柄请求，由宿主机定时器执行）
 * - 查看并触发回滚（选择历史版本），展示数据库快照与更新历史
 */
export default function UpdatePanel() {
  const [data, setData] = useState<UpdateStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [method, setMethod] = useState<UpdateMethod>("build");
  const seqRef = useRef(0);
  const mountedRef = useRef(true);

  const busy = data?.exec.kind === "pending" || data?.exec.kind === "running";

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async (force = false) => {
    const seq = ++seqRef.current;
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/update/status${force ? "?force=1" : ""}`, { cache: "no-store" });
      if (!mountedRef.current || seq !== seqRef.current) return;
      if (res.ok) setData(await res.json());
      else toast.error("获取更新状态失败，请稍后重试");
    } catch {
      if (mountedRef.current && seq === seqRef.current) toast.error("网络错误，获取更新状态失败");
    } finally {
      if (mountedRef.current && seq === seqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  // 有任务进行中时定时轮询，驱动进度与完成态刷新
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => load(false), 5000);
    return () => clearInterval(timer);
  }, [busy, load]);

  async function trigger(action: "update" | "rollback", version?: string, description?: string, useMethod?: UpdateMethod) {
    const key = `${action}:${version || "latest"}`;
    setSubmitting(key);
    try {
      const res = await fetch("/api/update/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, method: useMethod, version, description }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(body.action === "rollback" ? `已提交回滚到 ${version}` : "已提交更新，正在执行");
        load(false);
      } else {
        toast.error((body as { error?: string }).error || "操作失败，请重试");
      }
    } catch {
      toast.error("网络错误，操作失败");
    } finally {
      setSubmitting(null);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">加载中...</div>
    );
  }

  const latest = data?.latestRelease;
  const hostReady = data?.hostReady;
  const rollDone = data?.versions?.history?.length;

  return (
    <Card className="overflow-hidden border-border shadow-sm">
      <CardContent className="space-y-6 p-5">
        <PanelHeader
          title="系统更新"
          description={
            hostReady
              ? undefined
              : "宿主机更新通道尚未就绪（未安装脚本），请先在服务器部署 update-watch.sh"
          }
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => load(true)}
                disabled={refreshing || busy}
                className="gap-1.5"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                检查更新
              </Button>
            </>
          }
        />

        {/* 状态总览 */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">当前版本</p>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">
              v{data?.currentVersion ?? "?"}
            </p>
            {data?.versions?.updatedAt ? (
              <p className="mt-1 text-xs text-muted-foreground">
                上次变更 {formatTime(data.versions.updatedAt)}
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">最新版本</p>
            {latest ? (
              <>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">
                  {latest.version}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {latest.publishedAt ? formatTime(latest.publishedAt) : ""}
                </p>
              </>
            ) : (
              <p className="mt-1.5 text-sm text-muted-foreground">{data?.latestError || "未获取到"}</p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">版本状态</p>
            {data?.isUpdateAvailable ? (
              <>
                <p className="mt-1.5 flex items-center gap-1.5 text-2xl font-semibold text-primary">
                  <Sparkles className="h-5 w-5" /> 有新版本
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  可升级到 v{latest?.version}
                </p>
              </>
            ) : latest ? (
              <p className="mt-1.5 text-lg font-semibold text-success">已是最新</p>
            ) : (
              <p className="mt-1.5 text-lg font-semibold text-muted-foreground">未知</p>
            )}
          </div>
        </div>

        {/* 更新动作 */}
        <SectionBlock
          title="更新到最新版本"
          subtitle={data?.isUpdateAvailable ? `发现 v${latest?.version}` : "暂无新版"}
          dotClass="bg-primary"
          open={Boolean(data?.isUpdateAvailable)}
        >
          {data?.isUpdateAvailable && latest ? (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                点击下方按钮将站点更新到最新版本 <strong className="text-foreground">v{latest.version}</strong>，更新前会自动备份当前数据库，失败时可随时回滚。
              </p>
              {latest.body ? (
                <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    更新日志
                  </p>
                  <div className="prose prose-sm max-w-none text-sm leading-relaxed text-foreground">
                    <pre className="whitespace-pre-wrap font-sans text-sm">{latest.body}</pre>
                  </div>
                </div>
              ) : null}

              {/* 更新方式选择 */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  本次更新方式
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(Object.keys(METHOD_MAP) as UpdateMethod[]).map((m) => {
                    const opt = METHOD_MAP[m];
                    const active = method === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        disabled={busy}
                        onClick={() => setMethod(m)}
                        aria-pressed={active}
                        className={`rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                          active
                            ? "border-primary/60 bg-primary/10 ring-1 ring-primary/40"
                            : "border-border bg-muted/20 hover:border-border"
                        }`}
                      >
                        <span
                          className={`text-sm font-semibold ${active ? "text-primary" : "text-foreground"}`}
                        >
                          {opt.label}
                        </span>
                        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                          {opt.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => trigger("update", undefined, undefined, method)}
                  disabled={busy}
                  className="gap-2"
                >
                  {submitting === "update:latest" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <DownloadCloud className="h-4 w-4" />
                  )}
                  立即更新到 v{latest.version}
                </Button>
                <a
                  href={latest.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  <ExternalLink className="h-4 w-4" />
                  GitHub 查看
                </a>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="当前已是最新版本"
              hint="点击右上角「检查更新」可重新检测 GitHub 发布"
            />
          )}
        </SectionBlock>

        {/* 执行中进度 */}
        {busy && data?.exec.kind !== "idle" && (
          <div className="flex items-start gap-3 rounded-xl border border-info/30 bg-info/10 p-4 text-sm">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-info" />
            <div className="space-y-0.5">
              <p className="font-medium text-foreground">
                {data.exec.kind === "pending" ? "已提交，等待宿主机执行…" : "更新任务正在执行中…"}
              </p>
              {data.exec.request && (
                <p className="text-xs text-muted-foreground">
                  {data.exec.request.action === "rollback" ? "回滚" : "更新"}到{" "}
                  <strong>{data.exec.request.version}</strong>
                  {data.exec.request.method ? `（${METHOD_MAP[data.exec.request.method].label}）` : null}
                  ，发起人 {data.exec.request.requestedBy}，
                  提交于 {formatTime(data.exec.request.createdAt)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* 最近一次执行结果 */}
        {data?.exec.lastResult && data.exec.kind === "idle" && (
          <div
            className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
              data.exec.lastResult.status === "success"
                ? "border-success/30 bg-success/10"
                : data.exec.lastResult.status === "failed"
                ? "border-error/30 bg-error/10"
                : "border-border bg-muted/30"
            }`}
          >
            {data.exec.lastResult.status === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            ) : data.exec.lastResult.status === "failed" ? (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-error" />
            ) : (
              <FileClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="space-y-0.5">
              <p className="font-medium text-foreground">
                {data.exec.lastResult.action === "rollback"
                  ? `最近一次回滚（目标 ${data.exec.lastResult.version}）`
                  : `最近一次更新（目标 ${data.exec.lastResult.version}）`}
                {data.exec.lastResult.method ? ` · ${METHOD_MAP[data.exec.lastResult.method].label}` : ""}
                ：{data.exec.lastResult.status === "success" ? "成功" : data.exec.lastResult.status === "failed" ? "失败" : "进行中"}
              </p>
              <p className="text-xs text-muted-foreground">{data.exec.lastResult.message}</p>
            </div>
          </div>
        )}

        {/* 回滚 */}
        <SectionBlock
          title="回滚到历史版本"
          subtitle={`可回滚 ${data?.rollbackTargets.length ?? 0} 个版本`}
          dotClass="bg-warning"
          open={false}
        >
          {data?.rollbackTargets.length ? (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                选择之前的历史版本（git tag）进行回滚。回滚同样会先备份当前数据库，可再次回滚到其它版本。
              </p>
              <div className="space-y-2">
                {data.rollbackTargets.map((v) => (
                  <div
                    key={v}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <GitCompareArrows className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono text-sm font-semibold">{v}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => trigger("rollback", v, undefined, method)}
                      className="gap-1.5"
                    >
                      {submitting === `rollback:${v}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                      回滚到此版本
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<History className="h-5 w-5" />}
              title="暂无历史版本可回滚"
              hint={rollDone ? "当前已是最早的已记录版本" : "完成一次更新或升级后，这里会记录可回滚的历史版本"}
            />
          )}
        </SectionBlock>

        {/* 回滚数据快照 */}
        <SectionBlock title="数据库快照" subtitle={`${data?.backups.length ?? 0} 份`} dotClass="bg-success" open={false}>
          {data?.backups.length ? (
            <div className="space-y-2">
              {data.backups.slice(0, 10).map((b) => (
                <div
                  key={b.file}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-foreground">{b.file}</span>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatTs(b.at)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<HardDrive className="h-5 w-5" />}
              title="暂无数据库快照"
              hint="更新 / 回滚前会自动生成一份 prod-*.db 快照用于回档"
            />
          )}
        </SectionBlock>

        {/* 更新历史 */}
        <SectionBlock
          title="更新日志"
          subtitle={`${data?.records.length ?? 0} 条记录`}
          dotClass="bg-info"
          open={false}
        >
          {data?.records.length ? (
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-2 py-2 font-medium">操作</th>
                    <th className="px-2 py-2 font-medium">方式</th>
                    <th className="px-2 py-2 font-medium">版本</th>
                    <th className="px-2 py-2 font-medium">状态</th>
                    <th className="px-2 py-2 font-medium">操作者</th>
                    <th className="px-2 py-2 font-medium">时间</th>
                    <th className="px-2 py-2 font-medium">说明</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((r) => (
                    <tr key={r.id} className="border-b border-border/60 align-top">
                      <td className="px-2 py-2.5">
                        <ActionBadge action={r.action} />
                      </td>
                      <td className="px-2 py-2.5">
                        <MethodBadge method={r.method} />
                      </td>
                      <td className="px-2 py-2.5 font-mono font-medium">{r.version}</td>
                      <td className="px-2 py-2.5">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-2 py-2.5 text-muted-foreground">{r.triggeredBy}</td>
                      <td className="px-2 py-2.5 text-xs text-muted-foreground tabular-nums">
                        {formatTime(r.createdAt)}
                      </td>
                      <td className="max-w-[220px] px-2 py-2.5">
                        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {r.description || r.message || "-"}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={<FileClock className="h-5 w-5" />}
              title="暂无更新记录"
              hint="完成更新或回滚后，操作记录会显示在这里"
            />
          )}
        </SectionBlock>

        {!hostReady && (
          <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="leading-relaxed text-foreground">
              尚未检测到宿主机更新通道（data/deploy/versions.json 不存在）。
              请先在服务器安装并启动 <code className="rounded bg-muted px-1 font-mono text-xs">update-watch.sh</code>，
              并记录当前部署版本到 <code className="rounded bg-muted px-1 font-mono text-xs">versions.json</code>，即可启用更新 / 回滚功能。
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}