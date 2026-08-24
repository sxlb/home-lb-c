// 注意：此文件是 Docker 容器启动时直接运行的 CommonJS 脚本（对应 eslint 豁免项），
// 逻辑与 seed.ts 保持一致；若修改默认数据请同步更新 seed.ts
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

// 默认账号（首次启动写入数据库，登录后请在后台修改）
// 密码长度需 ≥ 8，与 /api/account 的 zod 校验一致
const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "admin123";

// 默认社交链接（来自 home 项目的默认配置）
const DEFAULT_SOCIAL_LINKS = [
  { name: "GitHub", icon: "github", url: "https://github.com", tip: "去 Github 看看", sort: 0 },
  { name: "BiliBili", icon: "bilibili", url: "https://space.bilibili.com", tip: "(゜-゜)つロ 干杯~", sort: 1 },
  { name: "Email", icon: "mail", url: "mailto:example@example.com", tip: "来封 Email~", sort: 2 },
  { name: "Twitter", icon: "twitter", url: "https://x.com", tip: "你懂的~", sort: 3 },
  { name: "Telegram", icon: "send", url: "https://t.me", tip: "你懂的~", sort: 4 },
];

// 默认网站链接（来自 home 项目的默认配置）
// 注意：名为「音乐」或 url 为 "music:" 的链接会触发页面音乐播放器（见 components/SiteLinks.tsx）
const DEFAULT_SITE_LINKS = [
  { name: "博客", icon: "book-open", url: "https://example.com/blog", sort: 0 },
  { name: "网盘", icon: "cloud", url: "https://example.com/pan", sort: 1 },
  { name: "音乐", icon: "music", url: "music:", sort: 2 },
  { name: "起始页", icon: "compass", url: "https://example.com/nav", sort: 3 },
  { name: "网址集", icon: "link", url: "https://example.com/web", sort: 4 },
  { name: "今日热榜", icon: "flame", url: "https://example.com/hot", sort: 5 },
];

async function main() {
  // ---- Profile 默认数据 ----
  const profileCount = await prisma.profile.count();
  if (profileCount === 0) {
    await prisma.profile.create({
      data: {
        avatar: "",
        siteIcon: "",
        nickname: "无名",
        bio: "这个人很懒，什么都没写",
        github: "",
        email: "",
        // 默认天气数据源：腾讯天气（免费、无需密钥，需填城市）
        weatherProvider: "tencent",
        amapKey: "",
        txWeatherKey: "",
        weatherCity: "",
      },
    });
    console.log("Seed 完成：已插入默认 Profile 记录");
  } else {
    console.log(`Seed 跳过：Profile 已存在 ${profileCount} 条记录`);
  }

  // ---- User 默认账号 ----
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    const hashed = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    await prisma.user.create({
      data: { username: DEFAULT_USERNAME, password: hashed },
    });
    console.log(`Seed 完成：已创建默认账号 "${DEFAULT_USERNAME}/${DEFAULT_PASSWORD}"`);
    console.warn("[seed] 请尽快登录后台修改默认账号密码");
  } else {
    console.log(`Seed 跳过：User 已存在 ${userCount} 条记录`);
  }

  // ---- SocialLink 默认数据 ----
  const socialLinkCount = await prisma.socialLink.count();
  if (socialLinkCount === 0) {
    await prisma.socialLink.createMany({
      data: DEFAULT_SOCIAL_LINKS,
    });
    console.log(`Seed 完成：已插入 ${DEFAULT_SOCIAL_LINKS.length} 条默认社交链接`);
  } else {
    console.log(`Seed 跳过：SocialLink 已存在 ${socialLinkCount} 条记录`);
  }

  // ---- SiteLink 默认数据 ----
  const siteLinkCount = await prisma.siteLink.count();
  if (siteLinkCount === 0) {
    await prisma.siteLink.createMany({
      data: DEFAULT_SITE_LINKS,
    });
    console.log(`Seed 完成：已插入 ${DEFAULT_SITE_LINKS.length} 条默认网站链接`);
  } else {
    console.log(`Seed 跳过：SiteLink 已存在 ${siteLinkCount} 条记录`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
