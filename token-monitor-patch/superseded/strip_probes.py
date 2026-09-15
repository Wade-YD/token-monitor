# -*- coding: utf-8 -*-
"""剥掉探针3插入的调试代码（保留全部修复），然后自检。

做法：按插入时的精确字符串做反向替换，而不是 git checkout（修复还没提交，checkout 会丢掉修复）。
"""
import io
import os
import re
import subprocess
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

FORK = r"C:\Users\29871\AppData\Local\Temp\opencode\tm-fork"
MAIN_JS = os.path.join(FORK, "src", "electron", "main.js")

REVERSALS = [
    # 1. edbg helper 块
    ("const EDGE_DEBUG_LOG = 'C:\\\\Users\\\\29871\\\\AppData\\\\Local\\\\Temp\\\\opencode\\\\edge-debug.log';\n"
     "function edbg(msg) {\n"
     "  try { require('fs').appendFileSync(EDGE_DEBUG_LOG, new Date().toISOString().slice(11, 23) + ' ' + msg + '\\n'); } catch (_) {}\n"
     "}\n", ""),
    # 2. 轮询隐藏态的 hit 记录
    ("      const __hit = edgeAutoHideApi.edgeTriggerHitTest(cursor, expanded, side, display, process.platform);\n"
     "      edbg('HIDDEN hit=' + __hit + ' cursor=' + JSON.stringify(cursor) + ' expanded=' + JSON.stringify(expanded) + ' side=' + side);\n"
     "      if (__hit) {",
     "      if (edgeAutoHideApi.edgeTriggerHitTest(cursor, expanded, side, display, process.platform)) {"),
    # 3. reconcile 去向
    ("  const desired = edgeAutoHideState.desired;\n"
     "  edbg('RECONCILE desired=' + desired + ' hidden=' + edgeAutoHideState.hidden + ' side=' + edgeAutoHideState.side + ' exp=' + JSON.stringify(edgeAutoHideState.expandedBounds));\n"
     "  if (desired === 'hidden') {",
     "  const desired = edgeAutoHideState.desired;\n  if (desired === 'hidden') {"),
    # 4. expandEdge 早退原因
    ("function expandEdge() {\n"
     "  edbg('EXPAND enter hidden=' + edgeAutoHideState.hidden + ' exp=' + JSON.stringify(edgeAutoHideState.expandedBounds));\n"
     "  if (!mainWindow || mainWindow.isDestroyed() || !edgeAutoHideState.hidden) { edbg('EXPAND abort: not hidden'); return false; }\n"
     "  if (!edgeAutoHideState.expandedBounds) { edbg('EXPAND abort: expandedBounds is NULL'); return false; }",
     "function expandEdge() {\n  if (!mainWindow || mainWindow.isDestroyed() || !edgeAutoHideState.hidden) return false;"),
    # 6. syncEdgeAutoHideAvailability
    ("  if (!canUseEdgeAutoHide(settings)) {\n"
     "    edbg('SYNC canUse=false hidden=' + edgeAutoHideState.hidden + ' -> ' + (edgeAutoHideState.hidden ? 'expandEdge' : 'null out dock'));\n"
     "    if (edgeAutoHideState.hidden) expandEdge();",
     "  if (!canUseEdgeAutoHide(settings)) {\n    if (edgeAutoHideState.hidden) expandEdge();"),
    # 7. moved 处理器运行记录
    ("    const bounds = mainWindow.getBounds();\n"
     "    edbg('MOVED handler ran bounds=' + JSON.stringify(bounds) + ' animating=' + edgeIsAnimating());",
     "    const bounds = mainWindow.getBounds();"),
]


def main():
    src = open(MAIN_JS, encoding="utf-8").read()
    before_edbg = len(re.findall(r"\bedbg\(", src))
    print(f"  edbg calls before: {before_edbg}")
    n = 0
    for old, new in REVERSALS:
        if old in src:
            src = src.replace(old, new, 1)
            n += 1
        else:
            print("    (not present, skipped)")
    open(MAIN_JS, "w", encoding="utf-8").write(src)
    after = open(MAIN_JS, encoding="utf-8").read()
    print(f"  reversals applied: {n}/{len(REVERSALS)}")
    print(f"  edbg calls after: {len(re.findall(r'\\bedbg\\(', after))}")
    print(f"  EDGE_DEBUG_LOG refs after: {after.count('EDGE_DEBUG_LOG')}")
    print(f"  __hit refs after: {after.count('__hit')}")

    r = subprocess.run(["node", "--check", "src/electron/main.js"], cwd=FORK, capture_output=True, text=True)
    print(f"  node --check exit={r.returncode} {r.stderr.strip()[:200]}")

    print("\n  --- 修复仍在的确认 ---")
    for probe in ["function setEdgeWindowPosition", "function reconcileEdgeAutoHide",
                  "function edgeIsAnimating", "process.on('uncaughtException'",
                  "edgeAutoHideState.desired = 'hidden'", "function clearEdgeCollapseTimer"]:
        print(f"    {probe:42s} {after.count(probe)}")

    print("\n  --- 测试 ---")
    for t in ("tests/electron/edgeAutoHide.test.js", "tests/electron/windowBehavior.test.js", "tests/electron/tray.test.js"):
        o = subprocess.run(["node", "--test", "--test-reporter=tap", t],
                           cwd=FORK, capture_output=True, text=True).stdout
        p = re.search(r"# pass (\d+)", o)
        f = re.search(r"# fail (\d+)", o)
        print(f"    {t:42s} pass={p.group(1) if p else '?'} fail={f.group(1) if f else '?'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
