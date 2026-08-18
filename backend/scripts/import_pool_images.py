"""Download the pool's exercise illustrations, process them, and store OUR OWN copies.

Nothing is hotlinked: the source repository could move, rename or vanish, and a program screen that
silently loses its pictures is worse than one that never had them. Images land in
`web/public/exercises/<slug>-N.webp` and ship with the app from our own domain.

Source: github.com/everkinetic/data — line-art illustrations, two frames per movement (start and
end position), CC BY-SA 4.0. That licence permits commercial use and requires attribution wherever
the image is shown; our processed copies stay under the same licence. The attribution string is
stored in the DB next to the URL (`exercise_pool.image_attribution`) precisely so a URL can never
travel without its credit.

Processing: trim the white margin, pad to a square, resize to 640px, convert to lossless webp.
Line art on a flat background compresses far better lossless than lossy, and lossy artefacts show
up as grey fuzz along every line.

Run (network + Pillow required, not part of CI):
    uv run python scripts/import_pool_images.py           # only fetch what is missing
    uv run python scripts/import_pool_images.py --force   # re-fetch everything
"""

from __future__ import annotations

import argparse
import json
import sys
from io import BytesIO
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MAP_FILE = ROOT / "data" / "exercise_pool" / "images.json"
OUT_DIR = ROOT.parent / "web" / "public" / "exercises"

SOURCE_JSON = "https://raw.githubusercontent.com/everkinetic/data/main/exercises.json"
SOURCE_RAW = "https://raw.githubusercontent.com/everkinetic/data/main/src/images-web/"

# The same artist's work is also on Wikimedia Commons — 1090 files against the mirror's 511, and
# correct where the mirror is broken (it serves one image for two different exercises, and one file
# for both frames of another). Commons wants a descriptive User-Agent and rasterises SVG for you.
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
COMMONS_UA = "workout-storage-catalogue/1.0 (https://aim-journal.com; contact@aim-journal.com)"

SIZE = 640
PADDING = 24


def fetch(url: str, *, agent: str | None = None) -> bytes:
    request = Request(url, headers={"User-Agent": agent} if agent else {})
    with urlopen(request, timeout=60) as resp:  # noqa: S310 - fixed https hosts
        return bytes(resp.read())


def commons_frames(files: list[str], width: int = 960) -> list[bytes]:
    """Raster bytes for a list of Commons file titles, in the order given.

    Commons renders SVG to PNG on request, so a vector original costs nothing extra here and comes
    out cleaner than the mirror's bitmaps.
    """
    query = urlencode(
        {
            "action": "query",
            "titles": "|".join(files),
            "prop": "imageinfo",
            "iiprop": "url",
            "iiurlwidth": str(width),
            "format": "json",
        }
    )
    meta = json.loads(fetch(f"{COMMONS_API}?{query}", agent=COMMONS_UA).decode("utf-8"))
    by_title = {}
    for page in meta["query"]["pages"].values():
        info = (page.get("imageinfo") or [{}])[0]
        url = info.get("thumburl") or info.get("url")
        if url:
            by_title[page["title"]] = url
    return [fetch(by_title[f], agent=COMMONS_UA) for f in files if f in by_title]


