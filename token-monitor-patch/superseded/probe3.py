# -*- coding: utf-8 -*-
"""探针3：为什么第 2 轮之后再也唤不出来？

三个候选（都会让 expandEdge 因 !expanded 静默返回 false）：
  A) moved 处理器「拖离所有边缘」分支把 side/expandedBounds/hiddenBounds 置 null
  B) syncEdgeAutoHideAvailability 误判 canUseEdgeAutoHide 为假
  C) 其它路径
同时记录：轮询隐藏分支的 hit 结果、reconcile 的分支去向、expandEdge 的早退原因。
"""
import ctypes
import ctypes.wintypes as wt
import io
import json
import os
import shutil
import subprocess
import sys
import time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

FORK = r"C:\Users\29871\AppData\Local\Temp\opencode\tm-fork"
EXTRACTED = r"C:\Users\29871\AppData\Local\Temp\opencode\asar-extracted"
APP = r"C:\Users\29871\AppData\Local\Programs\Token Monitor"
ASAR = os.path.join(APP, "resources", "app.asar")
EXE = os.path.join(APP, "Token Monitor.exe")
UD = os.path.join(os.environ["APPDATA"], "Token Monitor")
SETTINGS = os.path.join(UD, "settings.json")
TMP = r"C:\Users\29871\AppData\Local\Temp\opencode"
MAIN_JS = os.path.join(FORK, "src", "electron", "main.js")
DBG = os.path.join(TMP, "edge-debug.log")

FILES = [r"src\electron\floatingBubble.js", r"src\electron\main.js",
         r"src\electron\windowBehavior.js", r"src\electron\edgeAutoHide.js",
         r"src\electron\tray.js", r"src\electron\renderer\app.js",
         r"src\electron\renderer\i18n.js", r"src\electron\renderer\index.html"]

user32 = ctypes.windll.user32
WNDENUMPROC = ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)


def hr(t):
    print("\n" + "=" * 5 + " " + t + " " + "=" * 5)


def instrument():
    src = open(MAIN_JS, encoding="utf-8").read()
    if "function edbg(" in src:
        print("  already instrumented")
        return
    helper = (
        "const EDGE_DEBUG_LOG = 'C:\\\\Users\\\\29871\\\\AppData\\\\Local\\\\Temp\\\\opencode\\\\edge-debug.log';\n"
        "function edbg(msg) {\n"
        "  try { require('fs').appendFileSync(EDGE_DEBUG_LOG, new Date().toISOString().slice(11, 23) + ' ' + msg + '\\n'); } catch (_) {}\n"
        "}\n"
    )
    reps = [
        ("function edgeLog(scope, message) {", helper + "function edgeLog(scope, message) {"),

        # 轮询隐藏态：命中判定与输入
        ("      if (edgeAutoHideApi.edgeTriggerHitTest(cursor, expanded, side, display, process.platform)) {",
         "      const __hit = edgeAutoHideApi.edgeTriggerHitTest(cursor, expanded, side, display, process.platform);\n"
         "      edbg('HIDDEN hit=' + __hit + ' cursor=' + JSON.stringify(cursor) + ' expanded=' + JSON.stringify(expanded) + ' side=' + side);\n"
         "      if (__hit) {"),

        # reconcile 的去向
        ("  const desired = edgeAutoHideState.desired;\n  if (desired === 'hidden') {",
         "  const desired = edgeAutoHideState.desired;\n"
         "  edbg('RECONCILE desired=' + desired + ' hidden=' + edgeAutoHideState.hidden + ' side=' + edgeAutoHideState.side + ' exp=' + JSON.stringify(edgeAutoHideState.expandedBounds));\n"
         "  if (desired === 'hidden') {"),

        # expandEdge 的早退原因
        ("function expandEdge() {\n  if (!mainWindow || mainWindow.isDestroyed() || !edgeAutoHideState.hidden) return false;",
         "function expandEdge() {\n"
         "  edbg('EXPAND enter hidden=' + edgeAutoHideState.hidden + ' exp=' + JSON.stringify(edgeAutoHideState.expandedBounds));\n"
         "  if (!mainWindow || mainWindow.isDestroyed() || !edgeAutoHideState.hidden) { edbg('EXPAND abort: not hidden'); return false; }\n"
         "  if (!edgeAutoHideState.expandedBounds) { edbg('EXPAND abort: expandedBounds is NULL'); return false; }"),

        # 候选 A：moved 处理器把停靠信息置 null
        ("      } else if (edgeAutoHideState.side || settings.edgeAutoHideBounds) {",
         "      } else if (edgeAutoHideState.side || settings.edgeAutoHideBounds) {\n"
         "        edbg('MOVED cleared dock: side=' + edgeAutoHideState.side + ' expWas=' + JSON.stringify(edgeAutoHideState.expandedBounds) + ' bounds=' + JSON.stringify(bounds) + ' edgeSide=null');"),

        # 候选 B：canUse 变假
        ("  if (!canUseEdgeAutoHide(settings)) {\n    if (edgeAutoHideState.hidden) expandEdge();",
         "  if (!canUseEdgeAutoHide(settings)) {\n"
         "    edbg('SYNC canUse=false hidden=' + edgeAutoHideState.hidden + ' -> ' + (edgeAutoHideState.hidden ? 'expandEdge' : 'null out dock'));\n"
         "    if (edgeAutoHideState.hidden) expandEdge();"),

        # 候选 A 的另一半：真实拖拽离开边缘时也应记录
        ("    if (!canUseEdgeAutoHide(settings) || edgeAutoHideState.hidden) return;\n    const bounds = mainWindow.getBounds();",
         "    if (!canUseEdgeAutoHide(settings) || edgeAutoHideState.hidden) return;\n"
         "    const bounds = mainWindow.getBounds();\n"
         "    edbg('MOVED handler ran bounds=' + JSON.stringify(bounds) + ' animating=' + edgeIsAnimating());"),
    ]
    n = 0
    for old, new in reps:
        if old not in src:
            print("  ANCHOR MISS: " + old[:64].replace("\n", "\\n"))
            continue
        src = src.replace(old, new, 1)
        n += 1
    open(MAIN_JS, "w", encoding="utf-8").write(src)
    print(f"  instrumented {n}/{len(reps)}")


