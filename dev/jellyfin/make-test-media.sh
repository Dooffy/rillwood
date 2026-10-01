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
Dialogue: 0,0:00:01.00,0:00:10.00,Default,Ukrainian styled subtitle (ASS)
Dialogue: 0,0:00:12.00,0:00:25.00,Default,{\an8}Top-aligned ASS line
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

movie "4K HEVC 10bit" -f lavfi -i "testsrc2=size=3840x2160:rate=24:duration=$SECS" "${TONE[@]}" \
  -map 0:v -map 1:a -c:v libx265 -preset ultrafast -crf 28 -pix_fmt yuv420p10le -tag:v hvc1 -x265-params log-level=error -c:a aac -b:a 160k

# Show: 3 x 2-minute episodes for resume (>1 min), Next Up and autoplay-next
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

echo
echo "Done: $MEDIA"
echo "Add real files for DV P8 and PGS to $MEDIA/real/ (see README.md)."
