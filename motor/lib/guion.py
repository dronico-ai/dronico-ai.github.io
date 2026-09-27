"""Parser for the script format (guion). See motor/README.md for the full description.

    ---
    title: Hello, I'm Claude
    lede: A short description.
    ---
    ## First chapter | warm
    [hi] Hi. I'm Claude.
    [@sphere] Something new, {@wave}and it moves.
    I had no [[ElevenLabs|Eleven Labs]] to lean on. <pause 1.2>
"""
import pathlib
import re

MOODS = ("warm", "inward", "hush", "resolve")
SHAPES = ("drift", "wave", "ring", "sphere", "layers", "many", "compass", "heart", "image")
DEFAULT_GAP = 0.45
CHAPTER_GAP = 1.5
TOKEN = re.compile(r"\[\[([^\]|]+)\|([^\]]+)\]\]|\{([^}]*)\}")
PAUSE = re.compile(r"<pause\s+([0-9]*\.?[0-9]+)\s*s?>\s*$", re.I)


class GuionError(ValueError):
    pass


def parse_cue(s, where):
    s = s.strip()
    if not s:
        raise GuionError(f"{where}: empty cue")
    if not s.startswith("@"):
        return {"type": "text", "value": s}
    parts = s[1:].split()
    name = parts[0].lower() if parts else ""
    if name not in SHAPES:
        raise GuionError(f"{where}: unknown shape @{name}; use one of " + ", ".join("@" + x for x in SHAPES))
    if name == "image":
        if len(parts) < 2:
            raise GuionError(f"{where}: @image needs the image name, e.g. [@image portrait]")
        return {"type": "image", "src": parts[1]}
    if name == "compass" and len(parts) > 1:
        try:
            return {"type": "compass", "off": float(parts[1])}
        except ValueError:
            raise GuionError(f"{where}: @compass takes an angle in radians, e.g. [@compass 0.3]")
    return {"type": name}


def _append(buf, seg):
    seg = re.sub(r"\s+", " ", seg)
    if buf.endswith(" ") and seg.startswith(" "):
        seg = seg.lstrip(" ")
    return buf + seg


def parse(path):
    """Return {"meta": {...}, "lines": [...]} or raise GuionError with file:line context."""
    path = pathlib.Path(path)
    text = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    meta, body, first = {}, text, 1
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end < 0:
            raise GuionError(f"{path.name}: the front matter is not closed with ---")
        for i, ln in enumerate(text[3:end].split("\n")[1:], 2):
            if not ln.strip() or ln.strip().startswith("//"):
                continue
            key, sep, val = ln.partition(":")
            if not sep:
                raise GuionError(f"{path.name}:{i}: expected 'key: value'")
            meta[key.strip()] = val.strip()
        body = text[end + 4:]
        first = text[: end + 4].count("\n") + 1

    lines, pending, mood = [], None, "warm"
    for n, raw in enumerate(body.split("\n"), first):
        where = f"{path.name}:{n}"
        line = raw.strip()
        if not line or line.startswith("//"):
            continue
        if line.startswith("## "):
            title, _, m = line[3:].partition("|")
            m = m.strip().lower()
            if m and m not in MOODS:
                raise GuionError(f"{where}: unknown mood '{m}'; use one of {', '.join(MOODS)}")
            mood = m or mood
            pending = {"title": title.strip(), "mood": mood}
            if lines and not lines[-1].get("gap_set"):
                lines[-1]["gap"] = CHAPTER_GAP
            continue
        if line.startswith("#"):
            continue  # a top-level "# Title" is allowed and ignored

        entry = {"gap": DEFAULT_GAP, "src": where}
        m = PAUSE.search(line)
        if m:
            entry["gap"], entry["gap_set"] = float(m.group(1)), True
            line = line[: m.start()].rstrip()
        if line.startswith("[") and not line.startswith("[["):
            close = line.find("]")
            if close < 0:
                raise GuionError(f"{where}: missing ] after the cue")
            entry["cue"] = parse_cue(line[1:close], where)
            line = line[close + 1:].lstrip()

        say, cap, subs, pos = "", "", [], 0
        for tok in TOKEN.finditer(line):
            seg = line[pos: tok.start()]
            say, cap = _append(say, seg), _append(cap, seg)
            if tok.group(1) is not None:
                cap, say = _append(cap, tok.group(1)), _append(say, tok.group(2))
            else:
                subs.append({"idx": len(say), "cue": parse_cue(tok.group(3), where)})
            pos = tok.end()
        say, cap = _append(say, line[pos:]).strip(), _append(cap, line[pos:]).strip()
        if not say:
            raise GuionError(f"{where}: the line has a cue but nothing to say")
        if "[" in say or "{" in say or "}" in say:
            raise GuionError(f"{where}: stray bracket in '{say}'; cues go in [..] at the start or {{..}} inline")
        entry.update(say=say, caption=cap)
        if subs:
            entry["subcues"] = [{"idx": min(s["idx"], len(say) - 1), "cue": s["cue"]} for s in subs]
        if pending or not lines:
            ch = pending or {"title": "", "mood": mood}
            if ch["title"]:
                entry["chapter"] = ch["title"]
            entry["music"] = ch["mood"]
            pending = None
        lines.append(entry)

    if not lines:
        raise GuionError(f"{path.name}: no spoken lines found")
    if not meta.get("title"):
        raise GuionError(f"{path.name}: the front matter needs at least 'title: ...'")
    return {"meta": meta, "lines": lines}


def image_refs(parsed):
    refs = set()
    for ln in parsed["lines"]:
        for c in [ln.get("cue")] + [s["cue"] for s in ln.get("subcues", [])]:
            if c and c["type"] == "image":
                refs.add(c["src"])
    return refs
