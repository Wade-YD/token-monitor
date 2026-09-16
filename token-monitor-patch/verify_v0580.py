# -*- coding: utf-8 -*-
"""v0.58.0 + patch 重装后的运行时验证（精简自 deliver_finalize.py）。"""
import ctypes
import ctypes.wintypes as wt
import io
import json
import os
import subprocess
import sys
import time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

APP = r"C:\Users\29871\AppData\Local\Programs\Token Monitor"
RES = os.path.join(APP, "resources")
ASAR = os.path.join(RES, "app.asar")
EXE = os.path.join(APP, "Token Monitor.exe")
SNAP = r"C:\Users\29871\AppData\Local\Temp\opencode\v0580"
PATCHED = os.path.join(SNAP, "app.asar.v0580.patched")
ERRLOG = os.path.join(os.environ.get("TEMP", ""), "token-monitor-edge-error.log")

user32 = ctypes.windll.user32
WNDENUMPROC = ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)


def hr(t):
    print("\n" + "=" * 5 + " " + t + " " + "=" * 5)


def app_pids():
    r = subprocess.run(["tasklist", "/FI", "IMAGENAME eq Token Monitor.exe", "/FO", "CSV", "/NH"],
                       capture_output=True, text=True, encoding="utf-8", errors="ignore")
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
        tn = ctypes.create_unicode_buffer(256)
        n = int(user32.GetWindowTextLengthW(hwnd))
        user32.GetWindowTextW(hwnd, tn, n + 2)
        out.append({"hwnd": hwnd, "x": rect.left, "y": rect.top,
                    "w": rect.right - rect.left, "h": rect.bottom - rect.top,
                    "cls": cn.value, "title": tn.value})
        return True

    user32.EnumWindows(WNDENUMPROC(cb), 0)
    return out


def error_dialogs():
    return [w for w in windows_of(app_pids()) if w["cls"] == "#32770" and w["title"].strip().lower() == "error"]


def main_window():
    cands = [w for w in windows_of(app_pids()) if w["w"] > 40 and w["h"] > 40 and w["cls"] != "#32770"]
    if not cands:
        return None
    return min(cands, key=lambda w: abs(w["w"] - 297) + abs(w["h"] - 864))


def rect_of(hwnd):
    r = wt.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(r))
    return {"x": r.left, "y": r.top, "w": r.right - r.left, "h": r.bottom - r.top,
            "bottom": r.bottom, "right": r.right}


def set_cursor(x, y):
    user32.SetCursorPos(int(x), int(y))


def main():
    res = {}
    hr("1. swap asar (app must be closed)")
    pids = app_pids()
    assert not pids, f"app still running: {pids}"
    import shutil
    shutil.copy2(PATCHED, ASAR)
    print(f"  installed app.asar = {os.path.getsize(ASAR):,} B")

    hr("2. launch detached")
    for p in (ERRLOG,):
        if os.path.exists(p):
            os.remove(p)
    pt = wt.POINT()
    user32.GetCursorPos(ctypes.byref(pt))
    keep = (pt.x, pt.y)
    with open(os.devnull, "wb") as devnull:
        subprocess.Popen([EXE], stdout=devnull, stderr=devnull, stdin=devnull, close_fds=True)
    try:
        time.sleep(24)
        win = main_window()
        if not win:
            print("  FATAL no main window; dialogs:", error_dialogs())
            return 5
        hwnd = win["hwnd"]
        print(f"  main hwnd={hwnd} {win['w']}x{win['h']} title={win['title']!r}")
        time.sleep(4)

        hr("3. startup: docked top + hidden, strip ~= 3px")
        base = rect_of(hwnd)
        print(f"  rect = {base}")
        res["hides_on_launch"] = base["y"] < -50
        res["strip_about_3px"] = 1 <= base["bottom"] <= 6
        res["no_error_dialog"] = not error_dialogs()
        print(f"  hidden={res['hides_on_launch']} strip={base['bottom']}px clean={res['no_error_dialog']}")

        hr("4. one reveal / re-hide cycle")
        span_l, span_r = base["x"], base["x"] + base["w"]
        set_cursor((span_l + span_r) // 2, 2)
        time.sleep(3)
        rv = rect_of(hwnd)
        res["reveal"] = rv["y"] > base["y"] + 20
        set_cursor(300, 700)
        time.sleep(4)
        rh = rect_of(hwnd)
        res["rehide"] = abs(rh["bottom"] - 3) <= 3
        print(f"  reveal={res['reveal']} (y={rv['y']})  rehide={res['rehide']} (bottom={rh['bottom']})")

        hr("5. native popup hold (color chooser area probe is UI-level; here just far-edge no-trigger)")
        far = 40 if span_l > 300 else 1496
        set_cursor(far, 2)
        time.sleep(3)
        rf = rect_of(hwnd)
        res["no_false_trigger"] = abs(rf["bottom"] - 3) <= 3
        print(f"  far-edge cursor=({far},2) still_hidden={res['no_false_trigger']}")
    finally:
        set_cursor(*keep)

    hr("SUMMARY")
    if os.path.exists(ERRLOG):
        err = open(ERRLOG, encoding="utf-8", errors="replace").read()
        res["no_nonfinite"] = "refused a non-finite" not in err
        res["no_degrade"] = "tweening disabled" not in err
    else:
        res["no_error_log"] = True
        print("  error log absent (clean run)")
    for k, v in res.items():
        print(f"  {k:20s} = {v}")
    ok = all(res.values())
    print(f"\n  {'ALL GREEN' if ok else 'NOT ALL GREEN'}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
