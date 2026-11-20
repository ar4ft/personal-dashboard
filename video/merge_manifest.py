"""Three-way merge of public/videos.json for the Video News workflow's commit step.

Another writer (an agent, a box run) may push main while Actions renders. Instead of a textual rebase, the workflow
resets to origin/main and re-applies this run's changes by video id:
  - ours-only new ids are added (with their poster/captions and any script the remote does not have);
  - an id we rendered from an auto script is dropped if the remote now has a different (hand-written) script for it,
    so the next run re-renders it from that script;
  - ids we removed through retention are removed (with their local poster/captions);
  - ids changed on both sides keep the remote version.
Writes the merged manifest over --theirs and prints the number of videos this run added.
"""
from __future__ import annotations
import argparse, json, shutil
from pathlib import Path


def load(p):
    return {v["id"]: v for v in json.loads(Path(p).read_text())["videos"]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--ours", required=True)
    ap.add_argument("--theirs", default="public/videos.json")
    ap.add_argument("--ours-media", required=True, help="copy of public/media/videos after rendering")
    ap.add_argument("--ours-scripts", required=True, help="copy of video/scripts after rendering")
    ap.add_argument("--public", default="public")
    ap.add_argument("--scripts", default="video/scripts")
    a = ap.parse_args()
    B, O, T = load(a.base), load(a.ours), load(a.theirs)
    doc = json.loads(Path(a.theirs).read_text())
    pub, scripts = Path(a.public), Path(a.scripts)
    result, added, local = {}, 0, []

    def slug(v):
        return v["id"].split(":", 1)[1]

    for vid in set(B) | set(O) | set(T):
        b, o, t = B.get(vid), O.get(vid), T.get(vid)
        if t is not None and o is not None:
            if o == b or o == t:
                result[vid] = t
            elif t == b:
                result[vid] = o
                local.append(o)
            else:
                result[vid] = t
        elif o is not None:  # not on the remote
            if b is not None:
                continue  # the remote removed it
            name = slug(o) + ".json"
            mine = Path(a.ours_scripts) / name
            theirs = scripts / name
            if theirs.exists() and mine.exists() and theirs.read_bytes() != mine.read_bytes():
                print(f"merge: {vid} has a newer script on main; leaving it for the next run")
                continue
            result[vid] = o
            local.append(o)
            added += 1
        elif t is not None:
            if b is not None:  # we removed it (retention)
                for k in ("poster", "captions", "src"):
                    ref = t.get(k) or ""
                    if ref and not ref.startswith("http"):
                        (pub / ref).unlink(missing_ok=True)
                continue
            result[vid] = t
    for v in local:
        for k in ("poster", "captions"):
            ref = v.get(k) or ""
            src = Path(a.ours_media) / Path(ref).name
            if ref and not ref.startswith("http") and src.exists():
                (pub / ref).parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(src, pub / ref)
    for f in Path(a.ours_scripts).glob("*.json"):  # never overwrite a script that is on main
        if not (scripts / f.name).exists():
            shutil.copyfile(f, scripts / f.name)
    doc["videos"] = sorted(result.values(), key=lambda v: v.get("createdAt", ""), reverse=True)
    Path(a.theirs).write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    print(added)


if __name__ == "__main__":
    main()
