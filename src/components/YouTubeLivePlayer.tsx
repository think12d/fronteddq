interface YouTubeLivePlayerProps {
  videoId: string;
  title: string;
  teacherName?: string;
  participantCount?: number;
  isLive?: boolean;
}

export default function YouTubeLivePlayer({
  videoId,
  title,
  teacherName,
  participantCount,
  isLive = true,
}: YouTubeLivePlayerProps) {
  const embedUrl = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&modestbranding=1&rel=0&iv_load_policy=3`;
  return (
    <div className="youtube-player">
      <div className="youtube-player-frame">
        {isLive && <span className="youtube-live-badge"><span /> LIVE</span>}
        <iframe
          src={embedUrl}
          title={title}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div className="youtube-player-meta">
        <div>
          <span className="eyebrow">LIVE CLASSROOM</span>
          <h3>{title}</h3>
          {teacherName && <p>Teacher: {teacherName}</p>}
        </div>
        {isLive && typeof participantCount === "number" && <span>{participantCount} watching</span>}
      </div>
    </div>
  );
}
