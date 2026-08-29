# 后台增强 S6：登录安全 设计文档

- 日期：2026-08-30
- 状态：已批准
- 涉及模块：登录鉴权（NextAuth）
- 关联计划：后台增强批次三（S6）

## 背景与目标

现有登录仅有 IP 维度限流。目标：
1. 账号维度失败锁定（防多 IP 分布式爆破）
2. 可选 TOTP 两步验证（零依赖自实现 RFC 6238）

## 设计决策

### A. 账号维度失败锁定

- 失败时同时记录 `login:<ip>` 与 `login:user:<username>` 双 key
- 检查时任一维度 locked 即拒绝；账号维度防分布式爆破，IP 维度防单源轰炸
- 用户不存在时只记 IP key（避免账号锁定差异被探测）
- 沿用现有参数：5 次失败 / 5 分钟窗口 / 锁 10 分钟

### B. TOTP 两步验证

**数据模型**：`User` 加 `twoFactorSecret`（String，默认 ""）、`twoFactorEnabled`（Boolean，默认 false）+ migration

**登录流程**：
1. 登录页探测 `GET /api/auth/2fa-status?username=xxx`（IP 限流）→ 开启 2FA 则显示验证码输入框
2. authorize：密码通过后若 `twoFactorEnabled`：
   - 无验证码 → `totp_required` 错误
   - 验证码错误 → 记失败 + `totp_invalid`
   - 通过 → 登录成功

**TOTP 核心** `lib/totp.ts`（node:crypto 零依赖）：
- `generateSecret()`：20 字节随机 → base32
- `verifyTOTP(secret, code)`：HMAC-SHA1 + 动态截断，30s 步长 ±1 步容错
- otpauth:// URL 文本展示（不引入 qrcode 库）

**后台管理**（AccountPanel）：
- 开启：生成 secret → 显示 otpauth URL + secret → 输入验证码确认 → 启用
- 关闭：输入当前验证码 → 关闭

### C. 文件变更

| 文件 | 操作 |
|------|------|
| `lib/totp.ts` | 新建 |
| `prisma/schema.prisma` + migration | User 加两字段 |
| `lib/auth.ts` | 双 key 锁定 + 2FA 校验 + 错误码 |
| `app/api/auth/2fa-status/route.ts` | 新建探测接口 |
| `app/admin/login/page.tsx` | 条件验证码输入 + 错误提示 |
| `components/admin/AccountPanel.tsx` | 2FA 管理 |
| `tests/totp.test.ts` | RFC 6238 测试向量 |

### D. 测试与验收

- TOTP 用 RFC 6238 SHA1 官方测试向量单测
- 手工：5 次失败锁定；2FA 开启后登录需验证码；Authenticator 可用；可关闭

## 非目标

- 短信/邮箱验证码（TOTP 已满足个人站点）
- 多用户管理界面（单管理员模型）
