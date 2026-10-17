#!/usr/bin/env bash
#
# Record the bass straight off the interface, so the detector can be tuned
# against the instrument rather than against a synthesised pluck.
#
# Usage: ./scripts/record-take.sh [seconds] [name]
#
set -euo pipefail

PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export PATH

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$REPO/data/recordings"
SECONDS_TO_RECORD="${1:-30}"
NAME="${2:-take}"
# The input is whatever the interface presents; the index comes from
# `ffmpeg -f avfoundation -list_devices true -i ""`.
DEVICE="${BASSROOM_RECORD_DEVICE:-Scarlett Solo 4th Gen}"

die() {
  printf '\nrecord-take: %s\n' "$*" >&2
  exit 1
}

command -v ffmpeg >/dev/null 2>&1 || die "ffmpeg is not installed (brew install ffmpeg)."

# AVFoundation takes an index, not a name, and the index moves when devices are
# plugged in, so it is looked up every run.
device_index() {
  ffmpeg -f avfoundation -list_devices true -i "" 2>&1 \
    | sed -n '/AVFoundation audio devices/,$p' \
    | grep -F "] $DEVICE" \
    | sed -E 's/.*\[([0-9]+)\] .*/\1/' \
    | head -1
}

main() {
  mkdir -p "$OUT_DIR"
  local index
  index="$(device_index)"
  [ -n "$index" ] || die "no audio device named '$DEVICE'. Set BASSROOM_RECORD_DEVICE to one that is listed."

  local out="$OUT_DIR/${NAME}-$(date +%Y%m%d-%H%M%S).wav"
  echo "Recording ${SECONDS_TO_RECORD}s from '$DEVICE' (device $index)."
  echo "Play when the count reaches zero. Ctrl-C stops early and keeps what was recorded."
  local count
  for count in 3 2 1; do
    printf '  %d…\n' "$count"
    sleep 1
  done
  echo "  go"

  # Native rate and every channel the interface offers. An interface can
  # present four channels with the instrument on only one of them, and
  # downmixing to mono averages the instrument with the silent ones.
  ffmpeg -hide_banner -loglevel error \
    -f avfoundation -i ":$index" \
    -t "$SECONDS_TO_RECORD" -c:a pcm_f32le -y "$out"

  echo
  echo "Wrote $out"
  split_channels "$out"
}

# Report each channel on its own, so the instrument's channel can be found.
split_channels() {
  local out="$1" channels base index
  channels="$(ffprobe -hide_banner -loglevel error -show_entries stream=channels -of default=nw=1:nk=1 "$out")"
  base="${out%.wav}"
  echo "$channels channel(s):"
  for ((index = 0; index < channels; index++)); do
    local single="${base}-ch${index}.wav"
    ffmpeg -hide_banner -loglevel error -i "$out" \
      -filter_complex "[0:a]pan=mono|c0=c${index}[m]" -map "[m]" -c:a pcm_f32le -y "$single"
    local peak
    peak="$(ffmpeg -hide_banner -loglevel error -i "$single" -af volumedetect -f null - 2>&1 \
      | sed -n 's/.*max_volume: \(.*\)/\1/p')"
    printf '  channel %d  peak %s  -> %s\n' "$index" "${peak:-unknown}" "$single"
  done
}

main "$@"
