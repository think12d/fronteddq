import { useCallback, useEffect, useState } from "react";
import { Lock, Sparkles, Volume2 } from "lucide-react";
import { api } from "../api";
import type { LiveClassRoom } from "../types";

export default function LiveClassRoomPanel({ liveClassId }: { liveClassId: number }) {
  const [room, setRoom] = useState<LiveClassRoom | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setRoom(await api<LiveClassRoom>(`/live-classes/${liveClassId}/room`));
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, [liveClassId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  if (!room && !error) {
    return (
      <div className="live-room-panel room-loading modern-card">
        <div className="pulse-loader" />
        <span>Connecting to classroom interactive audio & chat channel…</span>
      </div>
    );
  }

  if (error && !room) {
    return (
      <div className="live-room-panel notice notice-error modern-card">
        <span>{error}</span>
      </div>
    );
  }

  if (!room) return null;

  return (
    <section className="live-room-panel modern-card cyber-hud">
      <div className="live-room-heading">
        <div>
          <span className="eyebrow text-cyan">
            <Sparkles size={13} /> CLASSROOM STATUS
          </span>
          <h3 className="hud-title">Live Session</h3>
        </div>
        <div className="hud-status-badge">
          <span className="status-indicator-dot online" /> Live Stream
        </div>
      </div>

      {error && <div className="notice notice-error">{error}</div>}

      <div className="live-room-controls">
        <div className={`room-permission-chip ${room.can_talk ? "perm-allowed" : "perm-blocked"}`}>
          {room.can_talk ? <Volume2 size={13} /> : <Lock size={13} />}
          <span>
            {room.can_talk
              ? "Voice open: You may speak"
              : "Microphone locked by instructor"}
          </span>
        </div>
      </div>
    </section>
  );
}

