"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { GITHUB_USERNAME_RE, githubProfileUrl, parseGithubUsername } from "@/lib/github";

interface Props {
  id?: string;
  /** 存库值：完整主页地址（如 https://github.com/sxlb），空串表示未设置 */
  value: string;
  /** 值变化：只在用户名合法时回写完整地址，避免把非法值写进配置 */
  onChange: (value: string) => void;
  /** 校验状态变化：非 null 表示存在阻止保存的错误 */
  onValidityChange?: (error: string | null) => void;
}

type ProbeState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok"; name: string; avatarUrl: string }
  | { kind: "not-found"; message: string }
  | { kind: "unreachable"; message: string };

/**
 * GitHub 字段：只需填写用户名（如 sxlb），链接由程序拼接为 https://github.com/sxlb。
 * 失焦时联网校验该用户是否存在：不存在则报错并阻止保存；网络不可达只提示、不阻止。
 */
export default function GithubUserField({ id, value, onChange, onValidityChange }: Props) {
  const [text, setText] = useState(() => parseGithubUsername(value));
  const [probe, setProbe] = useState<ProbeState>({ kind: "idle" });
  const lastChecked = useRef("");
  const onChangeRef = useRef(onChange);
  const onValidityRef = useRef(onValidityChange);
  onChangeRef.current = onChange;
  onValidityRef.current = onValidityChange;

  // 外部值变化（如切换面板/保存成功后回读）时同步输入框
  useEffect(() => {
    const parsed = parseGithubUsername(value);
    setText((prev) => (parseGithubUsername(githubProfileUrl(prev)) === value ? prev : parsed));
  }, [value]);

  const check = async (username: string) => {
    if (!username || !GITHUB_USERNAME_RE.test(username) || lastChecked.current === username) return;
    lastChecked.current = username;
    setProbe({ kind: "checking" });
    try {
      const res = await fetch(`/api/github-user?username=${encodeURIComponent(username)}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setProbe({ kind: "ok", name: data.name || "", avatarUrl: data.avatarUrl || "" });
        onValidityRef.current?.(null);
        return;
      }
      if (res.status === 404 || data?.exists === false) {
        const message = data?.error || `GitHub 用户「${username}」不存在，请检查拼写`;
        setProbe({ kind: "not-found", message });
        onValidityRef.current?.(message);
        return;
      }
      // 502/其它：无法联网校验，只提示不阻止保存（与“用户不存在”区分开）
      const message = data?.error || "暂时无法连接 GitHub 校验用户名";
      setProbe({ kind: "unreachable", message });
      onValidityRef.current?.(null);
    } catch {
      setProbe({ kind: "unreachable", message: "暂时无法连接 GitHub 校验用户名" });
      onValidityRef.current?.(null);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-stretch">
        <span className="inline-flex select-none items-center rounded-l-md border border-r-0 border-input bg-muted px-2.5 text-xs text-muted-foreground">
          github.com/
        </span>
        <Input
          id={id}
          value={text}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            const next = e.target.value.replace(/^@/, "").trim();
            setText(next);
            lastChecked.current = "";
            if (!next) {
              setProbe({ kind: "idle" });
              onValidityRef.current?.(null);
              onChangeRef.current("");
              return;
            }
            if (GITHUB_USERNAME_RE.test(next)) {
              setProbe({ kind: "idle" });
              onValidityRef.current?.(null);
              onChangeRef.current(githubProfileUrl(next));
            } else {
              const message = "用户名仅支持字母、数字与连字符（不能以连字符开头/结尾）";
              setProbe({ kind: "not-found", message });
              onValidityRef.current?.(message);
            }
          }}
          onBlur={() => void check(text)}
          placeholder="sxlb"
          className="rounded-l-none"
        />
      </div>

      {probe.kind === "checking" && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          正在校验该用户是否存在…
        </p>
      )}
      {probe.kind === "ok" && (
        <p className="flex items-center gap-1.5 text-xs text-success">
          <CheckCircle2 className="h-3 w-3" />
          已确认存在{probe.name ? `：${probe.name}` : ""}
        </p>
      )}
      {probe.kind === "not-found" && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          {probe.message}
        </p>
      )}
      {probe.kind === "unreachable" && (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <AlertCircle className="h-3 w-3" />
          {probe.message}（已跳过校验，不影响保存）
        </p>
      )}
    </div>
  );
}
