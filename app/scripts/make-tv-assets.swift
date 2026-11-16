// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV brand assets (roadmap TV task 20), drawn from the logo mark (`assets/images/logo-mark-*.svg`): the layered
// app icon - back: the icon's dark fill, middle: the white pebble, front: the play triangle (tvOS shifts the layers
// apart on focus) - and the Top Shelf images: the Welcome screen's tilted poster wall with the mark in the middle.
// No text, no fonts. Writes `assets/tv/*.png` at the sizes `@react-native-tvos/config-tv` takes (`appleTVImages` in
// app.json). Run from `app/` after changing the mark: `swift scripts/make-tv-assets.swift`.
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let out = URL(fileURLWithPath: "assets/tv", isDirectory: true)
try FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)

func rgb(_ hex: UInt32, _ alpha: CGFloat = 1) -> CGColor {
  CGColor(
    srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
    blue: CGFloat(hex & 0xFF) / 255, alpha: alpha)
}

// The palette's dark surfaces (src/theme.ts): the icon's fill, the poster wall's three greys.
let iconFill = rgb(0x1C1C1E)
let wall = [rgb(0x1C1C1E), rgb(0x2C2C2E), rgb(0x3A3A3C)]
let white = rgb(0xFFFFFF)

/** A canvas `width` × `height` with y pointing down (as the SVG), drawn by `draw`, saved as `name`. */
func png(_ name: String, _ width: Int, _ height: Int, opaque: Bool, _ draw: (CGContext) -> Void) throws {
  let ctx = CGContext(
    data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpace(name: CGColorSpace.sRGB)!,
    bitmapInfo: (opaque ? CGImageAlphaInfo.noneSkipLast : CGImageAlphaInfo.premultipliedLast).rawValue)!
  ctx.translateBy(x: 0, y: CGFloat(height))
  ctx.scaleBy(x: 1, y: -1)
  draw(ctx)
  let url = out.appendingPathComponent(name)
  let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
  guard CGImageDestinationFinalize(dest) else { throw NSError(domain: "png", code: 1) }
  print("wrote assets/tv/\(name)")
}

/** The mark's 100 × 100 box (the SVG's viewBox) placed with its centre at `center`, `size` points tall. */
func markSpace(_ ctx: CGContext, center: CGPoint, size: CGFloat) {
  ctx.translateBy(x: center.x - size / 2, y: center.y - size / 2)
  ctx.scaleBy(x: size / 100, y: size / 100)
}

/** The pebble: M21 45 C19 28 36 22 54 23 C74 24 82 36 80 52 C78 70 64 78 46 77 C30 76 23 62 21 45Z */
func pebble() -> CGPath {
  let p = CGMutablePath()
  p.move(to: CGPoint(x: 21, y: 45))
  p.addCurve(to: CGPoint(x: 54, y: 23), control1: CGPoint(x: 19, y: 28), control2: CGPoint(x: 36, y: 22))
  p.addCurve(to: CGPoint(x: 80, y: 52), control1: CGPoint(x: 74, y: 24), control2: CGPoint(x: 82, y: 36))
  p.addCurve(to: CGPoint(x: 46, y: 77), control1: CGPoint(x: 78, y: 70), control2: CGPoint(x: 64, y: 78))
  p.addCurve(to: CGPoint(x: 21, y: 45), control1: CGPoint(x: 30, y: 76), control2: CGPoint(x: 23, y: 62))
  p.closeSubpath()
  return p
}

/** The play triangle: M44 38 V62 L64 50Z, filled and stroked 3.5 with round joins (as the SVG). */
func drawTriangle(_ ctx: CGContext, color: CGColor) {
  let p = CGMutablePath()
  p.move(to: CGPoint(x: 44, y: 38))
  p.addLine(to: CGPoint(x: 44, y: 62))
  p.addLine(to: CGPoint(x: 64, y: 50))
  p.closeSubpath()
  ctx.setFillColor(color)
  ctx.setStrokeColor(color)
  ctx.setLineWidth(3.5)
  ctx.setLineJoin(.round)
  ctx.addPath(p)
  ctx.drawPath(using: .fillStroke)
}