def process_photo(raw: bytes) -> bytes:
    """Trim, square-pad and downscale a COLOUR illustration, keeping its colours.

    The other pipeline reduces a drawing to a black alpha mask, which is right for pure line art
    and destroys anything else: wger's anatomical renders carry a red highlight on the working
    muscle, and masking them leaves a black blob. These keep their own white ground and are marked
    `style: photo` so the app does not invert them in dark theme.
    """
    img = Image.open(BytesIO(raw)).convert("RGB")
    grey = img.convert("L").point(lambda p: 0 if p > 243 else 255)
    box = grey.getbbox()
    if box:
        img = img.crop(box)
    inner = SIZE - PADDING * 2
    ratio = min(inner / img.width, inner / img.height)
    img = img.resize(
        (max(1, round(img.width * ratio)), max(1, round(img.height * ratio))), Image.LANCZOS
    )
    canvas = Image.new("RGB", (SIZE, SIZE), (255, 255, 255))
    canvas.paste(img, ((SIZE - img.width) // 2, (SIZE - img.height) // 2))
    buf = BytesIO()
    canvas.save(buf, format="WEBP", quality=88, method=6)
    return buf.getvalue()


def process(raw: bytes) -> bytes:
    """Trim, square-pad and downscale one frame to a lossless webp on a transparent background.

    Transparent rather than white: the app renders these on a card that is near-black in dark
    theme, and a baked-in white rectangle would sit on it as a glaring slab. The line art itself is
    black, so the app tints it via CSS instead of us shipping two colour variants.
    """
    img = Image.open(BytesIO(raw)).convert("RGBA")
    # Flatten onto white first. The GitHub mirror ships opaque white-background bitmaps, but a
    # Commons SVG rasterises to black ink on a TRANSPARENT ground — read as luminance that is black
    # everywhere, and the ink mask below came out fully opaque, i.e. a solid black square.
    if img.getchannel("A").getextrema()[0] < 255:
        flat = Image.new("RGBA", img.size, (255, 255, 255, 255))
        flat.alpha_composite(img)
        img = flat
    # The source frames are black lines on white; anything not near-white is ink.
    flat = img.convert("L").point(lambda p: 0 if p > 235 else 255)
    box = flat.getbbox()
    if box:
        img = img.crop(box)
    # White -> transparent, keeping the ink as an opaque black alpha mask.
    grey = img.convert("L")
    alpha = grey.point(lambda p: 255 - p)
    ink = Image.new("RGBA", img.size, (0, 0, 0, 255))
    ink.putalpha(alpha)

    inner = SIZE - PADDING * 2
    # Scale to fit the box in BOTH directions. `thumbnail` only ever shrinks, so a small source
    # (Commons serves some originals at a few hundred pixels) stayed small and rendered as a
    # postage stamp next to the others.
    ratio = min(inner / ink.width, inner / ink.height)
    ink = ink.resize(
        (max(1, round(ink.width * ratio)), max(1, round(ink.height * ratio))), Image.LANCZOS
    )
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(ink, ((SIZE - ink.width) // 2, (SIZE - ink.height) // 2), ink)

    buf = BytesIO()
    canvas.save(buf, format="WEBP", lossless=True, quality=100, method=6)
    return buf.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser(description="Import exercise pool illustrations")
    parser.add_argument("--force", action="store_true", help="re-download and re-process existing")
    args = parser.parse_args()

    mapping = json.loads(MAP_FILE.read_text(encoding="utf-8"))["map"]
    source = {e["name"]: e for e in json.loads(fetch(SOURCE_JSON).decode("utf-8"))}
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    written = skipped = 0
    problems: list[str] = []
    for slug, spec in sorted(mapping.items()):
        if isinstance(spec, dict) and spec.get("source") == "commons":
            wanted = [(i, None) for i in range(1, len(spec["files"][:2]) + 1)]
            if all((OUT_DIR / f"{slug}-{i}.webp").exists() for i, _ in wanted) and not args.force:
                skipped += len(wanted)
                continue
            try:
                frames = commons_frames(spec["files"][:2])
            except Exception as exc:  # noqa: BLE001 - one bad movement must not abort the run
                problems.append(f"{slug}: commons fetch failed: {exc}")
                continue
            for index, raw in enumerate(frames, start=1):
                (OUT_DIR / f"{slug}-{index}.webp").write_bytes(process(raw))
                written += 1
            continue

        if isinstance(spec, dict) and spec.get("source") == "wger":
            urls = spec["urls"][:2]
            if (
                all((OUT_DIR / f"{slug}-{i}.webp").exists() for i in range(1, len(urls) + 1))
                and not args.force
            ):
                skipped += len(urls)
                continue
            convert = process if spec.get("style") == "ink" else process_photo
            for index, url in enumerate(urls, start=1):
                try:
                    (OUT_DIR / f"{slug}-{index}.webp").write_bytes(
                        convert(fetch(url, agent=COMMONS_UA))
                    )
                except Exception as exc:  # noqa: BLE001 - one bad frame must not abort the run
                    problems.append(f"{slug} frame {index}: {exc}")
                    continue
                written += 1
            continue

        entry = source.get(spec)
        if entry is None or not entry.get("img"):
            problems.append(f"{slug}: source movement {spec!r} has no images")
            continue
        # Two frames is the contract the app renders against; extra frames in the source are
        # alternate angles we do not use.
        for index, path in enumerate(entry["img"][:2], start=1):
            out = OUT_DIR / f"{slug}-{index}.webp"
            if out.exists() and not args.force:
                skipped += 1
                continue
            name = path.rsplit("/", 1)[-1]
            try:
                out.write_bytes(process(fetch(SOURCE_RAW + name)))
            except Exception as exc:  # noqa: BLE001 - one bad frame must not abort the run
                problems.append(f"{slug} frame {index} ({name}): {exc}")
                continue
            written += 1

    total = sum(f.stat().st_size for f in OUT_DIR.glob("*.webp"))
    print(f"written {written}, unchanged {skipped}, total on disk {total / 1_000_000:.1f} MB")
    for p in problems:
        print(f"WARN {p}", file=sys.stderr)


if __name__ == "__main__":
    main()
