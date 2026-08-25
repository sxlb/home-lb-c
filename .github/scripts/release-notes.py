#!/usr/bin/env python3
"""
生成 RELEASE_NOTES.md（供 GitHub Actions 发布时使用）。

逻辑：
- 读取 .github/scripts/release-notes-template.md（含 {{占位符}}）
- 用环境变量 / git 信息填充占位符并写出 RELEASE_NOTES.md
- 变更列表取"上一版本 tag 到 HEAD"的提交（无 tag 时取最近 20 条）
"""
import datetime
import os
import pathlib
import subprocess

ROOT = pathlib.Path(os.environ.get("GITHUB_WORKSPACE", "."))
VERSION = os.environ["VERSION"]
REPO = os.environ.get("REPO", "sxlb/home-lb-c")
DATE = datetime.date.today().strftime("%Y-%m-%d")


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], capture_output=True, text=True, check=False
    ).stdout.strip()


def main() -> None:
    # 上一版本 tag（按创建时间倒序取最新）
    tags = [t for t in git("tag", "--sort=-creatordate").splitlines() if t]
    prev = tags[0] if tags else ""

    # 变更列表（去掉 commit hash，保留提交信息；无历史时兜底）
    log_range = f"{prev}..HEAD" if prev and prev != VERSION else "HEAD"
    log = git("log", "--oneline", "--no-merges", "-20", log_range)
    if log:
        changes = "\n".join(
            f"- {line.split(maxsplit=1)[-1]}" for line in log.splitlines()
        )
    else:
        changes = "- 首次发布"

    # CHANGELOG 对比链接
    if prev and prev != VERSION:
        link = f"https://github.com/{REPO}/compare/{prev}...{VERSION}"
    else:
        link = f"https://github.com/{REPO}/commits/{VERSION}"

    template = (ROOT / ".github/scripts/release-notes-template.md").read_text(encoding="utf-8")
    notes = (
        template.replace("{{VERSION}}", VERSION)
        .replace("{{DATE}}", DATE)
        .replace("{{CHANGES}}", changes)
        .replace("{{COMPARE_LINK}}", link)
    )
    (ROOT / "RELEASE_NOTES.md").write_text(notes, encoding="utf-8")
    print(f"Generated RELEASE_NOTES.md for {VERSION} (prev tag: {prev or 'none'})")


if __name__ == "__main__":
    main()
