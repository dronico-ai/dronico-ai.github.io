#!/usr/bin/env python3
"""Build a talking presentation from a show folder, and keep the landing page up to date.

    python3 motor/build.py motor/shows/<name>            # web version into /<slug>/
    python3 motor/build.py motor/shows/<name> --single   # plus a single-file copy for sharing
    python3 motor/build.py --landing                     # only rebuild the landing page

Run motor/setup.sh once per fresh workspace first. See motor/README.md.
"""
import argparse
import base64
import html
import json
import pathlib
import shutil
import sys
import time

MOTOR = pathlib.Path(__file__).resolve().parent
REPO = MOTOR.parent
ENGINE = MOTOR / "engine"
CACHE = MOTOR / ".cache"
sys.path.insert(0, str(MOTOR / "lib"))

import guion  # noqa: E402
import images as imagesmod  # noqa: E402
import landing  # noqa: E402
from voice import Voices, label_of, narrate, write_segments  # noqa: E402

LANG_TAG = {"en": "EN", "es": "ES", "fr": "FR", "it": "IT", "pt": "PT"}


def fail(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


def split_texts(meta):
    """Front matter -> page texts; image.<key>.<field> lines go under texts['images']."""
    texts, imgs = {}, {}
    for k, v in meta.items():
        if k.startswith("image."):
            parts = k.split(".")
            if len(parts) != 3:
                fail(f"front matter key '{k}' should look like image.<name>.alt / .title / .caption")
            imgs.setdefault(parts[1], {})[parts[2]] = v
        else:
            texts[k] = v
    if imgs:
        texts["images"] = imgs
    return texts


def render_page(show, lang0, base_url, og_image):
    t = show["langs"][lang0]["texts"]
    esc = lambda s: html.escape(str(s or ""), quote=True)
    page = (ENGINE / "page.html").read_text(encoding="utf-8")
    og = f'<meta property="og:image" content="{esc(og_image)}">' if og_image else ""
    small = {"{{lang}}": lang0, "{{title}}": esc(t["title"]),
             "{{description}}": esc(t.get("description") or t.get("lede")), "{{og_image}}": og}
    for k, v in small.items():
        page = page.replace(k, v)
    data = json.dumps(show, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    page = page.replace("{{css}}", (ENGINE / "player.css").read_text(encoding="utf-8"))
    page = page.replace("{{show_json}}", data)
    page = page.replace("{{js}}", (ENGINE / "player.js").read_text(encoding="utf-8"))
    return page


def build(show_dir, single=False, update_landing=True):
    t0 = time.time()
    show_dir = pathlib.Path(show_dir).resolve()
    cfg_path = show_dir / "show.json"
    if not cfg_path.exists():
        fail(f"{cfg_path} not found")
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    slug, speed = cfg["slug"], float(cfg.get("speed", 0.95))
    if not slug or "/" in slug or slug in ("motor", "img", "audio"):
        fail(f"bad slug '{slug}'")
    site = landing.load(MOTOR / "site.json")
    out = REPO / slug
    audio_dir, img_dir = out / "audio", out / "img"
    for d in (audio_dir, img_dir):
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True)
    print(f"Building {slug} -> {out.relative_to(REPO)}/")

    imgs, img_bytes = {}, {}
    for key, fname in cfg.get("images", {}).items():
        data, info = imagesmod.process(show_dir / fname)
        (img_dir / f"{key}.jpg").write_bytes(data)
        imgs[key] = {"src": f"img/{key}.jpg", **info}
        img_bytes[key] = data
        print(f"  image {key}: {info['w']}x{info['h']}")

    voices = Voices(CACHE / "models", CACHE / "tts")
    avail = voices.available()
    langs, first_audio = {}, {}
    for lang, lc in cfg["languages"].items():
        try:
            parsed = guion.parse(show_dir / lc["script"])
        except guion.GuionError as e:
            fail(str(e))
        missing = guion.image_refs(parsed) - imgs.keys()
        if missing:
            fail(f"{lc['script']} uses images not listed in show.json: {', '.join(sorted(missing))}")
        order = lc["voices"]
        bad = [v for v in order if v not in avail]
        if bad:
            fail(f"unknown voices {bad}; see motor/README.md for the list")
        entry = {"texts": split_texts(parsed["meta"]), "order": order, "voices": {}}
        print(f"  [{lang}] {len(parsed['lines'])} lines, voices {', '.join(order)}")
        for v in order:
            audio, tl, cuts = narrate(parsed["lines"], v, speed, voices, log=lambda s: None)
            segs = write_segments(audio, cuts, audio_dir, f"{lang}-{v}", "64k")
            entry["voices"][v] = {"label": label_of(v), "timeline": tl,
                                  "segs": [{"t": s["t"], "url": f"audio/{s['path'].name}"} for s in segs]}
            first_audio.setdefault(lang, (v, audio, cuts))
            print(f"    {v}: {tl['duration']:.1f}s in {len(segs)} audio parts")
        langs[lang] = entry

    lang0 = next(iter(cfg["languages"]))
    show = {"slug": slug, "languages": list(cfg["languages"]), "langs": langs, "images": imgs,
            "single": f"{slug}.html" if single else None}
    key0 = cfg.get("landing_image") or next(iter(imgs), None)
    og = f"{site['base_url']}/{slug}/img/{key0}.jpg" if key0 else ""
    (out / "index.html").write_text(render_page(show, lang0, site["base_url"], og), encoding="utf-8")

    if single:
        # One voice per language, lighter audio and images, everything embedded.
        solo = json.loads(json.dumps(show))
        solo["single"] = None
        tmp = CACHE / "single" / slug
        if tmp.exists():
            shutil.rmtree(tmp)
        for lang, (v, audio, cuts) in first_audio.items():
            segs = write_segments(audio, cuts, tmp, f"{lang}-{v}", "32k")
            e = solo["langs"][lang]
            e["order"] = [v]
            e["voices"] = {v: dict(e["voices"][v], segs=[{"t": s["t"], "b64": base64.b64encode(s["path"].read_bytes()).decode()} for s in segs])}
        for key in solo["images"]:
            data, _ = imagesmod.process(show_dir / cfg["images"][key], max_size=720, quality=80)
            solo["images"][key]["src"] = "data:image/jpeg;base64," + base64.b64encode(data).decode()
        page = render_page(solo, lang0, site["base_url"], og)
        (out / f"{slug}.html").write_text(page, encoding="utf-8")
        print(f"  single file: {slug}.html ({len(page.encode()) / 2**20:.2f} MiB)")
    elif (out / f"{slug}.html").exists():
        (out / f"{slug}.html").unlink()

    if update_landing:
        t = langs[lang0]["texts"]
        tags = " / ".join(LANG_TAG.get(l, l.upper()) for l in cfg["languages"])
        meta = t.get("eyebrow", "") + (f" · {tags}" if len(cfg["languages"]) > 1 else "")
        img = imgs.get(key0, {})
        alt = (t.get("images", {}).get(key0, {}) or {}).get("alt", "")
        landing.upsert(site, {"slug": slug, "title": t["title"], "meta": meta, "blurb": t.get("lede", ""),
                              "image": f"{slug}/img/{key0}.jpg" if key0 else "", "alt": alt,
                              "w": img.get("w", 1080), "h": img.get("h", 1080)})
        landing.save(MOTOR / "site.json", site)
        landing.render(site, ENGINE / "landing.html", REPO / "index.html")
        print("  landing page updated")
    print(f"Done in {time.time() - t0:.0f}s. Page: {site['base_url']}/{slug}/")


def main():
    ap = argparse.ArgumentParser(description="Build a talking presentation (see motor/README.md).")
    ap.add_argument("show", nargs="?", help="show folder, e.g. motor/shows/talking-light")
    ap.add_argument("--single", action="store_true", help="also write a single-file copy for sharing")
    ap.add_argument("--no-landing", action="store_true", help="do not touch the landing page")
    ap.add_argument("--landing", action="store_true", help="only rebuild the landing page from site.json")
    args = ap.parse_args()
    if args.landing:
        landing.render(landing.load(MOTOR / "site.json"), ENGINE / "landing.html", REPO / "index.html")
        print("Landing page rebuilt.")
        return
    if not args.show:
        ap.error("give a show folder, or --landing")
    build(args.show, single=args.single, update_landing=not args.no_landing)


if __name__ == "__main__":
    main()
