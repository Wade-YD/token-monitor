# -*- coding: utf-8 -*-
"""harden-edge-auto-hide 交付 + 验证（任务组 6）。

按 tasks.md 6.2-6.6：
  * 主窗口识别：尺寸最接近 windowBounds，**排除 #32770 对话框**
  * 前置：先把 windowBounds 放到顶边（否则“未隐藏”是正确行为，不得判为缺陷）
  * 断言连续 >=5 轮「唤出 -> 收起」
  * **断言全程不存在标题为 Error 的 #32770 可见窗口**（上一轮漏掉，导致崩溃与“不收起”未被分离）
  * 断言触发区沿边约束反例：同边远处不得唤出
  * 断言持久化隔离：windowBounds 无隐藏坐标；edgeAutoHideBounds 存在且结构完整
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
SCREEN_W, SCREEN_H = 1536, 960
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


def windows_of(pids, visible_only=True):
    out = []

    def cb(hwnd, _):
        rect = wt.RECT()
        if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
            return True
        pid = wt.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value not in pids:
            return True
        vis = bool(user32.IsWindowVisible(hwnd))
        if visible_only and not vis:
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


def find_error_dialogs():
    pids = app_pids()
    return [w for w in windows_of(pids) if w["cls"] == "#32770" and w["title"].strip().lower() == "error"]


def main_window(wb):
    """尺寸最接近 windowBounds 的可见窗口；排除对话框（#32770）。"""
    pids = app_pids()
    cands = [w for w in windows_of(pids) if w["w"] > 40 and w["h"] > 40 and w["cls"] != "#32770"]
    if not cands:
        return None, []
    best = min(cands, key=lambda w: abs(w["w"] - wb["width"]) + abs(w["h"] - wb["height"]))
    return best, cands


def rect_of(hwnd):
    r = wt.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(r))
    return {"x": r.left, "y": r.top, "w": r.right - r.left, "h": r.bottom - r.top}


def set_cursor(x, y):
    user32.SetCursorPos(int(x), int(y))


