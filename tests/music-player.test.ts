import { describe, it, expect } from "vitest";
import { getNextTrackIndex, formatTime, normalizeTracks, type PlayMode } from "@/components/useAudioPlayer";

describe("getNextTrackIndex（播放模式下一首计算）", () => {
  it("空歌单一律返回 -1", () => {
    for (const mode of ["order", "loop", "single", "shuffle"] as PlayMode[]) {
      expect(getNextTrackIndex(mode, 0, 0)).toBe(-1);
    }
  });

  it("下标越界（-1 / 超出）回退到第一首", () => {
    expect(getNextTrackIndex("loop", 5, -1)).toBe(0);
    expect(getNextTrackIndex("loop", 5, 99)).toBe(0);
  });

  describe("order 顺序播放", () => {
    it("非最后一首：顺序 +1", () => {
      expect(getNextTrackIndex("order", 5, 2)).toBe(3);
    });
    it("最后一首：返回 -1（播放结束）", () => {
      expect(getNextTrackIndex("order", 5, 4)).toBe(-1);
    });
    it("单首歌：播放结束", () => {
      expect(getNextTrackIndex("order", 1, 0)).toBe(-1);
    });
  });

  describe("loop 列表循环", () => {
    it("非最后一首：顺序 +1", () => {
      expect(getNextTrackIndex("loop", 5, 2)).toBe(3);
    });
    it("最后一首：回到第一首", () => {
      expect(getNextTrackIndex("loop", 5, 4)).toBe(0);
    });
    it("单首歌：停留自身（自身循环）", () => {
      expect(getNextTrackIndex("loop", 1, 0)).toBe(0);
    });
  });

  describe("single 单曲循环", () => {
    it("始终停留当前曲目", () => {
      expect(getNextTrackIndex("single", 5, 2)).toBe(2);
      expect(getNextTrackIndex("single", 1, 0)).toBe(0);
    });
  });

  describe("shuffle 随机播放", () => {
    it("歌单多于一首时不会选到当前曲目", () => {
      for (let i = 0; i < 50; i++) {
        const next = getNextTrackIndex("shuffle", 5, 2);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(5);
        expect(next).not.toBe(2);
      }
    });
    it("单首歌：停留自身", () => {
      expect(getNextTrackIndex("shuffle", 1, 0)).toBe(0);
    });
  });
});

describe("formatTime（播放时长格式化）", () => {
  it("常规时长：m:ss 格式", () => {
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(600)).toBe("10:00");
  });
  it("不足一分钟补零", () => {
    expect(formatTime(9)).toBe("0:09");
  });
  it("非法值（NaN/Infinity/负数）回退 0:00", () => {
    expect(formatTime(Number.NaN)).toBe("0:00");
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe("0:00");
    expect(formatTime(-5)).toBe("0:00");
  });
  it("小数向下取整", () => {
    expect(formatTime(65.9)).toBe("1:05");
  });
});

describe("normalizeTracks（第三方字段归一化）", () => {
  it("兼容 name/title、artist/author、cover/pic 两组字段，并透传 lrc", () => {
    const tracks = normalizeTracks(
      [
        { id: 5, name: "歌 A", artist: "歌手 A", url: "https://a.mp3", cover: "https://a.jpg", lrc: "[00:01.00]第一句" },
        { title: "歌 B", author: "歌手 B", url: "https://b.mp3", pic: "https://b.jpg" },
        { url: "https://c.mp3" },
      ],
      0
    );
    expect(tracks).toEqual([
      { id: "5", name: "歌 A", artist: "歌手 A", url: "https://a.mp3", cover: "https://a.jpg", lrc: "[00:01.00]第一句" },
      { id: "1", name: "歌 B", artist: "歌手 B", url: "https://b.mp3", cover: "https://b.jpg", lrc: "" },
      { id: "2", name: "未知歌曲", artist: "未知歌手", url: "https://c.mp3", cover: "", lrc: "" },
    ]);
  });

  it("缺少 id 时用 offset + 下标兜底，避免跨源 id 冲突", () => {
    const a = normalizeTracks([{ name: "x", url: "u" }], 10000);
    expect(a[0].id).toBe("10000");
  });
});
