# SPDX-License-Identifier: GPL-3.0-or-later
# Minimal SRT -> PGS (.sup, HDMV presentation graphics) encoder. Needs Pillow.
# Usage: python3 srt2sup.py in.srt out.sup WIDTH HEIGHT [OFFSET_SECONDS] [START END]
#   OFFSET_SECONDS is added to every cue (e.g. -105 when cutting a clip at 1:45).
#   START/END (seconds, after offset) keep only cues inside the clip.
import re
import struct
import sys

from PIL import Image, ImageDraw, ImageFont

FONTS = ["/System/Library/Fonts/Helvetica.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]


def font(size):
    for p in FONTS:
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            pass
    return ImageFont.load_default(size=size)


def parse_srt(path):
    t = r"(\d+):(\d+):(\d+)[,.](\d+)"
    sec = lambda m, o: int(m[o]) * 3600 + int(m[o + 1]) * 60 + int(m[o + 2]) + int(m[o + 3]) / 1000
    cues = []
    for block in re.split(r"\n\s*\n", open(path, encoding="utf-8-sig").read().replace("\r", "")):
        lines = block.strip().split("\n")
        for i, line in enumerate(lines):
            m = re.match(t + r"\s*-->\s*" + t, line)
            if m:
                g = m.groups()
                text = "\n".join(re.sub(r"<[^>]+>", "", x) for x in lines[i + 1 :])
                cues.append((sec(g, 0), sec(g, 4), text))
                break
    return cues


def render(text, size):
    f = font(size)
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    l, t, r, b = (round(v) for v in probe.multiline_textbbox((0, 0), text, font=f, stroke_width=3, align="center"))
    img = Image.new("LA", (r - l + 8, b - t + 8), (0, 0))
    ImageDraw.Draw(img).multiline_text(
        (4 - l, 4 - t), text, font=f, fill=(255, 255), stroke_width=3, stroke_fill=(0, 255), align="center"
    )
    return img


def quantize(img):
    # 8 grey levels x 16 alpha levels -> palette index 1..128; index 0 = transparent.
    px = img.load()
    w, h = img.size
    idx = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            g, a = px[x, y]
            a4 = a >> 4
            idx[y * w + x] = 0 if a4 == 0 else 1 + (g >> 5) * 16 + a4
    pal = [(0, 16, 128, 128, 0)]
    for gi in range(8):
        for a4 in range(1, 16):
            yv = 16 + round(219 * (gi * 255 / 7) / 255)
            pal.append((1 + gi * 16 + a4, yv, 128, 128, a4 * 17))
    return idx, pal


def rle(idx, w, h):
    out = bytearray()
    for y in range(h):
        row = idx[y * w : (y + 1) * w]
        x = 0
        while x < w:
            c = row[x]
            n = 1
            while x + n < w and row[x + n] == c and n < 16383:
                n += 1
            if c == 0:
                out += bytes([0, n]) if n < 64 else bytes([0, 0x40 | (n >> 8), n & 0xFF])
            elif n <= 2:
                out += bytes([c]) * n
            else:
                out += bytes([0, 0x80 | n, c]) if n < 64 else bytes([0, 0xC0 | (n >> 8), n & 0xFF, c])
            x += n
        out += b"\x00\x00"
    return bytes(out)


def seg(pts, typ, payload):
    return b"PG" + struct.pack(">IIBH", int(pts * 90000) & 0xFFFFFFFF, 0, typ, len(payload)) + payload


def main():
    src, dst, W, H = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    off = float(sys.argv[5]) if len(sys.argv) > 5 else 0.0
    lo, hi = (float(sys.argv[6]), float(sys.argv[7])) if len(sys.argv) > 7 else (float("-inf"), float("inf"))
    out = bytearray()
    comp = 0
    size = max(24, H // 18)
    for start, end, text in parse_srt(src):
        start, end = start + off, end + off
        if start < lo or end > hi or not text.strip():
            continue
        img = render(text, size)
        w, h = img.size
        x, y = (W - w) // 2, H - h - H // 14
        idx, pal = quantize(img)
        data = rle(idx, w, h)
        win = struct.pack(">BBHHHH", 1, 0, x, y, w, h)
        # display set: PCS (epoch start) + WDS + PDS + ODS (+continuations) + END
        out += seg(start, 0x16, struct.pack(">HHBHBBBB", W, H, 0x10, comp, 0x80, 0, 0, 1) + struct.pack(">HBBHH", 0, 0, 0, x, y))
        out += seg(start, 0x17, win)
        out += seg(start, 0x14, bytes([0, 0]) + b"".join(bytes(p) for p in pal))
        first = struct.pack(">HH", w, h) + data
        total = len(first)
        chunks = [first[i : i + 65000] for i in range(0, total, 65000)]
        for i, ch in enumerate(chunks):
            flag = (0x80 if i == 0 else 0) | (0x40 if i == len(chunks) - 1 else 0)
            head = struct.pack(">HBB", 0, 0, flag) + (total.to_bytes(3, "big") if i == 0 else b"")
            out += seg(start, 0x15, head + ch)
        out += seg(start, 0x80, b"")
        comp += 1
        # clear set at cue end
        out += seg(end, 0x16, struct.pack(">HHBHBBBB", W, H, 0x10, comp, 0x00, 0, 0, 0))
        out += seg(end, 0x17, win)
        out += seg(end, 0x80, b"")
        comp += 1
    open(dst, "wb").write(out)


if __name__ == "__main__":
    main()
