"""Host Video News MP4s outside the Pages site: in a separate public repo served by jsDelivr.

Layout of the media repo (default ar4ft/dashboard-videos):
  main            README only
  v-YYYYMMDD-N    orphan branches holding that day's MP4s, each kept under REF_LIMIT bytes
                  (jsDelivr fetches single files up to 20 MB from any ref, but falls back to the whole
                  ref, limited to 50 MB, if a single-file fetch fails, so refs stay below that)
  pinned-N        orphan branches with keep-forever videos copied out of expiring day branches

URLs are pinned to the commit that added the file, so jsDelivr caches them as immutable:
  https://cdn.jsdelivr.net/gh/<repo>@<sha>/<slug>.mp4
Commits are built with git plumbing (no checkout), pushed with the gh-configured credential helper.
Retention deletes whole expired day branches (never rewrites history) after copying pinned videos out.
"""
from __future__ import annotations
import re, subprocess, urllib.request
from datetime import datetime, timedelta
from pathlib import Path

REPO = "ar4ft/dashboard-videos"
CDN = "https://cdn.jsdelivr.net/gh/"
REF_LIMIT = 40_000_000
URL_RE = re.compile(r"^https://cdn\.jsdelivr\.net/gh/([\w.-]+/[\w.-]+)@([0-9a-f]{40})/([\w.-]+\.mp4)$")


class Host:
    def __init__(self, clone: Path, repo: str = REPO, remote_url: str | None = None):
        self.dir, self.repo = Path(clone), repo
        if not (self.dir / ".git").exists() and not (self.dir / "HEAD").exists():
            self.dir.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(["git", "clone", "-q", "--no-checkout", remote_url or f"https://github.com/{repo}.git", str(self.dir)],
                           check=True, stdin=subprocess.DEVNULL)
        for key, val in (("user.name", "ar4ft"), ("user.email", "70501707+ar4ft@users.noreply.github.com")):
            if subprocess.run(["git", "-C", str(self.dir), "config", key], capture_output=True, stdin=subprocess.DEVNULL).returncode:
                subprocess.run(["git", "-C", str(self.dir), "config", key, val], check=True, stdin=subprocess.DEVNULL)
        self.fetch()

    def git(self, *args, input: bytes | None = None, env=None) -> str:
        r = subprocess.run(["git", "-C", str(self.dir), *args], input=input, capture_output=True, check=False, env=env,
                           **({} if input is not None else {"stdin": subprocess.DEVNULL}))
        if r.returncode:
            raise RuntimeError(f"git {' '.join(args[:3])} failed: {r.stderr.decode()[-300:]}")
        return r.stdout.decode().strip()

    def fetch(self):
        self.git("fetch", "-q", "--prune", "origin", "+refs/heads/*:refs/remotes/origin/*")

    def branches(self, prefix: str) -> list[str]:
        out = self.git("for-each-ref", "--format=%(refname:strip=3)", f"refs/remotes/origin/{prefix}*")
        return sorted(b for b in out.splitlines() if b)

    def tree(self, branch: str) -> dict[str, tuple[str, int]]:
        """name -> (blob sha, size) for files on a remote branch."""
        out = self.git("ls-tree", "-l", f"refs/remotes/origin/{branch}")
        files = {}
        for line in out.splitlines():
            meta, name = line.split("\t", 1)
            _mode, _type, sha, size = meta.split()
            files[name] = (sha, int(size))
        return files

    def url(self, sha: str, name: str) -> str:
        return f"{CDN}{self.repo}@{sha}/{name}"

    def _commit(self, branch: str, files: dict[str, str], new_branch: bool, msg: str) -> str:
        """files: name -> blob sha (full tree). Returns new commit sha after pushing."""
        tree_in = "".join(f"100644 blob {sha}\t{name}\n" for name, sha in sorted(files.items())).encode()
        tree = self.git("mktree", input=tree_in)
        parent = [] if new_branch else ["-p", self.git("rev-parse", f"refs/remotes/origin/{branch}")]
        commit = self.git("commit-tree", tree, *parent, "-m", msg)
        self.git("push", "-q", "origin", f"{commit}:refs/heads/{branch}")
        self.git("update-ref", f"refs/remotes/origin/{branch}", commit)
        return commit

    def _target(self, prefix: str, size: int) -> tuple[str, dict, bool]:
        existing = self.branches(f"{prefix}-")
        if existing:
            last = max(existing, key=lambda b: int(b.rsplit("-", 1)[1]))
            files = self.tree(last)
            if sum(s for _, s in files.values()) + size <= REF_LIMIT:
                return last, {n: s for n, (s, _) in files.items()}, False
            n = int(last.rsplit("-", 1)[1]) + 1
        else:
            n = 1
        return f"{prefix}-{n}", {}, True

    def upload(self, mp4: Path, day: str | None = None, prefix: str | None = None) -> str:
        """Add one MP4 (idempotent: same name+content on the target branch is reused). Returns the jsDelivr URL."""
        mp4 = Path(mp4)
        blob = self.git("hash-object", "-w", str(mp4))
        prefix = prefix or f"v-{day or datetime.now().strftime('%Y%m%d')}"
        # already uploaded with identical bytes on a branch of this prefix? reuse its commit
        for b in self.branches(f"{prefix}-"):
            f = self.tree(b).get(mp4.name)
            if f and f[0] == blob:
                sha = self.git("log", "-n1", "--format=%H", f"refs/remotes/origin/{b}", "--", mp4.name)
                return self.url(sha, mp4.name)
        branch, files, new = self._target(prefix, mp4.stat().st_size)
        files[mp4.name] = blob
        sha = self._commit(branch, files, new, f"video {mp4.stem}")
        return self.url(sha, mp4.name)

    def copy_to_pinned(self, url: str) -> str:
        m = URL_RE.match(url)
        sha, name = m.group(2), m.group(3)
        blob = self.git("rev-parse", f"{sha}:{name}")
        size = int(self.git("cat-file", "-s", blob))
        for b in self.branches("pinned-"):
            f = self.tree(b).get(name)
            if f and f[0] == blob:
                return self.url(self.git("log", "-n1", "--format=%H", f"refs/remotes/origin/{b}", "--", name), name)
        branch, files, new = self._target("pinned", size)
        files[name] = blob
        return self.url(self._commit(branch, files, new, f"pin {Path(name).stem}"), name)

    def branch_of(self, url: str) -> str | None:
        m = URL_RE.match(url or "")
        if not m:
            return None
        out = self.git("branch", "-r", "--contains", m.group(2), "--format=%(refname:strip=3)")
        names = [b for b in out.splitlines() if b and b != "HEAD"]
        return names[0] if names else None

    def expired_branches(self, retain_days: int) -> list[str]:
        # one extra day of slack so a branch is never deleted while its newest video is still in the window
        cutoff = (datetime.now() - timedelta(days=retain_days + 1)).strftime("%Y%m%d")
        return [b for b in self.branches("v-") if re.fullmatch(r"v-\d{8}-\d+", b) and b[2:10] < cutoff]

    def delete_branch(self, branch: str):
        assert re.fullmatch(r"v-\d{8}-\d+", branch), branch  # only ever delete expired day branches
        self.git("push", "-q", "origin", f":refs/heads/{branch}")
        self.git("update-ref", "-d", f"refs/remotes/origin/{branch}")


