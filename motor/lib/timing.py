"""Timing inside a spoken line.

The speech model gives no word timestamps, so: find clear pauses (>= 140 ms), match them
in order to the line's internal punctuation, and use them as anchors for a piecewise-linear
map from character position to time. Short silences inside words (consonant closures such
as the gap in "write code") are ignored by the length rule.
"""
import numpy as np

SR = 24000
HOP = 240  # 10 ms


def frame_rms(a, hop=HOP):
    n = len(a) // hop
    if n == 0:
        return np.zeros(0)
    return np.sqrt(np.mean(a[: n * hop].reshape(n, hop) ** 2, axis=1))


def trim(a, pad=0.04):
    """Cut leading and trailing silence, keeping a small pad."""
    r = frame_rms(a)
    if not len(r):
        return a
    thr = max(r.max() * 0.03, 1e-4)
    idx = np.where(r > thr)[0]
    if len(idx) == 0:
        return a
    s = max(0, idx[0] * HOP - int(pad * SR))
    e = min(len(a), (idx[-1] + 1) * HOP + int(pad * SR))
    return a[s:e]


def strong_pauses(a, min_len=0.14):
    r = frame_rms(a)
    if not len(r):
        return []
    thr = r.max() * 0.045
    out, run = [], 0
    for i, s in enumerate(r < thr):
        if s:
            run += 1
        else:
            if run * HOP / SR >= min_len and i - run > 3:
                out.append(i * HOP / SR)  # speech resumes here
            run = 0
    return out


def anchors(text, dur, pauses):
    pts = [(0, 0.0)]
    used = -1
    for i, ch in enumerate(text[:-1]):
        if ch not in ",.;:?!":
            continue
        k = i + 1
        while k < len(text) and text[k] == " ":
            k += 1
        est = dur * k / len(text)
        best = None
        for j, p in enumerate(pauses):
            if j <= used or abs(p - est) > 0.7:
                continue
            if best is None or abs(p - est) < abs(pauses[best] - est):
                best = j
        if best is not None and pauses[best] > pts[-1][1]:
            pts.append((k, pauses[best]))
            used = best
    pts.append((len(text), dur))
    return pts


def time_at_index(text, idx, dur, audio):
    """Seconds into the line's audio where the character at `idx` is spoken (slightly early)."""
    pts = anchors(text, dur, strong_pauses(audio))
    for (c0, t0), (c1, t1) in zip(pts, pts[1:]):
        if c0 <= idx <= c1:
            t = t0 + (idx - c0) / max(1, c1 - c0) * (t1 - t0)
            return max(0.0, t - 0.05)
    return dur * idx / max(1, len(text))
