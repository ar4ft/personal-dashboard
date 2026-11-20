"""Fetch the actual story behind a feed item: article text, key facts and real visuals.

All fetched content is untrusted data. It is only used as plain text for narration
and as images for frames; nothing fetched is executed or committed verbatim.
"""
from __future__ import annotations
import json, re, shutil, html
from io import BytesIO
from pathlib import Path
from urllib.parse import urljoin, urlparse
import urllib.request

from PIL import Image

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36"
MAX_BYTES = 8_000_000
CHROME = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")


def fetch(url: str, timeout=20, accept="*/*") -> tuple[bytes, str, str]:
    if urlparse(url).scheme not in ("http", "https"):
        raise ValueError("unsupported scheme")
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept, "Accept-Language": "en"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError("too large")
        return data, r.headers.get("Content-Type", ""), r.geturl()


def clean(text: str) -> str:
    text = html.unescape(text or "")
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"[\u200b-\u200f\u202a-\u202e]", "", text)  # strip invisible/bidi controls
    return re.sub(r"[ \t]+", " ", text).strip()


def meta(page: str, *names: str) -> str | None:
    for n in names:
        m = re.search(r'<meta[^>]+(?:property|name)=["\']%s["\'][^>]*content=["\']([^"\']+)' % re.escape(n), page, re.I) or \
            re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']%s["\']' % re.escape(n), page, re.I)
        if m:
            return html.unescape(m.group(1))
    return None


def save_image(url: str, dest: Path, min_side=360) -> Path | None:
    try:
        data, ctype, _ = fetch(url, accept="image/*")
        im = Image.open(BytesIO(data))
        im.load()
        if min(im.size) < min_side and max(im.size) < 600:
            return None
        im = im.convert("RGB")
        im.thumbnail((1600, 1600))
        dest = dest.with_suffix(".jpg")
        im.save(dest, quality=88)
        return dest
    except Exception:
        return None