def main():
    hr("1. preconditions")
    assert os.path.exists(BAK), "rollback backup missing"
    print(f"  backup present: {os.path.getsize(BAK):,} B")

    hr("2. pack and swap")
    subprocess.run(["taskkill", "/F", "/IM", "Token Monitor.exe"], capture_output=True)
    time.sleep(4)
    for rel in FILES:
        shutil.copy2(os.path.join(FORK, rel), os.path.join(EXTRACTED, rel))
    print(f"  overlaid {len(FILES)} files")
    out = os.path.join(TMP, "app.edge.hardened.asar")
    if os.path.exists(out):
        os.remove(out)
    r = subprocess.run(["npx", "--yes", "@electron/asar", "pack", EXTRACTED, out],
                       capture_output=True, text=True, shell=True)
    if not os.path.exists(out):
        print("  PACK FAILED:", (r.stdout or "")[-300:], (r.stderr or "")[-300:])
        return 4
    shutil.copy2(out, ASAR)
    print(f"  installed app.asar = {os.path.getsize(ASAR):,} B")

    hr("3. precondition the test: edge mode, windowBounds flush to the TOP edge")
    s = json.load(open(SETTINGS, encoding="utf-8"))
    orig_bounds = s.get("windowBounds")
    orig_behavior = s.get("windowBehavior")
    w0 = (orig_bounds or {}).get("width", 241)
    h0 = (orig_bounds or {}).get("height", 145)
    s["windowBehavior"] = "edge"
    s["windowBounds"] = {"x": 648, "y": 0, "width": w0, "height": h0}
    s.pop("edgeAutoHideBounds", None)
    json.dump(s, open(SETTINGS, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"  was  behavior={orig_behavior} bounds={orig_bounds}")
    print(f"  now  behavior=edge bounds={s['windowBounds']}")

    if os.path.exists(ERRLOG):
        os.remove(ERRLOG)
    set_cursor(760, 700)
    subprocess.Popen([EXE])
    time.sleep(16)

    wb = s["windowBounds"]
    win, cands = main_window(wb)
    if not win:
        print("  FATAL no main window. candidates:")
        for c in cands:
            print(f"    {c['w']}x{c['h']} cls={c['cls']!r} title={c['title']!r}")
        print(f"  error dialogs: {find_error_dialogs()}")
        return 5
    hwnd = win["hwnd"]
    print(f"  main window hwnd={hwnd} {win['w']}x{win['h']} cls={win['cls']!r} title={win['title']!r}")

    res = {}
    dialog_seen = []

    def check_dialog(tag):
        d = find_error_dialogs()
        if d:
            dialog_seen.append((tag, d))
        return not d

    hr("4. observe startup (expect: docked to top, then hidden)")
    time.sleep(5)
    base = rect_of(hwnd)
    print(f"  rect = {base}")
    res["hides_on_launch"] = base["y"] < -50
    res["no_error_dialog_at_startup"] = check_dialog("startup")
    print(f"  hidden={res['hides_on_launch']}  no-error-dialog={res['no_error_dialog_at_startup']}")

    keep = None
    pt = wt.POINT()
    user32.GetCursorPos(ctypes.byref(pt))
    keep = (pt.x, pt.y)
    span_l, span_r = base["x"], base["x"] + base["w"]
    try:
        hr("5. five reveal/re-hide cycles (the real failure was 'first cycle ok, later cycles dead')")
        for i in range(1, 6):
            set_cursor((span_l + span_r) // 2, 2)
            time.sleep(3)
            rv = rect_of(hwnd)
            revealed = rv["y"] > base["y"] + 20
            set_cursor(300 if i % 2 else 768, 700 + i)
            time.sleep(4)
            rh = rect_of(hwnd)
            rehidden = abs(rh["y"] - base["y"]) <= 3
            od = check_dialog(f"cycle{i}")
            res[f"cycle{i}_reveal"] = revealed
            res[f"cycle{i}_rehide"] = rehidden
            print(f"  cycle {i}: reveal={revealed} (y={rv['y']})  rehide={rehidden} (y={rh['y']})  no-error-dialog={od}")

        hr("6. trigger zone must be constrained along the edge")
        far = 40 if base["x"] > 300 else SCREEN_W - 40
        set_cursor(far, 2)
        print(f"  cursor=({far},2)  window span=[{span_l},{span_r}]")
        time.sleep(3)
        rf = rect_of(hwnd)
        res["no_false_trigger"] = abs(rf["y"] - base["y"]) <= 3
        print(f"  rect={rf}  still hidden={res['no_false_trigger']}")
    finally:
        set_cursor(*keep)

    hr("7. persistence isolation")
    s2 = json.load(open(SETTINGS, encoding="utf-8"))
    wbn = s2.get("windowBounds") or {}
    eab = s2.get("edgeAutoHideBounds")
    res["windowBounds_not_polluted"] = wbn.get("y", 0) > -20
    res["edgeAutoHideBounds_complete"] = bool(
        eab and eab.get("side") and isinstance(eab.get("expandedBounds"), dict)
        and isinstance(eab.get("hiddenBounds"), dict)
        and all(k in eab["expandedBounds"] for k in ("x", "y", "width", "height"))
        and all(k in eab["hiddenBounds"] for k in ("x", "y", "width", "height")))
    print(f"  windowBounds       = {wbn}")
    print(f"  edgeAutoHideBounds = {json.dumps(eab, ensure_ascii=False)}")

    hr("8. error dialog summary (throughout the whole run)")
    if dialog_seen:
        for tag, d in dialog_seen:
            print(f"  !! error dialog seen at {tag}: {d}")
        res["no_error_dialog_throughout"] = False
    else:
        print("  none seen at any checkpoint")
        res["no_error_dialog_throughout"] = True

    hr("9. guard / crash log")
    if os.path.exists(ERRLOG):
        print("  !! edge error log exists:")
        for l in open(ERRLOG, encoding="utf-8", errors="replace").read().splitlines()[-10:]:
            print("     " + l)
        res["no_guard_rejections"] = False
    else:
        print("  absent (no guard rejection, no uncaught exception)")
        res["no_guard_rejections"] = True

    hr("SUMMARY")
    for k, v in res.items():
        print(f"  {k:32s} = {v}")
    ok = all(res.values())
    print(f"\n  {'ALL GREEN' if ok else 'NOT ALL GREEN'}")
    print(f"  (test state left: windowBehavior=edge, windowBounds={s2.get('windowBounds')})")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
