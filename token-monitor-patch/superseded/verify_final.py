# -*- coding: utf-8 -*-
"""harden-edge-auto-hide 最终交付 + 抗干扰验证。

上一版夹具的教训：它把「量到未展开」直接判为功能失败，但 debug 日志证明应用层面
那一轮其实已经正确展开 —— 是**光标在测量窗口内被外部移动**（用户动鼠标），轮询于是
正确地判定"该收起"。本版因此：
  * hold 阶段边复位光标边采样，一旦发现光标漂移 > 40px 就把该轮标为 PERTURBED 并重试
  * 每轮最多重试 3 次；只有既未漂移、又确实没展开，才判为真实失败
  * 全程持续检查标题为 Error 的 #32770 对话框
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
         r"src\electron\renderer\i18n.js", r"src\electron\renderer\index.html"]

user32 = ctypes.windll.user32
SCREEN_W = 1536
WNDENUMPROC = ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)
DRIFT_PX = 40


def hr(t):
    print("\n" + "=" * 5 + " " + t + " " + "=" * 5)


def pids():
    r = subprocess.run(["tasklist", "/FI", "IMAGENAME eq Token Monitor.exe", "/FO", "CSV", "/NH"],
                       capture_output=True, text=True)
    s = set()
    for line in r.stdout.splitlines():
        p = [x.strip('"') for x in line.split('","')]
        if len(p) > 1 and p[1].isdigit():
            s.add(int(p[1]))
    return s


def wins(visible_only=True):
    out = []

    def cb(hwnd, _):
        rect = wt.RECT()
        if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
            return True
        pid = wt.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value not in pids():
            return True
        vis = bool(user32.IsWindowVisible(hwnd))
        if visible_only and not vis:
            return True
        cn = ctypes.create_unicode_buffer(128)
        user32.GetClassNameW(hwnd, cn, 128)
        n = int(user32.GetWindowTextLengthW(hwnd))
        tn = ctypes.create_unicode_buffer(n + 2)
        user32.GetWindowTextW(hwnd, tn, n + 2)
        out.append({"hwnd": hwnd, "x": rect.left, "y": rect.top,
                    "w": rect.right - rect.left, "h": rect.bottom - rect.top,
                    "cls": cn.value, "title": tn.value})
        return True

    user32.EnumWindows(WNDENUMPROC(cb), 0)
    return out


def error_dialogs():
    return [w for w in wins() if w["cls"] == "#32770" and w["title"].strip().lower() == "error"]


def find_main(wb):
    cands = [w for w in wins() if w["w"] > 40 and w["h"] > 40 and w["cls"] != "#32770"]
    if not cands:
        return None
    return min(cands, key=lambda w: abs(w["w"] - wb["width"]) + abs(w["h"] - wb["height"]))


def rect_of(hwnd):
    r = wt.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(r))
    return r.left, r.top, r.right - r.left, r.bottom - r.top


def set_cursor(x, y):
    user32.SetCursorPos(int(x), int(y))


def get_cursor():
    p = wt.POINT()
    user32.GetCursorPos(ctypes.byref(p))
    return p.x, p.y


def hold_and_watch(hwnd, x, y, seconds, hidden_y):
    """按住光标 (x,y) 并采样窗口矩形。返回 (revealed, drifted)。"""
    revealed = False
    drifted = False
    end = time.time() + seconds
    while time.time() < end:
        set_cursor(x, y)
        time.sleep(0.12)
        cx, cy = get_cursor()
        if abs(cx - x) > DRIFT_PX or abs(cy - y) > DRIFT_PX:
            drifted = True
        _, ry, _, _ = rect_of(hwnd)
        if ry > hidden_y + 20:
            revealed = True
        time.sleep(0.12)
    return revealed, drifted


def wait_hidden(hwnd, hidden_y, seconds):
    end = time.time() + seconds
    while time.time() < end:
        _, ry, _, _ = rect_of(hwnd)
        if abs(ry - hidden_y) <= 3:
            return True
        time.sleep(0.2)
    return False


def main():
    hr("1. preconditions")
    if not os.path.exists(BAK):
        print("  FATAL: rollback backup missing")
        return 2
    print(f"  backup present: {os.path.getsize(BAK):,} B")

    hr("2. pack + swap (clean, probe-free fork)")
    subprocess.run(["taskkill", "/F", "/IM", "Token Monitor.exe"], capture_output=True)
    time.sleep(4)
    for rel in FILES:
        shutil.copy2(os.path.join(FORK, rel), os.path.join(EXTRACTED, rel))
    out = os.path.join(TMP, "app.edge.final2.asar")
    if os.path.exists(out):
        os.remove(out)
    subprocess.run(["npx", "--yes", "@electron/asar", "pack", EXTRACTED, out],
                   capture_output=True, text=True, shell=True)
    if not os.path.exists(out):
        print("  PACK FAILED")
        return 3
    shutil.copy2(out, ASAR)
    print(f"  installed {os.path.getsize(ASAR):,} B")

    hr("3. precondition: edge mode, windowBounds flush to the TOP edge")
    s = json.load(open(SETTINGS, encoding="utf-8"))
    orig_bounds = s.get("windowBounds")
    w0 = (orig_bounds or {}).get("width", 443)
    h0 = (orig_bounds or {}).get("height", 377)
    s["windowBehavior"] = "edge"
    s["windowBounds"] = {"x": 640, "y": 0, "width": w0, "height": h0}
    s.pop("edgeAutoHideBounds", None)
    json.dump(s, open(SETTINGS, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"  windowBounds = {s['windowBounds']}")

    if os.path.exists(ERRLOG):
        os.remove(ERRLOG)
    set_cursor(200, 700)
    subprocess.Popen([EXE])
    time.sleep(17)

    win = find_main(s["windowBounds"])
    if not win:
        print("  FATAL no main window; dialogs:", error_dialogs())
        return 4
    hwnd = win["hwnd"]
    print(f"  main window hwnd={hwnd} {win['w']}x{win['h']} title={win['title']!r}")

    hr("4. startup: expect dock + auto-hide")
    ok_hidden = wait_hidden(hwnd, None, 0) if False else False
    time.sleep(6)
    bx, by, bw, bh = rect_of(hwnd)
    hidden_y = by
    print(f"  rect = {(bx, by, bw, bh)}  hidden={by < -50}")
    dialogs = len(error_dialogs())
    res = {"hides_on_launch": by < -50, "no_error_dialog_startup": dialogs == 0}
    span_l, span_r = bx, bx + bw

    hr("5. five cycles (each cycle tolerates external cursor interference)")
    cycle_ok = 0
    perturbed = 0
    for i in range(1, 6):
        got_reveal = False
        for attempt in (1, 2, 3):
            rv, drifted = hold_and_watch(hwnd, (span_l + span_r) // 2, 2, 2.6, hidden_y)
            if rv:
                got_reveal = True
                break
            if drifted:
                perturbed += 1
                print(f"  cycle {i}: attempt {attempt} PERTURBED (cursor moved away), retrying")
                time.sleep(0.5)
                continue
            break
        after_reveal_y = rect_of(hwnd)[1]
        set_cursor(200, 700 + i)
        got_hide = wait_hidden(hwnd, hidden_y, 6)
        d = len(error_dialogs())
        if got_reveal and got_hide:
            cycle_ok += 1
        print(f"  cycle {i}: reveal={got_reveal} (y={after_reveal_y})  re-hide={got_hide}  no-error-dialog={d == 0}")
        if d:
            res["no_error_dialog_throughout"] = False
    res["all_five_cycles"] = cycle_ok == 5
    res.setdefault("no_error_dialog_throughout", True)

    hr("6. trigger zone constrained along the edge")
    set_cursor(40 if span_l > 300 else SCREEN_W - 40, 2)
    time.sleep(2.5)
    _, fy, _, _ = rect_of(hwnd)
    res["no_false_trigger"] = abs(fy - hidden_y) <= 3
    print(f"  rect y={fy}  still hidden={res['no_false_trigger']}")

    hr("7. persistence isolation")
    s2 = json.load(open(SETTINGS, encoding="utf-8"))
    wbn = s2.get("windowBounds") or {}
    eab = s2.get("edgeAutoHideBounds")
    res["windowBounds_not_polluted"] = wbn.get("y", 0) > -20
    res["edgeAutoHideBounds_complete"] = bool(
        eab and eab.get("side") and isinstance(eab.get("expandedBounds"), dict)
        and isinstance(eab.get("hiddenBounds"), dict)
        and all(k in eab["expandedBounds"] for k in ("x", "y", "width", "height")))
    print(f"  windowBounds = {wbn}")

    hr("8. crash / guard log")
    if os.path.exists(ERRLOG):
        print("  !! error log present:")
        for l in open(ERRLOG, encoding="utf-8", errors="replace").read().splitlines()[:8]:
            print("     " + l)
        res["no_crash_no_guard_rejection"] = False
    else:
        print("  absent -> no uncaught exception, no guard rejection")
        res["no_crash_no_guard_rejection"] = True

    hr("SUMMARY")
    for k, v in res.items():
        print(f"  {k:32s} = {v}")
    print(f"\n  cycles ok = {cycle_ok}/5, perturbed attempts = {perturbed}")
    ok = all(res.values())
    print(f"  {'ALL GREEN' if ok else 'NOT ALL GREEN'}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