def warm(url: str, timeout=60) -> None:
    """Fetch once so jsDelivr caches it; require 200 + video/mp4."""
    req = urllib.request.Request(url, headers={"User-Agent": "dashboard-video-warm/1"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        ctype = r.headers.get("content-type", "")
        while r.read(1 << 20):
            pass
        if r.status != 200 or not ctype.startswith("video/mp4"):
            raise RuntimeError(f"jsDelivr warm failed: {r.status} {ctype} {url}")


README_HEAD = """# dashboard-videos

Video News MP4s (720×1280, H.264/AAC) for [ar4ft/personal-dashboard](https://github.com/ar4ft/personal-dashboard)
([Video News page](https://ar4ft.github.io/personal-dashboard/videos/)). **This README is generated** by
`video/make.py --host jsdelivr` from the dashboard's `public/videos.json`; do not edit by hand.

## Where the videos are

The `main` branch only holds this index. The MP4s live on other branches:

- `v-YYYYMMDD-N`: orphan **day branches** with the videos made that day. A new `-N` starts whenever a branch would
  pass ~40 MB (jsDelivr's whole-branch fallback limit is 50 MB).
- `pinned-N`: videos marked *keep forever*, copied out of a day branch before it expires.
- Each video is served by jsDelivr from the exact commit that added it
  (`https://cdn.jsdelivr.net/gh/ar4ft/dashboard-videos@<commit>/<file>.mp4`), so links never change.
- Retention: videos are kept **60 days**; then the whole day branch is deleted (pinned videos are kept forever).

Use the branch picker above, or the **File** links below.
"""


def _cell(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).replace("|", "\\|").replace("[", "\\[").replace("]", "\\]").strip()


def build_readme(host: "Host", videos: list[dict]) -> str:
    rows: dict[str, list[str]] = {}
    hosted = [v for v in videos if URL_RE.match(v.get("src") or "")]
    for v in sorted(hosted, key=lambda v: v.get("createdAt", ""), reverse=True):
        m = URL_RE.match(v["src"])
        name = m.group(3)
        branch = host.branch_of(v["src"]) or m.group(2)
        created = datetime.fromisoformat(v["createdAt"].replace("Z", "+00:00")).astimezone()
        day = created.strftime("%Y-%m-%d")
        story = v.get("url") or ""
        story_cell = f"[story]({story})" if story.startswith(("https://", "http://")) else ""
        rows.setdefault(day, []).append(
            f"| {_cell(v.get('title'))} | [{name}](https://github.com/{host.repo}/blob/{branch}/{name}) "
            f"| [jsDelivr]({v['src']}) | {story_cell} | {created.strftime('%Y-%m-%d %H:%M')} "
            f"| {'📌 yes' if v.get('pinned') else ''} |")
    out = [README_HEAD, f"\n## Videos ({len(hosted)})\n"]
    if not hosted:
        out.append("\n_No videos yet._\n")
    for day, lines in rows.items():
        out.append(f"\n### {day} ({len(lines)})\n\n| Title | File | CDN | Story | Created | Pinned |\n|---|---|---|---|---|---|\n")
        out.append("\n".join(lines) + "\n")
    return "".join(out)


def update_readme(host: "Host", videos: list[dict]) -> str | None:
    """Commit the generated index to main if it changed. Returns the commit sha, or None when unchanged."""
    text = build_readme(host, videos)
    try:
        current = host.git("show", "refs/remotes/origin/main:README.md")
    except RuntimeError:
        current = None
    if current is not None and current.strip() == text.strip():
        return None
    blob = host.git("hash-object", "-w", "--stdin", input=text.encode())
    try:
        files = {n: s for n, (s, _) in host.tree("main").items()}
        new = False
    except RuntimeError:
        files, new = {}, True
    files["README.md"] = blob
    return host._commit("main", files, new, f"index: {len(videos)} videos")
