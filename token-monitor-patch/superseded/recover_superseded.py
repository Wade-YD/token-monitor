# -*- coding: utf-8 -*-
"""从会话数据里找回「中档裁剪前」的产物原文。

目标两份：
  A) 52 任务的 tasks.md（后被 38 任务版覆盖，从未进 git）
  B) 被删掉的第三能力 specs/upstream-patch-maintenance/spec.md

做法：递归遍历会话 JSON，收集所有带 tool 名 + state.input 的节点，
按 input 里的目标路径与内容关键字筛选，打印候选并导出。
"""
import io
import json
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

SRC = r"D:\桌面\私人图书馆\7-工具箱\1-project\_extracted_session.json"
TMP = r"C:\Users\29871\AppData\Local\Temp\opencode"

EDIT_TOOLS = {"write", "edit", "create_file", "write_file"}


def load():
    print(f"读取 {SRC}  ({os.path.getsize(SRC):,} B)")
    with open(SRC, encoding="utf-8", errors="replace") as fh:
        data = json.load(fh)
    if isinstance(data, dict):
        print("  顶层 keys: " + ", ".join(list(data.keys())[:20]))
        if "messages" in data:
            print(f"  messages: {len(data['messages'])} 条")
    return data


def collect(node, out, depth=0):
    """收集所有形如 {tool/name, state:{input:{...}}} 的节点。"""
    if depth > 12:
        return
    if isinstance(node, dict):
        # 形态 1: {"type":"tool","tool":"write","state":{"input":{...}}}
        tool = node.get("tool") or node.get("name")
        state = node.get("state")
        if isinstance(tool, str) and isinstance(state, dict) and isinstance(state.get("input"), dict):
            out.append({"tool": tool, "input": state["input"], "title": state.get("title")})
        for v in node.values():
            collect(v, out, depth + 1)
    elif isinstance(node, list):
        for v in node:
            collect(v, out, depth + 1)


def main():
    data = load()
    found = []
    collect(data, found)
    print(f"\n共收集到带 input 的工具调用节点: {len(found)}")

    files = [x for x in found if x["tool"] in EDIT_TOOLS]
    print(f"其中写文件类（{sorted(EDIT_TOOLS)}）: {len(files)}")

    print("\n===== 与 harden-edge-auto-hide / upstream-patch-maintenance 相关的写入 =====")
    idx = 0
    for x in files:
        fp = str(x["input"].get("filePath") or x["input"].get("path") or "")
        content = x["input"].get("content") or ""
        blob = fp + "\n" + str(x["input"].get("newString") or "") + "\n" + str(content)
        if "harden-edge-auto-hide" not in blob and "upstream-patch-maintenance" not in blob:
            continue
        idx += 1
        n_task = content.count("- [ ]") + content.count("- [x]")
        print(f"\n  [{idx}] tool={x['tool']}")
        print(f"      filePath = {fp}")
        print(f"      content 长度 = {len(content):,}   任务勾选行 = {n_task}")
        if x["input"].get("oldString"):
            print(f"      oldString 长度 = {len(str(x['input']['oldString'])):,}  (这是一次 edit)")
        if content:
            head = content[:160].replace("\r", "").replace("\n", " / ")
            print(f"      开头: {head}")

        # 目标 A：52 任务的 tasks.md
        if fp.endswith("tasks.md") and n_task >= 45:
            out = os.path.join(TMP, "recovered_tasks_full_scope.md")
            with open(out, "w", encoding="utf-8") as fh:
                fh.write(content)
            print(f"      >>> 导出 52 任务版 -> {out}  ({len(content):,} 字符)")
        # 目标 B：第三能力 spec
        if "upstream-patch-maintenance" in fp:
            out = os.path.join(TMP, "recovered_upstream_patch_maintenance_spec.md")
            with open(out, "w", encoding="utf-8") as fh:
                fh.write(content)
            print(f"      >>> 导出第三能力 spec -> {out}  ({len(content):,} 字符)")

    print("\n===== 结果 =====")
    for f in ("recovered_tasks_full_scope.md", "recovered_upstream_patch_maintenance_spec.md"):
        p = os.path.join(TMP, f)
        print(f"  {f:52s} {'OK ' + str(os.path.getsize(p)) + ' B' if os.path.exists(p) else '❌ 未找到/未导出'}")


if __name__ == "__main__":
    main()
