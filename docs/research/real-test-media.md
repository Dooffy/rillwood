# Real test media (`$RILLWOOD_MEDIA/real/`)

Date: 2026-10-02. ~3.8 GB in `$RILLWOOD_MEDIA/real/` (not committed). Helper scripts: `dev/jellyfin/real-media/`.

## Files

| File                                                                    | Size                   | Duration        | Bitrate   | Streams                                                                                                                                         | Covers                         |
| ----------------------------------------------------------------------- | ---------------------- | --------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `Sintel (2010)/Sintel (2010).mkv`                                       | 3.77 GB (3767215117 B) | 11:19 (678.9 s) | 44.4 Mbps | H.264 High 4096x1744 24fps yuv420p 8-bit SDR; AC3 5.1(side) 640k; 11 SRT (ger default, eng, spa, fre, ita, dut, pol, por, rus, vie); 8 chapters | B6 (4K remux, 10 min playback) |
| `Rillwood DV P8 TrueHD PGS (2026)/Rillwood DV P8 TrueHD PGS (2026).mkv` | 41.7 MB                | 60.0 s          | 5.6 Mbps  | HEVC Main10 1920x818 24fps yuv420p10le, BT.2020/PQ, HDR10 SEI + DV P8.1 RPU; TrueHD 5.1 48k; PGS (eng) 12 cues                                  | C4 (DV P8 + TrueHD + PGS)      |

After a library refresh Jellyfin shows the C4 file as `DOVIWithHDR10` ("Dolby Vision Profile 8.1 (HDR10)") with TrueHD 5.1 and PGSSUB.

## 1. B6 - Sintel 4K (stream copy, first 11:19)

