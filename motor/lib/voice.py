"""Narration: synthesize script lines with Kokoro, build the timeline, cut audio per chapter.

Every line is synthesized on its own (and cached by voice, speed and text), trimmed, and
joined with the script's pauses. Sub-cues and sentence captions are timed from pauses in
the audio (see timing.py). The finished narration is cut at the silence between chapters so
the player can decode one chapter at a time.
"""
import hashlib
import pathlib
import re
import subprocess
import wave

import numpy as np

from timing import SR, frame_rms, time_at_index, trim

LEAD_IN = 0.4   # silence before the first word
ENV_FPS = 30    # loudness envelope rate for the visuals
LANG_OF = {"a": "en-us", "b": "en-gb", "e": "es", "f": "fr-fr", "i": "it", "p": "pt-br", "h": "hi"}
SENT = re.compile(r"(?<=[.?!])\s+")


class Voices:
    def __init__(self, model_dir, cache_dir):
        self.model_dir = pathlib.Path(model_dir)
        self.cache = pathlib.Path(cache_dir)
        self.cache.mkdir(parents=True, exist_ok=True)
        self._k = None

    def _kokoro(self):
        if self._k is None:
            from kokoro_onnx import Kokoro
            self._k = Kokoro(str(self.model_dir / "kokoro-v1.0.onnx"), str(self.model_dir / "voices-v1.0.bin"))
        return self._k

    def available(self):
        return set(self._kokoro().get_voices())

    def say(self, text, voice, speed):
        key = hashlib.sha1(f"{voice}|{speed}|{text}".encode()).hexdigest()[:20]
        f = self.cache / f"{key}.npy"
        if f.exists():
            return np.load(f)
        lang = LANG_OF.get(voice[0], "en-us")
        audio, sr = self._kokoro().create(text, voice=voice, speed=speed, lang=lang)
        assert sr == SR, sr
        a = trim(np.asarray(audio, dtype=np.float32))
        n = int(0.008 * SR)  # 8 ms fades against clicks
        ramp = np.linspace(0, 1, n, dtype=np.float32)
        a[:n] *= ramp
        a[-n:] *= ramp[::-1]
        np.save(f, a)
        return a


def label_of(voice_id):
    return voice_id.split("_", 1)[-1].replace("_", " ").title()


def narrate(lines, voice, speed, voices, log=print):
    """Return (audio float32, timeline dict, cut sample indices at chapter breaks)."""
    chunks = [np.zeros(int(LEAD_IN * SR), dtype=np.float32)]
    t = LEAD_IN
    out, cuts = [], [0]
    for i, ln in enumerate(lines):
        a = voices.say(ln["say"], voice, speed)
        dur = len(a) / SR
        if i and "chapter" in ln:  # cut in the middle of the silence before a new chapter
            prev_end = out[-1]["end"]
            cuts.append(int(round((prev_end + t) / 2 * SR)))
        e = {"start": round(t, 3), "end": round(t + dur, 3), "caption": ln["caption"]}
        for k in ("chapter", "music", "cue"):
            if k in ln:
                e[k] = ln[k]
        if ln.get("subcues"):
            e["subcues"] = [{"t": round(t + time_at_index(ln["say"], s["idx"], dur, a), 3), "cue": s["cue"]} for s in ln["subcues"]]
        say_s, cap_s = SENT.split(ln["say"]), SENT.split(ln["caption"])
        if len(say_s) > 1 and len(say_s) == len(cap_s):
            caps, pos = [{"t": e["start"], "text": cap_s[0]}], 0
            for s_say, s_cap in zip(say_s[1:], cap_s[1:]):
                pos = ln["say"].find(s_say, pos + 1)
                caps.append({"t": round(t + time_at_index(ln["say"], pos, dur, a) + 0.05, 3), "text": s_cap})
            e["caps"] = caps
        out.append(e)
        chunks.append(a)
        chunks.append(np.zeros(int(ln["gap"] * SR), dtype=np.float32))
        t += dur + ln["gap"]
        log(f"    {voice} {i + 1:2d}/{len(lines)} {dur:5.2f}s  {ln['say'][:56]}")
    full = np.concatenate(chunks)
    full = full / max(1e-6, float(np.abs(full).max())) * 0.89
    hop = SR // ENV_FPS
    r = frame_rms(full, hop)
    r = np.clip(r / np.percentile(r[r > 0], 97), 0, 1) ** 0.8
    env = "".join(np.base_repr(int(round(v * 35)), 36).lower() for v in r)
    tl = {"duration": round(len(full) / SR, 3), "envFps": ENV_FPS, "env": env, "lines": out}
    return full, tl, cuts


def write_segments(audio, cuts, out_dir, prefix, bitrate="64k"):
    """Cut audio at `cuts` (sample indices), encode each piece to MP3. Returns [{t, path}]."""
    out_dir = pathlib.Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2")
    segs = []
    for k, i0 in enumerate(cuts):
        i1 = cuts[k + 1] if k + 1 < len(cuts) else len(pcm)
        wav = out_dir / f".{prefix}-{k}.wav"
        mp3 = out_dir / f"{prefix}-{k}.mp3"
        with wave.open(str(wav), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm[i0:i1].tobytes())
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav),
                        "-codec:a", "libmp3lame", "-b:a", bitrate, str(mp3)], check=True)
        wav.unlink()
        segs.append({"t": round(i0 / SR, 4), "path": mp3})
    return segs
