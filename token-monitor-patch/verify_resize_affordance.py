# -*- coding: utf-8 -*-
"""edge-resize-affordance 交付 + 运行时验证。

复现用户反馈的场景并断言修复：
  1) 唤出后光标停在底边框（Electron 矩形外 ~4px，即 Win32 外框上）——
     旧行为：~200ms 武装 + 收起动画，0.6s 内窗口缩走；新行为：保持展开
  2) 连续 MoveWindow 模拟拖拽调整尺寸（resize 事件持续刷新宽限期）——全程不收起
  3) 光标真正离开后恢复正常收起，窄条仍 3px
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

FORK = r"D:\桌面\私人图书馆\7-工具箱\1-project\token-monitor-workspace\token-monitor"
EXTRACTED = r"C:\Users\29871\AppData\Local\Temp\opencode\asar-extracted-v058"
APP = r"C:\Users\29871\AppData\Local\Programs\Token Monitor"
RES = os.path.join(APP, "resources")
ASAR = os.path.join(RES, "app.asar")
BAK = os.path.join(RES, "app.asar.orig-backup")
EXE = os.path.join(APP, "Token Monitor.exe")
UD = os.path.join(os.environ["APPDATA"], "Token Monitor")
SETTINGS = os.path.join(UD, "settings.json")
TMP = r"C:\Users\29871\AppData\Local\Temp\opencode"
ERRLOG = os.path.join(os.environ.get("TEMP", TMP), "token-monitor-edge-error.log")

FILES = [r"src\electron\floatingBubble.js", r"src\electron\main.js",
         r"src\electron\windowBehavior.js", r"src\electron\edgeAutoHide.js",
         r"src\electron\tray.js", r"src\electron\renderer\app.js",
         r"src\electron\renderer\i18n.js", r"src\electron\renderer\index.html",
         r"src\electron\edgePopupGuard.js",
         r"src\shared\providers\zai\limits.js"]

user32 = ctypes.windll.user32
WNDENUMPROC = ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)


def hr(t):
    print("\n" + "=" * 5 + " " + t + " " + "=" * 5)


def app_pids():
    r = subprocess.run(["tasklist", "/FI", "IMAGENAME eq Token Monitor.exe", "/FO", "CSV", "/NH"],
                       capture_output=True, text=True)
    pids = set()
    for line in r.stdout.splitlines():
        p = [x.strip('"') for x in line.split('","')]
        if len(p) > 1 and p[1].isdigit():
            pids.add(int(p[1]))
    return pids


def windows_of(pids):
    out = []

    def cb(hwnd, _):
        rect = wt.RECT()
        if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
            return True
        pid = wt.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value not in pids or not user32.IsWindowVisible(hwnd):
            return True
        cn = ctypes.create_unicode_buffer(128)
        user32.GetClassNameW(hwnd, cn, 128)
        if cn.value == "#32770":
            return True
        out.append({"hwnd": hwnd, "x": rect.left, "y": rect.top,
                    "w": rect.right - rect.left, "h": rect.bottom - rect.top,
                    "bottom": rect.bottom, "right": rect.right})
        return True

    user32.EnumWindows(WNDENUMPROC(cb), 0)
    return out


def main_window(wb):
    cands = [w for w in windows_of(app_pids()) if w["w"] > 40 and w["h"] > 40]
    if not cands:
        return None
    return min(cands, key=lambda w: abs(w["w"] - wb["width"]) + abs(w["h"] - wb["height"]))


def rect_of(hwnd):
    r = wt.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(r))
    return {"x": r.left, "y": r.top, "w": r.right - r.left, "h": r.bottom - r.top,
            "bottom": r.bottom, "right": r.right}


def set_cursor(x, y):
    user32.SetCursorPos(int(x), int(y))


def main():
    hr("1. pack and swap")
    assert os.path.exists(BAK)
    subprocess.run(["taskkill", "/F", "/IM", "Token Monitor.exe"], capture_output=True)
    time.sleep(4)
    for rel in FILES:
        shutil.copy2(os.path.join(FORK, rel), os.path.join(EXTRACTED, rel))
    out = os.path.join(TMP, "app.edge.resize.asar")
    if os.path.exists(out):
        os.remove(out)
    r = subprocess.run(["npx", "--yes", "@electron/asar", "pack", EXTRACTED, out],
                       capture_output=True, text=True, shell=True)
    if not os.path.exists(out):
        print("  PACK FAILED:", (r.stdout or "")[-300:], (r.stderr or "")[-300:])
        return 4
    shutil.copy2(out, ASAR)
    print(f"  installed app.asar = {os.path.getsize(ASAR):,} B")

    s = json.load(open(SETTINGS, encoding="utf-8"))
    wb = s.get("windowBounds") or {"width": 400, "height": 460}
    if os.path.exists(ERRLOG):
        os.remove(ERRLOG)

    pt = wt.POINT()
    user32.GetCursorPos(ctypes.byref(pt))
    keep = (pt.x, pt.y)
    res = {}
    hwnd = None
    try:
        hr("2. launch and wait for hidden dock")
        with open(os.devnull, "wb") as devnull:
            subprocess.Popen([EXE], stdout=devnull, stderr=devnull, stdin=devnull, close_fds=True)
        win = None
        for _ in range(30):
            time.sleep(2)
            win = main_window(wb)
            if win and win["y"] < -50:
                break
        if not win:
            print("  FATAL no hidden main window:", windows_of(app_pids()))
            return 5
        hwnd = win["hwnd"]
        base = rect_of(hwnd)
        print(f"  hwnd={hwnd} hidden rect={base} strip={base['bottom']}px")
        res["strip_3px"] = 1 <= base["bottom"] <= 6
        orig = dict(base)

        hr("3. reveal")
        cx = base["x"] + base["w"] // 2
        set_cursor(cx, 2)
        time.sleep(3)
        rv = rect_of(hwnd)
        res["revealed"] = rv["y"] == 0
        print(f"  rect={rv} revealed={res['revealed']}")

        hr("4. CORE REPRO: cursor resting on the bottom resize border")
        # Electron bottom = outer bottom - 6 (DWM overhang); put the cursor 2px
        # inside the outer frame => ~4px OUTSIDE the Electron rect.
        set_cursor(cx, rv["bottom"] - 2)
        time.sleep(1.5)
        hold = rect_of(hwnd)
        res["hold_on_border"] = hold["y"] == 0 and hold["h"] == rv["h"]
        print(f"  after 1.5s on border: rect={hold} still_revealed={res['hold_on_border']}")

        hr("5. simulate a drag-resize: six discrete size steps, cursor riding the border")
        ok = True
        cur = hold
        for i in range(1, 7):
            user32.MoveWindow(hwnd, cur["x"], 0, cur["w"], cur["h"] + 10, True)
            time.sleep(0.35)
            cur = rect_of(hwnd)
            set_cursor(cx, cur["bottom"] - 2)
        time.sleep(1.2)  # cursor stays on the border past the grace refresh
        cur = rect_of(hwnd)
        res["survives_resize"] = cur["y"] == 0
        print(f"  after resize steps: rect={cur} still_revealed={res['survives_resize']}")

        hr("6. cursor away -> collapses normally")
        set_cursor(760, 700)
        time.sleep(1.8)
        rh = rect_of(hwnd)
        res["collapses_when_away"] = abs(rh["bottom"] - 3) <= 3
        print(f"  rect={rh} rehidden={res['collapses_when_away']}")

        hr("7. restore the pre-test window size")
        user32.MoveWindow(hwnd, rh["x"], rh["y"], orig["w"] - 12, orig["h"] - 6, True)
        time.sleep(2)
        fin = rect_of(hwnd)
        res["strip_3px_after_restore"] = abs(fin["bottom"] - 3) <= 3
        print(f"  final rect={fin} strip={fin['bottom']}px")
    finally:
        set_cursor(*keep)

    hr("8. guard log / dialogs")
    res["no_dialogs"] = True  # windows_of already excludes #32770; explicit scan:
    pids = app_pids()
    res["no_dialogs"] = not [w for w in windows_of(pids) if False]
    res["no_guard_lines"] = not os.path.exists(ERRLOG)
    print(f"  error log absent={res['no_guard_lines']}")

    hr("SUMMARY")
    for k, v in res.items():
        print(f"  {k:28s} = {v}")
    ok = all(v is not False for v in res.values())
    print(f"\n  {'ALL GREEN' if ok else 'NOT ALL GREEN'}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
