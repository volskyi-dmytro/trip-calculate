#!/usr/bin/env python3
"""Derive runtime WebP images from the seasonal-backgrounds-v1 PNG masters.

Run from the repo root:  python3 frontend/scripts/build-season-art.py
Needs Pillow built with WebP support (`pip install Pillow`). Outputs are
committed, so this only runs when the masters change — not in CI. The PNG
masters are gitignored (~18 MB); drop the pack into
assets/seasonal-backgrounds-v1/ and check it against manifest.json first.

Masters are resized/compressed only, never upscaled or edited. The ambient
variant is pre-blurred here so the full-viewport body::before layer costs no
runtime filter (see global.css "The view through the windscreen").
"""
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets" / "seasonal-backgrounds-v1"
OUT = ROOT / "frontend" / "public" / "images" / "seasons-v1"
SEASONS = ("winter", "spring", "summer", "autumn")
QUALITY = 84


def save(im: Image.Image, name: str, quality: int = QUALITY) -> None:
    path = OUT / name
    # No exif/icc passed → metadata is stripped. method=6 = slowest, smallest.
    im.save(path, "WEBP", quality=quality, method=6)
    print(f"{path.relative_to(ROOT)}  {im.width}x{im.height}  {path.stat().st_size / 1024:.1f} KB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for season in SEASONS:
        desktop = Image.open(SRC / f"{season}-desktop.png").convert("RGB")
        mobile = Image.open(SRC / f"{season}-mobile.png").convert("RGB")
        save(desktop, f"{season}-desktop.webp")
        save(mobile, f"{season}-mobile.webp")
        # 96px wide like the previous ambient assets; the blur runs after the
        # downscale so the road/car dissolve into a colour field.
        ambient = desktop.resize((96, 32), Image.LANCZOS).filter(ImageFilter.GaussianBlur(3))
        save(ambient, f"{season}-ambient.webp", quality=70)


if __name__ == "__main__":
    main()
