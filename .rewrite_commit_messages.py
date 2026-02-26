#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
用于 git filter-branch --msg-filter 的提交信息重写脚本。

目标格式（无冒号后空格）：
  <type>(<scope>):<subject>

说明：
- 该脚本只修改第一行 subject，保留原始 body。
- scope 会根据提交变更文件路径做启发式推断；若无法推断则使用 misc。
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from collections import Counter


KNOWN_TYPES = {
    "feat",
    "fix",
    "perf",
    "refactor",
    "docs",
    "chore",
    "test",
    "build",
    "ci",
    "style",
    "revert",
}

# 一些历史提交使用了过于泛化的 scope（或技术层 scope），希望自动纠正为“功能模块 scope”。
GENERIC_SCOPES = {"misc", "backend", "frontend", "api"}


def run_git(args: list[str]) -> str:
    return subprocess.check_output(["git", *args], text=True, stderr=subprocess.DEVNULL)


def changed_files(commit: str) -> list[str]:
    try:
        out = run_git(["diff-tree", "--no-commit-id", "--name-only", "-r", commit])
    except Exception:
        return []
    files = []
    for line in out.splitlines():
        p = line.strip()
        if p:
            files.append(p.replace("\\", "/"))
    return files


def infer_scope(files: list[str]) -> str:
    if not files:
        return "misc"

    # 强优先级：Syslog
    for p in files:
        if "syslog" in p.lower():
            return "syslog"

    buckets: Counter[str] = Counter()

    def add(scope: str) -> None:
        buckets[scope] += 1

    for p in files:
        low = p.lower()

        if low.startswith("backend-go/internal/logs/") or low.startswith("frontend/src/features/logs/") or low.startswith("tests/frontend/logs/") or low.startswith("tests/backend-go/internal/logs/") or low.startswith("logs/"):
            add("logs")
            continue

        if low.startswith("backend-go/internal/monitoring/") or low.startswith("frontend/src/features/monitoring/") or low.startswith("tests/frontend/monitoring/") or "monitoring" in low:
            add("monitoring")
            continue

        if low.startswith("backend-go/internal/alerts/") or low.startswith("frontend/src/features/alerts/") or low.startswith("tests/frontend/alerts/") or low.startswith("tests/backend-go/internal/alerts/") or "alert" in low:
            add("alerts")
            continue

        if low.startswith("backend-go/internal/settings/") or low.startswith("frontend/src/features/settings/") or low.startswith("tests/frontend/settings/") or "settings" in low:
            add("settings")
            continue

        if low.startswith("backend-go/internal/devices/") or low.startswith("frontend/src/features/devices/") or "devices" in low:
            add("devices")
            continue

        if low.startswith("backend-go/internal/inspection/") or "inspection" in low:
            add("inspection")
            continue

        if low.startswith("backend-go/internal/dashboard/") or "dashboard" in low:
            add("dashboard")
            continue

        if low.startswith("backend-go/internal/auth/") or "/auth" in low:
            add("auth")
            continue

        if low.startswith("docker-compose") or low.startswith("docker/"):
            add("docker")
            continue

        if low.startswith("docs/"):
            add("docs")
            continue

        if low.startswith("scripts/"):
            add("scripts")
            continue

        if low.startswith("tests/"):
            add("tests")
            continue

        if low.startswith("backend-go/"):
            add("backend")
            continue

        if low.startswith("frontend/"):
            add("frontend")
            continue

        # 兜底
        add("misc")

    # 选择出现次数最多的 scope；若 ties，则按优先级表挑选
    if not buckets:
        return "misc"

    best_count = max(buckets.values())
    candidates = {k for k, v in buckets.items() if v == best_count}
    priority = [
        "syslog",
        "logs",
        "monitoring",
        "alerts",
        "settings",
        "devices",
        "inspection",
        "dashboard",
        "auth",
        "docker",
        "docs",
        "scripts",
        "tests",
        "backend",
        "frontend",
        "misc",
    ]
    for item in priority:
        if item in candidates:
            return item
    return "misc"


