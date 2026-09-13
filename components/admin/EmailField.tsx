"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { selectClass } from "./profileShared";
import { cn } from "@/lib/utils";

/** 主流邮箱后缀（按国内使用频率排序） */
export const EMAIL_DOMAINS = [
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
        <select
          aria-label="切换为常见邮箱"
          value={CUSTOM_DOMAIN}
          // cn（tailwind-merge）确保 w-* 覆盖 selectClass 里的 w-full：
          // 直接拼字符串时 w-full 会赢，窄屏下下拉会吃满整行、把输入框挤到只剩几十像素
          className={cn(selectClass, "w-[7rem] shrink-0 sm:w-[8.5rem]")}
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
      </div>
    );
  }

  return (
    <div className="flex items-stretch">
      <Input
        id={id}
        value={local}
        autoComplete="off"
        inputMode="email"
        placeholder="123456"
        aria-label="邮箱账号"
        className="min-w-0 flex-1 rounded-r-none border-r-0"
        onChange={(e) => {
          const nextLocal = sanitizeLocalPart(e.target.value);
          setLocal(nextLocal);
          emit(nextLocal, domain);
        }}
      />
      <span className="inline-flex select-none items-center border-y border-input bg-muted px-1.5 text-base text-muted-foreground sm:px-2 sm:text-sm">
        @
      </span>
      <select
        aria-label="邮箱后缀"
        value={domain}
        className={cn(selectClass, "w-[8rem] shrink-0 rounded-l-none border-l-0 sm:w-[9rem]")}
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
    </div>
  );
}
