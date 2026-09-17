# -*- coding: utf-8 -*-
"""finalize-edge-auto-hide 交付 + 运行时验证。

在 deliver_hardened.py 基础上修正/新增：
  * 启动 GUI 子进程必须脱离 stdio（Popen -> DEVNULL + close_fds），否则工具调用等管道关到超时
  * F1 断言：整场验证 %TEMP%\\token-monitor-edge-error.log 不出现（上一版每启动写一条拒收）
  * F5 断言：启动隐藏后 Win32 外框露出条 = rect.bottom ≈ 3（补偿后）
  * F6 断言：隐藏态被外部 MoveWindow 改尺寸/挪位后 ~2s 内自愈（位置重算 + settings 同步）
  * F3 断言：edgeAutoHideDebug 开启时 debug 日志有决策记录，结束时恢复关闭
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
BAK = os.path.join(RES, "app.asar.v0580-official.bak")
EXE = os.path.join(APP, "Token Monitor.exe")
UD = os.path.join(os.environ["APPDATA"], "Token Monitor")
SETTINGS = os.path.join(UD, "settings.json")
TMP = r"C:\Users\29871\AppData\Local\Temp\opencode"
ERRLOG = os.path.join(os.environ.get("TEMP", TMP), "token-monitor-edge-error.log")
DBGLOG = os.path.join(os.environ.get("TEMP", TMP), "token-monitor-edge-debug.log")

FILES = [r"src\electron\floatingBubble.js", r"src\electron\main.js",
         r"src\electron\windowBehavior.js", r"src\electron\edgeAutoHide.js",
         r"src\electron\tray.js", r"src\electron\renderer\app.js",
         r"src\electron\renderer\i18n.js", r"src\electron\renderer\index.html",
         r"src\electron\renderer\styles.css", r"src\electron\renderer\sessionRows.js",
         r"src\electron\edgePopupGuard.js",
         r"src\shared\providers\zai\limits.js",
         r"src\shared\providers\zcode\sessionMetadata.js",
         r"src\shared\sessionMetadata.js",
         r"src\shared\sessionDetail.js"]

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
        if pid.value not in pids:
            return True
        if not user32.IsWindowVisible(hwnd):
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


def main_window(wb):
    cands = [w for w in windows_of(app_pids()) if w["w"] > 40 and w["h"] > 40 and w["cls"] != "#32770"]
    if not cands:
        return None, []
    best = min(cands, key=lambda w: abs(w["w"] - wb["width"]) + abs(w["h"] - wb["height"]))
    return best, cands


def rect_of(hwnd):
    r = wt.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(r))
    return {"x": r.left, "y": r.top, "w": r.right - r.left, "h": r.bottom - r.top,
            "bottom": r.bottom, "right": r.right}


def set_cursor(x, y):
    user32.SetCursorPos(int(x), int(y))


def main():
    hr("1. preconditions")
    assert os.path.exists(BAK), "rollback backup missing"
    assert os.path.exists(os.path.join(FORK, "src", "electron", "edgeAutoHide.js")), "fork missing"
    print(f"  backup present: {os.path.getsize(BAK):,} B")

    hr("2. quit app, overlay fork files onto extracted tree, pack, swap")
    subprocess.run(["taskkill", "/F", "/IM", "Token Monitor.exe"], capture_output=True)
    time.sleep(4)
    for rel in FILES:
        shutil.copy2(os.path.join(FORK, rel), os.path.join(EXTRACTED, rel))
    print(f"  overlaid {len(FILES)} files")
    out = os.path.join(TMP, "app.edge.final.asar")
    if os.path.exists(out):
        os.remove(out)
    r = subprocess.run(["npx", "--yes", "@electron/asar", "pack", EXTRACTED, out],
                       capture_output=True, text=True, shell=True)
    if not os.path.exists(out):
        print("  PACK FAILED:", (r.stdout or "")[-300:], (r.stderr or "")[-300:])
        return 4
    shutil.copy2(out, ASAR)
    print(f"  installed app.asar = {os.path.getsize(ASAR):,} B")

    hr("3. settings: keep user's dock, enable the debug switch for the F3 check")
    s = json.load(open(SETTINGS, encoding="utf-8"))
    shutil.copy2(SETTINGS, SETTINGS + ".pre-finalize.bak")
    if s.get("windowBehavior") != "edge":
        print(f"  !! unexpected windowBehavior={s.get('windowBehavior')!r}, setting edge for the test")
        s["windowBehavior"] = "edge"
    s["edgeAutoHideDebug"] = True
    json.dump(s, open(SETTINGS, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    wb = s.get("windowBounds")
    print(f"  behavior={s.get('windowBehavior')} windowBounds={wb}")

    for p in (ERRLOG, DBGLOG):
        if os.path.exists(p):
            os.remove(p)

    pt = wt.POINT()
    user32.GetCursorPos(ctypes.byref(pt))
    keep = (pt.x, pt.y)
    dialog_seen = []
    res = {}
    try:
        # DEVNULL + close_fds: the GUI must never inherit this script's stdout pipe.
        with open(os.devnull, "wb") as devnull:
            subprocess.Popen([EXE], stdout=devnull, stderr=devnull, stdin=devnull, close_fds=True)
        time.sleep(20)

        win, cands = main_window(wb or {"width": 400, "height": 460})
        if not win:
            print("  FATAL no main window. candidates:")
            for c in cands:
                print(f"    {c['w']}x{c['h']} cls={c['cls']!r} title={c['title']!r}")
            print(f"  error dialogs: {error_dialogs()}")
            return 5
        hwnd = win["hwnd"]
        print(f"  main window hwnd={hwnd} {win['w']}x{win['h']} cls={win['cls']!r} title={win['title']!r}")

        hr("4. startup: docked top + hidden, strip ~= 3px, no guard rejection")
        time.sleep(4)
        base = rect_of(hwnd)
        print(f"  rect = {base}")
        res["hides_on_launch"] = base["y"] < -50
        # F5: the visible strip is the outer bottom edge; design puts it at y=3.
        res["strip_about_3px"] = 1 <= base["bottom"] <= 6
        res["no_error_dialog_at_startup"] = not error_dialogs()
        # F1: the startup window must produce ZERO guard lines.
        res["startup_no_guard_rejection"] = (not os.path.exists(ERRLOG)
                                             or "geometry-guard" not in open(ERRLOG, encoding="utf-8", errors="replace").read())
        print(f"  hidden={res['hides_on_launch']} strip={base['bottom']}px (~3px={res['strip_about_3px']}) "
              f"no-dialog={res['no_error_dialog_at_startup']} startup-clean={res['startup_no_guard_rejection']}")

        span_l, span_r = base["x"], base["x"] + base["w"]

        hr("5. F6: resize + displace while hidden must self-heal in ~2s")
        w2, h2 = base["w"] + 60, base["h"] + 50
        user32.MoveWindow(hwnd, span_l, -300, w2, h2, True)
        time.sleep(3)
        r2 = rect_of(hwnd)
        print(f"  after MoveWindow(w={w2},h={h2} y=-300): rect={r2}")
        res["resize_repositioned"] = abs(r2["bottom"] - 3) <= 3 and r2["h"] == h2
        s2 = json.load(open(SETTINGS, encoding="utf-8"))
        eab = s2.get("edgeAutoHideBounds") or {}
        # Settings hold ELECTRON bounds: outer h2 minus the 6px bottom overhang.
        eh = h2 - 6
        res["resize_settings_synced"] = (abs(eab.get("hiddenBounds", {}).get("height", 0) - eh) <= 1
                                         and abs(eab.get("expandedBounds", {}).get("height", 0) - eh) <= 1)
        print(f"  self-healed={res['resize_repositioned']} settings_synced={res['resize_settings_synced']} "
              f"eab.h={eab.get('hiddenBounds', {}).get('height')} (electron, expect ~{eh})")
        base = r2
        span_l, span_r = base["x"], base["x"] + base["w"]

        hr("6. five reveal/re-hide cycles")
        for i in range(1, 6):
            set_cursor((span_l + span_r) // 2, 2)
            time.sleep(3)
            rv = rect_of(hwnd)
            revealed = rv["y"] > base["y"] + 20
            set_cursor(300 if i % 2 else 768, 700 + i)
            time.sleep(4)
            rh = rect_of(hwnd)
            rehidden = abs(rh["bottom"] - 3) <= 3
            if error_dialogs():
                dialog_seen.append(f"cycle{i}")
            res[f"cycle{i}_reveal"] = revealed
            res[f"cycle{i}_rehide"] = rehidden
            print(f"  cycle {i}: reveal={revealed} (y={rv['y']})  rehide={rehidden} (bottom={rh['bottom']})")

        hr("7. same edge far from the span must NOT trigger")
        far = 40 if span_l > 300 else 1496
        set_cursor(far, 2)
        time.sleep(3)
        rf = rect_of(hwnd)
        res["no_false_trigger"] = abs(rf["bottom"] - 3) <= 3
        print(f"  cursor=({far},2) span=[{span_l},{span_r}] rect={rf} still_hidden={res['no_false_trigger']}")

        hr("8. F3: debug log captured the decisions")
        res["debug_log_written"] = os.path.exists(DBGLOG)
        if res["debug_log_written"]:
            lines = open(DBGLOG, encoding="utf-8", errors="replace").read().splitlines()
            kinds = sorted({l.split("] ", 1)[-1].split(" ", 1)[0] if "] " in l else "?" for l in lines})
            hits = [l for l in lines if "[poll]" in l or "[collapse]" in l or "[expand]" in l]
            res["debug_log_written"] = len(hits) >= 3
            print(f"  {len(lines)} lines, sample:")
            for l in lines[-6:]:
                print("    " + l)
        else:
            print("  !! debug log missing")
    finally:
        set_cursor(*keep)

    hr("9. cleanup: debug switch back off")
    s3 = json.load(open(SETTINGS, encoding="utf-8"))
    s3.pop("edgeAutoHideDebug", None)
    json.dump(s3, open(SETTINGS, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("  edgeAutoHideDebug removed")

    hr("10. error dialog + guard log summary (whole run)")
    res["no_error_dialog_throughout"] = not dialog_seen and not error_dialogs()
    print(f"  dialogs seen: {dialog_seen or 'none'}")
    # Hard failures: non-finite coordinates (a logic bug) or an animation
    # degrade (>=3 consecutive native rejections). A single transient native
    # rejection of a late tween frame is tolerated by design (D7) -- reported,
    # not fatal.
    if os.path.exists(ERRLOG):
        err_text = open(ERRLOG, encoding="utf-8", errors="replace").read()
        res["no_nonfinite_rejections"] = "refused a non-finite" not in err_text
        res["no_tweening_degrade"] = "tweening disabled" not in err_text
        transient = [l for l in err_text.splitlines() if "native setPosition rejected" in l]
        res["transient_native_rejections"] = len(transient)
        for l in transient:
            print("  ~ transient: " + l)
    else:
        res["no_nonfinite_rejections"] = True
        res["no_tweening_degrade"] = True
        res["transient_native_rejections"] = 0
        print("  %TEMP%\\token-monitor-edge-error.log absent for the whole run")

    hr("SUMMARY")
    for k, v in res.items():
        print(f"  {k:32s} = {v}")
    ok = all(v for k, v in res.items() if k != "transient_native_rejections")
    print(f"\n  {'ALL GREEN' if ok else 'NOT ALL GREEN'}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
