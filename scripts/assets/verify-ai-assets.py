"""Verify the seven bundled AI product icons are local, decodable assets.

This gate is intentionally offline. It checks the exact bytes committed in
src/assets/ai and never follows the documented source URLs at runtime.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
ASSET_DIR = ROOT / "src" / "assets" / "ai"

EXPECTED = {
    "chatgpt": {
        "file": "chatgpt.webp",
        "sha256": "3481F245B6D560F855E49A16FC66EE7FDEC2DEE4115949179B113839149A9649",
        "format": "WEBP",
        "size": (48, 48),
    },
    "claude": {
        "file": "claude.png",
        "sha256": "F9B8A3B95FA7EF7CFD3C91E170260CCD3215E575BF45F347FEC0F0A94BA11161",
        "format": "PNG",
        "size": (32, 32),
    },
    "gemini": {
        "file": "gemini.png",
        "sha256": "5E7CFECAA53F4F65A313FE89B0F389548126544A78FAD8489510C70AE641A4A1",
        "format": "PNG",
        "size": (512, 512),
    },
    "kimi": {
        "file": "kimi.png",
        "sha256": "280D3A7AB31357BCB4CB25A7C8D8EBCEAC5F6646D76AD5DE25E7E1C5E00CF340",
        "format": "PNG",
        "size": (48, 48),
    },
    "doubao": {
        "file": "doubao.png",
        "sha256": "BF8E41BCC864C00099A98080825EA42ABA7CF481303DAD3312F44A5DA68C3F3B",
        "format": "PNG",
        "size": (128, 128),
    },
    "deepseek": {
        "file": "deepseek.png",
        "sha256": "547EAD56DCB71424315BA53BF8F4C35E745EFEAECE106B9FB7E4DCDFA19C1A7A",
        "format": "PNG",
        "size": (180, 180),
    },
    "grok": {
        "file": "grok.png",
        "sha256": "3A462C3C2524733C173BB05C431DE737812F8219DB8FA115B0025D12A347E086",
        "format": "PNG",
        "size": (512, 512),
    },
}


def fail(message: str) -> None:
    raise SystemExit(f"AI_ASSET_VERIFY_FAIL {message}")


def main() -> None:
    if set(path.name for path in ASSET_DIR.iterdir() if path.is_file()) != {
        item["file"] for item in EXPECTED.values()
    }:
        files = sorted(path.name for path in ASSET_DIR.iterdir() if path.is_file())
        fail(f"unexpected files={files}")

    for provider, expectation in EXPECTED.items():
        path = ASSET_DIR / expectation["file"]
        if not path.is_file():
            fail(f"{provider} missing {path.name}")
        digest = hashlib.sha256(path.read_bytes()).hexdigest().upper()
        if digest != expectation["sha256"]:
            fail(f"{provider} hash mismatch expected={expectation['sha256']} actual={digest}")
        try:
            with Image.open(path) as image:
                image.load()
                if image.format != expectation["format"]:
                    fail(f"{provider} format={image.format}, expected {expectation['format']}")
                if image.size != expectation["size"]:
                    fail(f"{provider} size={image.size}, expected {expectation['size']}")
                if image.mode not in {"RGBA", "RGB"}:
                    fail(f"{provider} mode={image.mode}, expected RGB/RGBA")
        except OSError as error:
            fail(f"{provider} cannot decode {path.name}: {error}")

    print(f"AI_ASSETS_OK providers={len(EXPECTED)} files={len(EXPECTED)}")


if __name__ == "__main__":
    main()
