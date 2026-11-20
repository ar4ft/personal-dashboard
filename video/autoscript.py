"""Deterministic, LLM-free narration scripts for Video News.

Used by GitHub Actions when no hand-written `video/scripts/<slug>.json` exists. Builds a hook + 3 beats only from
text we already have: the feed item (title, description, content) and the fetched story.json (post text, article
excerpt, key facts). Extractive: every spoken sentence is a cleaned sentence from those sources, nothing is invented.

    python video/autoscript.py --ids hn:1 x:2 --work /tmp/video-work --scripts video/scripts [--force]

Writes video/scripts/<slug>.json with "auto": true for stories that have no script yet, and skips stories without
enough real text (< MIN_WORDS words of usable sentences), printing why.
"""
from __future__ import annotations
import argparse, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIN_WORDS, TARGET, MAX_WORDS = 70, 80, 90
HOOK_MAX = 10
STOP = set("a an the and or but of to in on for with at by from as is are was were be been it its this that these those "
           "into over than then so via about after before just more most new now how why what who your you we our".split())
BOILER = re.compile(r"cookie|subscribe|sign up|sign in|log in|newsletter|javascript|click|this file contains|bidirectional|"
                    r"unicode|all rights reserved|privacy policy|terms of|advertis|share this|follow us|read more|"
                    r"comments?\b|loading|download (the )?app|accept|copyright|©|discussion\b|thread 🧵|\bRT\b|repo on github|"
                    r"post on x\b|website\b|hn discussion|via @|full post|link in|👇", re.I)
NUM = re.compile(r"(?<![\w.])(?:[$€£]\s?)?\d[\d,]*(?:\.\d+)?(?:\s?(?:%|x|×|k|K|M|B|T|bn|GB/s|GB|TB|MB|KB|ms|s|tok/s|"
                 r"tokens/s|fps|Hz|MHz|GHz|W|kWh|nm|°|times|percent|billion|million|thousand|trillion))?(?![\w])")
EMOJI = re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200d]")


def slug(item_id: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", item_id.lower()).strip("-")


def clean(text: str) -> str:
    t = text or ""
    t = re.sub(r"```.*?```", " ", t, flags=re.S)            # code blocks
    t = re.sub(r"`[^`]*`", " ", t)                           # inline code
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", t)              # images
    t = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", t)           # links -> text
    t = re.sub(r"<[^>]+>", " ", t)                           # html
    t = re.sub(r"https?://\S+|www\.\S+|\b\S+\.(?:com|io|dev|org|app|ai)/\S*", " ", t)
    t = re.sub(r"(?m)^\s*(?:#+|>|[-*+]|\d+[.)])\s+", "", t)  # md headings, quotes, bullets
    t = re.sub(r"[*_~]{1,3}", "", t)
    t = re.sub(r"[@#](\w+)", r"\1", t)                       # handles / hashtags -> words
    t = re.sub(r"\s*\((?:[^()]{0,60})\)", "", t)              # short parentheticals read badly aloud
    t = EMOJI.sub(" ", t)
    t = t.replace("—", ", ").replace("–", "-").replace("→", ", ").replace("•", " ").replace("|", " ")
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"\s+([,.;:!?])", r"\1", t)
    t = re.sub(r"([.!?])[,;:]\s*", r"\1 ", t)
    return t.strip()


def sentences(text: str) -> list[str]:
    # list items and lines without punctuation are separate statements, not one run-on sentence
    lines = [l.strip() for l in (text or "").splitlines() if l.strip()]
    joined = []
    for i, l in enumerate(lines):
        nxt = lines[i + 1] if i + 1 < len(lines) else ""
        is_item = re.match(r"([-*+•]|\d+[.)])\s", l)
        ends = re.search(r"[.!?:;,]$", l)
        # a list item or a short heading-like line is its own statement; hard-wrapped prose is not
        if not ends and (is_item or (len(l.split()) <= 12 and nxt[:1].isupper()) or not nxt):
            l += "."
        joined.append(l)
    text = " ".join(joined)
    t = clean(text)
    # protect decimals and common abbreviations before splitting
    t = re.sub(r"(\d)\.(\d)", r"\1<DOT>\2", t)
    t = re.sub(r"\b(e\.g|i\.e|vs|etc|approx|Mr|Ms|Dr|Inc|Ltd|U\.S|No)\.", lambda m: m.group(1).replace(".", "<DOT>") + "<DOT>", t)
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"“(])", t)
    out = []
    for p in parts:
        s = p.replace("<DOT>", ".").strip(" \"“”'")
        if s and s[-1] not in ".!?":
            s += "."
        s = re.sub(r"[:,]\s*\w+\.$", ".", s)  # dangling "…: Quality." fragments
        out.append(s)
    return out


