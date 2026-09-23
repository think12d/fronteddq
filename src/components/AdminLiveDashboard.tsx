import { useCallback, useEffect, useState } from "react";
import {
  Calendar,
  Check,
  CircleAlert,
  Clock,
  ExternalLink,
  Mic,
  MicOff,
  MessageSquare,
  Pencil,
  Play,
  RefreshCw,
  Radio,
  Save,
  Square,
  Trash2,
  Upload,
  Users,
  Video,
  X,
  Volume2
} from "lucide-react";
import { api } from "../api";
import { useNotifications } from "../notifications";
import type { LiveClass, LiveClassRoom, LiveClassParticipant } from "../types";

interface EditDraft {
  title: string;
  description: string;
  scheduledAt: string;
}

function localDateTimeValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function AdminLiveDashboard() {
  const notifications = useNotifications();
  const [classes, setClasses] = useState<LiveClass[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [moderationOpen, setModerationOpen] = useState<number | null>(null);
  const [moderationRooms, setModerationRooms] = useState<Record<number, LiveClassRoom>>({});
  const [moderationBusyId, setModerationBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<number, EditDraft>>({});

  const fetchClasses = useCallback(async () => {
    try {
      setClasses(await api<LiveClass[]>("/live-classes"));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, []);

  useEffect(() => {
    fetchClasses();
    const interval = window.setInterval(fetchClasses, 6000);
    return () => window.clearInterval(interval);
  }, [fetchClasses]);

  const clearMessages = () => {
    setError(null);
    setSuccessMessage(null);
  };

  const action = async (id: number, path: "start" | "go-live" | "end" | "retry-recording") => {
    setBusyId(id);
    clearMessages();
    try {
      await api(`/live-classes/${id}/${path}`, { method: "POST" });
      if (path === "start") {
        setSuccessMessage("Classroom started! Email invitations have been automatically dispatched to all registered learners.");
      } else if (path === "go-live") {
        setSuccessMessage("Class is now marked LIVE on the learner portal.");
      } else if (path === "end") {
        setSuccessMessage("Class ended. Drive recording processing has commenced.");
      } else if (path === "retry-recording") {
        setSuccessMessage("Retrying Drive recording processing.");
      }
      await fetchClasses();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const startAndOpen = async (item: LiveClass) => {
    setBusyId(item.id);
    clearMessages();
    try {
      const started = await api<LiveClass>(`/live-classes/${item.id}/start`, { method: "POST" });
      setSuccessMessage(`Classroom started for ${item.course_title || `course #${item.course_id}`}. Meet event synced and invitations sent to registered learners.`);
      await fetchClasses();
      if (started.meet_uri) {
        window.open(started.meet_uri, "_blank", "noopener,noreferrer");
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const beginEdit = (item: LiveClass) => {
    setEditDrafts((current) => ({
      ...current,
      [item.id]: {
        title: item.title,
        description: item.description || "",
        scheduledAt: localDateTimeValue(item.scheduled_at),
      },
    }));
    setEditingId(item.id);
    setModerationOpen(null);
    clearMessages();
  };

  const changeDraft = (id: number, field: keyof EditDraft, value: string) => {
    setEditDrafts((current) => ({
      ...current,
      [id]: { ...current[id], [field]: value },
    }));
  };

  const saveEdit = async (id: number) => {
    const draft = editDrafts[id];
    if (!draft || !draft.title.trim() || !draft.scheduledAt) return;
    setBusyId(id);
    clearMessages();
    try {
      await api(`/live-classes/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: draft.title.trim(),
          description: draft.description,
          scheduled_at: new Date(draft.scheduledAt).toISOString(),
        }),
      });
      setEditingId(null);
      setSuccessMessage("Classroom details and Google Calendar event updated.");
      await fetchClasses();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const deleteClass = async (item: LiveClass) => {
    const confirmed = await notifications.confirmAction({
      title: "Delete live class",
      message: `Delete "${item.title}"? This will also remove the Google Calendar Meet event.`,
      confirmLabel: "Delete class",
      destructive: true,
      onConfirm: async () => {
        setBusyId(item.id);
        clearMessages();
        try {
          await api(`/live-classes/${item.id}`, { method: "DELETE" });
          if (editingId === item.id) setEditingId(null);
          if (moderationOpen === item.id) setModerationOpen(null);
          setSuccessMessage("Live class deleted.");
          notifications.showToast({
            kind: "success",
            title: "Live class deleted",
            message: `${item.title} was removed successfully.`,
          });
          await fetchClasses();
        } catch (cause) {
          setError((cause as Error).message);
          notifications.showToast({
            kind: "error",
            title: "Delete failed",
            message: (cause as Error).message,
          });
        } finally {
          setBusyId(null);
        }
      },
    });
    if (!confirmed) return;
  };

  const uploadRecording = async (id: number, file: File) => {
    setBusyId(id);
    clearMessages();
    try {
      const form = new FormData();
      form.append("file", file);
      await api(`/live-classes/${id}/upload-recording`, { method: "POST", body: form });
      setSuccessMessage("Manual recording MP4 uploaded successfully.");
      await fetchClasses();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const loadModeration = async (id: number) => {
    setModerationBusyId(`load-${id}`);
    clearMessages();
    try {
      const result = await api<LiveClassRoom>(`/live-classes/${id}/room`);
      setModerationRooms((current) => ({ ...current, [id]: result }));
      setModerationOpen(id);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setModerationBusyId(null);
    }
  };

  const updateModeration = async (
    classId: number,
    studentId: number,
    change: { muted?: boolean; can_talk?: boolean; can_chat?: boolean }
  ) => {
    setModerationBusyId(`${classId}-${studentId}`);
    try {
      const result = await api<LiveClassRoom>(`/live-classes/${classId}/room/participants/${studentId}`, {
        method: "PATCH",
        body: JSON.stringify(change),
      });
      setModerationRooms((current) => ({ ...current, [classId]: result }));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setModerationBusyId(null);
    }
  };

  return (
    <section className="live-admin-dashboard cyber-section">
      <div className="admin-live-header">
        <div>
          <span className="eyebrow">
            <Radio size={14} className="pulse-cyan" /> GOOGLE MEET BROADCAST STUDIO
          </span>
          <h2 className="futuristic-heading">Live Class Management</h2>
          <p className="muted">
            Attendance is automatically synced with registered batch learners. No manual invite list needed.
          </p>
        </div>
        <button className="button button-small button-outline" onClick={() => fetchClasses()}>
          <RefreshCw size={13} /> Refresh Roster
        </button>
      </div>

      {error && (
        <div className="notice notice-error">
          <CircleAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="notice notice-success">
          <Check size={16} />
          <span>{successMessage}</span>
        </div>
      )}

      {!classes.length && (
        <div className="empty-state">
          <Video size={36} className="text-cyan" />
          <h3>No Google Meet classes scheduled</h3>
          <p>Create a live class linked to your course batch using the course manager below.</p>
        </div>
      )}

      <div className="admin-live-grid">
        {classes.map((item) => {
          const isMeet = item.provider === "meet";
          const isLive = item.status === "LIVE";
          const isStarting = item.status === "STARTING";
          const isProcessing = item.status === "PROCESSING";
          const isCompleted = item.recording_status === "COMPLETED";
          const isBusy = busyId === item.id;

          return (
            <article
              className={`admin-live-card modern-card ${isLive ? "card-live-glow" : ""}`}
              key={item.id}
            >
              <div className="admin-live-topbar">
                <div className="admin-live-status-group">
                  <span className={`status-pill status-${item.status.toLowerCase()}`}>
                    {isLive && <span className="live-pulse" />}
                    {item.status}
                  </span>
                  <span className="tag-provider">
                    {isMeet ? "Google Meet" : "Legacy YouTube"}
                  </span>
                  {item.google_calendar_event_id && (
                    <span className="tag-calendar" title="Google Calendar Event Active">
                      <Calendar size={11} /> Synced
                    </span>
                  )}
                </div>
                <div className="admin-live-time">
                  <Clock size={13} />
                  <span>{new Date(item.scheduled_at).toLocaleString()}</span>
                </div>
              </div>

              <div className="admin-live-body">
                <h3 className="admin-live-title">{item.title}</h3>
                <p className="admin-live-course">Course: {item.course_title || `#${item.course_id}`}</p>
                {item.description && <p className="admin-live-desc">{item.description}</p>}
                
                {isCompleted && (
                  <div className="drive-replay-badge">
                    <Check size={14} /> Replay permanently saved in Google Drive
                  </div>
                )}
                {isProcessing && (
                  <div className="processing-badge">
                    <RefreshCw size={13} className="spin" /> Processing recording in Drive...
                  </div>
                )}
              </div>

              <div className="admin-live-footer">
                {/* Secondary Actions: Edit, Moderation, Delete */}
                <div className="admin-live-actions-group">
                  <button
                    className="button button-small button-outline"
                    disabled={isBusy}
                    onClick={() => beginEdit(item)}
                  >
                    <Pencil size={13} /> Edit
                  </button>
                  <button
                    className="button button-small button-outline"
                    disabled={moderationBusyId === `load-${item.id}` || isBusy}
                    onClick={() => void loadModeration(item.id)}
                  >
                    <Users size={13} /> Classroom ({moderationRooms[item.id]?.participants?.length ?? "Roster"})
                  </button>
                  <button
                    className="button button-small button-danger"
                    disabled={isBusy}
                    onClick={() => void deleteClass(item)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Primary State Actions */}
                <div className="admin-live-actions-group primary-actions">
                  {isMeet && (item.status === "SCHEDULED" || item.status === "START_FAILED") && (
                    <button
                      className="button button-small button-cyan"
                      disabled={isBusy}
                      onClick={() => void startAndOpen(item)}
                    >
                      <Play size={13} /> Start & Open Meet
                    </button>
                  )}

                  {isMeet && item.meet_uri && (isStarting || isLive) && (
                    <a
                      className="button button-small button-outline"
                      href={item.meet_uri}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={13} /> Open Meet Link
                    </a>
                  )}

                  {isMeet && isStarting && (
                    <button
                      className="button button-small button-emerald"
                      disabled={isBusy}
                      onClick={() => void action(item.id, "go-live")}
                    >
                      <Radio size={13} /> Mark Live
                    </button>
                  )}

                  {isLive && (
                    <button
                      className="button button-small button-rose"
                      disabled={isBusy}
                      onClick={() => void action(item.id, "end")}
                    >
                      <Square size={13} /> End Class
                    </button>
                  )}

                  {item.status === "PROCESSING" && item.recording_status === "UPLOAD_FAILED" && (
                    <button
                      className="button button-small button-cyan"
                      disabled={isBusy}
                      onClick={() => void action(item.id, "retry-recording")}
                    >
                      <RefreshCw size={13} /> Retry Drive Sync
                    </button>
                  )}

                  {item.status === "PROCESSING" &&
                    ["WAITING", "PROCESSING", "UPLOAD_FAILED", null].includes(item.recording_status ?? null) && (
                      <label className="button button-small button-outline upload-btn">
                        <Upload size={13} /> Upload MP4
                        <input
                          type="file"
                          accept="video/mp4,video/quicktime"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void uploadRecording(item.id, file);
                          }}
                        />
                      </label>
                    )}
                </div>
              </div>

              {/* Edit Classroom Inline Drawer */}
              {editingId === item.id && editDrafts[item.id] && (
                <div className="live-edit-panel cyber-drawer">
                  <div className="drawer-header">
                    <h4>Edit Classroom Configuration</h4>
                    <button className="close-btn" onClick={() => setEditingId(null)}>
                      <X size={15} />
                    </button>
                  </div>
                  <div className="drawer-body">
                    <label>
                      <span>Class Title</span>
                      <input
                        value={editDrafts[item.id].title}
                        onChange={(e) => changeDraft(item.id, "title", e.target.value)}
                        maxLength={240}
                        placeholder="e.g. Paper 1 Masterclass: Teaching Aptitude"
                      />
                    </label>
                    <label>
                      <span>Description</span>
                      <textarea
                        value={editDrafts[item.id].description}
                        onChange={(e) => changeDraft(item.id, "description", e.target.value)}
                        placeholder="Outline concepts and target topics covered in this session"
                        rows={3}
                      />
                    </label>
                    <label>
                      <span>Scheduled Date & Time</span>
                      <input
                        type="datetime-local"
                        value={editDrafts[item.id].scheduledAt}
                        onChange={(e) => changeDraft(item.id, "scheduledAt", e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="drawer-footer">
                    <button
                      className="button button-small button-cyan"
                      disabled={
                        isBusy ||
                        !editDrafts[item.id].title.trim() ||
                        !editDrafts[item.id].scheduledAt
                      }
                      onClick={() => void saveEdit(item.id)}
                    >
                      <Save size={13} /> Save & Sync Calendar
                    </button>
                    <button className="button button-small button-outline" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Classroom Moderation Drawer */}
              {moderationOpen === item.id && (
                <div className="live-moderation-panel cyber-drawer">
                  <div className="drawer-header">
                    <div>
                      <h4>Classroom Audio & Chat Moderation</h4>
                      <small className="muted">
                        Manage participant permissions for live Google Meet learners.
                      </small>
                    </div>
                    <button className="close-btn" onClick={() => setModerationOpen(null)}>
                      <X size={15} />
                    </button>
                  </div>

                  <div className="drawer-body moderation-roster">
                    {(moderationRooms[item.id]?.participants || []).length ? (
                      moderationRooms[item.id].participants.map((student) => {
                        const busy = moderationBusyId === `${item.id}-${student.user_id}`;
                        return (
                          <div className="moderation-student-card" key={student.user_id}>
                            <div className="student-info">
                              <div className="student-avatar-wrap">
                                <span className="student-avatar">
                                  {student.full_name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <b>{student.full_name}</b>
                                <small className="muted">{student.email}</small>
                              </div>
                              <span
                                className={`moderation-pill ${
                                  student.is_muted ? "pill-muted" : "pill-active"
                                }`}
                              >
                                {student.is_muted
                                  ? student.force_muted
                                    ? "Admin Muted"
                                    : "Self Muted"
                                  : "Speaking Open"}
                              </span>
                            </div>

                            <div className="moderation-controls">
                              <button
                                className={`button button-xs ${
                                  student.is_muted ? "button-cyan" : "button-outline"
                                }`}
                                disabled={busy}
                                onClick={() =>
                                  void updateModeration(item.id, student.user_id, {
                                    muted: !student.is_muted,
                                  })
                                }
                              >
                                {student.is_muted ? <Volume2 size={12} /> : <MicOff size={12} />}
                                {student.is_muted ? "Unmute" : "Force Mute"}
                              </button>

                              <label className="toggle-label">
                                <input
                                  type="checkbox"
                                  checked={student.can_talk}
                                  disabled={busy}
                                  onChange={(e) =>
                                    void updateModeration(item.id, student.user_id, {
                                      can_talk: e.target.checked,
                                    })
                                  }
                                />
                                <Mic size={12} /> Allow Mic
                              </label>

                              <label className="toggle-label">
                                <input
                                  type="checkbox"
                                  checked={student.can_chat}
                                  disabled={busy}
                                  onChange={(e) =>
                                    void updateModeration(item.id, student.user_id, {
                                      can_chat: e.target.checked,
                                    })
                                  }
                                />
                                <MessageSquare size={12} /> Allow Chat
                              </label>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="empty-roster-note">
                        <Users size={20} className="muted" />
                        <p>No active participants in classroom yet.</p>
                      </div>
                    )}
                  </div>

                  <div className="drawer-footer">
                    <button
                      className="button button-small button-outline"
                      onClick={() => void loadModeration(item.id)}
                    >
                      <RefreshCw size={12} /> Refresh Participants
                    </button>
                    <button className="button button-small button-outline" onClick={() => setModerationOpen(null)}>
                      Done
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}