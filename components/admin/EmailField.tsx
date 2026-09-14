"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { ChevronDown } from "lucide-react";
import { selectClass } from "./profileShared";
import { cn } from "@/lib/utils";

/** 主流邮箱后缀（按国内使用频率排序，仅本组件内部使用） */
const EMAIL_DOMAINS = [
  "qq.com",
  "163.com",
  "126.com",
  "foxmail.com",
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "sina.com",
  "yeah.net",
  "icloud.com",
  "139.com",
  "189.cn",
];

/** 下拉里的「自定义」哨兵值 */
const CUSTOM_DOMAIN = "__custom__";

interface Props {
  id?: string;
  /** 存库值：完整邮箱（或空串） */
  value: string;
  onChange: (value: string) => void;
}

function splitEmail(value: string): { local: string; domain: string } {
  const at = value.lastIndexOf("@");
  if (at <= 0) return { local: value, domain: "" };
  return { local: value.slice(0, at), domain: value.slice(at + 1) };
}

/** 本地部分只允许邮箱常见字符，避免拼出非法地址 */
function sanitizeLocalPart(input: string): string {
  return input.replace(/[@\s]/g, "");
}

/**
 * 邮箱字段：默认只需填写本地部分（如 123456），后缀从主流邮箱下拉选择，
 * 自动拼成 123456@163.com；需要非常规邮箱时切换到「自定义」手填完整地址。
 */
export default function EmailField({ id, value, onChange }: Props) {
  const parsed = splitEmail(value);
  const isPreset = parsed.domain === "" || EMAIL_DOMAINS.includes(parsed.domain);

  const [local, setLocal] = useState(parsed.local);
  const [domain, setDomain] = useState(isPreset ? parsed.domain || EMAIL_DOMAINS[0] : EMAIL_DOMAINS[0]);
  const [custom, setCustom] = useState(!isPreset);
  const [customValue, setCustomValue] = useState(isPreset ? "" : value);

  // 外部值变化（载入配置 / 保存后回读）时同步本地状态
  useEffect(() => {
    const next = splitEmail(value);
    const preset = next.domain === "" || EMAIL_DOMAINS.includes(next.domain);
    setCustom(!preset);
    if (preset) {
      setLocal(next.local);
      setDomain(next.domain || EMAIL_DOMAINS[0]);
    } else {
      setCustomValue(value);
    }
  }, [value]);

  const emit = (nextLocal: string, nextDomain: string) => {
    const mail = nextLocal.trim();
    onChange(mail ? `${mail}@${nextDomain}` : "");
  };

  if (custom) {
    return (
      <div className="flex gap-2">
        <Input
          id={id}
          value={customValue}
          autoComplete="email"
          placeholder="you@example.com"
          className="min-w-0 flex-1"
          onChange={(e) => {
            setCustomValue(e.target.value);
            onChange(e.target.value.trim());
          }}
        />
        <div className="relative flex h-10 shrink-0 items-center">
          <select
            aria-label="切换为常见邮箱"
            value={CUSTOM_DOMAIN}
            // appearance-none 去掉原生箭头，改用统一 chevron 图标；
            // 宽度用固定值（w-* 覆盖 selectClass 里的 w-full），窄屏下才不会被撑满
            className={cn(selectClass, "w-[7.25rem] cursor-pointer appearance-none pr-8 sm:w-[8.75rem]")}
            onChange={() => {
              setCustom(false);
              setLocal("");
              setDomain(EMAIL_DOMAINS[0]);
              onChange("");
            }}
          >
            <option value={CUSTOM_DOMAIN}>自定义</option>
            {EMAIL_DOMAINS.map((d) => (
              <option key={d} value={d}>
                @{d}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    // 三段合成一个整体控件：外层统一边框，聚焦任一段整组同步高亮（focus-within）
    <div className="flex h-10 items-stretch overflow-hidden rounded-md border border-input bg-background transition-all duration-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      <input
        id={id}
        value={local}
        autoComplete="off"
        inputMode="email"
        spellCheck={false}
        placeholder="123456"
        aria-label="邮箱账号"
        className="w-full min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
        onChange={(e) => {
          const nextLocal = sanitizeLocalPart(e.target.value);
          setLocal(nextLocal);
          emit(nextLocal, domain);
        }}
      />
      {/* @ 分隔：左右细竖线在三段间形成分段感，同时保留在一整个边框内 */}
      <span className="flex select-none items-center border-x border-input/60 bg-muted px-1 text-base text-muted-foreground sm:px-1.5 sm:text-sm">
        @
      </span>
      <div className="relative flex h-full items-center">
        <select
          aria-label="邮箱后缀"
          value={domain}
          className="h-full w-[8rem] cursor-pointer appearance-none border-0 bg-transparent pl-1 pr-7 text-base outline-none sm:w-[9rem] sm:text-sm"
          onChange={(e) => {
            const next = e.target.value;
            if (next === CUSTOM_DOMAIN) {
              const full = local ? `${local}@${domain}` : "";
              setCustom(true);
              setCustomValue(full);
              onChange(full);
              return;
            }
            setDomain(next);
            emit(local, next);
          }}
        >
          {EMAIL_DOMAINS.map((d) => (
            <option key={d} value={d}>
              @{d}
            </option>
          ))}
          <option value={CUSTOM_DOMAIN}>自定义…</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}
