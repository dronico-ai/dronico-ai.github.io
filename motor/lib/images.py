"""Images: web copy, tiny copy for particle sampling, and a colour ramp for the particles."""
import base64
import io

from PIL import Image


def _jpeg(im, quality):
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


def ramp_of(im, bins=16):
    """Average colour per luminance bin, so particles take the image's own tones."""
    t = im.copy()
    t.thumbnail((200, 200), Image.LANCZOS)
    acc = [[0, 0, 0, 0] for _ in range(bins)]
    for r, g, b in t.convert("RGB").getdata():
        i = min(bins - 1, int((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 * bins))
        acc[i][0] += r; acc[i][1] += g; acc[i][2] += b; acc[i][3] += 1
    ramp = [[round(a[0] / a[3]), round(a[1] / a[3]), round(a[2] / a[3])] if a[3] else None for a in acc]
    for i in range(bins):
        if ramp[i] is None:
            j = next((k for k in range(i, bins) if ramp[k]), None)
            h = next((k for k in range(i, -1, -1) if ramp[k]), None)
            ramp[i] = ramp[j] if j is not None else ramp[h]
    return ramp


def process(src, max_size=1080, quality=86):
    """Return (jpeg_bytes, info) where info has tiny (data URI), ramp, aspect, w, h."""
    im = Image.open(src).convert("RGB")
    if max(im.size) > max_size:
        im.thumbnail((max_size, max_size), Image.LANCZOS)
    tiny = im.copy()
    tiny.thumbnail((200, 200), Image.LANCZOS)
    info = {
        "tiny": "data:image/jpeg;base64," + base64.b64encode(_jpeg(tiny, 82)).decode(),
        "ramp": ramp_of(im),
        "aspect": round(im.width / im.height, 4),
        "w": im.width,
        "h": im.height,
    }
    return _jpeg(im, quality), info
