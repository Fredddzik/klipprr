#!/usr/bin/env python3
"""Daily platform health check (FR-8).

Does every supported platform still resolve, preview and export with the yt-dlp and ffmpeg
that users actually have? Runs the *installed* Klipprr's bundled binaries against the test
links in scripts/health-check.json.

Must run from a home connection (the founder's Mac), never CI: YouTube, Instagram and X
treat datacenter IPs as bots, and the false alarms would teach everyone to ignore it.

Silent when everything passes. Sends a macOS notification when a platform is broken.
Nothing leaves the machine: clips go to a temp folder that is deleted at the end, and no
account or plan limit is involved.

    python3 scripts/health-check.py            # full run, report in ~/Library/Logs/Klipprr/health/
    python3 scripts/health-check.py --quiet    # no notification (manual runs)
    KLIPPRR_BIN=/path/to/bin python3 ...       # test other binaries than the installed app's

Exit status: 0 healthy (links that are merely gone are reported, not alarmed), 1 broken.
"""

import datetime
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG = os.environ.get("KLIPPRR_HEALTH_CONFIG", os.path.join(HERE, "health-check.json"))
BIN = os.environ.get("KLIPPRR_BIN", "/Applications/Klipprr.app/Contents/Resources/bin")
YT_DLP = os.path.join(BIN, "yt-dlp")
FFPROBE = os.path.join(BIN, "ffprobe")
FFMPEG = os.path.join(BIN, "ffmpeg")
LOG_DIR = os.path.expanduser("~/Library/Logs/Klipprr/health")
EXPORT_SECONDS = 8

# yt-dlp messages that mean the test video itself is gone, not that Klipprr is broken.
GONE = re.compile(
    r"unavailable|no longer available|been removed|removed by|private video|is private|"
    r"deleted|does not exist|not found|suspended|terminated|404|410|"
    r"no video could be found|broadcast no longer exists",
    re.I,
)


def run(cmd, timeout=180):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return p.returncode, p.stdout, p.stderr
    except subprocess.TimeoutExpired:
        return 124, "", "timed out after %ds" % timeout


def last_error(stderr):
    lines = [l for l in stderr.splitlines() if "ERROR" in l] or stderr.strip().splitlines()[-1:]
    return (lines[-1] if lines else "no output").strip()[:200]


def resolve(url):
    """Same call the app makes on Load (commands/resolve.rs)."""
    rc, out, err = run([YT_DLP, "--dump-single-json", "--no-warnings", "--no-progress",
                        "--no-playlist", "--socket-timeout", "20", url])
    if rc != 0:
        raise Failure("resolve", last_error(err))
    info = json.loads(out)
    if not info.get("formats") and info.get("entries"):
        info = next((e for e in info["entries"] if e and e.get("formats")), info)
    if not info.get("formats"):
        raise Failure("resolve", "no formats returned")
    return info


def dash_probe(info):
    """The index read behind /yt-dash.mpd (FR-7): moov and sidx in the first 64 KB."""
    fmts = info["formats"]
    pick = lambda pred: max((f for f in fmts if pred(f)), key=lambda f: f.get("tbr") or 0, default=None)
    video = pick(lambda f: str(f.get("vcodec", "")).startswith("avc1") and f.get("acodec") == "none"
                 and f.get("protocol") == "https" and (f.get("height") or 0) <= 1080)
    audio = pick(lambda f: str(f.get("acodec", "")).startswith("mp4a") and f.get("vcodec") == "none"
                 and f.get("protocol") == "https")
    if not video or not audio:
        raise Failure("preview", "no H.264 + AAC DASH renditions")
    for f in (video, audio):
        headers = dict(f.get("http_headers") or {})
        headers["Range"] = "bytes=0-65535"
        try:
            with urllib.request.urlopen(urllib.request.Request(f["url"], headers=headers), timeout=20) as r:
                buf = r.read()
        except Exception as e:
            raise Failure("preview", "index fetch failed: %s" % e)
        kinds, off = [], 0
        while off + 8 <= len(buf):
            size, kind = struct.unpack(">I4s", buf[off:off + 8])
            if size < 8:
                break
            kinds.append(kind.decode("latin1"))
            if kind == b"sidx":
                break
            off += size
        if "moov" not in kinds or "sidx" not in kinds:
            raise Failure("preview", "itag %s is not laid out for streaming (%s)" % (f.get("format_id"), kinds))


# The app's "Original" (stream-copy) export selector at a 1080p cap, the most common
# export (commands/download.rs, speed mode). Keep in step with it.
EXPORT_FORMAT = ("bv*[ext=mp4][vcodec^=avc1][height<=1080]+ba[ext=m4a]/b[ext=mp4][vcodec^=?avc1][height<=?1080]/"
                 "bv*[ext=mp4][height<=1080]+ba[ext=m4a]/bv*[ext=mp4][height<=1080]+ba/"
                 "best[ext=mp4][height<=1080]/best[height<=1080]")


