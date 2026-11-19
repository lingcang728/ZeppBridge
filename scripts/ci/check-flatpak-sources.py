"""托盘那几个 Flatpak 模块的来源还在不在、对不对。

真正的 Flatpak 构建只在打包时跑，模块来源写错了，平时的 CI 是绿的、发版才红。
这里把最容易静默出错的部分提前到秒级：tarball 的地址还在不在、校验值对不对、
git tag 还指不指着钉住的那个 commit。它不构建任何东西。

archive 按「主地址 + mirror-urls」依次试，和 flatpak-builder 实际下载时一样：
主源临时 503、镜像能下到且校验值对，就只打一条警告，不让整条流水线失败。

用法：python3 scripts/ci/check-flatpak-sources.py [manifest]
需要 PyYAML 和 git。
"""

import hashlib
import subprocess
import sys
import time
import urllib.request

import yaml

DEFAULT_MANIFEST = "packaging/flatpak/com.zeppbridge.app.yml"


def fetch(url, attempts=2):
    last_err = None
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "ZeppBridge-CI/1.0"})
            return urllib.request.urlopen(req, timeout=60).read()
        except Exception as exc:  # noqa: BLE001 - 每种网络错误都按「这个来源不可用」处理
            last_err = exc
            if attempt < attempts:
                time.sleep(3)
    raise last_err


def check_archive(name, source):
    candidates = [source["url"], *source.get("mirror-urls", [])]
    errors = []
    for idx, url in enumerate(candidates):
        label = "primary" if idx == 0 else f"mirror#{idx}"
        print(f"{name}: fetching ({label}) {url}")
        try:
            blob = fetch(url)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{label} {url}: {exc}")
            continue
        got = hashlib.sha256(blob).hexdigest()
        if got != source["sha256"]:
            errors.append(f"{label} {url}: sha256 {got} != manifest {source['sha256']}")
            continue
        if idx > 0:
            print(f"::warning::{name} 主源不可用，已回退到 {label}（{url}）：{errors[0]}")
        print(f"  sha256 ok ({len(blob)} bytes)")
        return None
    return f"{name}: 所有来源都失败（{'; '.join(errors)}）"


def check_git(name, source):
    url, tag, commit = source["url"], source["tag"], source["commit"]
    print(f"{name}: git ls-remote {url} tags/{tag}")
    out = subprocess.run(
        ["git", "ls-remote", url, f"refs/tags/{tag}^{{}}", f"refs/tags/{tag}"],
        check=True, capture_output=True, text=True,
    ).stdout
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
    print("每个托盘模块的来源都还在，校验值也对得上")
    return 0


if __name__ == "__main__":
    sys.exit(main())
