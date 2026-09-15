# -*- coding: utf-8 -*-
"""第二轮探针：把 edgeAutoHideState 的状态与轮询分支去向全部打出来。

要回答的问题：
  Q1 collapseEdge 之后窗口为何会从 151 高变成 416 高？
  Q2 展开态轮询到底走了哪个分支（hidden 分支？dockSide 为空？inDocked？focused？）
  Q3 persistWindowBounds 是否真的抛异常（上一轮加的 tmp 错误日志里有没有东西）
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
ERRLOG = os.path.join(os.environ.get("TEMP", TMP), "token-monitor-edge-error.log")

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
        # 在 stopEdgeAutoHideTimers 前插入 helper（该函数当时紧接着紧跟一个已知锚点）
        ("function stopEdgeAutoHideTimers() {", helper + "function stopEdgeAutoHideTimers() {"),
        # 轮询每次 tick 打状态
        ("    if (!mainWindow.isVisible()) return;",
         "    edbg('TICK hidden=' + edgeAutoHideState.hidden + ' side=' + edgeAutoHideState.side\n"
         "      + ' anim=' + edgeAutoHideState.animating + ' timer=' + !!edgeAutoHideState.collapseTimer\n"
         "      + ' bounds=' + JSON.stringify(mainWindow.getBounds()));\n"
         "    if (!mainWindow.isVisible()) { edbg('TICK return: not visible'); return; }"),
        # 隐藏态分支
        ("      if (edgeAutoHideApi.edgeTriggerHitTest(cursor, expanded, side, display, process.platform)) {",
         "      const __hit = edgeAutoHideApi.edgeTriggerHitTest(cursor, expanded, side, display, process.platform);\n"
         "      edbg('HIDDEN branch cursor=' + JSON.stringify(cursor) + ' expanded=' + JSON.stringify(expanded) + ' hit=' + __hit);\n"
         "      if (__hit) {"),
        # 展开态：dockSide
        ("    if (!dockSide) {",
         "    edbg('EXP dockSide=' + dockSide + ' bounds=' + JSON.stringify(bounds));\n    if (!dockSide) {"),
        # 展开态：inDocked / focused
        ("    if (edgeAutoHideApi.edgeCursorInExpandedBounds(cursor, docked) || mainWindow.isFocused()) {",
         "    const __ind = edgeAutoHideApi.edgeCursorInExpandedBounds(cursor, docked);\n"
         "    const __foc = mainWindow.isFocused();\n"
         "    edbg('EXP cursor=' + JSON.stringify(cursor) + ' docked=' + JSON.stringify(docked)\n"
         "      + ' inDocked=' + __ind + ' focused=' + __foc);\n"
         "    if (__ind || __foc) {"),
        # 计时器设置点
        ("    if (!edgeAutoHideState.collapseTimer) {\n      edgeAutoHideState.collapseTimer = setTimeout(() => {",
         "    if (!edgeAutoHideState.collapseTimer) {\n      edbg('EXP arm collapse timer');\n      edgeAutoHideState.collapseTimer = setTimeout(() => {"),
        # 计时器回调的各个 abort
        ("        if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isFocused()) return;",
         "        if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isFocused()) { edbg('TIMER abort: destroyed/focused'); return; }"),
        ("        if (edgeAutoHideState.hidden || edgeAutoHideState.animating || !canUseEdgeAutoHide(settings)) return;",
         "        if (edgeAutoHideState.hidden || edgeAutoHideState.animating || !canUseEdgeAutoHide(settings)) { edbg('TIMER abort: hidden/animating/canUse'); return; }"),
        ("        const hideSide = edgeAutoHideApi.edgeSide(hideBounds, hideDisplay, process.platform);\n        if (!hideSide) return;",
         "        const hideSide = edgeAutoHideApi.edgeSide(hideBounds, hideDisplay, process.platform);\n"
         "        edbg('TIMER fire hideBounds=' + JSON.stringify(hideBounds) + ' hideSide=' + hideSide);\n"
         "        if (!hideSide) { edbg('TIMER abort: no hideSide'); return; }"),
        # collapseEdge
        ("function collapseEdge(expandedBounds, side) {\n  if (!mainWindow",
         "function collapseEdge(expandedBounds, side) {\n  edbg('COLLAPSE exp=' + JSON.stringify(expandedBounds) + ' side=' + side);\n  if (!mainWindow"),
        ("  edgeAutoHideState.hidden = true;\n  edgeAutoHideState.side = side;",
         "  edbg('COLLAPSE hidden=' + JSON.stringify(hidden));\n  edgeAutoHideState.hidden = true;\n  edgeAutoHideState.side = side;"),
        # expandEdge
        ("function expandEdge() {\n  if (!mainWindow",
         "function expandEdge() {\n  edbg('EXPAND call hidden=' + edgeAutoHideState.hidden + ' exp=' + JSON.stringify(edgeAutoHideState.expandedBounds));\n  if (!mainWindow"),
        # resized 对 expandedBounds 的覆盖（怀疑 416 高度来自这里）
        ("    trackEdgeExpandedBounds();",
         "    trackEdgeExpandedBounds();\n    edbg('RESIZED -> expandedBounds=' + JSON.stringify(edgeAutoHideState.expandedBounds));"),
    ]
    n = 0
    for old, new in reps:
        if old not in src:
            print("  ANCHOR MISS: " + old[:68].replace("\n", "\\n"))
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
    out = os.path.join(TMP, "app.edge.dbg2.asar")
    if os.path.exists(out):
        os.remove(out)
    subprocess.run(["npx", "--yes", "@electron/asar", "pack", EXTRACTED, out],
                   capture_output=True, text=True, shell=True)
    shutil.copy2(out, ASAR)
    print(f"  delivered {os.path.getsize(ASAR):,} B")


def app_hwnd():
    r = subprocess.run(["tasklist", "/FI", "IMAGENAME eq Token Monitor.exe", "/FO", "CSV", "/NH"],
                       capture_output=True, text=True)
    pids = set()
    for line in r.stdout.splitlines():
        p = [x.strip('"') for x in line.split('","')]
        if len(p) > 1 and p[1].isdigit():
            pids.add(int(p[1]))
    best = [None]

    def cb(hwnd, _):
        rect = wt.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(rect))
        pid = wt.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        w, h = rect.right - rect.left, rect.bottom - rect.top
        if pid.value in pids and user32.IsWindowVisible(hwnd) and 40 < w < 1200 and 40 < h < 1400:
            cn = ctypes.create_unicode_buffer(64)
            user32.GetClassNameW(hwnd, cn, 64)
            if cn.value != "#32770" and (best[0] is None or w * h > best[0][1]):
                best[0] = (hwnd, w * h)
        return True

    user32.EnumWindows(WNDENUMPROC(cb), 0)
    return best[0][0] if best[0] else None


def rect_of(hwnd):
    r = wt.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(r))
    return (r.left, r.top, r.right - r.left, r.bottom - r.top)


def main():
    hr("0. was there a persistence error from the previous run?")
    print(f"  {ERRLOG}: " + ("EXISTS" if os.path.exists(ERRLOG) else "absent"))
    if os.path.exists(ERRLOG):
        for l in open(ERRLOG, encoding="utf-8", errors="replace").read().splitlines()[-8:]:
            print("    " + l)

    hr("1. instrument (round 2)")
    instrument()
    r = subprocess.run(["node", "--check", "src/electron/main.js"], cwd=FORK, capture_output=True, text=True)
    print(f"  node --check: exit={r.returncode} {r.stderr.strip()[:200]}")

    hr("2. deliver + launch")
    if os.path.exists(DBG):
        os.remove(DBG)
    deliver()
    s = json.load(open(SETTINGS, encoding="utf-8"))
    s["windowBehavior"] = "edge"
    s["windowBounds"] = {"x": 320, "y": 0, "width": 241, "height": 145}
    s.pop("edgeAutoHideBounds", None)
    json.dump(s, open(SETTINGS, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    subprocess.Popen([EXE])
    time.sleep(15)
    hwnd = app_hwnd()
    print(f"  hwnd={hwnd} rect={rect_of(hwnd)}")
    time.sleep(6)
    print(f"  after 6s: {rect_of(hwnd)}")

    hr("3. hover the strip to reveal")
    r0 = rect_of(hwnd)
    user32.SetCursorPos(r0[0] + r0[2] // 2, 2)
    time.sleep(3)
    print(f"  rect={rect_of(hwnd)}")

    hr("4. move the cursor away and wait")
    user32.SetCursorPos(768, 820)
    time.sleep(5)
    print(f"  rect={rect_of(hwnd)}")
    time.sleep(4)
    print(f"  rect={rect_of(hwnd)}")

    hr("5. debug log")
    if os.path.exists(DBG):
        lines = open(DBG, encoding="utf-8").read().splitlines()
        print(f"  {len(lines)} lines; last 60:")
        for l in lines[-60:]:
            print("    " + l)
    else:
        print("  NO DEBUG LOG")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
