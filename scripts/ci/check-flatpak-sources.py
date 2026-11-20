"""托盘那几个 Flatpak 模块的来源还在不在、对不对。

真正的 Flatpak 构建只在打包时跑，模块来源写错了，平时的 CI 是绿的、发版才红。
这里把最容易静默出错的部分提前到秒级：tarball 的地址还在不在、校验值对不对、
git tag 还指不指着钉住的那个 commit。它不构建任何东西。

archive 按「主地址 + mirror-urls」依次试，和 flatpak-builder 实际下载时一样：
主源临时 503、镜像能下到且校验值对，就只打一条警告，不让整条流水线失败。
所有来源都只是「对方暂时不可用」（5xx、429、超时、连不上）时同样只打警告：
那是上游的事，不是这份清单写错了；地址 404、校验值对不上、tag 改指才判失败。

用法：python3 scripts/ci/check-flatpak-sources.py [manifest]
需要 PyYAML 和 git。
"""

import hashlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

import yaml

DEFAULT_MANIFEST = "packaging/flatpak/com.zeppbridge.app.yml"


RETRY_DELAYS = (5, 15)


def is_transient(exc):
    """对方暂时不可用（换个时间再试就好），而不是地址或内容本身有问题。"""
    if isinstance(exc, urllib.error.HTTPError):
        return exc.code >= 500 or exc.code == 429
    return isinstance(exc, (urllib.error.URLError, TimeoutError, ConnectionError, OSError))


def fetch(url):
    for delay in (*RETRY_DELAYS, None):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ZeppBridge-CI/1.0"})
            return urllib.request.urlopen(req, timeout=60).read()
        except Exception as exc:  # noqa: BLE001
            if delay is None or not is_transient(exc):
                raise
            print(f"  {exc}; {delay} 秒后重试")
            time.sleep(delay)
    raise AssertionError("unreachable")


def check_archive(name, source):
    candidates = [source["url"], *source.get("mirror-urls", [])]
    errors = []
    transient = True
    for idx, url in enumerate(candidates):
        label = "primary" if idx == 0 else f"mirror#{idx}"
        print(f"{name}: fetching ({label}) {url}")
        try:
            blob = fetch(url)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{label} {url}: {exc}")
            transient = transient and is_transient(exc)
            continue
        got = hashlib.sha256(blob).hexdigest()
        if got != source["sha256"]:
            errors.append(f"{label} {url}: sha256 {got} != manifest {source['sha256']}")
            transient = False
            continue
        if idx > 0:
            print(f"::warning::{name} 主源不可用，已回退到 {label}（{url}）：{errors[0]}")
        print(f"  sha256 ok ({len(blob)} bytes)")
        return None
    if transient:
        print(f"::warning::{name} 的来源暂时都下不到，像是上游临时故障，这次不判失败：{'; '.join(errors)}")
        return None
    return f"{name}: 所有来源都失败（{'; '.join(errors)}）"


def check_git(name, source):
    url, tag, commit = source["url"], source["tag"], source["commit"]
    print(f"{name}: git ls-remote {url} tags/{tag}")
    command = ["git", "ls-remote", url, f"refs/tags/{tag}^{{}}", f"refs/tags/{tag}"]
    for delay in (*RETRY_DELAYS, None):
        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=30)
        except subprocess.TimeoutExpired:
            reason = "git ls-remote timed out"
        else:
            if result.returncode == 0:
                break
            reason = result.stderr.strip() or f"git ls-remote exit {result.returncode}"
            # 只有明确说「仓库不存在 / 无权访问」才是清单的问题；网络层的报错写法太多
            # （TLS 中断、连接被重置、空回复、5xx……），列不全，一律当临时故障重试。
            permanent = (
                "repository not found", "not found", "error: 404", "error: 403",
                "error: 401", "authentication failed", "could not read username",
                "does not appear to be a git repository",
            )
            if any(message in reason.lower() for message in permanent):
                return f"{name}: git ls-remote 失败：{reason}"
        if delay is None:
            print(f"::warning::{name} 的 Git 来源暂未核验：{reason}")
            return None
        print(f"  git ls-remote 失败；{delay} 秒后重试")
        time.sleep(delay)
    out = result.stdout
    # 附注标签有两行：`refs/tags/X` 是标签对象，`refs/tags/X^{}` 是它指向的 commit。
    shas = {line.split("\t")[1]: line.split("\t")[0] for line in out.strip().splitlines()}
    resolved = shas.get(f"refs/tags/{tag}^{{}}") or shas.get(f"refs/tags/{tag}")
    if resolved != commit:
        return f"{name}: tag {tag} 现在指向 {resolved}，manifest 钉的是 {commit}"
    print(f"  commit ok ({commit})")
    return None


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_MANIFEST
    with open(path, encoding="utf-8") as fh:
        manifest = yaml.safe_load(fh)
    failed = []
    for module in manifest["modules"]:
        if module["name"] == "zeppbridge":
            continue
        for source in module.get("sources", []):
            if source["type"] == "archive":
                problem = check_archive(module["name"], source)
            elif source["type"] == "git":
                problem = check_git(module["name"], source)
            else:
                continue
            if problem:
                failed.append(problem)
    if failed:
        for line in failed:
            print(f"::error::{line}")
        return 1
    print("来源检查结束；暂时无法核验的来源已单独警告")
    return 0


if __name__ == "__main__":
    sys.exit(main())
