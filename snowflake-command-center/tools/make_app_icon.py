#!/usr/bin/env python3
"""Generate the Snowflake Revenue Command Center App Studio icon.

Combines two source marks:
  * the baseline "Domo for Snowflake" app icon — a slate/steel-blue gradient
    rounded square with soft depth (top highlight + inner shadow), and
  * the Snowflake snowflake glyph from the product left-nav — the authentic
    6-arm dendrite flake, rendered crisp and white.

Output: 256x256 PNG with transparent corners (best for Domo tiles/nav).
Rendered at 4x supersample for clean anti-aliased edges.
"""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SCALE = 4
SIZE = 256 * SCALE
OUT = Path(__file__).resolve().parent / "app-icon.png"

# Family palette sampled from both reference icons (top -> bottom gradient).
TOP = (63, 114, 160)      # #3F72A0  steel blue (slight Snowflake-cyan lean)
BOTTOM = (43, 74, 110)    # #2B4A6E  slate navy
WHITE = (255, 255, 255)

RADIUS = int(58 * SCALE)  # rounded-square corner radius (~22%)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def capsule(draw, p0, p1, width, fill):
    """Rounded-cap thick segment."""
    draw.line([p0, p1], fill=fill, width=width)
    r = width / 2
    for (x, y) in (p0, p1):
        draw.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def gradient_rounded_square():
    grad = Image.new("RGB", (SIZE, SIZE), TOP)
    gd = ImageDraw.Draw(grad)
    for y in range(SIZE):
        gd.line([(0, y), (SIZE, y)], fill=lerp(TOP, BOTTOM, y / (SIZE - 1)))

    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=RADIUS, fill=255)

    tile = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    tile.paste(grad, (0, 0), mask)

    # Soft top sheen for depth (like the baseline app icon).
    sheen = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(sheen).ellipse(
        [-SIZE * 0.25, -SIZE * 0.85, SIZE * 1.25, SIZE * 0.35], fill=42
    )
    sheen = sheen.filter(ImageFilter.GaussianBlur(SIZE * 0.05))
    white_layer = Image.new("RGBA", (SIZE, SIZE), (255, 255, 255, 0))
    white_layer.putalpha(Image.composite(sheen, Image.new("L", (SIZE, SIZE), 0), mask))
    tile = Image.alpha_composite(tile, white_layer)

    # Subtle inner bottom shadow for a tactile edge.
    inner = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(inner).ellipse(
        [-SIZE * 0.25, SIZE * 0.72, SIZE * 1.25, SIZE * 1.6], fill=60
    )
    inner = inner.filter(ImageFilter.GaussianBlur(SIZE * 0.06))
    dark_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    dark_layer.putalpha(Image.composite(inner, Image.new("L", (SIZE, SIZE), 0), mask))
    tile = Image.alpha_composite(tile, dark_layer)
    return tile


def draw_snowflake(target):
    """Draw the authentic Snowflake 6-arm flake, centered and white."""
    cx = cy = SIZE / 2
    R = 96 * SCALE           # arm reach from center
    arm_w = 17 * SCALE       # main spoke thickness
    barb_w = 13 * SCALE      # barb thickness
    inner = 12 * SCALE       # spoke start radius (clear the center gem)
    barb_at = 0.60           # fraction of R where barbs branch
    barb_len = 0.34 * R      # barb length

    # Render flake on its own layer so we can add a soft drop shadow.
    flake = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    fd = ImageDraw.Draw(flake)

    angles = [90 + 60 * k for k in range(6)]  # one arm points straight up
    for a in angles:
        rad = math.radians(a)
        dx, dy = math.cos(rad), -math.sin(rad)
        p_in = (cx + dx * inner, cy + dy * inner)
        p_out = (cx + dx * R, cy + dy * R)
        capsule(fd, p_in, p_out, arm_w, WHITE)

        # two barbs near the tip, angled +/-60 deg from the arm
        bx = cx + dx * (R * barb_at)
        by = cy + dy * (R * barb_at)
        for da in (60, -60):
            br = math.radians(a + da)
            bdx, bdy = math.cos(br), -math.sin(br)
            capsule(fd, (bx, by), (bx + bdx * barb_len, by + bdy * barb_len), barb_w, WHITE)

    # center gem: crisp hexagon
    gem_r = 24 * SCALE
    hexpts = [
        (cx + gem_r * math.cos(math.radians(90 + 60 * k)),
         cy - gem_r * math.sin(math.radians(90 + 60 * k)))
        for k in range(6)
    ]
    fd.polygon(hexpts, fill=WHITE)

    # soft shadow beneath the flake for subtle depth
    shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sa = flake.split()[3].point(lambda v: int(v * 0.30))
    shadow.putalpha(sa)
    shadow = shadow.filter(ImageFilter.GaussianBlur(6 * SCALE))
    shadow = Image.new("RGBA", (SIZE, SIZE), (10, 24, 40, 0))
    shadow.putalpha(sa.filter(ImageFilter.GaussianBlur(5 * SCALE)))
    off = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    off.paste(shadow, (0, 3 * SCALE), shadow)

    target = Image.alpha_composite(target, off)
    target = Image.alpha_composite(target, flake)
    return target


def main():
    tile = gradient_rounded_square()
    tile = draw_snowflake(tile)
    tile = tile.resize((256, 256), Image.LANCZOS)
    tile.save(OUT, format="PNG")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
