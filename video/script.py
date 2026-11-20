"""Turn an ingested story into a short narration script.

Preferred: the curation agent writes `script.json` from the story's real facts
(see README for the format). Fallback: an extractive script from key facts, so the
pipeline still runs unattended when no hand-written script exists.
"""
from __future__ import annotations
import re

MAX_BEAT_WORDS = 20
WORD_BUDGET = 75  # ~30 s of narration at the default rate


def _trim(sentence: str, n=MAX_BEAT_WORDS) -> str:
    s = re.sub(r"\s+", " ", sentence).strip()
    s = re.sub(r"#\w+", "", s).strip()
    words = s.split()
    if len(words) <= n:
        return s if s.endswith((".", "!", "?")) else s + "."
    cut = " ".join(words[:n])
    m = re.search(r"^(.*[,;:—-])\s", cut)
    return (m.group(1).rstrip(",;:—- ") if m and len(m.group(1).split()) > n * 0.6 else cut) + "."


def _stat(sentence: str):
    m = re.search(r"(?<![\w-])(\$?\d[\d,]*\.?\d*\s?(?:%|x|×|GB/s|GB|TB|MB|ms)?)(?![\w-])", sentence)
    if m and re.search(r"\d", m.group(1)) and not re.fullmatch(r"(19|20)\d\d", m.group(1).strip()):
        return m.group(1).replace(" ", "")
    return None


def auto_script(story: dict, max_beats=3) -> dict:
    """Fallback: our own feed summary first (already curated), then the strongest facts from the page."""
    summary = story.get("feedSummary") or (story.get("article") or {}).get("metaDescription") or ""
    from ingest import key_facts
    excerpt = (story.get("article") or {}).get("excerpt") or ""
    facts = key_facts(" ".join(filter(None, [(story.get("post") or {}).get("text"), excerpt]))) if excerpt else story.get("facts", [])
    facts = [f for f in facts if len(f.split()) >= 6]
    lines = ([summary] if summary else []) + facts
    beats = []
    used = len(story["title"].split())
    for i, f in enumerate(lines[:max_beats]):
        say = _trim(f, min(MAX_BEAT_WORDS, WORD_BUDGET - used))
        used += len(say.split())
        if used > WORD_BUDGET + 5 or len(say.split()) < 6:
            break
        beat = {"say": say, "visual": i + 1}
        st = _stat(f) if i else None
        if st and len(st) <= 8:
            beat["stat"] = st
        beats.append(beat)
    return {"hook": story["title"], "beats": beats, "outro": "Full story on the dashboard.", "auto": True}
