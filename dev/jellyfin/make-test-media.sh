#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Generates the synthetic playback test matrix (CLAUDE.md §8 M0) into $RILLWOOD_MEDIA.
# Needs ffmpeg with libx264, libx265 (10-bit), libsvtav1. Re-runnable: skips files that exist.
# Not covered (needs real files in $RILLWOOD_MEDIA/real/): Dolby Vision P8, PGS subtitles.
set -euo pipefail

MEDIA="${RILLWOOD_MEDIA:-$HOME/rillwood-media}"
MOVIES="$MEDIA/movies"
SHOWS="$MEDIA/shows"
mkdir -p "$MOVIES" "$SHOWS" "$MEDIA/real"

command -v ffmpeg >/dev/null || { echo "ffmpeg not found (brew install ffmpeg)" >&2; exit 1; }

SECS=30
SRC=(-f lavfi -i "testsrc2=size=1920x1080:rate=24:duration=$SECS")
TONE=(-f lavfi -i "sine=frequency=440:sample_rate=48000:duration=$SECS")
TONE2=(-f lavfi -i "sine=frequency=880:sample_rate=48000:duration=$SECS")
Q=(-hide_banner -loglevel error -y)
export SVT_LOG=1 # SVT-AV1: errors only

# Subtitle files shared by the clips
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cat >"$TMP/en.srt" <<'SRT'
1
00:00:01,000 --> 00:00:10,000
English subtitle (SRT)