def infer_type(subject: str, files: list[str]) -> str:
    s = subject.strip()

    m = re.match(r"^([A-Za-z]+)(\([^)]+\))?:", s)
    if m:
        t = m.group(1).lower()
        return t if t in KNOWN_TYPES else "chore"

    low = s.lower()
    if s.startswith("修复") or s.startswith("修正") or low.startswith("fix") or "安全修复" in s:
        return "fix"
    if s.startswith("重构") or "重构" in s:
        return "refactor"
    if s.startswith("优化") or "优化" in s:
        return "perf"
    if s.startswith("文档") or low.startswith("docs") or any(p.lower().startswith("docs/") for p in files):
        return "docs"
    if s.startswith("整理") or s.startswith("更新") or s.startswith("删除") or s.startswith("迁移") or "迁移" in s:
        return "chore"
    if s.startswith("完成") or s.startswith("实现") or s.startswith("添加") or s.startswith("升级") or "实现" in s or "新增" in s:
        return "feat"

    # 兜底：按文件类型判断
    if files and all(p.lower().startswith("docs/") for p in files):
        return "docs"
    return "feat"


def strip_fix_prefix(text: str) -> str:
    s = text.strip()
    # 常见“修复/修正/Fix”前缀
    s = re.sub(r"^(修复|修正)\s*[:：]?\s*", "", s)
    s = re.sub(r"^(fix|Fix|FIX)\s*[:：]?\s*", "", s)
    return s.strip()

def looks_like_fix_prefix(text: str) -> bool:
    s = text.strip()
    low = s.lower()
    return s.startswith(("修复", "修正")) or low.startswith("fix") or ("安全修复" in s)


def normalize_subject_line(subject: str, commit: str, files: list[str]) -> str:
    s = subject.strip()

    # 特殊指定：用户要求的 syslog 原子类型崩溃修复提交（不要依赖 commit hash，避免重写后 hash 变化）
    if "原子存储类型不一致导致启动崩溃" in s:
        return "fix(syslog):Syslog 接收器原子存储类型不一致导致启动崩溃"

    m = re.match(r"^([A-Za-z]+)(\(([^)]+)\))?:\s*(.*)$", s)
    if m:
        t = m.group(1).lower()
        scope_raw = m.group(3)  # may be None
        rest = m.group(4).strip()

        if t not in KNOWN_TYPES:
            t = "chore"

        inferred_scope = infer_scope(files)

        # scope 纠正策略：
        # 1) Syslog 强优先级：只要推断为 syslog，就覆盖任何已有 scope（历史里经常写成 api/backend/misc）。
        # 2) 对 misc/backend/frontend/api 这类泛化 scope，若能推断出更具体模块，则用推断值覆盖。
        if inferred_scope == "syslog":
            scope = "syslog"
        else:
            scope = scope_raw.strip().lower() if scope_raw else inferred_scope
            if not scope:
                scope = inferred_scope
            if scope in GENERIC_SCOPES and inferred_scope and inferred_scope != "misc":
                scope = inferred_scope

        # 历史提交里常见 “feat(...):修复xxx” 这类错标，自动纠正为 fix
        if t != "fix" and looks_like_fix_prefix(rest):
            t = "fix"

        if t == "fix":
            rest = strip_fix_prefix(rest)
        if not rest:
            rest = m.group(4).strip()

        return f"{t}({scope}):{rest}"

    # 形如 “修复xxx...” / “安全修复：xxx”
    t = infer_type(s, files)
    scope = infer_scope(files)
    rest = s
    if t == "fix":
        rest = strip_fix_prefix(rest)

    if not rest:
        rest = s.strip()
    return f"{t}({scope}):{rest}"


def main() -> int:
    commit = os.environ.get("GIT_COMMIT", "").strip()
    # 在 Windows PowerShell 场景中，stdin 的默认编码可能不是 UTF-8，
    # 直接 sys.stdin.read() 会导致中文提交信息被“错解码”，从而匹配/规范化失败。
    # 这里用字节读取并按 UTF-8 解码（surrogateescape 便于尽量保留原始字节）。
    raw = sys.stdin.buffer.read().decode("utf-8", errors="surrogateescape")
    if raw == "":
        return 0

    lines = raw.splitlines()
    subject = lines[0] if lines else ""
    body = "\n".join(lines[1:]) if len(lines) > 1 else ""

    files = changed_files(commit) if commit else []
    new_subject = normalize_subject_line(subject, commit, files)

    if body:
        sys.stdout.buffer.write((new_subject + "\n" + body + "\n").encode("utf-8", errors="surrogateescape"))
    else:
        sys.stdout.buffer.write((new_subject + "\n").encode("utf-8", errors="surrogateescape"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
