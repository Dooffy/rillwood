import { MpvPlayerViewProps } from "./MpvPlayer.types";

export default function MpvPlayerView(props: MpvPlayerViewProps) {
  const url = props.source?.url ?? "";
  return (
    <div>
      <iframe
        title="mpv player"
        style={{ flex: 1 }}
        src={url}
        onLoad={() => props.onLoad?.({ nativeEvent: { url } })}
      />
    </div>
  );
}
