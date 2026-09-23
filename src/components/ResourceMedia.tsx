import { useState } from "react";
import { Download, ExternalLink, FileAudio, FileImage, FileText, FileVideo, LoaderCircle } from "lucide-react";
import { api, apiBlob } from "../api";
import { useNotifications } from "../notifications";
import type { Resource } from "../types";

function iconFor(type: string) {
  if (type === "image") return <FileImage size={12} />;
  if (type === "audio") return <FileAudio size={12} />;
  if (type === "video") return <FileVideo size={12} />;
  return <FileText size={12} />;
}

export default function ResourceMedia({ resource }: { resource: Resource }) {
  const notifications = useNotifications();
  const type = resource.resource_type.toLowerCase();
  const [driveBusy, setDriveBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [error, setError] = useState("");

  const setResourceError = (message: string) => {
    setError(message);
    notifications.showToast({
      kind: "error",
      title: "Resource unavailable",
      message,
    });
  };

  const downloadFile = async () => {
    setDownloadBusy(true);
    try {
      const media = await api<{ download_url?: string | null }>(`/courses/resources/${resource.id}/media-url`);
      if (media.download_url) {
        const link = document.createElement("a");
        link.href = media.download_url;
        link.download = resource.original_filename || resource.title;
        link.target = "_self";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        link.remove();
        notifications.showToast({
          kind: "success",
          title: "Download started",
          message: `${resource.original_filename || resource.title} is downloading.`,
        });
        return;
      }
      const blob = await apiBlob(`/courses/resources/${resource.id}/media?download=true`);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = resource.original_filename || resource.title;
      document.body.appendChild(link);
      link.click();
      link.remove();
      notifications.showToast({ kind: "success", title: "Download started", message: `${resource.original_filename || resource.title} is downloading.` });
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (cause) {
      setResourceError((cause as Error).message || "Resource is not available");
    } finally {
      setDownloadBusy(false);
    }
  };

  const hasDriveLink = Boolean(resource.public_url && resource.public_url.trim());

  const openInDrive = async () => {
    if (!hasDriveLink) {
      setResourceError("This resource has no Google Drive file.");
      return;
    }
    setDriveBusy(true);
    try {
      const result = await api<{ url?: string | null }>(`/courses/resources/${resource.id}/drive-view`, { method: "POST" });
      const driveUrl = result?.url?.trim() || resource.public_url?.trim();
      if (!driveUrl) {
        setResourceError("This resource has no Google Drive file.");
        return;
      }
      const tab = window.open(driveUrl, "_blank", "noopener,noreferrer");
      if (!tab) {
        notifications.showToast({
          kind: "warning",
          title: "Pop-up blocked",
          message: "Allow pop-ups to open the Google Drive file.",
        });
        return;
      }
      notifications.showToast({
        kind: "info",
        title: "Opening Drive copy",
        message: "The resource has been opened in a protected Google Drive window.",
      });
    } catch (cause) {
      setResourceError((cause as Error).message || "Google Drive access could not be granted.");
    } finally {
      setDriveBusy(false);
    }
  };

  const actions = <div className="resource-actions"><button className="resource-pill resource-open-button" type="button" disabled={downloadBusy} onClick={() => void downloadFile()}>{downloadBusy ? <LoaderCircle size={12} className="spin" /> : <Download size={12} />} {downloadBusy ? "Downloading…" : "Download"}</button><button className="resource-pill resource-open-button" type="button" disabled={driveBusy || !hasDriveLink} onClick={() => void openInDrive()}><ExternalLink size={12} /> {driveBusy ? "Opening…" : "Open in OneDrive"}</button></div>;

  return <div className="resource-media"><div className="resource-file-label">{iconFor(type)} <span title={resource.original_filename}>{resource.original_filename || resource.title}</span></div>{error && <span className="resource-media-status form-error">{error}</span>}{actions}</div>;
}
