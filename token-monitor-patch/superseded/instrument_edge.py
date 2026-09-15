# -*- coding: utf-8 -*-
"""给 fork 的 edge 代码加临时探针 -> 重新交付 -> 复现"不重隐藏" -> 读探针日志 -> 还原探针。

只动 fork 的 main.js（先备份），探针写到一个独立的日志文件，不混入应用自身日志。
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
MAIN_BAK = os.path.join(TMP, "main.js.prefork.bak")
DBG = os.path.join(TMP, "edge-debug.log")

FILES = [r"src\electron\floatingBubble.js", r"src\electron\main.js",
         r"src\electron\windowBehavior.js", r"src\electron\edgeAutoHide.js",
         r"src\electron\tray.js", r"src\electron\renderer\app.js",
         r"src\electron\renderer\i18n.js", r"src\electron\renderer\index.html"]

user32 = ctypes.windll.user32
SCREEN_W = 1536
WNDENUMPROC = ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)


def hr(t):
    print("\n" + "=" * 5 + " " + t + " " + "=" * 5)


def instrument():
    src = open(MAIN_JS, encoding="utf-8").read()
    if "function edbg(" in src:
        print("  already instrumented")
        return
    if not os.path.exists(MAIN_BAK):
        shutil.copy2(MAIN_JS, MAIN_BAK)
    helper = (
        "const EDGE_DEBUG_LOG = 'C:\\\\Users\\\\29871\\\\AppData\\\\Local\\\\Temp\\\\opencode\\\\edge-debug.log';\n"
        "let __edbgLast = 0;\n"
        "function edbg(msg) {\n"
        "  const now = Date.now();\n"
        "  if (now - __edbgLast < 250) return;\n"
        "  __edbgLast = now;\n"
        "  try { require('fs').appendFileSync(EDGE_DEBUG_LOG, new Date().toISOString().slice(11, 23) + ' ' + msg + '\\n'); } catch (_) {}\n"
        "}\n"
        "function edbgForce(msg) {\n"
        "  try { require('fs').appendFileSync(EDGE_DEBUG_LOG, new Date().toISOString().slice(11, 23) + ' ' + msg + '\\n'); } catch (_) {}\n"
        "}\n"
    )
    reps = [
        ("function stopEdgeAutoHideTimers() {", helper + "function stopEdgeAutoHideTimers() {"),
        ("  edgeAutoHideState.pollTimer = setInterval(() => {",
         "  edbgForce('POLL ARM hidden=' + edgeAutoHideState.hidden + ' side=' + edgeAutoHideState.side + ' exp=' + JSON.stringify(edgeAutoHideState.expandedBounds));\n"
         "  edgeAutoHideState.pollTimer = setInterval(() => {"),
        ("    const dockSide = side || edgeAutoHideApi.edgeSide(bounds, display, process.platform);",
         "    const dockSide = side || edgeAutoHideApi.edgeSide(bounds, display, process.platform);\n"
         "    edbg('POLL exp bounds=' + JSON.stringify(bounds) + ' side=' + side + ' dockSide=' + dockSide);"),
        ("    if (!dockSide) {\n      if (edgeAutoHideState.collapseTimer) {",
         "    if (!dockSide) {\n      edbgForce('BAD no dockSide -> clear timer & return  bounds=' + JSON.stringify(bounds));\n      if (edgeAutoHideState.collapseTimer) {"),
        ("    if (edgeAutoHideApi.edgeCursorInExpandedBounds(cursor, docked) || mainWindow.isFocused()) {",
         "    edbg('POLL exp cursor=' + JSON.stringify(cursor) + ' docked=' + JSON.stringify(docked)\n"
         "      + ' inDocked=' + edgeAutoHideApi.edgeCursorInExpandedBounds(cursor, docked)\n"
         "      + ' focused=' + mainWindow.isFocused());\n"
         "    if (edgeAutoHideApi.edgeCursorInExpandedBounds(cursor, docked) || mainWindow.isFocused()) {"),
        ("        if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isFocused()) return;\n"
         "        if (edgeAutoHideState.hidden || edgeAutoHideState.animating || !canUseEdgeAutoHide(settings)) return;",
         "        if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isFocused()) { edbgForce('TIMER abort: focus/destroyed'); return; }\n"
         "        if (edgeAutoHideState.hidden || edgeAutoHideState.animating || !canUseEdgeAutoHide(settings)) { edbgForce('TIMER abort: hidden=' + edgeAutoHideState.hidden + ' animating=' + edgeAutoHideState.animating); return; }"),
        ("        const hideSide = edgeAutoHideApi.edgeSide(hideBounds, hideDisplay, process.platform);\n        if (!hideSide) return;",
         "        const hideSide = edgeAutoHideApi.edgeSide(hideBounds, hideDisplay, process.platform);\n"
         "        edbgForce('TIMER fire hideBounds=' + JSON.stringify(hideBounds) + ' hideSide=' + hideSide);\n"
         "        if (!hideSide) { edbgForce('TIMER abort: no hideSide'); return; }"),
        ("function collapseEdge(expandedBounds, side) {\n  if (!mainWindow || mainWindow.isDestroyed() || !expandedBounds || !side) return false;",
         "function collapseEdge(expandedBounds, side) {\n"
         "  edbgForce('COLLAPSE call exp=' + JSON.stringify(expandedBounds) + ' side=' + side);\n"
         "  if (!mainWindow || mainWindow.isDestroyed() || !expandedBounds || !side) { edbgForce('COLLAPSE abort: bad args'); return false; }"),
        ("  const hidden = edgeAutoHideApi.edgeHiddenBounds(expandedBounds, side, display, process.platform);\n  if (!hidden) return false;",
         "  const hidden = edgeAutoHideApi.edgeHiddenBounds(expandedBounds, side, display, process.platform);\n"
         "  edbgForce('COLLAPSE hidden=' + JSON.stringify(hidden));\n"
         "  if (!hidden) { edbgForce('COLLAPSE abort: no hidden bounds'); return false; }"),
    ]
    n = 0
    for old, new in reps:
        if old not in src:
            print("  ANCHOR MISS: " + old[:70].replace("\n", "\\n"))
            continue
        src = src.replace(old, new, 1)
        n += 1
    open(MAIN_JS, "w", encoding="utf-8").write(src)
    print(f"  instrumented {n}/{len(reps)} anchors; edbg helper added")


def restore_main():
    if os.path.exists(MAIN_BAK):
        shutil.copy2(MAIN_BAK, MAIN_JS)
        print("  restored un-instrumented main.js")


def deliver():
    subprocess.run(["taskkill", "/F", "/IM", "Token Monitor.exe"], capture_output=True)
    time.sleep(4)
    for rel in FILES:
        shutil.copy2(os.path.join(FORK, rel), os.path.join(EXTRACTED, rel))
    out = os.path.join(TMP, "app.edge.dbg.asar")
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
    hr("1. instrument")
    instrument()
    r = subprocess.run(["node", "--check", "src/electron/main.js"], cwd=FORK, capture_output=True, text=True)
    print(f"  node --check: exit={r.returncode} {r.stderr.strip()[:200]}")

    hr("2. deliver instrumented build")
    if os.path.exists(DBG):
        os.remove(DBG)
    deliver()

    hr("3. settings -> edge mode, flush to top")
    s = json.load(open(SETTINGS, encoding="utf-8"))
    s["windowBehavior"] = "edge"
    s["windowBounds"] = {"x": 320, "y": 0, "width": 241, "height": 145}
    s.pop("edgeAutoHideBounds", None)
    json.dump(s, open(SETTINGS, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    hr("4. launch, let it hide")
    subprocess.Popen([EXE])
    time.sleep(16)
    hwnd = app_hwnd()
    print(f"  hwnd={hwnd}  rect={rect_of(hwnd)}")
    time.sleep(6)
    print(f"  after 6s more: rect={rect_of(hwnd)}")

    hr("5. reveal by hovering the trigger zone")
    t = rect_of(hwnd)
    user32.SetCursorPos(t[0] + t[2] // 2, 2)
    time.sleep(3)
    print(f"  after hover: rect={rect_of(hwnd)}")

    hr("6. cursor away, wait 5s while logging open")
    user32.SetCursorPos(768, 800)
    with open(DBG, "a", encoding="utf-8") as fh:
        fh.write(f"--- cursor moved away at {time.strftime('%H:%M:%S')} ---\n")
    time.sleep(5)
    print(f"  after moving away: rect={rect_of(hwnd)}")

    user32.SetCursorPos(1150, 300)
    time.sleep(4)
    print(f"  after another move: rect={rect_of(hwnd)}")

    hr("7. debug log (last 45 lines)")
    if os.path.exists(DBG):
        lines = open(DBG, encoding="utf-8").read().splitlines()
        print(f"  total {len(lines)} lines")
        for l in lines[-45:]:
            print("    " + l)
    else:
        print("  NO DEBUG LOG - the instrumentation never ran")

    hr("8. restore un-instrumented source (delivered build keeps the probes)")
    restore_main()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