- Source: https://download.blender.org/durian/movies/Sintel.2010.4k.mkv.zip (md5 of inner file in `Sintel.2010.4k.mkv.md5`)
- Licence: CC-BY 3.0, (c) copyright Blender Foundation | durian.blender.org (https://durian.blender.org/sharing/)
- Not HEVC 10-bit / no TrueHD: all freely licensed 4K Blender masters are H.264 8-bit. Tears of Steel 4K (`tearsofsteel_4k.mov.zip`, 6.7 GB, ~73 Mbps) is higher bitrate but a 10 min cut would be ~5.5 GB - over budget. Netflix Open Content not used (IMF/ProRes packages, impractical size).
- Full file is 4.5 GB / 14:48 - cut at chapter 7 start (678.833 s) to fit the disk budget. No re-encode, all tracks + chapters kept.
- Trick: the zip uses method 0 (stored), so the MKV is a contiguous byte range at offset 96 - streamed straight into ffmpeg, no zip on disk, no unzip copy.

```bash
curl -sS -r 96-4506488330 https://download.blender.org/durian/movies/Sintel.2010.4k.mkv.zip \
 | ffmpeg -nostdin -loglevel warning -f matroska -i pipe:0 -map 0 -t 678.833 -c copy -metadata title="Sintel" sintel.mkv
# offset 96 = 30 (local header) + 18 (name) + 48 (extra); end = 96 + 4506488235 - 1
```

## 2+3. C4 - DV P8.1 + TrueHD 5.1 + PGS (generated from Sintel, CC-BY 3.0)

Source = 60 s of the Sintel 4K file above (1:45-2:45, dialogue scene, 12 English cues). Derived work, same CC-BY 3.0 attribution.

Tools:

- ffmpeg 8.1 - has libx265 and the native (experimental) TrueHD encoder. No drawtext / zscale / libass.
- `dovi_tool` 2.3.4 prebuilt (https://github.com/quietvoid/dovi_tool/releases/download/2.3.4/dovi_tool-2.3.4-universal-macOS.zip, MIT).
- `mkvmerge` v101.0 from the MKVToolNix macOS dmg (https://mkvtoolnix.download/macos/releases/101.0/MKVToolNix-101.0-1-arm64.dmg, sha256 verified, GPL-2.0), used as a dev tool only. Needed because ffmpeg can't mux raw HEVC with B-frames to MKV ("Can't write packet with unknown timestamp") and mkvmerge writes the DV config record (dvcC) from the RPU.
- Python 3.9 + Pillow 11.3 for the PGS encoder.

Steps:

1. SDR -> PQ: `sdr2pq_cube.py` writes a 33^3 `.cube` LUT (BT.1886 gamma 2.4 -> linear, BT.709 -> BT.2020 primaries, SDR white = 203 nits per BT.2408, PQ encode). Applied with ffmpeg's built-in `lut3d` so the HDR10 picture looks right, not just flagged.
2. x265 HDR10 base layer (raw Annex B, `repeat-headers`, AUD).
3. `dovi_tool generate` P8.1 RPU (static L1 + L6, 1440 frames) -> `inject-rpu`.
4. TrueHD 5.1 from Sintel's AC3 5.1 (`-c:a truehd -strict -2`) - lossy source re-encoded, fine for codec coverage.
5. PGS: `srt2sup.py` (own ~130-line encoder) renders each SRT cue with Pillow (white text, black 3px stroke, centred, bottom), quantises to 8 grey x 16 alpha palette, RLE-encodes, writes PCS/WDS/PDS/ODS/END display sets + clear sets at cue end. Cue times shifted -105 s.
6. mkvmerge mux.

```bash
SRC="$HOME/rillwood-media/real/Sintel (2010)/Sintel (2010).mkv"
R=dev/jellyfin/real-media
python3 $R/sdr2pq_cube.py sdr2pq.cube
ffmpeg -nostdin -y -ss 105 -i "$SRC" -t 60 -map 0:v:0 \
 -vf "scale=1920:-2:in_color_matrix=bt709:in_range=tv:out_range=pc:flags=lanczos,format=gbrp16le,lut3d=file=sdr2pq.cube,scale=out_color_matrix=bt2020:out_range=tv,format=yuv420p10le" \
 -c:v libx265 -preset medium -crf 18 -profile:v main10 \
 -color_primaries bt2020 -color_trc smpte2084 -colorspace bt2020nc -color_range tv \
 -x265-params "hdr10=1:hdr10-opt=1:repeat-headers=1:aud=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):max-cll=1000,400:keyint=48:log-level=error" \
 -f hevc bl.hevc                                   # ~3 min, 17 MB
ffmpeg -nostdin -y -ss 105 -i "$SRC" -t 60 -map 0:a:0 -c:a truehd -strict -2 audio.mka
cp $R/p81.json .
dovi_tool generate -j p81.json -o rpu.bin
dovi_tool inject-rpu -i bl.hevc --rpu-in rpu.bin -o dv.hevc
ffmpeg -v error -y -i "$SRC" -map 0:s:m:language:eng -c copy sintel_eng.srt
python3 $R/srt2sup.py sintel_eng.srt eng.sup 1920 818 -105 0 60
mkvmerge -q -o out.mkv --title "Rillwood DV P8 TrueHD PGS" \
 --language 0:und --default-duration 0:24p dv.hevc \
 --language 0:eng --track-name "0:TrueHD 5.1" audio.mka \
 --language 0:eng --track-name "0:English (PGS)" eng.sup
```

(`length` = frame count: `ffprobe -v error -count_packets -select_streams v:0 -show_entries stream=nb_read_packets -of csv=p=0 bl.hevc`. `max_pq 2378` = PQ(203 nits).)

Verification:

- `ffprobe -show_streams -select_streams v`: `side_data_type=DOVI configuration record`, `dv_profile=8`, `dv_level=3`, `rpu_present_flag=1`, `el_present_flag=0`, `dv_bl_signal_compatibility_id=1`; `pix_fmt=yuv420p10le`, `color_primaries=bt2020`, `color_transfer=smpte2084`, `color_space=bt2020nc`.
- Streams: `hevc` / `truehd` (6 ch, 5.1(side), 48k) / `hdmv_pgs_subtitle`.
- `dovi_tool info -s` on RPU re-extracted from the final MKV: Frames 1440, Profile 8, CM v4.0, L1 MaxCLL 203 nits, L6 1000/0.0001 nits, MaxCLL 1000 / MaxFALL 400, L5 offsets 0, L9 DCI-P3 D65.
- PGS decode: ffprobe subtitle frames alternate `num_rects=1` / `0`; overlay render at 8 s shows "It has shed much innocent blood." correctly.
- Jellyfin: `DOVIWithHDR10`, "Dolby Vision Profile 8.1 (HDR10)", PGSSUB.

Caveat: synthetic DV (static metadata, SDR-graded content mapped to 203 nits). Good for container/RPU/HDR10-fallback handling and "does it play"; not a real DV grade. A real DV P8 sample with dynamic L1/L2 would still be nice if a freely licensed one turns up.

## Test plan rows

- **C4** (DV P8 / TrueHD / PGS - plays, PGS render): runnable with `Rillwood DV P8 TrueHD PGS (2026)`.
- **B6** (4K remux, 10 min playback - no memory warning / OS kill): runnable with `Sintel (2010)` (4096x1744 H.264, 44 Mbps, 11:19). Not HEVC 10-bit; the generated `movies/` 4K HEVC covers that codec path.
- Also adds a real 11-track SRT file (track switching, languages) and chapters (chapter scrubber, M4).
- Skipped: Jellyfin jellyfish bitrate files (optional extras; not needed for C4/B6).

## Scripting into `make-test-media.sh` (later)

- New deps: `dovi_tool` (release binary, MIT), `mkvmerge` (MKVToolNix, GPL-2.0 - a dev tool, not shipped), Python 3 + Pillow (PGS). Script could download dovi_tool into a cache dir; mkvmerge via `brew install mkvtoolnix` or the dmg.
- `srt2sup.py` falls back to `ImageFont.load_default(size)` if Helvetica / DejaVu is missing.
- Sintel download is ~3.8 GB of network for B6; the C4 file can be built from a short range of it (or from `testsrc2` if a contributor skips B6).
