#!/usr/bin/env python3
"""Video News: feed items -> real story -> narrated 9:16 MP4 + poster + captions + manifest.

Usage:
  python video/make.py --latest 3                    # newest news items without a video
  python video/make.py --ids hn:123 x:456 --scripts video/scripts
  python video/make.py --pin video:hn-123            # keep forever (also: --unpin)
  python video/make.py --sync-pins                   # pin videos the owner asked to keep via GitHub issues
Retention (every run): videos are kept at least --retain-days (60) by createdAt; older ones are
deleted unless "pinned": true.
"""
from __future__ import annotations
import argparse, json, os, re, shutil, signal, subprocess, sys, time
from datetime import datetime, timedelta, timezone
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
    ap.add_argument("--music", default=str(Path(__file__).parent / "music/ambient-bed.mp3"), help="music bed (ducked under the voice)")
    ap.add_argument("--no-music", action="store_true")
    ap.add_argument("--retain-days", type=int, default=60, help="delete unpinned videos older than this (0 = keep all)")
    ap.add_argument("--pin", nargs="*", default=[], help="video ids (video:...) or feed ids to keep forever")
    ap.add_argument("--unpin", nargs="*", default=[])
    ap.add_argument("--sync-pins", action="store_true", help="read open 'Keep video: <id>' issues by --owner and pin them")
    ap.add_argument("--owner", default="ar4ft", help="only this GitHub account's issues can pin videos")
    ap.add_argument("--social-dir", default=None, help="also keep 1080x1920 copies here (outside the repo), e.g. /workspace/video-social/2026-11-20")
    ap.add_argument("--ingest-only", action="store_true")
    ap.add_argument("--story-timeout", type=int, default=300, help="seconds per story attempt before giving up on it (0 = none)")
    ap.add_argument("--host", choices=["local", "jsdelivr"], default="local",
                    help="local: MP4 in public/media/videos; jsdelivr: MP4 in the media repo, SHA-pinned jsDelivr URL in src")
    ap.add_argument("--media-repo", default="ar4ft/dashboard-videos")
    ap.add_argument("--media-clone", default="/workspace/dashboard/videos-repo")
    ap.add_argument("--media-remote", default=None, help=argparse.SUPPRESS)  # tests: a local bare repo
    ap.add_argument("--migrate", action="store_true", help="with --host jsdelivr: move existing local MP4s to the media repo")
    ap.add_argument("--refresh", action="store_true", help="re-fetch stories even if cached in --work")
    a = ap.parse_args()
    # Never let child processes (ffmpeg, gh, browsers) consume the caller's stdin: in a
    # `while read id; do make.py ...; done < ids.txt` loop that silently skipped every other ID.
    devnull = os.open(os.devnull, os.O_RDONLY); os.dup2(devnull, 0); os.close(devnull)

    items = json.loads(Path(a.feed).read_text())["items"]
    by_id = {i["id"]: i for i in items}
    manifest = load_manifest(Path(a.manifest))
    for v in manifest["videos"]:  # older entries used itemId
        if "itemId" in v:
            v.setdefault("feedId", v.pop("itemId"))
    have = {v["feedId"] for v in manifest["videos"]}
    pinned_before = {v["id"] for v in manifest["videos"] if v.get("pinned")}
    if a.ids:
        chosen = [by_id[i] for i in a.ids if i in by_id]
    else:
        news = sorted((i for i in items if i.get("section") == "news" and i["id"] not in have),
                      key=lambda i: i.get("createdAt", ""), reverse=True)
        chosen = news[: a.latest]
    out_dir = Path(a.out); out_dir.mkdir(parents=True, exist_ok=True)
    host = None
    if a.host == "jsdelivr" and not a.ingest_only:
        from host_jsdelivr import Host, warm
        host = Host(Path(a.media_clone), a.media_repo, a.media_remote)

    def publish(mp4: Path, day: str | None = None) -> str:
        """Upload to the media repo, warm jsDelivr, drop the local copy. Returns the src URL."""
        url = host.upload(mp4, day=day)
        for i in range(3):
            try:
                warm(url); break
            except Exception:
                if i == 2: raise
                time.sleep(5)
        mp4.unlink(missing_ok=True)
        return url

    def save_manifest():
        Path(a.manifest).write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")

    def process(item):
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
            print(f"ingested {item['id']} -> {work}/story.json"); return
        sp = Path(a.scripts) / f"{s}.json" if a.scripts else None
        script = json.loads(sp.read_text()) if sp and sp.exists() else auto_script(story)
        mp4, poster = out_dir / f"{s}.mp4", out_dir / f"{s}.jpg"
        music = None if a.no_music or not a.music or not Path(a.music).exists() else a.music
        if a.social_dir:
            # render once at 1080p for Reels/TikTok, then downscale the site copy
            sd = Path(a.social_dir); sd.mkdir(parents=True, exist_ok=True)
            big = sd / mp4.name
            info = render(story, script, big, sd / poster.name, size=1080, music=music)
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(big), "-vf", f"scale={a.size}:{a.size * 16 // 9}:flags=lanczos",
                            "-c:v", "libx264", "-preset", "medium", "-crf", "27", "-maxrate", "1600k", "-bufsize", "3200k",
                            "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", "-c:a", "copy", str(mp4)], check=True, stdin=subprocess.DEVNULL)
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(sd / poster.name), "-vf", f"scale={a.size}:-2", "-q:v", "4", str(poster)], check=True, stdin=subprocess.DEVNULL)
            shutil.copyfile(big.with_suffix(".vtt"), mp4.with_suffix(".vtt"))
            info["bytes"] = mp4.stat().st_size
        else:
            info = render(story, script, mp4, poster, size=a.size, music=music)
        prefix = a.public_prefix
        src = publish(mp4) if host else f"{prefix}{mp4.name}"
        entry = {"id": f"video:{s}", "feedId": item["id"], "title": item["title"], "source": item.get("source"),
                 "topics": item.get("topics", []), "url": item.get("url"),
                 "src": src, "poster": f"{prefix}{poster.name}", "captions": f"{prefix}{mp4.with_suffix('.vtt').name}",
                 "duration": info["duration"], "transcript": info["captions"][:1200],
                 "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                 "pinned": f"video:{s}" in pinned_before}
        prev = next((v for v in manifest["videos"] if v["id"] == entry["id"]), None)
        if prev:  # a re-render keeps the original date, so it doesn't reset retention
            entry["createdAt"] = prev.get("createdAt", entry["createdAt"])
        manifest["videos"] = [v for v in manifest["videos"] if v["id"] != entry["id"]] + [entry]
        print(f"rendered {item['id']}: {info['duration']}s, {info['bytes']/1e6:.2f} MB, {time.time()-t0:.0f}s"
              f"{' (auto script)' if script.get('auto') else ''}")
        if not a.ingest_only:
            save_manifest()  # incremental: a later failure can't lose this render

    def _timeout(signum, frame):
        raise TimeoutError(f"story took longer than {a.story_timeout}s")
    signal.signal(signal.SIGALRM, _timeout)

    failed = []
    for item in chosen:
        for attempt in (1, 2):
            try:
                signal.alarm(max(0, a.story_timeout))
                try:
                    process(item)
                finally:
                    signal.alarm(0)
                break
            except Exception as e:  # keep going: one bad story must not stop the batch
                print(f"error {item['id']} (attempt {attempt}): {type(e).__name__}: {str(e)[:200]}", flush=True)
                if attempt == 2:
                    failed.append(item["id"])
                    s = slug(item["id"])
                    if f"video:{s}" not in {v["id"] for v in manifest["videos"]}:
                        for ext in (".mp4", ".jpg", ".vtt"):  # drop half-written outputs
                            (out_dir / f"{s}{ext}").unlink(missing_ok=True)
                else:
                    time.sleep(5)
    if host and a.migrate:  # move existing local MP4s to the media repo, oldest first, saving after each
        for v in sorted(manifest["videos"], key=lambda v: v["createdAt"]):
            src = v.get("src") or ""
            local = out_dir / Path(src).name
            if src.startswith("http") or not local.exists():
                continue
            try:
                day = datetime.fromisoformat(v["createdAt"].replace("Z", "+00:00")).astimezone().strftime("%Y%m%d")
                v["src"] = publish(local, day=day)
                save_manifest()
                print(f"migrated {v['id']} -> {v['src']}", flush=True)
            except Exception as e:
                failed.append(v["id"])
                print(f"error migrating {v['id']}: {type(e).__name__}: {str(e)[:200]}", flush=True)
    if failed:
        print(f"failed ({len(failed)}): {' '.join(failed)}", flush=True)

    pins, unpins = set(a.pin), set(a.unpin)
    if a.sync_pins:
        pins |= issue_pins(a.owner)
    for v in manifest["videos"]:
        if v["id"] in pins or v.get("feedId") in pins:
            v["pinned"] = True
        if v["id"] in unpins or v.get("feedId") in unpins:
            v["pinned"] = False
    manifest["videos"].sort(key=lambda v: v["createdAt"], reverse=True)
    if a.retain_days > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(days=a.retain_days)
        keep, drop = [], []
        for v in manifest["videos"]:
            created = datetime.fromisoformat(v["createdAt"].replace("Z", "+00:00"))
            (keep if v.get("pinned") or created >= cutoff else drop).append(v)
        for old in drop:
            for key in ("src", "poster", "captions"):
                ref = old.get(key) or ""
                f = out_dir / Path(ref).name
                if ref and not ref.startswith("http") and f.exists():
                    f.unlink()
            print(f"retention: removed {old['id']} (created {old['createdAt']}, not pinned)")
        manifest["videos"] = keep
        if host:  # media repo: pinned videos leave expiring day branches, then expired branches are deleted
            expired = set(host.expired_branches(a.retain_days))
            if expired:
                for v in keep:
                    if v.get("pinned") and host.branch_of(v.get("src", "")) in expired:
                        v["src"] = host.copy_to_pinned(v["src"])
                        print(f"pinned copy: {v['id']} -> {v['src']}")
                still_used = {host.branch_of(v.get("src", "")) for v in keep}
                for b in sorted(expired - still_used):
                    host.delete_branch(b)
                    print(f"retention: deleted media branch {b}")
    if not a.ingest_only:
        save_manifest()


def issue_pins(owner: str) -> set[str]:
    """Pins requested from the Video news page's 'Keep forever' button (a GitHub issue).
    Only issues opened by the owner count; anyone can open issues on a public repo."""
    try:
        r = subprocess.run(["gh", "issue", "list", "--state", "open", "--author", owner, "--search", "Keep video: in:title",
                            "--json", "title,author", "--limit", "100"], stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=60, check=True)
        out = set()
        for i in json.loads(r.stdout):
            m = re.fullmatch(r"Keep video:\s*(video:[a-z0-9-]{1,120})\s*", i["title"])
            if m and (i.get("author") or {}).get("login") == owner:
                out.add(m.group(1))
        return out
    except Exception as e:
        print(f"pin sync skipped: {type(e).__name__}")
        return set()


if __name__ == "__main__":
    main()
