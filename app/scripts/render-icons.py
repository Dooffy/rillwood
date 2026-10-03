# SPDX-License-Identifier: GPL-3.0-or-later
# Renders the two-wave LogoMark (assets/images/logo-mark-*.svg, 72-unit viewBox) into the app icon PNGs.
# Run from app/ after changing the mark: python3 scripts/render-icons.py (needs Pillow: pip install pillow).
# Colours = theme.ts dark palette: surface tile, textSecondary + text waves.
from PIL import Image, ImageDraw

OUT = 'assets/images/'
SS = 4  # supersampling for smooth edges
GREY, WHITE, SURFACE, CLEAR = '#98989F', '#FFFFFF', '#1C1C1E', (0, 0, 0, 0)


def bezier(p0, p1, p2, p3, n=200):
    return [
        tuple((1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t**2 * c + t**3 * d for a, b, c, d in zip(p0, p1, p2, p3))
        for t in (i / n for i in range(n + 1))
    ]


def wave(y):
    # SVG path: M18 y c6-6 12-6 18 0 s12 6 18 0
    return bezier((18, y), (24, y - 6), (30, y - 6), (36, y)) + bezier((36, y), (42, y + 6), (48, y + 6), (54, y))


def render(size, background, top, bottom, mark):
    """`mark` = px size of the 72-unit box, centred on a `size` canvas."""
    s = size * SS
    img = Image.new('RGBA', (s, s), background)
    draw = ImageDraw.Draw(img)
    k = mark * SS / 72
    offset = (s - mark * SS) / 2
    r = 3.5 / 2 * k  # stroke-width 3.5, round caps
    for y, colour in ((32, top), (44, bottom)):
        for x, yy in wave(y):
            cx, cy = offset + x * k, offset + yy * k
            draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=colour)
    return img.resize((size, size), Image.LANCZOS)


# iOS + fallback icon: opaque (App Store rejects alpha).
render(1024, SURFACE, GREY, WHITE, 1024).convert('RGB').save(OUT + 'icon.png')
# Android adaptive: mark in the 2/3 safe zone; background = adaptiveIcon.backgroundColor in app.json.
render(512, CLEAR, GREY, WHITE, 512 * 2 // 3).save(OUT + 'android-icon-foreground.png')
render(432, CLEAR, WHITE, WHITE, 432 * 2 // 3).save(OUT + 'android-icon-monochrome.png')
# Splash: 3x of imageWidth 120 in app.json.
render(360, CLEAR, GREY, WHITE, 360).save(OUT + 'splash-icon.png')
