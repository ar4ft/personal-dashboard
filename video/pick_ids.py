"""Print feed IDs of recent news items that have no Video News video yet (for GitHub Actions)."""
import argparse, json
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser()
ap.add_argument("--days", type=float, default=3)
ap.add_argument("--max", type=int, default=20)
a = ap.parse_args()
items = json.loads((ROOT / "public/feed.json").read_text())["items"]
have = {v.get("feedId") for v in json.loads((ROOT / "public/videos.json").read_text())["videos"]}
cutoff = datetime.now(timezone.utc) - timedelta(days=a.days)
def created(i):
    try:
        return datetime.fromisoformat(i.get("createdAt", "").replace("Z", "+00:00"))
    except ValueError:
        return None
news = [i for i in items if i.get("section") == "news" and i["id"] not in have and (created(i) or cutoff) > cutoff]
news.sort(key=lambda i: i.get("createdAt", ""), reverse=True)
print(" ".join(i["id"] for i in news[: a.max]))
