"""Draw the StoveRatings Ember Bars social image.

Favicon, apple-touch, PWA icons, and site.webmanifest in public/ are the
design-kit files. This script refreshes public/og-image.png only.
"""

from pathlib import Path
from tempfile import TemporaryDirectory

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
PAPER = (245, 241, 234)
INK = (30, 28, 26)
SOOT = (91, 87, 83)
CHARCOAL = (42, 36, 32)
EMBER = (180, 68, 31)
EMBER_MID = (217, 119, 58)


def ttf_from_woff2(woff2, dest):
    font = TTFont(woff2)
    font.flavor = None
    font.save(dest)
    return dest


def draw_mark(draw, origin, size):
    x, y = origin
    scale = size / 64

    def box(bx, by, bw, bh):
        return (
            x + bx * scale,
            y + by * scale,
            x + (bx + bw) * scale,
            y + (by + bh) * scale,
        )

    draw.rounded_rectangle(box(0, 0, 64, 64), radius=14 * scale, fill=CHARCOAL)
    draw.rounded_rectangle(box(12, 34, 10, 18), radius=3 * scale, fill=EMBER)
    draw.rounded_rectangle(box(27, 24, 10, 28), radius=3 * scale, fill=EMBER_MID)
    draw.rounded_rectangle(box(42, 14, 10, 38), radius=3 * scale, fill=PAPER)


def main():
    with TemporaryDirectory() as tmp_name:
        tmp = Path(tmp_name)
        display = ttf_from_woff2(
            PUBLIC / "fonts" / "roboto-slab-latin-700-normal.woff2",
            tmp / "roboto-slab-700.ttf",
        )
        body = ttf_from_woff2(
            PUBLIC / "fonts" / "ibm-plex-sans-latin-400-normal.woff2",
            tmp / "ibm-plex-sans-400.ttf",
        )
        write_og(display, body)


def write_og(display, body):

    width, height = 1200, 630
    image = Image.new("RGB", (width, height), PAPER)
    draw = ImageDraw.Draw(image)
    mark = 300
    draw_mark(draw, (88, (height - mark) // 2), mark)

    title_font = ImageFont.truetype(str(display), 78)
    sub_font = ImageFont.truetype(str(body), 36)
    title = "StoveRatings"
    subtitle = "EPA test numbers"
    title_box = draw.textbbox((0, 0), title, font=title_font)
    sub_box = draw.textbbox((0, 0), subtitle, font=sub_font)
    gap = 18
    block = (title_box[3] - title_box[1]) + gap + (sub_box[3] - sub_box[1])
    text_x = 88 + mark + 64
    text_y = (height - block) / 2
    draw.text((text_x, text_y - title_box[1]), title, font=title_font, fill=INK)
    draw.text(
        (text_x, text_y + (title_box[3] - title_box[1]) + gap - sub_box[1]),
        subtitle,
        font=sub_font,
        fill=SOOT,
    )
    image.save(PUBLIC / "og-image.png", "PNG")


if __name__ == "__main__":
    main()
