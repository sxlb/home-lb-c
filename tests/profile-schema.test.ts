import { describe, it, expect } from "vitest";
import { profileSchema } from "@/lib/validation";

describe("profileSchema", () => {
  describe("合法输入", () => {
    it("全字段合法时通过校验", () => {
      const input = {
        avatar: "https://avatars.githubusercontent.com/u/1",
        nickname: "张三",
        bio: "一句话介绍",
        github: "https://github.com/test",
        email: "test@example.com",
      };
      const result = profileSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("空字符串字段（除 nickname 外）使用默认值", () => {
      // nickname 有 min(1) 校验，空字符串会失败；其他字段空字符串合法
      const input = {
        avatar: "",
        nickname: "有名字",
        bio: "",
        github: "",
        email: "",
      };
      const result = profileSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.avatar).toBe("");
        expect(result.data.bio).toBe("");
        expect(result.data.github).toBe("");
        expect(result.data.email).toBe("");
      }
    });

    it("nickname 前后空格被 trim", () => {
      const result = profileSchema.safeParse({ nickname: "  张三  " });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.nickname).toBe("张三");
      }
    });

    it("省略字段时使用默认值", () => {
      const result = profileSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.avatar).toBe("");
        expect(result.data.nickname).toBe("无名");
      }
    });

    it("http 头像 URL 合法", () => {
      const result = profileSchema.safeParse({ avatar: "http://example.com/a.png" });
      expect(result.success).toBe(true);
    });

    it("新增字段 amapSecretKey / txWeatherSk / iconfontUrl 接受合法值", () => {
      const result = profileSchema.safeParse({
        amapSecretKey: "secret-key-123",
        txWeatherSk: "sk-456",
        iconfontUrl: "https://at.alicdn.com/t/c/font_123.js",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.amapSecretKey).toBe("secret-key-123");
        expect(result.data.txWeatherSk).toBe("sk-456");
        expect(result.data.iconfontUrl).toBe("https://at.alicdn.com/t/c/font_123.js");
      }
    });

    it("省略新增字段时使用默认值（空串）", () => {
      const result = profileSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.amapSecretKey).toBe("");
        expect(result.data.txWeatherSk).toBe("");
        expect(result.data.iconfontUrl).toBe("");
      }
    });
  });

  describe("非法输入", () => {
    it("nickname 超过 32 字符失败", () => {
      const result = profileSchema.safeParse({ nickname: "a".repeat(33) });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("32");
      }
    });

    it("bio 超过 280 字符失败", () => {
      const result = profileSchema.safeParse({ bio: "a".repeat(281) });
      expect(result.success).toBe(false);
    });

    it("avatar 非 http(s) 开头失败", () => {
      const result = profileSchema.safeParse({ avatar: "ftp://example.com/a.png" });
      expect(result.success).toBe(false);
    });

    it("github 非 https://github.com/ 开头失败", () => {
      const result = profileSchema.safeParse({ github: "http://github.com/test" });
      expect(result.success).toBe(false);
    });

    it("github 非 github.com 域名失败", () => {
      const result = profileSchema.safeParse({ github: "https://evil.com/path" });
      expect(result.success).toBe(false);
    });

    it("email 格式不正确失败", () => {
      const result = profileSchema.safeParse({ email: "not-an-email" });
      expect(result.success).toBe(false);
    });

    it("email 缺少顶级域名失败", () => {
      const result = profileSchema.safeParse({ email: "a@b" });
      expect(result.success).toBe(false);
    });

    it("avatar URL 超过 2048 字符失败", () => {
      const result = profileSchema.safeParse({ avatar: "https://" + "a".repeat(2050) });
      expect(result.success).toBe(false);
    });
  });

  describe("功能开关字段", () => {
    it("6 个功能开关缺省时默认开启", () => {
      const result = profileSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.loadingScreen).toBe(true);
        expect(result.data.clickEffect).toBe(true);
        expect(result.data.consoleEgg).toBe(true);
        expect(result.data.showStats).toBe(true);
        expect(result.data.dynamicTitle).toBe(true);
        expect(result.data.topProgressBar).toBe(true);
      }
    });

    it("可显式关闭功能开关", () => {
      const result = profileSchema.safeParse({
        loadingScreen: false,
        clickEffect: false,
        consoleEgg: false,
        showStats: false,
        dynamicTitle: false,
        topProgressBar: false,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.loadingScreen).toBe(false);
        expect(result.data.clickEffect).toBe(false);
        expect(result.data.consoleEgg).toBe(false);
        expect(result.data.showStats).toBe(false);
        expect(result.data.dynamicTitle).toBe(false);
        expect(result.data.topProgressBar).toBe(false);
      }
    });

    it("非布尔值传入开关字段时校验失败", () => {
      const result = profileSchema.safeParse({ clickEffect: "yes" });
      expect(result.success).toBe(false);
    });
  });

  describe("艺术字体 logoFont", () => {
    it("18 种双语字体值全部合法", () => {
      const fonts = [
        "ma-shan-zheng",
        "zcool-kuail",
        "long-cang",
        "zcool-xiaowei",
        "zcool-qingke",
        "liu-jian-mao-cao",
        "zhi-mang-xing",
        "noto-serif-sc",
        "smiley-sans",
        "maoken-sans",
        "yozai",
        "lxgw-wen-kai",
        "alimama-daka",
        "dingtalk-jinbuti",
        "hongleixingshu",
        "xiaolai",
        "slidefu",
        "slideqiuhong",
      ];
      for (const f of fonts) {
        const result = profileSchema.safeParse({ logoFont: f });
        expect(result.success).toBe(true);
      }
    });

    it("缺省时默认站酷快乐体", () => {
      const result = profileSchema.safeParse({});
      if (result.success) {
        expect(result.data.logoFont).toBe("zcool-kuail");
      }
    });

    it("非法字体值校验失败", () => {
      const result = profileSchema.safeParse({ logoFont: "pacifico" });
      expect(result.success).toBe(false);
    });
  });
});