def usable(s: str) -> bool:
    w = s.split()
    if not 6 <= len(w) <= 45 or BOILER.search(s):
        return False
    if sum(c.isalpha() for c in s) < 0.6 * len(s.replace(" ", "")):
        return False  # mostly symbols/numbers: tables, code, version dumps
    if re.search(r"[{}<>=;$]{2,}|\(\)|::|/\w+/|\\|\.\.\.|…|\s-\s|\.\s+to\s", s):
        return False
    caps = [x for x in w[1:] if x[:1].isupper()]
    if len(caps) > 0.5 * (len(w) - 1):
        return False  # Title Case Run-Ons from menus, nav bars and app-store blurbs
    return True


def words(s: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", s.lower())


def keyset(s: str) -> set[str]:
    return {w for w in words(s) if w not in STOP and len(w) > 2}


ANAPHORA = r"(This|These|That|Those|It|They|He|She|But|And|Also|However|So|Then|Here)\b"
REL = {"that", "which", "who", "while", "where", "when"}
PREP = {"for", "with", "in", "on", "at", "by", "from", "to", "of", "using", "via", "against", "after", "before", "as", "into", "up"}


def cut_phrase(w: list[str], limit: int, min_k: int = 3) -> list[str]:
    """Longest prefix <= limit words that ends right before a relative pronoun or preposition."""
    if len(w) <= limit:
        return w
    def best(group, bad_prev):
        for k in range(min(limit, len(w) - 1), min_k - 1, -1):
            if w[k].lower() in group and w[k - 1].lower() not in bad_prev:
                return k
        return 0
    k_rel = best(REL, PREP | REL | STOP)
    if k_rel:
        return w[:k_rel]
    k_conj = best({"and", "but", "so"}, REL | (STOP - PREP))
    k_other = best(PREP | {"it", "they", "a", "an", "the"}, PREP | REL | STOP)
    if k_conj and (not k_other or k_other - k_conj < 3):
        return w[:k_conj]
    if k_other:
        return w[:k_other]
    cut = w[:limit]
    while len(cut) > min_k and cut[-1].lower() in STOP | PREP | REL:
        cut.pop()
    return cut


def hook_from_title(title: str) -> str:
    t = clean(title).rstrip(".")
    t = re.sub(r"^(Show|Launch|Ask|Tell) HN:\s*", "", t)
    t = re.sub(r"\s*\((?:YC [A-Z]\d+)\)", "", t)
    t = re.sub(r"\s*\[(video|pdf)\]\s*$", "", t, flags=re.I)
    w = t.split()
    if len(w) <= HOOK_MAX:
        return t
    for sep in (":", " – ", " - "):
        head, _, tail = t.partition(sep)
        if tail and len(head.split()) <= 3:
            # "Kinetic: a Rust inference engine for GGUF models that claims ..." -> "Kinetic: a Rust inference engine for GGUF models"
            tw = tail.split()
            rest = cut_phrase(tw, HOOK_MAX - len(head.split()))
            if len(rest) + len(head.split()) > HOOK_MAX or len(rest) < 3:
                rest = cut_phrase([x for x in tw if x.lower() not in ("a", "an", "the")], HOOK_MAX - len(head.split()))
            return f"{head.strip()}: {' '.join(rest)}".rstrip(",;:")
        if tail and 4 <= len(head.split()) <= HOOK_MAX:
            return head.strip()
    cut = cut_phrase(w, HOOK_MAX, min_k=6)
    if len(cut) >= 6:
        return " ".join(cut).rstrip(",;:")
    return " ".join(cut_phrase([x for x in w if x.lower() not in ("a", "an", "the")], HOOK_MAX)).rstrip(",;:")


def shorten(s: str, limit: int) -> str:
    """Trim a sentence to <= limit words at a clause boundary when possible."""
    w = s.split()
    if len(w) <= limit:
        return s
    cut = " ".join(w[:limit])
    m = re.search(r"^(.*[,;:])\s", cut)
    if m and len(m.group(1).split()) >= max(6, int(limit * 0.55)):
        cut = m.group(1)
    else:
        cut = " ".join(cut_phrase(w, limit, min_k=6))
    cut = re.sub(r"[:,]\s*\w+$", "", cut.rstrip(",;: "))
    return cut + "."


UNIT = re.compile(r"^(?:[$€£]?\d[\d,]*(?:\.\d+)?\s?(?:%|x|×|GB/s|TB|GB|MB|ms|tok/s|tokens/s|fps|MHz|GHz|kWh|percent|times|"
                  r"billion|million|thousand|trillion|bn|[KMBT]\b)|[$€£]\d[\d,.]*[KMBT]?|\d{1,3}(?:,\d{3})+)$")


def stat_of(s: str) -> tuple[str, str] | None:
    """A headline number with a unit (36.4 GB/s, 3.5x, $2T, 40,000) plus the 1-3 words that follow it."""
    for m in NUM.finditer(s):
        tok = m.group(0).strip()
        if not UNIT.match(tok) or len(tok) > 12:
            continue
        prev = s[:m.start()].rstrip().split()[-1:] or [""]
        if re.search(r"[A-Za-z]\d|^v$|version", prev[0]):
            continue  # model names / versions (LFM3 1.7B, v2 3.0)
        tail = re.split(r"[,.;:()!?]", s[m.end():], maxsplit=1)[0]
        lab = [w for w in tail.split()][:4]
        if lab and lab[0].lower() == "of":
            lab.pop(0)
        cutl = []
        for x in lab[:3]:
            if cutl and x.lower() in STOP:
                break
            cutl.append(x)
        lab = cutl
        if lab and all(re.fullmatch(r"[A-Za-z][\w'/-]*", x) for x in lab):
            return tok, " ".join(lab).lower()
    return None


def candidates(item: dict, story: dict) -> list[tuple[str, float, int]]:
    """(sentence, source weight, order) from the best sources first."""
    art = story.get("article") or {}
    post = story.get("post") or {}
    srcs = [
        (item.get("description") or story.get("feedSummary") or "", 3.0),
        (item.get("content") or "", 2.5),
        (post.get("text") or "", 2.0),
        (art.get("excerpt") or "", 1.5),
        (" ".join(story.get("facts") or []), 1.2),
        (art.get("metaDescription") or "", 1.0),
    ]
    seen, out, order = set(), [], 0
    for text, wgt in srcs:
        for s in sentences(text):
            k = " ".join(words(s))
            if k in seen or not usable(s):
                continue
            seen.add(k)
            out.append((s, wgt, order))
            order += 1
    return out


def same_point(a: str, b: str) -> bool:
    ka, kb = keyset(a), keyset(b)
    if len(ka & kb) / (min(len(ka), len(kb)) or 1) >= 0.4:
        return True
    na = {x for x in re.findall(r"\d[\d,.]*\d|\d{2,}", a)}
    return len(na & {x for x in re.findall(r"\d[\d,.]*\d|\d{2,}", b)}) >= 2


def build(item: dict, story: dict) -> dict | None:
    title = item.get("title") or story.get("title") or ""
    hook = hook_from_title(title)
    tkeys = keyset(title)
    cands = candidates(item, story)
    scored = []
    for s, wgt, order in cands:
        k = keyset(s)
        overlap = len(k & tkeys) / (len(tkeys) or 1)
        nums = len([m for m in NUM.finditer(s) if not re.fullmatch(r"(19|20)\d\d", m.group(0).strip())])
        n = len(s.split())
        score = wgt + 1.5 * overlap + 0.6 * min(nums, 3) - 0.02 * order - (0.8 if n > 32 else 0) \
            - (0.6 if re.match(r"(I|We|My|Our)\b", s) else 0) - (1.0 if s.endswith("?") else 0) \
            - (1.5 if re.match(ANAPHORA, s) or re.search(r"\bto this\b|\bthis is\b", s) else 0)
        # sentences that merely restate the hook add nothing
        if keyset(hook) and len(k & keyset(hook)) / len(keyset(hook)) > 0.8 and n < 14:
            score -= 2
        scored.append((score, order, s))
    scored.sort(key=lambda x: -x[0])
    picked = []
    for score, order, s in scored:
        if not any(same_point(s, p) for _, p in picked):
            picked.append((order, s))
        if len(picked) == 3:
            break
    if len(picked) < 3:
        return None
    picked.sort()  # keep the story's own order so it reads naturally
    beats = [s for _, s in picked]
    budget = MAX_WORDS - len(hook.split())
    # fit 70-90 words: trim the longest beats first
    while sum(len(b.split()) for b in beats) > budget:
        i = max(range(3), key=lambda j: len(beats[j].split()))
        beats[i] = shorten(beats[i], len(beats[i].split()) - 4)
    total = len(hook.split()) + sum(len(b.split()) for b in beats)
    if total < MIN_WORDS:
        # append the next best unused sentence to the shortest beat
        for score, order, s in scored:
            if s in beats or any(same_point(s, b) for b in beats) or re.match(ANAPHORA, s):
                continue
            room = MAX_WORDS - total
            if room < 6:
                break
            add = shorten(s, room)
            i = min(range(3), key=lambda j: len(beats[j].split()))
            beats[i] = beats[i] + " " + add
            total = len(hook.split()) + sum(len(b.split()) for b in beats)
            if total >= MIN_WORDS:
                break
    if total < MIN_WORDS:
        return None
    nvis = len(story.get("visuals") or [])
    out_beats = []
    for i, b in enumerate(beats):
        beat = {"say": b, "visual": (i + 1) % nvis if nvis > 1 else 0}
        st = stat_of(b) if i else None
        if st and st[1]:
            beat["stat"], beat["statLabel"] = st
        out_beats.append(beat)
    return {"hook": hook, "hookText": hook, "beats": out_beats, "outro": "Full story on the dashboard.", "auto": True}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", nargs="*", default=[])
    ap.add_argument("--feed", default=str(ROOT / "public/feed.json"))
    ap.add_argument("--work", default="/tmp/video-work")
    ap.add_argument("--scripts", default=str(ROOT / "video/scripts"))
    ap.add_argument("--force", action="store_true", help="overwrite existing auto scripts (never hand-written ones)")
    ap.add_argument("--print", action="store_true")
    a = ap.parse_args()
    items = {i["id"]: i for i in json.loads(Path(a.feed).read_text())["items"]}
    sd = Path(a.scripts); sd.mkdir(parents=True, exist_ok=True)
    made, skipped = [], []
    for fid in a.ids:
        s = slug(fid)
        dest = sd / f"{s}.json"
        if dest.exists():
            old = json.loads(dest.read_text())
            if not (a.force and old.get("auto")):
                print(f"script exists: {fid}{' (auto)' if old.get('auto') else ''}"); continue
        sp = Path(a.work) / s / "story.json"
        if fid not in items:
            skipped.append((fid, "not in feed")); continue
        story = json.loads(sp.read_text()) if sp.exists() else {}
        script = build(items[fid], story)
        if not script:
            skipped.append((fid, "not enough usable story text")); continue
        dest.write_text(json.dumps(script, indent=2, ensure_ascii=False) + "\n")
        made.append(fid)
        if a.print:
            print(json.dumps(script, indent=2, ensure_ascii=False))
    print(f"autoscript: wrote {len(made)}; skipped {len(skipped)}" + "".join(f"\n  skip {f}: {r}" for f, r in skipped))


if __name__ == "__main__":
    sys.exit(main())