def screenshots(url: str, work: Path, count=2) -> list[str]:
    """Phone-sized screenshots in a throwaway browser context (no cookies, no logins)."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return []
    shots = []
    try:
        with sync_playwright() as p:
            kw = {"channel": "chrome"} if CHROME else {}
            b = p.chromium.launch(args=["--no-sandbox", "--mute-audio"], **kw)
            ctx = b.new_context(viewport={"width": 430, "height": 932}, device_scale_factor=2, is_mobile=True,
                                user_agent=UA.replace("Macintosh; Intel Mac OS X 14_0", "iPhone; CPU iPhone OS 18_0 like Mac OS X"),
                                accept_downloads=False)
            pg = ctx.new_page()
            pg.goto(url, wait_until="domcontentloaded", timeout=20000)
            pg.wait_for_timeout(2500)
            for i in range(count):
                dest = work / f"shot{i}.png"
                pg.screenshot(path=str(dest))
                if dest.stat().st_size > 25_000:
                    shots.append(str(dest))
                pg.mouse.wheel(0, 850)
                pg.wait_for_timeout(900)
            b.close()
    except Exception:
        pass
    return shots


def x_post(status_id: str) -> dict | None:
    for u in (f"https://cdn.syndication.twimg.com/tweet-result?id={status_id}&token=a",
              f"https://api.fxtwitter.com/i/status/{status_id}"):
        try:
            data, _, _ = fetch(u, accept="application/json")
            j = json.loads(data)
            t = j.get("tweet", j)
            text = t.get("text", "")
            for e in (t.get("entities") or {}).get("urls", []):
                text = text.replace(e.get("url", ""), e.get("expanded_url", ""))
            links = [e.get("expanded_url") for e in (t.get("entities") or {}).get("urls", []) if e.get("expanded_url")]
            links += re.findall(r"https?://[^\s]+", text)
            media = [m.get("media_url_https") for m in t.get("mediaDetails", []) if m.get("type") == "photo"]
            media += [p.get("url") for p in ((t.get("media") or {}).get("photos") or [])]
            for m in t.get("mediaDetails", []):
                if m.get("type") in ("video", "animated_gif") and m.get("media_url_https"):
                    media.append(m["media_url_https"])  # poster frame
            user = t.get("user") or t.get("author") or {}
            return {"text": clean(text), "links": [l for l in dict.fromkeys(links) if "x.com" not in l and "twitter.com" not in l],
                    "media": [m for m in dict.fromkeys(media) if m], "author": user.get("name"),
                    "handle": user.get("screen_name"), "likes": t.get("favorite_count") or t.get("likes")}
        except Exception:
            continue
    return None


def article(url: str, work: Path, tag: str) -> dict:
    out = {"url": url, "text": "", "title": None, "images": [], "blocked": False}
    try:
        data, ctype, final = fetch(url, accept="text/html,application/xhtml+xml")
    except Exception as e:
        out["blocked"] = True
        out["error"] = type(e).__name__
        return out
    if "html" not in ctype:
        return out
    page = data.decode("utf-8", "replace")
    out["title"] = meta(page, "og:title", "twitter:title")
    out["siteName"] = meta(page, "og:site_name")
    out["metaDescription"] = clean(meta(page, "og:description", "description") or "")
    try:
        import trafilatura
        out["text"] = clean(trafilatura.extract(page, include_comments=False, include_tables=False, favor_precision=True) or "")
    except Exception:
        pass
    if len(out["text"]) < 300 and re.search(r"paywall|subscribe to (continue|read)|enable javascript", page, re.I):
        out["blocked"] = True
    cands = []
    og = meta(page, "og:image", "twitter:image", "og:image:url")
    if og:
        cands.append(urljoin(final, og))
    for m in re.finditer(r'<img[^>]+src=["\']([^"\']+)["\']', page, re.I):
        src = m.group(1)
        if src.startswith("data:") or re.search(r"logo|icon|avatar|sprite|badge|pixel|emoji|\.svg", src, re.I):
            continue
        cands.append(urljoin(final, src))
    for i, c in enumerate(dict.fromkeys(cands)):
        if len(out["images"]) >= 4 or i > 14:
            break
        p = save_image(c, work / f"{tag}-img{i}")
        if p:
            out["images"].append(str(p))
    return out


NUM = re.compile(r"(\$?\d[\d,.]*\s?(%|x|×|GB|MB|TB|ms|GB/s|B|M|K|k|billion|million|times|percent|°)?)")


def key_facts(text: str, limit=6) -> list[str]:
    text = re.sub(r"`([^`]*)`", r"\1", text)
    text = re.sub(r"\s*\n\s*", " ", text)
    sents = re.split(r"(?<=[.!?])\s+", text)
    scored, seen = [], set()
    for i, s in enumerate(sents[:120]):
        s = s.strip(" -•…")
        key = re.sub(r"\W+", "", s.lower())[-60:]
        if not 40 <= len(s) <= 260 or key in seen or len(re.findall(r"[(){}<>_=*/\\]", s)) > 6:
            continue
        seen.add(key)
        score = 2 * len(NUM.findall(s)) + (3 if i < 4 else 0) + (1 if re.search(r"\b(first|new|open[- ]source|faster|free|launch|release|fix)\w*", s, re.I) else 0)
        scored.append((score, i, s))
    best = sorted(scored, reverse=True)[:limit]
    return [s for _, _, s in sorted(best, key=lambda t: t[1])]


def ingest(item: dict, work: Path) -> dict:
    work.mkdir(parents=True, exist_ok=True)
    story = {"id": item["id"], "title": item["title"], "source": item.get("source"), "topics": item.get("topics", []),
             "url": item.get("url"), "feedSummary": clean(item.get("description", "")), "post": None,
             "article": None, "images": [], "screenshots": []}
    target = item.get("url")
    m = re.search(r"(?:x|twitter)\.com/[^/]+/status/(\d+)", target or "")
    if m:
        post = x_post(m.group(1))
        story["post"] = post
        if post:
            for i, u in enumerate(post["media"][:3]):
                p = save_image(u, work / f"post{i}")
                if p:
                    story["images"].append(str(p))
            target = post["links"][0] if post["links"] else None
    story["target"] = target
    if target:
        art = article(target, work, "page")
        story["article"] = {k: v for k, v in art.items() if k != "images"}
        story["images"] += art["images"]
        story["screenshots"] = screenshots(target, work)
    body = " ".join(filter(None, [(story["post"] or {}).get("text"), (story["article"] or {}).get("text")]))
    story["facts"] = key_facts(body)
    # keep only a short excerpt on disk; full text is never committed
    if story["article"]:
        story["article"]["excerpt"] = story["article"].pop("text", "")[:2500]
    (work / "story.json").write_text(json.dumps(story, indent=2, ensure_ascii=False))
    return story
