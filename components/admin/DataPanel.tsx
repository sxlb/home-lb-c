"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Upload, Loader2, FileJson } from "lucide-react";
import { toast } from "sonner";

interface BackupSummary {
  exportedAt?: string;
  counts?: { profile: string; socialLinks: number; siteLinks: number; friendLinks: number };
}

/** 数据管理面板：备份下载 + 恢复上传（危险操作二次确认） */
export default function DataPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePickFile = (f: File | null) => {
    setFile(f);
    setSummary(null);
    setConfirmed(false);
    if (!f) return;
    // 本地解析预览（不发送）：校验 version 并展示摘要
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (data.version !== 1) {
          toast.error("备份版本不支持");
          setFile(null);
          return;
        }
        setSummary({
          exportedAt: data.exportedAt ? new Date(data.exportedAt).toLocaleString("zh-CN") : "未知",
          counts: {
            profile: data.profile?.nickname || "（空配置）",
            socialLinks: Array.isArray(data.socialLinks) ? data.socialLinks.length : 0,
            siteLinks: Array.isArray(data.siteLinks) ? data.siteLinks.length : 0,
            friendLinks: Array.isArray(data.friendLinks) ? data.friendLinks.length : 0,
          },
        });
      } catch {
        toast.error("备份文件解析失败，请确认为导出的 JSON 文件");
        setFile(null);
      }
    };
    reader.readAsText(f);
  };

  const handleRestore = async () => {
    if (!file || !summary || !confirmed) return;
    setRestoring(true);
    try {
      const text = await file.text();
      const res = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, backup: JSON.parse(text) }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("恢复成功，数据已更新");
        setFile(null);
        setSummary(null);
        setConfirmed(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else {
        toast.error(data.error || "恢复失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Card>
      {/* 页面级标题/描述由 admin/page.tsx 提供，卡内不再重复标题 */}
      <CardContent className="space-y-6">
        {/* 备份区 */}
        <div className="rounded-xl border bg-muted/20 p-4">
          <h3 className="mb-1 text-sm font-semibold">一键备份</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            下载全部业务数据为 JSON 文件，用于迁移部署或定期存档。账号密码与操作日志不包含在内。
          </p>
          <a
            href="/api/backup"
            download
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Download className="h-4 w-4" />
            下载备份
          </a>
        </div>

        {/* 恢复区 */}
        <div className="rounded-xl border border-destructive/20 p-4">
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
            <Upload className="h-4 w-4" />
            恢复备份
          </h3>
          <p className="mb-3 text-xs text-destructive/80">
            危险操作：恢复将覆盖当前所有配置与链接数据，且不可撤销。请确认已下载最新备份。
          </p>

          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => handlePickFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
            />

            {summary && (
              <div className="rounded-lg border bg-background/60 p-3 text-sm">
                <div className="mb-2 flex items-center gap-1.5 text-success">
                  <FileJson className="h-4 w-4" />
                  <span className="font-medium">备份文件信息</span>
                </div>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  <li>备份时间：{summary.exportedAt}</li>
                  <li>站点配置：{summary.counts?.profile}</li>
                  <li>社交链接：{summary.counts?.socialLinks} 条</li>
                  <li>网站链接：{summary.counts?.siteLinks} 条</li>
                  <li>友情链接：{summary.counts?.friendLinks} 条</li>
                </ul>
              </div>
            )}

            {file && (
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-destructive"
                />
                <span className="text-muted-foreground">我了解此操作将覆盖当前全部数据</span>
              </label>
            )}

            <Button
              variant="destructive"
              onClick={handleRestore}
              disabled={!file || !summary || !confirmed || restoring}
              className="gap-1.5"
            >
              {restoring ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  恢复中...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  确认恢复
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