def deliver():
    subprocess.run(["taskkill", "/F", "/IM", "Token Monitor.exe"], capture_output=True)
    time.sleep(4)
    for rel in FILES:
        shutil.copy2(os.path.join(FORK, rel), os.path.join(EXTRACTED, rel))
    out = os.path.join(TMP, "app.edge.probe3.asar")
    if os.path.exists(out):
        os.remove(out)
    subprocess.run(["npx", "--yes", "@electron/asar", "pack", EXTRACTED, out],
                   capture_output=True, text=True, shell=True)
    shutil.copy2(out, ASAR)
    print(f"  delivered {os.path.getsize(ASAR):,} B")


def main_window(wb):
    pids = set()
    r = subprocess.run(["tasklist", "/FI", "IMAGENAME eq Token Monitor.exe", "/FO", "CSV", "/NH"],
                       capture_output=True, text=True)
    for line in r.stdout.splitlines():
        p = [x.strip('"') for x in line.split('","')]
        if len(p) > 1 and p[1].isdigit():
            pids.add(int(p[1]))
    cands = []

    def cb(hwnd, _):
        rect = wt.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(rect))
        pid = wt.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        w, h = rect.right - rect.left, rect.bottom - rect.top
        if pid.value in pids and user32.IsWindowVisible(hwnd) and w > 40 and h > 40:
            cn = ctypes.create_unicode_buffer(128)
            user32.GetClassNameW(hwnd, cn, 128)
            if cn.value != "#32770":
                cands.append({"hwnd": hwnd, "w": w, "h": h, "x": rect.left, "y": rect.top})
        return True

    user32.EnumWindows(WNDENUMPROC(cb), 0)
    if not cands:
        return None
    return min(cands, key=lambda c: abs(c["w"] - wb["width"]) + abs(c["h"] - wb["height"]))


def rect_of(hwnd):
    r = wt.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(r))
    return (r.left, r.top, r.right - r.left, r.bottom - r.top)


def main():
    hr("1. instrument + deliver")
    instrument()
    r = subprocess.run(["node", "--check", "src/electron/main.js"], cwd=FORK, capture_output=True, text=True)
    print(f"  node --check exit={r.returncode} {r.stderr.strip()[:200]}")
    if r.returncode:
        return 2
    if os.path.exists(DBG):
        os.remove(DBG)
    deliver()

    hr("2. launch with the same precondition")
    s = json.load(open(SETTINGS, encoding="utf-8"))
    s["windowBehavior"] = "edge"
    s["windowBounds"] = {"x": 648, "y": 0, "width": 443, "height": 377}
    s.pop("edgeAutoHideBounds", None)
    json.dump(s, open(SETTINGS, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    user32.SetCursorPos(760, 700)
    subprocess.Popen([EXE])
    time.sleep(16)
    win = main_window(s["windowBounds"])
    if not win:
        print("  FATAL no window")
        return 3
    hwnd = win["hwnd"]
    time.sleep(4)
    base = rect_of(hwnd)
    print(f"  hwnd={hwnd} base rect={base}  hidden={base[1] < -50}")

    pt = wt.POINT()
    user32.GetCursorPos(ctypes.byref(pt))
    keep = (pt.x, pt.y)
    span_l, span_r = base[0], base[0] + base[2]
    try:
        hr("3. three cycles")
        for i in (1, 2, 3):
            user32.SetCursorPos((span_l + span_r) // 2, 2)
            time.sleep(3)
            rv = rect_of(hwnd)
            user32.SetCursorPos(300, 700 + i)
            time.sleep(4)
            rh = rect_of(hwnd)
            print(f"  cycle {i}: after hover y={rv[1]} (revealed={rv[1] > base[1] + 20})   after leave y={rh[1]}")
    finally:
        user32.SetCursorPos(*keep)

    hr("4. debug log")
    if os.path.exists(DBG):
        lines = open(DBG, encoding="utf-8").read().splitlines()
        print(f"  {len(lines)} lines")
        # 先给摘要：各类事件出现次数
        for tag in ("MOVED cleared dock", "SYNC canUse=false", "EXPAND abort", "HIDDEN hit=true", "EXPAND enter"):
            print(f"    '{tag}' 出现 {sum(1 for l in lines if tag in l)} 次")
        print("  --- last 40 ---")
        for l in lines[-40:]:
            print("    " + l)
    else:
        print("  NO LOG")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
