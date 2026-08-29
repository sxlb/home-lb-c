# 后台增强 S3：访问统计看板 设计文档

- 日期：2026-08-29
- 状态：已批准
- 涉及模块：后台访问统计
- 关联计划：后台增强批次二（S3 + S4 + S5）

## 背景与目标

站点已有 `/api/stats` 记录每日 PV/UV（VisitStat 表），但后台无可视化。目标：新增「访问统计」面板，展示概要指标与 14 天趋势图（零依赖 SVG）。

## 设计决策

### 1. 数据 API

新增 `GET /api/stats/dashboard`（`requireSession`），返回：

```json
{
  "totalPv": 0, "totalUv": 0,
  "todayPv": 0, "todayUv": 0,
  "yesterdayPv": 0, "yesterdayUv": 0,
  "daily": [ { "date": "2026-08-15", "pv": 10, "uv": 2 }, ... ]
}
```

- `daily`：最近 30 天 `findMany` 记录（按 date 升序）
- 概要值：今日/昨日行查询 + 全部 `aggregate`（与现有 `/api/stats` GET 逻辑一致）

### 2. 前端 StatsPanel（后台「访问统计」tab，运维工具组）

- 概要卡片 4 个：今日 PV、今日 UV、累计 PV、累计 UV（含较昨日增减百分比与颜色）
- 趋势图 2 个：PV / UV 最近 14 天 SVG 折线图
  - 纯 SVG `polyline` + 数据点；hover 显示日期与数值（绝对定位 tooltip）
  - 日期补零（缺失日期补 0）；全零/空数据时空态提示
- 图表逻辑抽纯函数（`buildDailySeries`：30 天记录 → 14 天补零序列），可单测

### 3. 文件变更

| 文件 | 操作 |
|------|------|
| `app/api/stats/dashboard/route.ts` | 新建：历史趋势 + 概要 API |
| `components/admin/StatsPanel.tsx` | 新建：概要卡 + 双折线图 |
| `app/admin/page.tsx` | 修改：新增「访问统计」tab（BarChart3 图标） |
| `tests/stats-dashboard.test.ts` | 新建：buildDailySeries 补零/取窗逻辑单测 |

### 4. 测试与验收

- `buildDailySeries` 单测：缺失日期补 0、窗口取最近 N 天、降序输入归一化
- 手工：后台「访问统计」显示 4 概要卡 + 双趋势图；hover tooltip；无数据空态

## 非目标

- 图表库引入（保持零依赖）
- 更多维度（来源/设备/地理位置等）
