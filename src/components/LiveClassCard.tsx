import { useState } from "react";
import { Calendar, Clock, Radio, Video, ExternalLink, Lock } from "lucide-react";
import { useNotifications } from "../notifications";
import type { LiveClassStatus } from "../types";

export interface LiveClassCardData {
  id: number;
  title: string;
  teacherName: string;
  status: LiveClassStatus | string;
  canJoin?: boolean;
  scheduledAt: string;
  recordingStatus?: string | null;
  provider?: string;
  meetLink?: string | null;
}

export default function LiveClassCard({
  data,
  onJoin,
}: {
  data: LiveClassCardData;
  onJoin: (id: number) => void | Promise<void>;
}) {
  const notifications = useNotifications();
  const [joining, setJoining] = useState(false);
  const isLive = data.status === "LIVE";
  const isStarting = data.status === "STARTING";
  const isBroadcastReady = isLive || isStarting;
  const canJoin = data.canJoin ?? true;
  const isMeet = !data.provider || data.provider === "meet";

  const handleJoinClick = async () => {
    if (joining) return;
    setJoining(true);
    try {
      notifications.showToast({
        kind: "info",
        title: "Opening classroom",
        message: "Checking access and opening your protected classroom link…",
      });
      await onJoin(data.id);
    } catch (cause) {
      notifications.showToast({
        kind: "error",
        title: "Unable to open classroom",
        message: (cause as Error)?.message || "Please try again or sign in first.",
      });
    } finally {
      setJoining(false);
    }
  };

  return (
    <article
      className={`live-class-card modern-card ${
        isLive ? "card-live-glow live-class-card--live" : ""
      }`}
    >
      <div className="live-class-card-top">
        <div className="live-status-group">
          <span className={`status-pill ${isLive ? "status-live" : `status-${data.status.toLowerCase()}`}`}>
            {isLive ? (
              <>
                <span className="live-pulse" /> LIVE NOW
              </>
            ) : isStarting ? (
              <>
                <span className="starting-pulse" /> STARTING
              </>
            ) : (
              data.status
            )}
          </span>
          <span className="provider-chip">
            <Video size={12} /> {isMeet ? "Google Meet" : "YouTube"}
          </span>
        </div>
        <Radio size={16} className={isLive ? "text-rose pulse-fast" : "text-cyan"} />
      </div>

      <div className="live-card-body">
        <h3 className="live-card-title">{data.title}</h3>
        <p className="live-card-teacher">
          {data.teacherName ? `Instructor: ${data.teacherName}` : "NTA UGC NET Faculty"}
        </p>

        <div className="live-meta-row">
          <div className="live-meta-item">
            <Clock size={12} />
            <span>{new Date(data.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          <div className="live-meta-item">
            <Calendar size={12} />
            <span>{new Date(data.scheduledAt).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
          </div>
        </div>
      </div>

      <div className="live-card-actions">
        {isBroadcastReady && canJoin ? (
          <div className="live-card-actions">
            <button
              className={`button full ${isLive ? "button-rose" : "button-cyan"}`}
              onClick={() => void handleJoinClick()}
              disabled={joining}
            >
              <Video size={14} /> {joining ? "Opening…" : isLive ? "Join Google Meet" : "Enter Waiting Room"}
            </button>
            {data.meetLink && isBroadcastReady && (
              <a className="provider-chip" href={data.meetLink} target="_blank" rel="noreferrer">
                <ExternalLink size={12} /> Open Meet link
              </a>
            )}
          </div>
        ) : isBroadcastReady ? (
          <div className="locked-access-notice">
            <Lock size={13} />
            <span>Register and pay for this batch to attend</span>
          </div>
        ) : data.status === "COMPLETED" ? (
          <span className="replayed-note">
            Recorded replay available in library
          </span>
        ) : (
          <span className="upcoming-note">
            Classroom unlocks when session begins
          </span>
        )}
      </div>
    </article>
  );
}

