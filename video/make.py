#!/usr/bin/env python3
"""Video News: feed items -> real story -> narrated 9:16 MP4 + poster + captions + manifest.

Usage:
  python video/make.py --latest 3                    # newest news items without a video
  python video/make.py --ids hn:123 x:456 --scripts video/scripts
  python video/make.py --latest 4 --keep 30          # prune manifest/files beyond 30 newest
"""
from __future__ import annotations
import argparse, json, re, sys, time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from ingest import ingest  # noqa: E402
from script import auto_script  # noqa: E402
from render import render  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def slug(item_id: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", item_id.lower()).strip("-")[:80]


def visuals(story: dict) -> list[dict]:
    imgs = [{"path": p, "kind": "image"} for p in story.get("images", [])]
    shots = [{"path": p, "kind": "shot"} for p in story.get("screenshots", [])]
    out = imgs[:1] + shots + imgs[1:]  # og:image first for the hook, then the real page, then inline figures
    return out


def load_manifest(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text())
    return {"version": 1, "videos": []}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--feed", default=str(ROOT / "public/feed.json"))
    ap.add_argument("--ids", nargs="*")
    ap.add_argument("--latest", type=int, default=0)
    ap.add_argument("--scripts", default=None, help="dir of <slug>.json scripts written by the curation agent")
    ap.add_argument("--work", default="/tmp/video-work")
    ap.add_argument("--out", default=str(ROOT / "public/media/videos"))
    ap.add_argument("--manifest", default=str(ROOT / "public/videos.json"))
    ap.add_argument("--public-prefix", default="media/videos/", help="path or https URL prefix stored in the manifest")
    ap.add_argument("--size", type=int, default=720, help="720 for the site, 1080 for Reels/TikTok uploads")
    ap.add_argument("--music", default=None)
    ap.add_argument("--keep", type=int, default=0, help="if >0, keep only the newest N videos")
    ap.add_argument("--ingest-only", action="store_true")
    ap.add_argument("--refresh", action="store_true", help="re-fetch stories even if cached in --work")
    a = ap.parse_args()

    items = json.loads(Path(a.feed).read_text())["items"]
    by_id = {i["id"]: i for i in items}
    manifest = load_manifest(Path(a.manifest))
    have = {v["itemId"] for v in manifest["videos"]}
    if a.ids:
        chosen = [by_id[i] for i in a.ids if i in by_id]
    else:
        news = sorted((i for i in items if i.get("section") == "news" and i["id"] not in have),
                      key=lambda i: i.get("createdAt", ""), reverse=True)
        chosen = news[: a.latest]
    out_dir = Path(a.out); out_dir.mkdir(parents=True, exist_ok=True)

    for item in chosen:
        t0 = time.time()
        s = slug(item["id"])
        work = Path(a.work) / s
        cached = work / "story.json"
        story = json.loads(cached.read_text()) if cached.exists() and not a.refresh else ingest(item, work)
        story["visuals"] = visuals(story)
        post = story.get("post") or {}
        if post.get("handle"):
            story["credit"] = f"@{post['handle']} on X"
        elif story.get("article") and story["article"].get("siteName"):
            story["credit"] = story["article"]["siteName"]
        (work / "story.json").write_text(json.dumps(story, indent=2, ensure_ascii=False))
        if a.ingest_only:
            print(f"ingested {item['id']} -> {work}/story.json"); continue
        sp = Path(a.scripts) / f"{s}.json" if a.scripts else None
        script = json.loads(sp.read_text()) if sp and sp.exists() else auto_script(story)
        mp4, poster = out_dir / f"{s}.mp4", out_dir / f"{s}.jpg"
        info = render(story, script, mp4, poster, size=a.size, music=a.music)
        prefix = a.public_prefix
        entry = {"id": f"video:{s}", "itemId": item["id"], "title": item["title"], "source": item.get("source"),
                 "topics": item.get("topics", []), "url": item.get("url"),
                 "src": f"{prefix}{mp4.name}", "poster": f"{prefix}{poster.name}", "captions": f"{prefix}{mp4.with_suffix('.vtt').name}",
                 "duration": info["duration"], "transcript": info["captions"][:1200],
                 "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
        manifest["videos"] = [v for v in manifest["videos"] if v["id"] != entry["id"]] + [entry]
        print(f"rendered {item['id']}: {info['duration']}s, {info['bytes']/1e6:.2f} MB, {time.time()-t0:.0f}s"
              f"{' (auto script)' if script.get('auto') else ''}")

    manifest["videos"].sort(key=lambda v: v["createdAt"], reverse=True)
    if a.keep > 0:
        for old in manifest["videos"][a.keep:]:
            for key in ("src", "poster", "captions"):
                f = out_dir / Path(old[key]).name
                if not old[key].startswith("http") and f.exists():
                    f.unlink()
        manifest["videos"] = manifest["videos"][: a.keep]
    if not a.ingest_only:
        Path(a.manifest).write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
