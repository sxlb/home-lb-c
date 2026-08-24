"use client";

/**
 * Lucide 图标解析工具
 * - 支持 "lucide:xxx" 前缀格式的图标值
 * - 动态从 lucide-react 查找对应图标组件
 * - 提供 kebab-case → PascalCase 转换
 */

import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Lucide 图标值前缀 */
export const LUCIDE_PREFIX = "lucide:";

/**
 * 判断图标值是否为 lucide 格式（以 lucide: 开头）
 */
export function isLucideIcon(iconValue: string): boolean {
  return iconValue?.startsWith(LUCIDE_PREFIX);
}

/**
 * 从 lucide:xxx 格式的值中提取纯图标名（kebab-case）
 * 例如 "lucide:github" → "github"
 */
export function extractLucideIconName(iconValue: string): string {
  if (isLucideIcon(iconValue)) {
    return iconValue.slice(LUCIDE_PREFIX.length);
  }
  return "";
}

/**
 * kebab-case → PascalCase 转换
 * 例如 "chevron-right" → "ChevronRight"
 */
export function kebabToPascalCase(str: string): string {
  return str
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/**
 * 根据 kebab-case 图标名查找 Lucide 图标组件
 * 找不到时返回 null
 */
export function getLucideIconByName(name: string): LucideIcon | null {
  if (!name) return null;
  const pascalName = kebabToPascalCase(name);
  const Icon = (LucideIcons as unknown as Record<string, LucideIcon | undefined>)[pascalName];
  return Icon ?? null;
}

/**
 * 根据图标值（支持 lucide: 前缀）解析 Lucide 图标组件
 * - 若为 lucide:xxx 格式，动态查找对应图标
 * - 若不是 lucide 格式，返回 null（由调用方处理回退逻辑）
 */
export function resolveLucideIcon(iconValue: string): LucideIcon | null {
  if (!isLucideIcon(iconValue)) return null;
  const name = extractLucideIconName(iconValue);
  return getLucideIconByName(name);
}