2
00:00:12,000 --> 00:00:25,000
Second line - check timing and position
SRT
cat >"$TMP/uk.ass" <<'ASS'
[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BorderStyle, Outline, Alignment, MarginV
Style: Default,Arial,64,&H0000FFFF,&H00000000,1,3,2,60

[Events]
Format: Layer, Start, End, Style, Text
Dialogue: 0,0:00:01.00,0:00:10.00,Default,Українські субтитри (ASS) - ґ є і ї
Dialogue: 0,0:00:12.00,0:00:25.00,Default,{\an8}Рядок угорі (ASS)
ASS

movie() { # movie <title> <ffmpeg args...>  -> movies/<title> (2026)/<title> (2026).mkv
  local title="$1"; shift
  local dir="$MOVIES/$title (2026)" out
  out="$dir/$title (2026).mkv"
  [[ -f "$out" ]] && { echo "skip  $title"; return; }
  mkdir -p "$dir"
  echo "make  $title"
  # Write to .part and rename on success, so an interrupted run never leaves a broken clip to "skip"
  ffmpeg "${Q[@]}" "$@" -f matroska "$out.part" && mv "$out.part" "$out"
}

movie "H264 AAC SRT" "${SRC[@]}" "${TONE[@]}" -i "$TMP/en.srt" \
  -map 0:v -map 1:a -map 2:s -c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 160k -c:s srt \
  -metadata:s:a:0 language=eng -metadata:s:s:0 language=eng
cp -n "$TMP/en.srt" "$MOVIES/H264 AAC SRT (2026)/H264 AAC SRT (2026).en.srt" 2>/dev/null || true

movie "HEVC 10bit AC3 ASS" "${SRC[@]}" "${TONE[@]}" -i "$TMP/uk.ass" \
  -map 0:v -map 1:a -map 2:s -c:v libx265 -preset fast -crf 26 -pix_fmt yuv420p10le -tag:v hvc1 -x265-params log-level=error \
  -c:a ac3 -ac 6 -b:a 448k -c:s ass -metadata:s:a:0 language=eng -metadata:s:s:0 language=ukr

movie "HEVC HDR10 EAC3" "${SRC[@]}" "${TONE[@]}" \
  -map 0:v -map 1:a -c:v libx265 -preset fast -crf 26 -pix_fmt yuv420p10le -tag:v hvc1 \
  -x265-params "log-level=error:hdr10=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):max-cll=1000,400" \
  -c:a eac3 -ac 6 -b:a 640k

movie "AV1 AAC" "${SRC[@]}" "${TONE[@]}" \
  -map 0:v -map 1:a -c:v libsvtav1 -preset 10 -crf 35 -pix_fmt yuv420p10le -c:a aac -b:a 160k

movie "H264 DTS" "${SRC[@]}" "${TONE[@]}" \
  -map 0:v -map 1:a -c:v libx264 -preset veryfast -crf 23 -c:a dca -strict -2 -ac 6

movie "H264 TrueHD" "${SRC[@]}" "${TONE[@]}" \
  -map 0:v -map 1:a -c:v libx264 -preset veryfast -crf 23 -c:a truehd -strict -2 -ac 6

movie "Multi Audio Multi Subs" "${SRC[@]}" "${TONE[@]}" "${TONE2[@]}" -i "$TMP/en.srt" -i "$TMP/uk.ass" \
  -map 0:v -map 1:a -map 2:a -map 3:s -map 4:s -c:v libx264 -preset veryfast -crf 23 \
  -c:a:0 aac -b:a:0 160k -c:a:1 ac3 -b:a:1 384k -c:s:0 srt -c:s:1 ass \
  -metadata:s:a:0 language=eng -metadata:s:a:0 title="English 440Hz" \
  -metadata:s:a:1 language=ukr -metadata:s:a:1 title="Ukrainian 880Hz" \
  -metadata:s:s:0 language=eng -metadata:s:s:1 language=ukr -disposition:s:0 default

# One SRT per script: CJK, Hangul, RTL (font fallback + bidi)
srt() { # srt <file> <text>
  printf '1\n00:00:01,000 --> 00:00:25,000\n%s\n' "$2" >"$TMP/$1"
}
srt ja.srt "日本語の字幕 - ひらがな カタカナ"
srt zh.srt "中文字幕 测试"
srt ko.srt "한국어 자막"
srt ar.srt "ترجمة عربية"
srt he.srt "כתוביות בעברית"
movie "Multi Script Subs" "${SRC[@]}" "${TONE[@]}" \
  -i "$TMP/ja.srt" -i "$TMP/zh.srt" -i "$TMP/ko.srt" -i "$TMP/ar.srt" -i "$TMP/he.srt" \
  -map 0:v -map 1:a -map 2:s -map 3:s -map 4:s -map 5:s -map 6:s \
  -c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 160k -c:s srt \
  -metadata:s:s:0 language=jpn -metadata:s:s:1 language=zho -metadata:s:s:2 language=kor \
  -metadata:s:s:3 language=ara -metadata:s:s:4 language=heb

# Sidecar track ids (mpv numbers sidecars after the embedded subs, in the order they're added): an embedded English
# SRT + German and French sidecars, each with its own text so the screen shows which one loaded. "Missing Sidecar" is
# the same; delete its German file after the library scan (test plan T2) so the server lists a sidecar that 404s.
srt en-embedded.srt "English - embedded"
srt de.srt "Deutsch - sidecar"
srt fr.srt "Français - sidecar"
for title in "Sidecar Subs" "Missing Sidecar"; do
  dir="$MOVIES/$title (2026)"
  [[ -f "$dir/$title (2026).mkv" ]] && { echo "skip  $title"; continue; }
  movie "$title" "${SRC[@]}" "${TONE[@]}" -i "$TMP/en-embedded.srt" \
    -map 0:v -map 1:a -map 2:s -c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 160k -c:s srt \
    -metadata:s:a:0 language=eng -metadata:s:s:0 language=eng
  # UTF-8 BOM: without one Jellyfin guesses the charset of a short sidecar and serves "Français" as "Fran├žais"
  for lang in de fr; do
    { printf '\xef\xbb\xbf'; cat "$TMP/$lang.srt"; } >"$dir/$title (2026).$lang.srt"
  done
done

movie "4K HEVC 10bit" -f lavfi -i "testsrc2=size=3840x2160:rate=24:duration=$SECS" "${TONE[@]}" \
  -map 0:v -map 1:a -c:v libx265 -preset ultrafast -crf 28 -pix_fmt yuv420p10le -tag:v hvc1 -x265-params log-level=error -c:a aac -b:a 160k

# Resume: 7 minutes, small. Jellyfin keeps resume points only for items >= 300 s (MinResumeDurationSeconds);
# at 420 s the server thresholds land on 21 s (5 %) and 378 s (90 %)
movie "Resume Test" -f lavfi -i "testsrc2=size=320x180:rate=24:duration=420" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=420" \
  -map 0:v -map 1:a -c:v libx264 -preset veryfast -b:v 200k -pix_fmt yuv420p -c:a aac -b:a 64k

# Show: 3 x 2-minute episodes for Next Up and autoplay-next (too short for server resume points, see Resume Test)
SHOW="$SHOWS/Test Show (2026)/Season 01"
mkdir -p "$SHOW"
for ep in 1 2 3; do
  out="$SHOW/Test Show S01E0$ep.mkv"
  [[ -f "$out" ]] && { echo "skip  Test Show S01E0$ep"; continue; }
  echo "make  Test Show S01E0$ep"
  ffmpeg "${Q[@]}" -f lavfi -i "testsrc2=size=1280x720:rate=24:duration=120" \
    -f lavfi -i "sine=frequency=$((300 + ep * 100)):sample_rate=48000:duration=120" \
    -map 0:v -map 1:a -c:v libx264 -preset veryfast -crf 26 -c:a aac -b:a 128k \
    -metadata title="Episode $ep" -f matroska "$out.part" && mv "$out.part" "$out"
done

# Language Show: English + Ukrainian audio and subtitles in every episode, for remembered track languages. E02 lists
# them in the other order (Ukrainian first), so carrying a choice by language and by stream index give different tracks.
# Plain SRT for Ukrainian: converting uk.ass to SRT keeps only empty style tags (blank subtitles)
srt uk.srt "Українські субтитри (SRT)"
LANG_SHOW="$SHOWS/Language Show (2026)/Season 01"
mkdir -p "$LANG_SHOW"
for ep in 1 2 3; do
  out="$LANG_SHOW/Language Show S01E0$ep.mkv"
  [[ -f "$out" ]] && { echo "skip  Language Show S01E0$ep"; continue; }
  echo "make  Language Show S01E0$ep"
  if [[ $ep == 2 ]]; then order=(uk en); else order=(en uk); fi
  inputs=() meta=()
  for i in 0 1; do # per language: its tone + subtitle as inputs, its stream metadata
    case ${order[$i]} in
      en) lang=eng title="English 440Hz" inputs+=("${TONE[@]}" -i "$TMP/en.srt") ;;
      uk) lang=ukr title="Ukrainian 880Hz" inputs+=("${TONE2[@]}" -i "$TMP/uk.srt") ;;
    esac
    meta+=(-metadata:s:a:$i language=$lang -metadata:s:a:$i title="$title" -metadata:s:s:$i language=$lang)
  done
  ffmpeg "${Q[@]}" "${SRC[@]}" "${inputs[@]}" \
    -map 0:v -map 1:a -map 3:a -map 2:s -map 4:s -c:v libx264 -preset veryfast -crf 26 -c:a aac -b:a 128k -c:s srt \
    "${meta[@]}" -metadata title="Episode $ep" -f matroska "$out.part" && mv "$out.part" "$out"
