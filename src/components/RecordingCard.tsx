import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Film,
  HardDrive,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { api } from "../api";
import type { Course, LiveClass, User } from "../types";
import { useNotifications } from "../notifications";

/**
 * Drop-in module for the Admin "Recorded Videos" screen.
 *
 * Talks to the SAME existing endpoints your app already calls — nothing
 * about the Drive sync, matching engine, or data model changes here:
 *   GET   /admin/recorded-videos
 *   GET   /admin/recorded-videos/summary
 *   POST  /admin/recorded-videos/sync
 *   PATCH /admin/recorded-videos/{id}/assign          body: { live_class_id }
 *   POST  /library/recorded-videos/{drive_file_id}/drive-view
 *   GET   /live-classes
 *   GET   /admin/courses
 *
 * Usage (in App.tsx):
 *   import AdminRecordedVideosPage from "./components/AdminRecordedVideosPage";
 *   <Route path="/admin/recorded-videos" element={<AdminRecordedVideosPage user={user} />} />
 */

type AdminRecordedVideo = {
  id: number;
  drive_file_id: string;
  file_name: string;
  mime_type?: string | null;
  file_size?: number | null;
  drive_created_at?: string | null;
  drive_modified_at?: string | null;
  duration_seconds?: number | null;
  live_class_id?: number | null;
  course_id?: number | null;
  live_class_title?: string | null;
  course_title?: string | null;
  suggested_course_id?: number | null;
  suggested_course_title?: string | null;
  status: string;
  matching_source?: string | null;
  match_confidence?: string | null;
  available?: boolean;
  last_error?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type RecordedVideosSummary = { total: number; assigned: number; unassigned: number };

function isAssigned(record: AdminRecordedVideo): boolean {
  return record.status === "ASSIGNED" && Boolean(record.live_class_id || record.course_id);
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatWhen(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminRecordedVideosPage({ user }: { user: User | null }) {
  const notifications = useNotifications();
  const [records, setRecords] = useState<AdminRecordedVideo[]>([]);
  const [liveClasses, setLiveClasses] = useState<LiveClass[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [summary, setSummary] = useState<RecordedVideosSummary>({ total: 0, assigned: 0, unassigned: 0 });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [tab, setTab] = useState<"all" | "assigned" | "unassigned">("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name">("newest");
  const [pendingCourseByRecord, setPendingCourseByRecord] = useState<Record<number, string>>({});
  const [pendingClassByRecord, setPendingClassByRecord] = useState<Record<number, string>>({});
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [previewItem, setPreviewItem] = useState<AdminRecordedVideo | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const pageSize = 8;

  const load = async () => {
    setLoading(true);
    try {
      const [items, stats, classes, allCourses] = await Promise.all([
        api<AdminRecordedVideo[]>("/admin/recorded-videos"),
        api<RecordedVideosSummary>("/admin/recorded-videos/summary"),
        api<LiveClass[]>("/live-classes"),
        api<Course[]>("/admin/courses"),
      ]);
      const uniqueItems = Array.from(
        new Map(items.map((item) => [item.drive_file_id, item])).values(),
      );
      const suggestionResponse = uniqueItems.length
        ? await api<{
            suggestions: {
              id: number;
              course_id: number | null;
              course_title: string | null;
            }[];
          }>("/admin/recorded-videos/course-suggestions", {
            method: "POST",
            body: JSON.stringify({
              files: uniqueItems.slice(0, 500).map(({ id, file_name }) => ({ id, file_name })),
            }),
          }).catch(() => ({ suggestions: [] }))
        : { suggestions: [] };
      const suggestionsById = new Map(
        suggestionResponse.suggestions.map((item) => [item.id, item]),
      );
      setRecords(uniqueItems.map((item) => {
        const suggestion = suggestionsById.get(item.id);
        return {
          ...item,
          suggested_course_id: suggestion?.course_id ?? null,
          suggested_course_title: suggestion?.course_title ?? null,
        };
      }));
      setSummary(stats);
      setLiveClasses(classes);
      setCourses(allCourses);
      setError("");
    } catch (cause) {
      setError((cause as Error).message || "Unable to load recorded videos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role !== "admin") return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    setPage(1);
  }, [tab, search, sortBy]);

  const courseTitleById = useMemo(() => {
    const map = new Map<number, string>();
    for (const course of courses) map.set(course.id, course.title);
    return map;
  }, [courses]);

  const liveClassById = useMemo(() => {
    const map = new Map<number, LiveClass>();
    for (const item of liveClasses) map.set(item.id, item);
    return map;
  }, [liveClasses]);

  const enrichedRecords = useMemo(() => {
    return records.map((record) => {
      const liveClass = record.live_class_id ? liveClassById.get(record.live_class_id) || null : null;
      const courseTitle = record.course_id
        ? courseTitleById.get(record.course_id) || ""
        : liveClass
          ? courseTitleById.get(liveClass.course_id) || ""
          : "";
      return {
        ...record,
        liveClassTitle: record.live_class_title || liveClass?.title || (record.course_id && !record.live_class_id ? "Prerecorded video" : ""),
        courseTitle,
      };
    });
  }, [records, liveClassById, courseTitleById]);

  const visibleRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = enrichedRecords.filter((record) => {
      const matchesTab =
        tab === "all" || (tab === "assigned" ? isAssigned(record) : !isAssigned(record));
      const matchesSearch =
        !query ||
        `${record.file_name} ${record.courseTitle} ${record.suggested_course_title || ""} ${record.liveClassTitle}`.toLowerCase().includes(query);
      return matchesTab && matchesSearch;
    });
    return [...filtered].sort((left, right) => {
      if (sortBy === "name") return (left.file_name || "").localeCompare(right.file_name || "");
      const leftDate = left.drive_created_at ? Date.parse(left.drive_created_at) : new Date(left.created_at || 0).getTime();
      const rightDate = right.drive_created_at ? Date.parse(right.drive_created_at) : new Date(right.created_at || 0).getTime();
      return sortBy === "oldest" ? leftDate - rightDate : rightDate - leftDate;
    });
  }, [enrichedRecords, search, sortBy, tab]);

  const totalPages = Math.max(1, Math.ceil(visibleRecords.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRecords = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return visibleRecords.slice(start, start + pageSize);
  }, [safePage, visibleRecords]);

  const syncNow = async () => {
    setSyncing(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ checked: number; assigned: number; unassigned: number; message: string }>(
        "/admin/recorded-videos/sync",
        { method: "POST" },
      );
      setNotice(`${result.message} — ${result.checked} checked, ${result.assigned} matched, ${result.unassigned} need review.`);
      notifications.showToast({
        kind: "success",
        title: "Recordings synced",
        message: `${result.checked} videos checked, ${result.assigned} matched.`,
      });
      await load();
    } catch (cause) {
      const messageText = (cause as Error).message || "Unable to sync recordings right now.";
      setError(messageText);
      notifications.showToast({ kind: "error", title: "Sync failed", message: messageText });
    } finally {
      setSyncing(false);
    }
  };

  const assignRecording = async (recordId: number, courseId: string, liveClassId: string) => {
    const selectedCourseId = Number(courseId);
    const selectedLiveClassId = liveClassId ? Number(liveClassId) : null;
    if (!selectedCourseId) {
      setError("Choose a course before assigning this recording.");
      return;
    }
    setAssigningId(recordId);
    setError("");
    setNotice("");
    try {
      await api(`/admin/recorded-videos/${recordId}/assign`, {
        method: "PATCH",
        body: JSON.stringify({ course_id: selectedCourseId, live_class_id: selectedLiveClassId }),
      });
      const assignmentMessage = selectedLiveClassId
        ? "Linked to the selected live class."
        : "Assigned as a prerecorded course video.";
      setNotice(`Recording assigned. ${assignmentMessage}`);
      notifications.showToast({ kind: "success", title: "Recording assigned", message: assignmentMessage });
      await load();
    } catch (cause) {
      const messageText = (cause as Error).message || "Unable to assign this recording.";
      setError(messageText);
      notifications.showToast({ kind: "error", title: "Assignment failed", message: messageText });
    } finally {
      setAssigningId(null);
    }
  };

  const uploadRecording = async (file: File) => {
    const extension = file.name.split(".").pop()?.toLowerCase();
    const acceptedMimeTypes: Record<string, string[]> = {
      webm: ["video/webm"],
      mp4: ["video/mp4"],
      mp3: ["audio/mpeg", "audio/mp3", "audio/x-mpeg"],
    };
    if (!extension || !acceptedMimeTypes[extension]) {
      setError("Choose a WEBM, MP4, or MP3 recording.");
      return;
    }
    if (file.type && file.type !== "application/octet-stream" && !acceptedMimeTypes[extension].includes(file.type)) {
      setError("The selected file type does not match its extension.");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError("Recordings must be no larger than 100 MB.");
      return;
    }

    setUploading(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api<AdminRecordedVideo>("/admin/recorded-videos/upload", {
        method: "POST",
        body: form,
      });
      setNotice(`${result.file_name} uploaded and added as unassigned.`);
      notifications.showToast({
        kind: "success",
        title: "Recording uploaded",
        message: "The recording is ready for Live Class assignment.",
      });
      await load();
    } catch (cause) {
      const message = (cause as Error).message || "Unable to upload this recording.";
      setError(message);
      notifications.showToast({ kind: "error", title: "Upload failed", message });
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  };

  const openPreview = async (record: AdminRecordedVideo) => {
    setPreviewBusy(true);
    setPreviewUrl("");
    setPreviewItem(record);
    try {
      const result = await api<{ url: string }>(`/library/recorded-videos/${record.drive_file_id}/drive-view`, {
        method: "POST",
      });
      setPreviewUrl(result.url);
    } catch (cause) {
      setError((cause as Error).message || "Unable to load the preview right now.");
      setPreviewItem(null);
    } finally {
      setPreviewBusy(false);
    }
  };

  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1);

  if (!user || user.role !== "admin") {
    return (
      <div className="rv2-root">
        <style>{RV2_STYLES}</style>
        <div className="rv2-guard">
          <ShieldCheck size={24} />
          <p>Admin access only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rv2-root">
      <style>{RV2_STYLES}</style>

      <header className="rv2-header">
        <div>
          <span className="rv2-eyebrow">Recorded Videos</span>
          <h1>Live class recordings</h1>
          <p className="rv2-subtitle">Recordings from Google Drive, matched to live classes automatically.</p>
        </div>
        <div className="rv2-header-actions">
          <input
            ref={uploadInputRef}
            type="file"
            accept=".webm,.mp4,.mp3,video/webm,video/mp4,audio/mpeg"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void uploadRecording(file);
            }}
          />
          <button
            className="rv2-btn rv2-btn-ghost"
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload size={16} /> {uploading ? "Uploading…" : "Upload recording"}
          </button>
          <button className="rv2-btn rv2-btn-primary" type="button" onClick={() => void syncNow()} disabled={syncing}>
            <RefreshCw size={16} className={syncing ? "rv2-spin" : ""} />
            {syncing ? "Syncing…" : "Sync Google Drive"}
          </button>
        </div>
      </header>

      {notice && (
        <div className="rv2-banner rv2-banner-success">
          <Check size={16} />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="rv2-banner rv2-banner-error">
          <span>{error}</span>
        </div>
      )}

      <div className="rv2-stats">
        <div className="rv2-stat">
          <span className="rv2-stat-label">Total videos</span>
          <span className="rv2-stat-value">{summary.total || records.length}</span>
        </div>
        <div className="rv2-stat rv2-stat-success">
          <span className="rv2-stat-label">Assigned</span>
          <span className="rv2-stat-value">{summary.assigned || records.filter(isAssigned).length}</span>
        </div>
        <div className="rv2-stat rv2-stat-warning">
          <span className="rv2-stat-label">Unassigned</span>
          <span className="rv2-stat-value">{summary.unassigned || records.filter((item) => !isAssigned(item)).length}</span>
        </div>
      </div>

      <div className="rv2-toolbar">
        <div className="rv2-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by file, course or live class…"
          />
        </div>
        <div className="rv2-tabs">
          {(["all", "assigned", "unassigned"] as const).map((key) => (
            <button
              key={key}
              type="button"
              className={`rv2-tab ${tab === key ? "is-active" : ""}`}
              onClick={() => setTab(key)}
            >
              {key === "all" ? "All" : key === "assigned" ? "Assigned" : "Unassigned"}
            </button>
          ))}
        </div>
        <select className="rv2-sort" value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>

      {loading ? (
        <div className="rv2-loading">
          <RefreshCw size={18} className="rv2-spin" />
          <span>Loading recordings…</span>
        </div>
      ) : paginatedRecords.length === 0 ? (
        <div className="rv2-empty">
          <Film size={22} />
          <h3>No recordings here yet.</h3>
          <p>Run a sync to pull the latest recordings from Google Drive.</p>
        </div>
      ) : (
        <div className="rv2-list">
          {paginatedRecords.map((record, index) => {
            const assigned = isAssigned(record);
            const pendingCourse = pendingCourseByRecord[record.id] ?? (record.suggested_course_id ? String(record.suggested_course_id) : "");
            const pendingClass = pendingClassByRecord[record.id] ?? "";
            const availableLiveClasses = liveClasses.filter((item) => String(item.course_id) === pendingCourse);
            return (
              <article
                className={`rv2-card ${assigned ? "rv2-card-assigned" : "rv2-card-unassigned"}`}
                key={record.id}
                style={{ animationDelay: `${(index % pageSize) * 35}ms` }}
              >
                <div className="rv2-card-top">
                  <div className="rv2-card-title">
                    <Film size={16} />
                    <span title={record.file_name}>{record.file_name}</span>
                  </div>
                  <span className={`rv2-pill ${assigned ? "rv2-pill-success" : "rv2-pill-warning"}`}>
                    {assigned ? "Assigned" : "Unassigned"}
                  </span>
                </div>

                <div className="rv2-meta-row">
                  <span className="rv2-meta">
                    <HardDrive size={13} /> {formatBytes(record.file_size)}
                  </span>
                  <span className="rv2-meta">
                    <Clock3 size={13} /> {formatDuration(record.duration_seconds)}
                  </span>
                  <span className="rv2-meta">Uploaded {formatWhen(record.drive_created_at || record.created_at)}</span>
                  {record.matching_source && (
                    <span className="rv2-meta rv2-meta-tag">
                      <Sparkles size={13} /> {record.matching_source === "AUTO" ? "Auto-matched" : "Manually assigned"}
                      {record.match_confidence ? ` · ${record.match_confidence}` : ""}
                    </span>
                  )}
                </div>

                {record.last_error && <div className="rv2-warn-line">{record.last_error}</div>}

                {assigned ? (
                  <div className="rv2-assigned-info">
                    <div>
                      <span className="rv2-info-label">Course</span>
                      <span className="rv2-info-value">{record.courseTitle || "Course unavailable"}</span>
                    </div>
                    <div>
                      <span className="rv2-info-label">Live class</span>
                        <span className="rv2-info-value">{record.liveClassTitle || "—"}</span>
                    </div>
                    <button className="rv2-btn rv2-btn-ghost" type="button" onClick={() => void openPreview(record)}>
                      <Play size={14} /> Preview
                    </button>
                  </div>
                ) : (
                  <div className="rv2-assign-row">
                    <div
                      role="note"
                      style={{
                        display: "grid",
                        gap: 4,
                        marginBottom: 10,
                        padding: "10px 12px",
                        border: "1px solid var(--rv2-border)",
                        borderRadius: 10,
                      }}
                    >
                      <span className="rv2-info-label">{record.suggested_course_title ? "Suggested Course" : "Course"}</span>
                      {record.suggested_course_title ? (
                        <>
                          <strong>{record.suggested_course_title}</strong>
                          <small>Filename suggestion only. Status remains Unassigned.</small>
                        </>
                      ) : (
                        <small>No filename suggestion. Choose from all courses.</small>
                      )}
                    </div>
                    <select
                      aria-label={`Choose course for ${record.file_name}`}
                      value={pendingCourse}
                      onChange={(event) => {
                        setPendingCourseByRecord((current) => ({ ...current, [record.id]: event.target.value }));
                        setPendingClassByRecord((current) => ({ ...current, [record.id]: "" }));
                      }}
                    >
                      <option value="">Select a course…</option>
                      {courses.map((course) => (
                        <option key={course.id} value={String(course.id)}>{course.title}</option>
                      ))}
                    </select>
                    {availableLiveClasses.length > 0 ? (
                      <select
                        aria-label={`Choose Live Class for ${record.file_name}`}
                        value={pendingClass}
                        disabled={!pendingCourse}
                        onChange={(event) =>
                          setPendingClassByRecord((current) => ({ ...current, [record.id]: event.target.value }))
                        }
                      >
                        <option value="">Select a Live Class…</option>
                        {availableLiveClasses.map((item) => (
                          <option key={item.id} value={String(item.id)}>{item.title}</option>
                        ))}
                      </select>
                    ) : pendingCourse ? (
                      <div className="rv2-info-value" role="status">No Live Class — Prerecorded Video</div>
                    ) : null}
                    <button
                      className="rv2-btn rv2-btn-primary"
                      type="button"
                      disabled={assigningId === record.id || !pendingCourse || (availableLiveClasses.length > 0 && !pendingClass)}
                      onClick={() => void assignRecording(record.id, pendingCourse, pendingClass)}
                    >
                      {assigningId === record.id ? "Assigning…" : "Assign recording"}
                    </button>
                    <button className="rv2-btn rv2-btn-ghost" type="button" onClick={() => void openPreview(record)}>
                      <Play size={14} /> Preview
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="rv2-pagination">
          <button
            type="button"
            className="rv2-btn rv2-btn-ghost"
            disabled={safePage === 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            <ChevronLeft size={14} /> Prev
          </button>
          {pageNumbers.map((number) => (
            <button
              key={number}
              type="button"
              className={`rv2-page ${safePage === number ? "is-active" : ""}`}
              onClick={() => setPage(number)}
            >
              {number}
            </button>
          ))}
          <button
            type="button"
            className="rv2-btn rv2-btn-ghost"
            disabled={safePage === totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}

      {previewItem && (
        <div className="rv2-modal-backdrop" onClick={() => setPreviewItem(null)}>
          <div className="rv2-modal" onClick={(event) => event.stopPropagation()}>
            <button className="rv2-modal-close" type="button" onClick={() => setPreviewItem(null)} aria-label="Close preview">
              <X size={16} />
            </button>
            <h3>{previewItem.file_name}</h3>
            {previewUrl ? (
              <video src={previewUrl} controls playsInline autoPlay />
            ) : previewBusy ? (
              <div className="rv2-modal-loading">
                <RefreshCw size={18} className="rv2-spin" />
                <span>Preparing preview…</span>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

type RecordingCardData = {
  liveClassId?: number;
  courseId?: number;
  hideWhenEmpty?: boolean;
  title: string;
  topic: string;
  date?: string;
  paymentUrl: string;
};

type LearnerRecording = {
  id: string;
  name: string;
  mime_type: string;
  course_id: number;
  live_class_id: number | null;
  meeting_name?: string;
  display_name?: string;
  recorded_at?: string | null;
  play_url: string;
};

export default function RecordingCard({ data }: { data: RecordingCardData }) {
  const [recordings, setRecordings] = useState<LearnerRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api<{ items: LearnerRecording[]; premium_required?: boolean }>('/library/recorded-videos')
      .then((library) => {
        if (!active) return;
        if (library.premium_required) {
          setError('Course access is required to play this recording.');
          return;
        }

        const matching = (library.items || []).filter((item) =>
          data.liveClassId !== undefined
            ? item.live_class_id === data.liveClassId
            : item.live_class_id === null && item.course_id === data.courseId,
        );

        setRecordings(matching);
        if (matching.length === 0 && !data.hideWhenEmpty) setError('Recording is not available yet.');
      })
      .catch((cause) => {
        if (active) setError((cause as Error).message || 'Unable to load this recording.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [data.title, data.topic, data.liveClassId, data.courseId, data.hideWhenEmpty]);

  if (data.hideWhenEmpty && !loading && !error && recordings.length === 0) return null;

  return (
    <article className="recording-card">
      <div className="recording-card-copy">
        <span className="eyebrow">CLASS RECORDING</span>
        <h3>{data.title}</h3>
        <p>{data.topic}</p>
        {data.date && <small>{new Date(data.date).toLocaleDateString("en-IN")}</small>}
      </div>
      {loading ? (
        <p className="muted">Loading recording…</p>
      ) : recordings.length ? (
        <div className="recording-card-media-list">
          {recordings.map((recording) => {
            const mediaType = (recording.mime_type || "video/mp4").toLowerCase();
            const isAudio = mediaType.startsWith("audio/");
            return (
              <div key={`${recording.id}-${recording.play_url}`} className="recording-card-media-item">
                <span>{recording.name}</span>
                {isAudio ? (
                  <audio controls preload="metadata" src={recording.play_url}>
                    Your browser does not support audio playback.
                  </audio>
                ) : (
                  <video controls playsInline preload="metadata" src={recording.play_url}>
                    Your browser does not support video playback.
                  </video>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="recording-card-error" role="status">
          <span>{error}</span>
          {(error.includes("402") || error.toLowerCase().includes("access")) && (
            <a href={data.paymentUrl}>View course access</a>
          )}
        </div>
      )}
    </article>
  );
}

const RV2_STYLES = `
.rv2-root {
  --rv2-bg: #f6f7fb;
  --rv2-surface: #ffffff;
  --rv2-border: #e6e8f2;
  --rv2-ink: #14172b;
  --rv2-muted: #6b7089;
  --rv2-accent: #4f5dff;
  --rv2-accent-soft: #eef0ff;
  --rv2-success: #0f9d6c;
  --rv2-success-soft: #e6f7ef;
  --rv2-warning: #b76e00;
  --rv2-warning-soft: #fff2e0;
  --rv2-danger: #d92d20;
  --rv2-danger-soft: #fdecea;
  --rv2-radius: 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
  color: var(--rv2-ink);
  background: var(--rv2-bg);
  padding: 20px clamp(14px, 4vw, 32px) 48px;
  border-radius: 20px;
  box-sizing: border-box;
}
.rv2-root * { box-sizing: border-box; }

.rv2-guard {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 24px;
  background: var(--rv2-surface);
  border: 1px solid var(--rv2-border);
  border-radius: var(--rv2-radius);
  color: var(--rv2-muted);
}

.rv2-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--rv2-border);
}
.rv2-eyebrow {
  font-size: 12px;
  font-weight: 600;
  color: var(--rv2-accent);
  letter-spacing: 0.02em;
}
.rv2-header h1 {
  margin: 6px 0 4px;
  font-size: clamp(22px, 3vw, 28px);
  font-weight: 700;
}
.rv2-subtitle { margin: 0; color: var(--rv2-muted); font-size: 14px; }

.rv2-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 10px;
  border: 1px solid var(--rv2-border);
  background: var(--rv2-surface);
  color: var(--rv2-ink);
  font-size: 13.5px;
  font-weight: 600;
  padding: 10px 16px;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, border-color 0.15s ease;
  white-space: nowrap;
}
.rv2-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(20, 23, 43, 0.08); }
.rv2-btn:focus-visible { outline: 2px solid var(--rv2-accent); outline-offset: 2px; }
.rv2-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
.rv2-btn-primary { background: var(--rv2-accent); border-color: var(--rv2-accent); color: #fff; }
.rv2-btn-primary:hover:not(:disabled) { background: #3f4de0; }
.rv2-btn-ghost { background: transparent; border-color: var(--rv2-border); color: var(--rv2-muted); }
.rv2-btn-ghost:hover:not(:disabled) { color: var(--rv2-ink); border-color: var(--rv2-ink); }

.rv2-spin { animation: rv2-spin 0.9s linear infinite; }
@keyframes rv2-spin { to { transform: rotate(360deg); } }

.rv2-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 13.5px;
}
.rv2-banner-success { background: var(--rv2-success-soft); color: var(--rv2-success); }
.rv2-banner-error { background: var(--rv2-danger-soft); color: var(--rv2-danger); }

.rv2-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 20px;
}
.rv2-stat {
  background: var(--rv2-surface);
  border: 1px solid var(--rv2-border);
  border-radius: var(--rv2-radius);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-left: 3px solid var(--rv2-border);
}
.rv2-stat-success { border-left-color: var(--rv2-success); }
.rv2-stat-warning { border-left-color: var(--rv2-warning); }
.rv2-stat-label { font-size: 12.5px; color: var(--rv2-muted); font-weight: 600; }
.rv2-stat-value { font-size: 26px; font-weight: 700; }

.rv2-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 20px;
}
.rv2-search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--rv2-surface);
  border: 1px solid var(--rv2-border);
  border-radius: 10px;
  padding: 9px 12px;
  flex: 1 1 220px;
  min-width: 180px;
  color: var(--rv2-muted);
}
.rv2-search input { border: none; outline: none; flex: 1; font-size: 13.5px; background: transparent; color: var(--rv2-ink); }
.rv2-tabs { display: flex; gap: 6px; background: var(--rv2-surface); border: 1px solid var(--rv2-border); border-radius: 10px; padding: 4px; }
.rv2-tab { border: none; background: transparent; padding: 7px 12px; border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--rv2-muted); cursor: pointer; transition: background 0.15s ease, color 0.15s ease; }
.rv2-tab.is-active { background: var(--rv2-accent-soft); color: var(--rv2-accent); }
.rv2-sort { border: 1px solid var(--rv2-border); border-radius: 10px; padding: 9px 12px; font-size: 13px; background: var(--rv2-surface); color: var(--rv2-ink); }

.rv2-loading, .rv2-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 48px 16px;
  color: var(--rv2-muted);
  text-align: center;
}
.rv2-empty h3 { margin: 4px 0 0; color: var(--rv2-ink); }
.rv2-empty p { margin: 0; font-size: 13.5px; }

.rv2-list { display: flex; flex-direction: column; gap: 12px; margin-top: 18px; }
.rv2-card {
  background: var(--rv2-surface);
  border: 1px solid var(--rv2-border);
  border-left: 3px solid var(--rv2-border);
  border-radius: var(--rv2-radius);
  padding: 16px 18px;
  opacity: 0;
  animation: rv2-rise 0.35s ease forwards;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}
.rv2-card:hover { box-shadow: 0 8px 22px rgba(20, 23, 43, 0.06); }
.rv2-card-assigned { border-left-color: var(--rv2-success); }
.rv2-card-unassigned { border-left-color: var(--rv2-warning); }
@keyframes rv2-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) {
  .rv2-card { animation: none; opacity: 1; }
  .rv2-spin { animation: none; }
}

.rv2-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.rv2-card-title { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14.5px; min-width: 0; }
.rv2-card-title span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.rv2-pill { font-size: 11.5px; font-weight: 700; padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
.rv2-pill-success { background: var(--rv2-success-soft); color: var(--rv2-success); }
.rv2-pill-warning { background: var(--rv2-warning-soft); color: var(--rv2-warning); }

.rv2-meta-row { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 10px; font-size: 12.5px; color: var(--rv2-muted); }
.rv2-meta { display: flex; align-items: center; gap: 5px; }
.rv2-meta-tag { color: var(--rv2-accent); }

.rv2-warn-line { margin-top: 10px; font-size: 12.5px; color: var(--rv2-danger); }

.rv2-assigned-info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--rv2-border);
}
.rv2-info-label { display: block; font-size: 11.5px; color: var(--rv2-muted); font-weight: 600; }
.rv2-info-value { display: block; font-size: 13.5px; font-weight: 600; margin-top: 2px; }

.rv2-assign-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--rv2-border);
}
.rv2-assign-row select {
  flex: 1 1 220px;
  border: 1px solid var(--rv2-border);
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 13px;
  background: var(--rv2-bg);
  color: var(--rv2-ink);
}

.rv2-pagination { display: flex; justify-content: center; align-items: center; gap: 6px; margin-top: 26px; flex-wrap: wrap; }
.rv2-page { border: 1px solid var(--rv2-border); background: var(--rv2-surface); border-radius: 8px; min-width: 34px; height: 34px; font-size: 13px; font-weight: 600; color: var(--rv2-muted); cursor: pointer; }
.rv2-page.is-active { background: var(--rv2-accent); border-color: var(--rv2-accent); color: #fff; }

.rv2-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(20, 23, 43, 0.45);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 60;
  animation: rv2-fade 0.15s ease;
}
@keyframes rv2-fade { from { opacity: 0; } to { opacity: 1; } }
.rv2-modal {
  background: var(--rv2-surface);
  border-radius: 18px;
  padding: 20px;
  width: min(92vw, 820px);
  position: relative;
  box-shadow: 0 24px 60px rgba(20, 23, 43, 0.25);
}
.rv2-modal h3 { margin: 0 0 12px; font-size: 15px; padding-right: 30px; }
.rv2-modal video { width: 100%; max-height: 65vh; border-radius: 12px; background: #0b0c14; display: block; }
.rv2-modal-close {
  position: absolute; top: 14px; right: 14px;
  border: none; background: var(--rv2-bg); border-radius: 999px;
  width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: var(--rv2-muted);
}
.rv2-modal-loading { display: flex; align-items: center; gap: 8px; padding: 40px 0; justify-content: center; color: var(--rv2-muted); }

@media (max-width: 720px) {
  .rv2-stats { grid-template-columns: 1fr; }
  .rv2-assigned-info, .rv2-assign-row { flex-direction: column; align-items: stretch; }
  .rv2-card-top { flex-direction: column; }
}
`;
