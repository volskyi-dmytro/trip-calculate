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


def save(im: Image.Image, name: str, quality: int = QUALITY, out: Path = OUT) -> None:
    path = out / name
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

    # Season-independent homepage illustration. Kept RGBA so the soft edges
    # blend into either theme's surface; 720px = 2x the ~360px display width.
    planner = Image.open(SRC / "planner-empty.png").convert("RGBA")
    planner = planner.resize((720, 480), Image.LANCZOS)
    save(planner, "planner-empty.webp", out=OUT.parent)

    # Signed-in planner artwork (assets/planner-ui-v1). RGBA like the above;
    # widths are ~2x the largest CSS display size (280px / 144px).
    ui_src = ROOT / "assets" / "planner-ui-v1"
    ui_out = OUT.parent / "planner-v1"
    ui_out.mkdir(exist_ok=True)
    for name, width in (("ai-welcome", 600), ("waypoints-empty", 320)):
        art = Image.open(ui_src / f"{name}.png").convert("RGBA")
        art = art.resize((width, round(width * art.height / art.width)), Image.LANCZOS)
        save(art, f"{name}.webp", out=ui_out)

    # Dashboard next-trip banner artwork (assets/dashboard-ui-v1). RGBA like
    # the above; 640px wide is ~2x the ~300px CSS display width.
    dash_src = ROOT / "assets" / "dashboard-ui-v1"
    dash_out = OUT.parent / "dashboard-v1"
    dash_out.mkdir(exist_ok=True)
    next_trip = Image.open(dash_src / "next-trip.png").convert("RGBA")
    width = 640
    next_trip = next_trip.resize((width, round(width * next_trip.height / next_trip.width)), Image.LANCZOS)
    save(next_trip, "next-trip.webp", out=dash_out)


if __name__ == "__main__":
    main()