done

# Long Show: 2 seasons x 25 short episodes (~4 MB each) for long lists - Downloads Episodes chip, a show's page (L8)
for season in 1 2; do
  dir="$SHOWS/Long Show (2026)/Season 0$season"
  mkdir -p "$dir"
  for ep in $(seq -w 1 25); do
    name="Long Show S0${season}E$ep"
    out="$dir/$name.mkv"
    [[ -f "$out" ]] && { echo "skip  $name"; continue; }
    echo "make  $name"
    ffmpeg "${Q[@]}" -f lavfi -i "testsrc2=size=640x360:rate=24:duration=$SECS" "${TONE[@]}" \
      -map 0:v -map 1:a -c:v libx264 -preset veryfast -b:v 1M -pix_fmt yuv420p -c:a aac -b:a 64k \
      -metadata title="Episode $((10#$ep))" -f matroska "$out.part" && mv "$out.part" "$out"
  done
done

# Showcase library: fictional movies + shows with artwork, for screenshots (README.md "Showcase library")
if command -v node >/dev/null; then
  node "$(dirname "$0")/make-showcase-media.mjs"
else
  echo "node not found - skipped the showcase library (make-showcase-media.mjs)" >&2
fi

echo
echo "Done: $MEDIA"
echo "Add real files for DV P8 and PGS to $MEDIA/real/ (see README.md)."