// MARK: App icon - three layers, each scale its own file name (the plugin copies them into one catalog).

for (w, h) in [(1280, 768), (400, 240), (800, 480)] {
  let size = "\(w)x\(h)"
  // The mark as on the phone icon: the 100-unit box across the icon's height.
  let center = CGPoint(x: CGFloat(w) / 2, y: CGFloat(h) / 2)
  try png("icon-back-\(size).png", w, h, opaque: true) { ctx in
    ctx.setFillColor(iconFill)
    ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
  }
  try png("icon-middle-\(size).png", w, h, opaque: false) { ctx in
    markSpace(ctx, center: center, size: CGFloat(h))
    ctx.setFillColor(white)
    ctx.addPath(pebble())
    ctx.fillPath()
  }
  try png("icon-front-\(size).png", w, h, opaque: false) { ctx in
    markSpace(ctx, center: center, size: CGFloat(h))
    drawTriangle(ctx, color: iconFill)
  }
}

// MARK: Top Shelf - the poster wall (Welcome screen), the mark in the middle.

/** Tilted rows of poster shapes in the three greys, as `welcome-wall-dark.svg`, scaled to the shelf's height. */
func drawWall(_ ctx: CGContext, width: CGFloat, height: CGFloat) {
  ctx.setFillColor(rgb(0x000000))
  ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
  let unit = height / 560 * 1.6  // the SVG's poster grid, a bit larger on a wide shelf
  let poster = CGSize(width: 86 * unit, height: 129 * unit)
  let step = CGSize(width: 96 * unit, height: 139 * unit)
  ctx.saveGState()
  ctx.translateBy(x: width / 2, y: height / 2)
  ctx.rotate(by: -8 * .pi / 180)
  let cols = Int((width * 1.3) / step.width) / 2 + 2
  let rows = Int((height * 1.6) / step.height) / 2 + 2
  for row in -rows...rows {
    for col in -cols...cols {
      // Every other row shifted half a poster; colours cycle along the row, one step per row (as the SVG).
      let x = CGFloat(col) * step.width + (row % 2 == 0 ? 0 : step.width / 2) - poster.width / 2
      let y = CGFloat(row) * step.height - poster.height / 2
      let shade = ((col - row) % 3 + 3) % 3
      ctx.setFillColor(wall[shade])
      ctx.addPath(
        CGPath(
          roundedRect: CGRect(origin: CGPoint(x: x, y: y), size: poster), cornerWidth: 12 * unit,
          cornerHeight: 12 * unit, transform: nil))
      ctx.fillPath()
    }
  }
  ctx.restoreGState()
  // Darker towards the middle, so the mark stands out of the wall.
  let glow = CGGradient(
    colorsSpace: CGColorSpace(name: CGColorSpace.sRGB)!, colors: [rgb(0x000000, 0.9), rgb(0x000000, 0)] as CFArray,
    locations: [0, 1])!
  let center = CGPoint(x: width / 2, y: height / 2)
  ctx.drawRadialGradient(
    glow, startCenter: center, startRadius: 0, endCenter: center, endRadius: height * 0.75, options: [])
}

for (w, h) in [(1920, 720), (3840, 1440), (2320, 720), (4640, 1440)] {
  let wide = w * 720 == 2320 * h
  let name = "top-shelf\(wide ? "-wide" : "")-\(w)x\(h).png"
  try png(name, w, h, opaque: true) { ctx in
    drawWall(ctx, width: CGFloat(w), height: CGFloat(h))
    markSpace(ctx, center: CGPoint(x: CGFloat(w) / 2, y: CGFloat(h) / 2), size: CGFloat(h) * 0.7)
    ctx.setFillColor(white)
    ctx.addPath(pebble())
    ctx.fillPath()
    drawTriangle(ctx, color: iconFill)
  }
}
