# -*- coding: utf-8 -*-
"""核对 token-monitor fork 的两件事：
  1) i18n 的 10 个新 key 是否逐字正确（console 显示乱码，需排除真的写坏了）
  2) 打印 edgeAutoHide.js 全文 + main.js 里 persistBoundsSoon 的改动 hunk（供人工评审）
"""
import io
import re
import subprocess
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
FORK = r"C:\Users\29871\AppData\Local\Temp\opencode\tm-fork"

# 我提供给实现者的文案（期望值）
EXPECT = {
    "en": ("Edge auto-hide", "Edge auto-hide"),
    "zh-TW": ("貼邊自動隱藏", "貼邊自動隱藏"),
    "zh-CN": ("贴边自动隐藏", "贴边自动隐藏"),
    "ko": ("가장자리 자동 숨김", "가장자리 자동 숨김"),
    "ja": ("端で自動的に隠す", "端で自動的に隠す"),
}

print("=" * 4 + " 1. i18n 逐字核对 " + "=" * 4)
p = FORK + r"\src\electron\renderer\i18n.js"
raw = open(p, "rb").read()
txt = raw.decode("utf-8", errors="replace")
print(f"  file bytes={len(raw):,}  U+FFFD replacement chars in file: {txt.count(chr(0xFFFD))}")

for key in ("settings.windowBehavior.edge", "trayMenu.presentation.edge"):
    found = re.findall(r"'%s'\s*:\s*'([^']*)'" % re.escape(key), txt)
    print(f"\n  key = {key}   出现 {len(found)} 次")
    expected_all = {v[0] if key.startswith('settings') else v[1] for v in EXPECT.values()}
    for v in found:
        printable = "".join(ch if ord(ch) > 31 else "?" for ch in v)
        ok = v in expected_all
        cps = " ".join(f"U+{ord(c):04X}" for c in v)
        print(f"    {'OK ' if ok else 'BAD'} value='{printable}'  len={len(v)}")
        if not ok:
            print(f"        codepoints: {cps}")
    missing = expected_all - set(found)
    if missing:
        print("    未出现的期望值:")
        for m in missing:
            print(f"      '{m}'  codepoints: " + " ".join(f"U+{ord(c):04X}" for c in m))

print("\n  期望值 codepoints（供人工比对）:")
for lang, (a, b) in EXPECT.items():
    print(f"    {lang:6s} settings='{a}' = " + " ".join(f"U+{ord(c):04X}" for c in a))

print("\n" + "=" * 4 + " 2. edgeAutoHide.js 全文 " + "=" * 4)
mod = FORK + r"\src\electron\edgeAutoHide.js"
lines = open(mod, encoding="utf-8").read().splitlines()
print(f"  ({len(lines)} lines)")
for i, l in enumerate(lines, 1):
    print(f"  {i:4d}| {l}")

print("\n" + "=" * 4 + " 3. main.js: persistBoundsSoon 的改动 " + "=" * 4)
try:
    d = subprocess.run(["git", "diff", "-U6", "--", "src/electron/main.js"],
                       cwd=FORK, capture_output=True, text=True, encoding="utf-8").stdout
    hunks = d.split("@@")
    for i in range(1, len(hunks), 2):
        header = hunks[i].strip()
        body = hunks[i + 1] if i + 1 < len(hunks) else ""
        if "persistBoundsSoon" in body or "2505" in header or "edgeAutoHideBounds" in body:
            print(f"  @@ {header}")
            for bl in body.splitlines():
                if bl.strip():
                    print("    " + bl)
except Exception as e:
    print("  diff 失败:", e)
