"""在真实浏览器里验证登录窗口注入的那两段 JS。

Rust 单测能证明「拿到 idle=true 才允许跳转」这条判断是对的，但证明不了那两段
注入脚本在真实 DOM 里到底管不管用——事件监听有没有挂上、跨源 iframe 里的输入
能不能报到顶层、只被自动填充（没有事件）的输入框认不认。这三件事恰恰是这次
修复的全部依据：判断错了，用户就会在输密码或等验证码的中途被导走。

脚本直接从 `src-tauri/src/commands/login.rs` 里抠出真正要发布的那两段 JS，不
自己抄一份，所以源码改了这里会跟着变——抄一份的测试只能证明抄的那份没坏。

用法（需要全局 Playwright 与 Chromium）：
    G:\\python\\python.exe scripts/verify/login-activity-probe.py

退出码 0 表示全部通过。
"""

from __future__ import annotations

import http.server
import json
import socket
import sys
import threading
from functools import partial
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - 环境问题，不是被测代码的问题
    print("缺少 playwright，请用全局 Python 运行：G:\\python\\python.exe", file=sys.stderr)
    raise SystemExit(2)

ROOT = Path(__file__).resolve().parents[2]
LOGIN_RS = ROOT / "src-tauri" / "src" / "commands" / "login.rs"


# --------------------------------------------------------------------------
# 从 Rust 源码里取出真正会被注入的两段脚本
# --------------------------------------------------------------------------
def extract_raw_string(source: str, anchor: str) -> str:
    """取 `anchor` 之后第一个 Rust 原始字符串 `r#"..."#` 的内容。"""
    start = source.index(anchor)
    open_at = source.index('r#"', start) + len('r#"')
    close_at = source.index('"#', open_at)
    return source[open_at:close_at]


def load_scripts() -> tuple[str, str]:
    source = LOGIN_RS.read_text(encoding="utf-8")
    activity = extract_raw_string(source, "const LOGIN_ACTIVITY_SCRIPT")
    probe = extract_raw_string(source, "async fn login_page_activity")
    if "__zeppbridgeInteracted" not in activity:
        raise AssertionError("注入脚本里没有活动标记，抠错了位置")
    if "idle" not in probe:
        raise AssertionError("探测脚本里没有 idle 字段，抠错了位置")
    return activity, probe


# --------------------------------------------------------------------------
# 两个本地源，用来构造跨源 iframe（host 不同即跨源）
# --------------------------------------------------------------------------
TOP_PAGE = """<!doctype html><meta charset="utf-8"><title>top</title>
<form><input id="account" type="text" placeholder="email"><input id="pw" type="password"></form>
"""

TOP_WITH_IFRAME = """<!doctype html><meta charset="utf-8"><title>top</title>
<p>signing in</p>
<iframe id="frame" src="{child}" width="400" height="300"></iframe>
"""

CHILD_PAGE = """<!doctype html><meta charset="utf-8"><title>child</title>
<form><input id="otp" type="text" placeholder="one-time code"></form>
"""


class Handler(http.server.BaseHTTPRequestHandler):
    def __init__(self, *args, pages: dict[str, str], **kwargs):
        self._pages = pages
        super().__init__(*args, **kwargs)

    def do_GET(self):  # noqa: N802 - BaseHTTPRequestHandler 的接口
        body = self._pages.get(self.path)
        if body is None:
            self.send_error(404)
            return
        payload = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_args):  # 安静
        return


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def serve(host: str, port: int, pages: dict[str, str]) -> http.server.HTTPServer:
    server = http.server.HTTPServer((host, port), partial(Handler, pages=pages))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


# --------------------------------------------------------------------------
# 断言
# --------------------------------------------------------------------------
FAILURES: list[str] = []


def check(name: str, got, want) -> None:
    if got == want:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name}: got {got!r}, want {want!r}")
        FAILURES.append(name)


def idle_of(page, probe: str):
    """跑一次探测脚本，返回 idle 字段。整个流程只信这一个值。"""
    return json.loads(page.evaluate(probe))["idle"]


def launch_chromium(playwright):
    """优先用本机已装的浏览器，不为跑一次校验再下一份 Chromium。"""
    last = None
    for channel in ("chrome", "msedge", None):
        try:
            if channel:
                return playwright.chromium.launch(channel=channel)
            return playwright.chromium.launch()
        except Exception as error:  # noqa: BLE001 - 换下一个候选
            last = error
    raise AssertionError(f"没有可用的 Chromium：{last}")


def main() -> int:
    activity, probe = load_scripts()

    port_a, port_b = free_port(), free_port()
    child_url = f"http://localhost:{port_b}/child.html"
    top = serve(
        "127.0.0.1",
        port_a,
        {
            "/plain.html": TOP_PAGE,
            "/iframe.html": TOP_WITH_IFRAME.format(child=child_url),
        },
    )
    child = serve("localhost", port_b, {"/child.html": CHILD_PAGE})

    try:
        with sync_playwright() as playwright:
            browser = launch_chromium(playwright)
            # add_init_script 作用于每个 frame 的每次导航，对应 Rust 里的
            # initialization_script_for_all_frames。
            context = browser.new_context()
            context.add_init_script(activity)

            # 1. 刚打开、没人碰过：这是唯一允许自动跳转的状态。
            page = context.new_page()
            page.goto(f"http://127.0.0.1:{port_a}/plain.html")
            check("空白登录页判定为空闲", idle_of(page, probe), True)

            # 2. 用户开始输邮箱——线上那条反馈就死在这一步。
            page.click("#account")
            page.keyboard.type("someone@example.com")
            check("输入邮箱后判定为有人在用", idle_of(page, probe), False)

            # 3. 密码被密码管理器自动填上，没有任何输入事件：靠非空输入框认出来。
            filled = context.new_page()
            filled.goto(f"http://127.0.0.1:{port_a}/plain.html")
            filled.eval_on_selector("#pw", "node => { node.value = 'autofilled'; }")
            check("自动填充（无事件）也判定为有人在用", idle_of(filled, probe), False)

            # 4. 跨源 iframe 里的输入要能报到顶层。
            #    小米验证码、第三方授权表单常常就在这样一个 iframe 里；事件不会
            #    冒泡到顶层文档，只能靠脚本自己 postMessage 上报。
            framed = context.new_page()
            framed.goto(f"http://127.0.0.1:{port_a}/iframe.html")
            check("带 iframe 的页面未被碰过时仍是空闲", idle_of(framed, probe), True)
            frame = framed.frame_locator("#frame")
            frame.locator("#otp").click()
            framed.keyboard.type("123456")
            framed.wait_for_timeout(200)  # postMessage 是异步的
            check("跨源 iframe 里输入验证码后判定为有人在用", idle_of(framed, probe), False)

            # 5. 探测脚本必须永远返回可解析的 JSON——Rust 侧解析失败会当成
            #    「问不出来」，那会让页面真没渲染出来的人永远等不到备用页。
            blank = context.new_page()
            raw = blank.evaluate(probe)  # about:blank
            check("about:blank 上仍返回合法 JSON", isinstance(json.loads(raw), dict), True)

            browser.close()
    finally:
        top.shutdown()
        child.shutdown()

    if FAILURES:
        print(f"\n{len(FAILURES)} 项未通过：{', '.join(FAILURES)}")
        return 1
    print("\n登录窗口注入脚本：全部通过")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
