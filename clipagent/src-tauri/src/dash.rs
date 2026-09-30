//! Streamed YouTube preview (FR-7).
//!
//! YouTube serves video and audio as separate fragmented MP4 files. Each one starts with
//! its initialisation data (`ftyp` + `moov`) and a segment index (`sidx`) listing every
//! seekable chunk. Given those two byte ranges, a DASH player (Shaka, in the UI) plays the
//! files directly through Media Source Extensions, fetching only what is watched. The
//! first frame no longer waits for a download of the whole video, whatever its length.
//!
//! Media bytes flow through `/preview-stream`, so its disk cache (FR-2) makes every
//! revisited region local. The streams are the source itself, so preview time is source
//! time (PIPELINES.md invariant 1); export still cuts from the source (invariant 3).

use once_cell::sync::Lazy;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;

/// Tallest rendition offered to the player. Higher costs bandwidth without helping a
/// preview pane, and YouTube publishes nothing above 1080p in H.264 anyway.
const MAX_HEIGHT: i64 = 1080;

#[derive(Clone)]
pub struct Rendition {
    pub id: String,
    pub url: String,
    pub codecs: String,
    pub bandwidth: u64,
    pub width: i64,
    pub height: i64,
    pub fps: f64,
    pub sample_rate: i64,
}

#[derive(Clone)]
pub struct DashSource {
    pub duration: f64,
    pub video: Vec<Rendition>,
    pub audio: Rendition,
}

/// Formats from the most recent resolve of each page URL. Resolve runs yt-dlp anyway;
/// keeping its answer here saves a second 8–9 s extraction when the preview starts.
static SOURCES: Lazy<Mutex<HashMap<String, DashSource>>> = Lazy::new(|| Mutex::new(HashMap::new()));

fn rendition(f: &Value) -> Option<Rendition> {
    let url = f["url"].as_str().filter(|u| !u.is_empty())?.to_string();
    let codec = |k: &str| f[k].as_str().unwrap_or("none").to_string();
    let is_video = codec("vcodec") != "none";
    Some(Rendition {
        id: f["format_id"].as_str().unwrap_or("").to_string(),
        url,
        codecs: if is_video { codec("vcodec") } else { codec("acodec") },
        // tbr is kbit/s; DASH wants bit/s.
        bandwidth: (f["tbr"].as_f64().unwrap_or(1000.0) * 1000.0) as u64,
        width: f["width"].as_i64().unwrap_or(0),
        height: f["height"].as_i64().unwrap_or(0),
        fps: f["fps"].as_f64().unwrap_or(0.0),
        sample_rate: f["asr"].as_i64().unwrap_or(44100),
    })
}

/// Picks streamable renditions from yt-dlp's formats and remembers them for `page_url`.
/// Only H.264 video and AAC audio in plain HTTPS MP4 qualify: that is what WKWebView's
/// Media Source Extensions decode, and what a byte-range index can address.
/// Returns whether a stream-able preview exists.
pub fn remember(page_url: &str, formats: &[Value], duration: f64) -> bool {
    let direct_mp4 = |f: &&Value| {
        f["protocol"].as_str() == Some("https")
            && matches!(f["ext"].as_str(), Some("mp4") | Some("m4a"))
            && f["has_drm"].as_bool() != Some(true)
    };

    // One rendition per height, the highest bitrate at each.
    let mut by_height: HashMap<i64, &Value> = HashMap::new();
    for f in formats.iter().filter(direct_mp4) {
        let vc = f["vcodec"].as_str().unwrap_or("none");
        let h = f["height"].as_i64().unwrap_or(0);
        if !vc.starts_with("avc1") || f["acodec"].as_str().unwrap_or("none") != "none" || h <= 0 || h > MAX_HEIGHT {
            continue;
        }
        let tbr = |x: &Value| x["tbr"].as_f64().unwrap_or(0.0);
        if by_height.get(&h).map_or(true, |cur| tbr(f) > tbr(cur)) {
            by_height.insert(h, f);
        }
    }
    let mut video: Vec<Rendition> = by_height.values().filter_map(|f| rendition(f)).collect();
    video.sort_by_key(|r| r.height);

    // LC-AAC over HE-AAC: HE-AAC (mp4a.40.5) is the 48 kbit/s stream and sounds it.
    let audio = formats
        .iter()
        .filter(direct_mp4)
        .filter(|f| f["vcodec"].as_str().unwrap_or("none") == "none")
        .filter(|f| f["acodec"].as_str().map_or(false, |a| a.starts_with("mp4a")))
        .max_by_key(|f| {
            let lc = f["acodec"].as_str() == Some("mp4a.40.2");
            (lc, (f["abr"].as_f64().unwrap_or(0.0) * 10.0) as i64)
        })
        .and_then(rendition);

    let (Some(audio), false) = (audio, video.is_empty()) else {
        return false;
    };
    if let Ok(mut m) = SOURCES.lock() {
        m.insert(page_url.to_string(), DashSource { duration, video, audio });
    }
    true
}