def export(url, info, workdir):
    """A short section download and cut, checked with ffprobe."""
    duration = info.get("duration") or 0
    # Instagram often reports no duration; start at 0 so a short Reel still has content.
    start = int(min(5, duration / 3)) if duration else 0
    end = int(min(duration, start + EXPORT_SECONDS)) if duration else start + EXPORT_SECONDS
    out = os.path.join(workdir, "clip.%(ext)s")
    rc, _, err = run([YT_DLP, "--no-playlist", "--no-warnings", "--socket-timeout", "20",
                      "--ffmpeg-location", FFMPEG, "-f", EXPORT_FORMAT, "--merge-output-format", "mp4",
                      "--download-sections", "*%d-%d" % (start, end), "-o", out, url], timeout=300)
    if rc != 0:
        raise Failure("export", last_error(err))
    files = [f for f in os.listdir(workdir) if f.startswith("clip.") and not f.endswith(".part")]
    if not files:
        raise Failure("export", "no output file")
    path = os.path.join(workdir, files[0])
    rc, out, err = run([FFPROBE, "-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name",
                        "-of", "json", path])
    if rc != 0:
        raise Failure("export", "ffprobe: %s" % last_error(err))
    probe = json.loads(out)
    got = float(probe.get("format", {}).get("duration") or 0)
    want = end - start
    types = [s.get("codec_type") for s in probe.get("streams", [])]
    if "video" not in types:
        raise Failure("export", "clip has no video stream")
    # Sections snap to keyframes, so allow a little slack either way. With no known
    # duration the source may be shorter than the section, so only require real content.
    if not duration and got >= 0.5:
        pass
    elif not (want - 2.5 <= got <= want + 4):
        raise Failure("export", "clip is %.1fs, expected ~%ds" % (got, want))
    codecs = ",".join(s.get("codec_name", "?") for s in probe["streams"])
    return "%.1fs %s" % (got, codecs)


def still_available(url):
    """Independent of yt-dlp: is the test video itself still up? None when unknown."""
    host = urllib.parse.urlparse(url).netloc
    if "youtube" in host or "youtu.be" in host:
        endpoint = "https://www.youtube.com/oembed?format=json&url="
    elif host.endswith("twitter.com") or host.endswith("x.com"):
        endpoint = "https://publish.twitter.com/oembed?url="
    else:
        return None
    try:
        urllib.request.urlopen(endpoint + urllib.parse.quote(url, safe=""), timeout=15).read()
        return True
    except urllib.error.HTTPError as e:
        # 401/403: the video exists but blocks embedding. 400/404: gone or private.
        return True if e.code in (401, 403) else False
    except Exception:
        return None


class Failure(Exception):
    def __init__(self, step, message):
        super().__init__(message)
        self.step, self.message = step, message


def check_url(url, want_dash):
    workdir = tempfile.mkdtemp(prefix="klipprr-health-")
    try:
        t0 = time.time()
        info = resolve(url)
        if want_dash:
            dash_probe(info)
        clip = export(url, info, workdir)
        return {"url": url, "ok": True, "detail": "%s in %ds" % (clip, time.time() - t0)}
    except Failure as f:
        available = still_available(url)
        gone = available is False or (available is None and bool(GONE.search(f.message)))
        return {"url": url, "ok": False, "step": f.step, "detail": f.message, "gone": gone}
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def latest_yt_dlp():
    try:
        req = urllib.request.Request("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest",
                                     headers={"Accept": "application/vnd.github+json"})
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.load(r).get("tag_name")
    except Exception:
        return None


def notify(title, message):
    script = 'display notification "%s" with title "%s" sound name "Basso"' % (
        message.replace('"', "'"), title.replace('"', "'"))
    subprocess.run(["osascript", "-e", script], capture_output=True)


def main():
    quiet = "--quiet" in sys.argv
    for tool in (YT_DLP, FFMPEG, FFPROBE):
        if not os.access(tool, os.X_OK):
            print("missing %s (is Klipprr installed?)" % tool)
            return 1
    config = json.load(open(CONFIG))["platforms"]
    _, installed, _ = run([YT_DLP, "--version"], timeout=30)
    installed = installed.strip()
    latest = latest_yt_dlp()

    started = datetime.datetime.now()
    lines = ["Klipprr health check %s" % started.strftime("%Y-%m-%d %H:%M"),
             "yt-dlp %s (latest release: %s)" % (installed, latest or "unknown"), ""]
    broken, notes = [], []
    for platform, spec in config.items():
        results = [check_url(u, spec.get("dash", False)) for u in spec["urls"]]
        if any(r["ok"] for r in results):
            status = "OK"
        elif all(r.get("gone") for r in results):
            status = "TEST LINKS GONE"
            notes.append(platform)
        else:
            status = "BROKEN"
            broken.append(platform)
        lines.append("%-12s %s" % (platform, status))
        for r in results:
            if r["ok"]:
                lines.append("    ok    %s  (%s)" % (r["url"], r["detail"]))
            else:
                tag = "gone" if r["gone"] else "FAIL"
                lines.append("    %s  %s  [%s] %s" % (tag, r["url"], r["step"], r["detail"]))
                if r["gone"] and platform not in notes:
                    notes.append(platform)
    if latest and installed and latest != installed:
        lines += ["", "A newer yt-dlp exists (%s). The weekly update job normally picks it up;" % latest,
                  "if a platform is broken, updating is the first thing to try."]
    lines += ["", "Took %ds." % (datetime.datetime.now() - started).seconds]
    report = "\n".join(lines)
    print(report)

    os.makedirs(LOG_DIR, exist_ok=True)
    with open(os.path.join(LOG_DIR, started.strftime("%Y-%m-%d") + ".log"), "w") as f:
        f.write(report + "\n")
    with open(os.path.join(LOG_DIR, "latest.json"), "w") as f:
        json.dump({"time": started.isoformat(), "broken": broken, "links_gone": notes,
                   "yt_dlp": installed, "yt_dlp_latest": latest}, f)

    if not quiet:
        if broken:
            notify("Klipprr: %s broken" % ", ".join(broken),
                   "Resolving or exporting failed. Report in ~/Library/Logs/Klipprr/health/")
        elif notes:
            notify("Klipprr health check", "All platforms work. Some test links are gone: %s" % ", ".join(notes))
    return 1 if broken else 0


if __name__ == "__main__":
    sys.exit(main())
