"""Draw the StoveRatings icons. No EPA mark, no star, no rating."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1] / "public"
PAPER = (245, 241, 234, 255)
INK = (30, 28, 26, 255)
EMBER = (180, 68, 31, 255)
FONT = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
FONT_TEXT = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")


def draw_plate(draw, box, stroke):
    x0, y0, x1, y1 = box
    width = x1 - x0
    height = y1 - y0
    radius = max(4, width // 12)
    draw.rounded_rectangle(box, radius=radius, fill=PAPER, outline=INK, width=stroke)
    bolt = max(2, width // 22)

    def bolt_at(cx, cy):
        draw.ellipse((cx - bolt, cy - bolt, cx + bolt, cy + bolt), fill=INK)

    inset = max(6, width // 10)
    bolt_at(x0 + inset, y0 + inset)
    bolt_at(x1 - inset, y0 + inset)
    bolt_at(x0 + inset, y1 - inset)
    bolt_at(x1 - inset, y1 - inset)
    body = (
        x0 + width * 0.22,
        y0 + height * 0.30,
        x1 - width * 0.22,
        y1 - height * 0.28,
    )
    draw.rounded_rectangle(body, radius=max(2, width // 40), fill=INK)
    window = (
        body[0] + (body[2] - body[0]) * 0.18,
        body[1] + (body[3] - body[1]) * 0.22,
        body[2] - (body[2] - body[0]) * 0.18,
        body[3] - (body[3] - body[1]) * 0.22,
    )
    draw.rectangle(window, fill=EMBER)


def icon(size, pad_ratio):
    image = Image.new("RGBA", (size, size), PAPER)
    draw = ImageDraw.Draw(image)
    pad = int(size * pad_ratio)
    stroke = max(2, size // 48)
    draw_plate(draw, (pad, pad, size - pad - 1, size - pad - 1), stroke)
    return image


def save_png(image, name):
    image.save(ROOT / name, "PNG")


def main():
    save_png(icon(180, 0.08), "apple-touch-icon.png")
    save_png(icon(192, 0.08), "icon-192.png")
    save_png(icon(512, 0.08), "icon-512.png")
    save_png(icon(512, 0.22), "icon-maskable-512.png")
    ico_base = icon(48, 0.06)
    ico_base.save(
        ROOT / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=[icon(16, 0.04), icon(32, 0.06)],
    )

    og = Image.new("RGB", (1200, 630), PAPER[:3])
    draw = ImageDraw.Draw(og)
    plate = icon(420, 0.08).convert("RGB")
    og.paste(plate, (70, 105))
    title = ImageFont.truetype(str(FONT), 84)
    body = ImageFont.truetype(str(FONT_TEXT), 36)
    draw.text((540, 190), "StoveRatings", font=title, fill=INK[:3])
    draw.text((540, 310), "EPA test numbers", font=body, fill=INK[:3])
    draw.text((540, 370), "Snapshot 2026-10-23", font=body, fill=(91, 87, 83))
    og.save(ROOT / "og-image.png", "PNG")


if __name__ == "__main__":
    main()
