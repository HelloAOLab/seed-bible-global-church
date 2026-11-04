"""The pixel diff for scripts/parity.ts: for every <vp>-<screen>-theirs.png beside its -ours.png, the share of pixels
that differ (per channel > 25) and a -diff.png with the differences in red, plus a -pair.png side by side.
Needs Pillow:  python3 scripts/parity-diff.py [dir]"""
import sys, pathlib
from PIL import Image, ImageChops

d = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "parity")
for theirs in sorted(d.glob("*-theirs.png")):
    ours = theirs.with_name(theirs.name.replace("-theirs.png", "-ours.png"))
    if not ours.exists():
        continue
    a, b = Image.open(theirs).convert("RGB"), Image.open(ours).convert("RGB")
    w, h = min(a.width, b.width), min(a.height, b.height)
    a, b = a.crop((0, 0, w, h)), b.crop((0, 0, w, h))
    mask = ImageChops.difference(a, b).convert("L").point(lambda v: 255 if v > 25 else 0)
    n = sum(1 for v in mask.getdata() if v)
    red = Image.new("RGB", (w, h), (230, 40, 40))
    diff = Image.composite(red, a.convert("L").convert("RGB"), mask)
    diff.save(theirs.with_name(theirs.name.replace("-theirs.png", "-diff.png")))
    pair = Image.new("RGB", (w * 2 + 8, h), (255, 255, 255))
    pair.paste(a, (0, 0)); pair.paste(b, (w + 8, 0))
    pair.save(theirs.with_name(theirs.name.replace("-theirs.png", "-pair.png")))
    print(f"{theirs.name.replace('-theirs.png', ''):28s} {100 * n / (w * h):5.1f}% of pixels differ")
