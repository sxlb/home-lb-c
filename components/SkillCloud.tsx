"use client";

import type { SkillRow } from "@/app/hooks";
import { resolveLucideIcon, isLucideIcon } from "@/components/lucideIconResolver";

/** 技能胶囊图标（lucide 名解析，未知则返回 null 以纯标签展示） */
function SkillIcon({ icon }: { icon: string }) {
  if (!icon || !isLucideIcon(icon)) return null;
  const Icon = resolveLucideIcon(icon);
  return Icon ? <Icon className="h-4 w-4 shrink-0 text-white/70" /> : null;
}

/** 技能云卡片（并入首屏，位于链接导航下方；无数据时不渲染） */
export default function SkillCloud({ skills }: { skills: SkillRow[] }) {
  if (skills.length === 0) return null;

  return (
    <div className="card-glass w-full rounded-2xl p-4 lg:p-5">
      <h2 className="mb-3 text-base font-semibold tracking-wide text-white">
        技能 <span className="ml-1 text-xs font-normal text-white/40">Skill Set</span>
      </h2>
      <div className="flex flex-wrap gap-2">
        {skills.map((s) => (
          <span
            key={s.id}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-2.5 pr-2.5 text-sm text-white/90"
          >
            <SkillIcon icon={s.icon} />
            {s.name}
            {s.level > 0 && (
              <span className="ml-0.5 h-1.5 w-12 overflow-hidden rounded-full bg-white/10" aria-hidden>
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.max(0, s.level))}%`,
                    background:
                      "linear-gradient(90deg, color-mix(in srgb, var(--accent-color, #7dd3fc) 60%, white), var(--accent-color, #7dd3fc))",
                  }}
                />
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}