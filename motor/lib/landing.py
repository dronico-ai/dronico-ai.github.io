"""The site's landing page, generated from motor/site.json."""
import html
import json
import pathlib

CARD = """    <a class="work" href="{slug}/">
      <img src="{image}" alt="{alt}" width="{w}" height="{h}"{lazy}>
      <p class="meta">{meta}</p>
      <h2>{title}</h2>
      <p class="blurb">{blurb}</p>
    </a>"""


def load(path):
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))


def save(path, site):
    pathlib.Path(path).write_text(json.dumps(site, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def upsert(site, entry):
    for i, e in enumerate(site["shows"]):
        if e["slug"] == entry["slug"]:
            site["shows"][i] = entry
            return
    site["shows"].append(entry)


def render(site, template, out):
    esc = lambda s: html.escape(str(s or ""), quote=True)
    cards = [
        CARD.format(slug=esc(e["slug"]), image=esc(e["image"]), alt=esc(e.get("alt")), meta=esc(e.get("meta")),
                    title=esc(e["title"]), blurb=esc(e.get("blurb")), w=e.get("w", 1080), h=e.get("h", 1080),
                    lazy="" if i == 0 else ' loading="lazy"')
        for i, e in enumerate(site["shows"])
    ]
    page = pathlib.Path(template).read_text(encoding="utf-8")
    for k, v in {"{{title}}": esc(site["title"]), "{{tagline}}": esc(site.get("tagline")),
                 "{{footer}}": esc(site.get("footer")), "{{cards}}": "\n".join(cards)}.items():
        page = page.replace(k, v)
    pathlib.Path(out).write_text(page, encoding="utf-8")