pub fn source(page_url: &str) -> Option<DashSource> {
    SOURCES.lock().ok()?.get(page_url).cloned()
}

/// Byte ranges and length read from the start of a fragmented MP4.
pub struct Layout {
    /// Last byte of `moov`; the initialisation segment is `0..=init_end`.
    pub init_end: u64,
    pub index_start: u64,
    pub index_end: u64,
    pub duration: f64,
}

/// Walks the top-level boxes in `buf` (the first bytes of the file) for `moov` and the
/// `sidx` after it. None when the file is not laid out for streaming or `buf` is too
/// short to reach the index.
pub fn layout(buf: &[u8]) -> Option<Layout> {
    let mut off = 0usize;
    let mut init_end = None;
    while off + 8 <= buf.len() {
        let mut size = u32::from_be_bytes(buf[off..off + 4].try_into().ok()?) as u64;
        let kind = &buf[off + 4..off + 8];
        if size == 1 {
            size = u64::from_be_bytes(buf.get(off + 8..off + 16)?.try_into().ok()?);
        }
        if size < 8 {
            return None;
        }
        let end = off as u64 + size;
        match kind {
            b"moov" => init_end = Some(end - 1),
            b"sidx" => {
                let body = buf.get(off..end as usize)?;
                return Some(Layout {
                    init_end: init_end?,
                    index_start: off as u64,
                    index_end: end - 1,
                    duration: sidx_duration(body)?,
                });
            }
            b"moof" | b"mdat" => return None,
            _ => {}
        }
        off = end as usize;
    }
    None
}

/// Total duration the segment index covers, in seconds.
fn sidx_duration(sidx: &[u8]) -> Option<f64> {
    let version = *sidx.get(8)?;
    let timescale = u32::from_be_bytes(sidx.get(16..20)?.try_into().ok()?) as f64;
    // earliest_presentation_time and first_offset: 32-bit each in v0, 64-bit in v1.
    let mut p = 20 + if version == 0 { 8 } else { 16 };
    p += 2; // reserved
    let count = u16::from_be_bytes(sidx.get(p..p + 2)?.try_into().ok()?) as usize;
    p += 2;
    let mut total: u64 = 0;
    for i in 0..count {
        let e = p + i * 12;
        total += u32::from_be_bytes(sidx.get(e + 4..e + 8)?.try_into().ok()?) as u64;
    }
    (timescale > 0.0).then(|| total as f64 / timescale)
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// A static on-demand DASH manifest. `base_url` turns a media URL into the address the
/// player should fetch it from (the caching `/preview-stream` proxy).
pub fn manifest(
    duration: f64,
    video: &[(Rendition, Layout)],
    audio: &(Rendition, Layout),
    base_url: impl Fn(&str) -> String,
) -> String {
    let segment_base = |l: &Layout| {
        format!(
            r#"<SegmentBase indexRange="{}-{}"><Initialization range="0-{}"/></SegmentBase>"#,
            l.index_start, l.index_end, l.init_end
        )
    };
    let mut v = String::new();
    for (r, l) in video {
        v.push_str(&format!(
            r#"<Representation id="v{}" codecs="{}" bandwidth="{}" width="{}" height="{}"{}><BaseURL>{}</BaseURL>{}</Representation>"#,
            xml_escape(&r.id),
            xml_escape(&r.codecs),
            r.bandwidth,
            r.width,
            r.height,
            if r.fps > 0.0 { format!(r#" frameRate="{}""#, r.fps.round() as i64) } else { String::new() },
            xml_escape(&base_url(&r.url)),
            segment_base(l),
        ));
    }
    let (ar, al) = audio;
    format!(
        concat!(
            r#"<?xml version="1.0" encoding="UTF-8"?>"#,
            r#"<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" minBufferTime="PT1.5S" mediaPresentationDuration="PT{:.3}S">"#,
            r#"<Period>"#,
            r#"<AdaptationSet contentType="video" mimeType="video/mp4" segmentAlignment="true" subsegmentAlignment="true">{}</AdaptationSet>"#,
            r#"<AdaptationSet contentType="audio" mimeType="audio/mp4" lang="und"><Representation id="a{}" codecs="{}" bandwidth="{}" audioSamplingRate="{}"><BaseURL>{}</BaseURL>{}</Representation></AdaptationSet>"#,
            r#"</Period></MPD>"#
        ),
        duration,
        v,
        xml_escape(&ar.id),
        xml_escape(&ar.codecs),
        ar.bandwidth,
        ar.sample_rate,
        xml_escape(&base_url(&ar.url)),
        segment_base(al),
    )
}
