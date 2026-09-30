"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearPendingUpload, getPendingUpload, setPendingUpload } from "@/lib/pending-upload";
import { parseStoredVideoReference } from "@/lib/project-media";
import { isAllowedVideoUpload } from "@/lib/security";
import { formatTime } from "@/lib/time-format";
import { getTimelineTicks, pixelToTime, timeToPixel } from "@/lib/timeline-scale";
import type { Transcript } from "@/lib/types";
import { addKeepSegment, cutsFromKeepSegments, getPlaybackBoundary, getSourceCoverage, getTimelineDuration, keepSegmentsFromCuts, moveKeepSegment, sourceTimeAtTimelineTime, splitKeepSegment, timelineTimeAtSourceTime, trimKeepSegment, validateKeepSegments, type KeepSegment } from "@/lib/edit-decision-list";
import type { TranscriptHighlight } from "@/lib/highlight-detection";
import { ChatPanel, type ChatMessage, type ChatPlan, type TranscriptCapability } from "./components/chat-panel";

type LoadedClip = {
  id: string;
  name: string;
  url: string;
  duration: number;
  videoId?: string;
  hasAudio?: boolean;
};

type SessionUser = {
  id: string;
  email: string;
};

type PendingPlan = {
  id: string;
  videoId: string;
  prompt: string;
  operation: string;
  cuts: Array<{ action: "cut"; start: number; end: number; reason?: string }>;
  segments: KeepSegment[];
  durationBefore: number;
  durationAfter: number;
};

export default function EditorPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const timelineScrollerRef = useRef<HTMLDivElement | null>(null);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(0);
  const [projectName, setProjectName] = useState("untitled project");
  const [clips, setClips] = useState<LoadedClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null);
  const [status, setStatus] = useState("");
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [editPlan, setEditPlan] = useState<Array<{ action: "cut"; start: number; end: number; reason?: string }>>([]);
  const [editSegments, setEditSegments] = useState<KeepSegment[]>([]);
  const [selectedEditSegmentId, setSelectedEditSegmentId] = useState<string | null>(null);
  const [timelineUndo, setTimelineUndo] = useState<KeepSegment[][]>([]);
  const [timelineRedo, setTimelineRedo] = useState<KeepSegment[][]>([]);
  const [exportState, setExportState] = useState<"idle" | "rendering" | "completed" | "failed">("idle");
  const [exportError, setExportError] = useState("");
  const [exportDownloadUrl, setExportDownloadUrl] = useState<string | null>(null);
  const initializedTimelineKeyRef = useRef<string | null>(null);
  const playbackSegmentIdRef = useRef<string | null>(null);
  const trimDragRef = useRef<{
    id: string;
    edge: "start" | "end";
    initial: KeepSegment[];
    latest: KeepSegment[];
    left: number;
    width: number;
    timelineStart: number;
    timelineDuration: number;
  } | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExportPreviewPlaying, setIsExportPreviewPlaying] = useState(false);
  const [exportPreviewTime, setExportPreviewTime] = useState(0);
  const [exportPreviewDuration, setExportPreviewDuration] = useState(0);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [mediaReady, setMediaReady] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingFileLoaded, setPendingFileLoaded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerWrapperRef = useRef<HTMLDivElement | null>(null);
  const exportVideoRef = useRef<HTMLVideoElement | null>(null);
  const [authUser, setAuthUser] = useState<SessionUser | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState("MP4");
  const [exportResolution, setExportResolution] = useState("1080p");
  const [exportQuality, setExportQuality] = useState("High");
  const uploadInFlightRef = useRef(false);
  const appliedPlanIdRef = useRef<string | null>(null);
  const lastVideoStorageKey = authUser ? `voxcut:last-video:${authUser.id}` : null;
  const [authLoading, setAuthLoading] = useState(true);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [transcriptionVideoId, setTranscriptionVideoId] = useState<string | null>(null);
  const [transcriptionStatus, setTranscriptionStatus] = useState<"not_started" | "transcribing" | "completed" | "failed">("not_started");
  const [transcriptionError, setTranscriptionError] = useState("");
  const [transcriptionErrorCode, setTranscriptionErrorCode] = useState<string | undefined>();
  const [captionStatus, setCaptionStatus] = useState("");
  const [highlights, setHighlights] = useState<TranscriptHighlight[]>([]);
  const [highlightStatus, setHighlightStatus] = useState("");

  useEffect(() => {
    if (!status || isUploading || status === "Generating edit plan...") return;
    const message = status;
    const timeout = window.setTimeout(() => {
      setStatus((current) => current === message ? "" : current);
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [isUploading, status]);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (!response.ok) {
          setAuthUser(null);
          return;
        }

        const payload = (await response.json()) as { user?: SessionUser };
        setAuthUser(payload.user ?? null);
      } catch {
        setAuthUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    fetchSession();
  }, []);

  const handleAuthSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedEmail = authForm.email.trim();
    const trimmedPassword = authForm.password.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setAuthError("Enter a valid email address.");
      return;
    }

    if (trimmedPassword.length < 8 || !/[A-Za-z]/.test(trimmedPassword) || !/\d/.test(trimmedPassword)) {
      setAuthError("Password must be at least 8 characters and include letters and numbers.");
      return;
    }

    setAuthBusy(true);
    setAuthError("");

    try {
      const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password: trimmedPassword }),
      });

      const payload = (await response.json()) as { error?: string; user?: SessionUser };
      if (!response.ok || !payload.user) {
        throw new Error(payload.error ?? "Authentication failed.");
      }

      setAuthUser(payload.user);
      setAuthForm({ email: "", password: "" });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    if (authUser && typeof window !== "undefined") {
      try { localStorage.removeItem(`voxcut:last-video:${authUser.id}`); } catch { /* local storage may be unavailable */ }
    }
    setAuthUser(null);
    setStatus("");
    setChatMessages([]);
    setPendingPlan(null);
    setPrompt("");
    setProjectName("untitled project");
    setClips([]);
    setSelectedClipId(null);
    setOutputUrl(null);
    setEditPlan([]);
    setEditSegments([]);
    setTimelineUndo([]);
    setTimelineRedo([]);
    setSelectedEditSegmentId(null);
    setPendingPlan(null);
  };

  const selectedClip = useMemo(
    () => clips.find((clip) => clip.id === selectedClipId) ?? clips[0] ?? null,
    [clips, selectedClipId],
  );

  const duration = selectedClip?.duration || 0;
  const timelineSegments = useMemo(
    () => editSegments.length > 0 ? editSegments : duration > 0 ? (editPlan.length > 0 ? keepSegmentsFromCuts(editPlan, duration) : [{ id: "source", start: 0, end: duration }]) : [],
    [duration, editPlan, editSegments],
  );
  const timelineDuration = getTimelineDuration(timelineSegments);
  const sourceCoverage = useMemo(() => getSourceCoverage(timelineSegments, duration), [duration, timelineSegments]);
  const timelineCurrentTime = timelineTimeAtSourceTime(timelineSegments, currentTime);
  const timelinePixelWidth = Math.max(timelineViewportWidth, timelineDuration * 60 * timelineZoom);
  const activeProjectId = useMemo(() => (authUser ? `project-${authUser.id.slice(0, 8)}` : "default-project"), [authUser]);
  const timelineTicks = useMemo(() => getTimelineTicks(timelineDuration, timelineDuration ? timelinePixelWidth / timelineDuration : 0), [timelineDuration, timelinePixelWidth]);
  const currentTranscript = selectedClip?.videoId === transcriptionVideoId ? transcript : null;
  const currentTranscriptionStatus = selectedClip?.videoId === transcriptionVideoId ? transcriptionStatus : "not_started";
  const currentTranscriptionError = selectedClip?.videoId === transcriptionVideoId ? transcriptionError : "";
  const currentTranscriptionErrorCode = selectedClip?.videoId === transcriptionVideoId ? transcriptionErrorCode : undefined;
  const hasTranscript = Boolean(currentTranscript && (currentTranscript.words.length > 0 || currentTranscript.segments.length > 0));
  const transcriptCapability: TranscriptCapability = currentTranscriptionStatus === "transcribing" ? "transcribing"
    : currentTranscriptionErrorCode === "NO_AUDIO_TRACK" || selectedClip?.hasAudio === false ? "no-audio"
      : currentTranscriptionErrorCode === "NO_SPEECH" || (currentTranscript !== null && !hasTranscript) ? "no-speech"
        : hasTranscript ? "ready"
          : currentTranscriptionStatus === "failed" || Boolean(currentTranscriptionError) ? "failed" : "not-started";
  const transcriptNote = transcriptCapability === "no-audio"
    ? "This video has no sound, so transcript edits are unavailable. Timing edits still work."
    : transcriptCapability === "no-speech"
      ? "No speech was detected, so transcript edits are unavailable. Timing edits still work."
      : transcriptCapability === "transcribing"
        ? "Transcription is running. Timing edits still work while speech is processed."
        : transcriptCapability === "failed"
          ? "Transcription failed. Retry it or use the available timing edits."
          : transcriptCapability === "ready"
            ? "Transcript is ready. Use transcript context or the tested timing edits below."
            : selectedClip
              ? "Timing edits work now. Transcribe this video to enable transcript-based planning."
              : "Upload a video to enable timing and transcript-based edits.";
  const promptSuggestions = hasTranscript
    ? ["Cut from 2 to 5 seconds", "Trim first 5 seconds", "Cut last 2 seconds"]
    : ["Trim first 5 seconds", "Cut last 2 seconds", "Cut from 2 to 5 seconds"];
  const timelineStorageKey = authUser && selectedClip?.videoId ? `voxcut:timeline:${authUser.id}:${selectedClip.videoId}` : null;
  const activeTranscriptIndex = currentTranscript?.segments.findIndex(
    (segment) => currentTime >= segment.start && currentTime <= segment.end,
  ) ?? -1;

  useEffect(() => {
    const scroller = timelineScrollerRef.current;
    if (!scroller) return;
    const updateWidth = () => setTimelineViewportWidth(scroller.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  const sceneBreakdown = useMemo(() => {
    if (!duration || timelineSegments.length === 0) return [];
    let timelineStart = 0;
    return timelineSegments.map((segment, index) => {
      const length = segment.end - segment.start;
      const item = { ...segment, label: `Scene ${index + 1}`, timelineStart, width: (length / Math.max(timelineDuration, 0.01)) * 100 };
      timelineStart += length;
      return item;
    });
  }, [duration, timelineDuration, timelineSegments]);

  const invalidatePlanUndo = () => {
    appliedPlanIdRef.current = null;
    setChatMessages((messages) => messages.map((message) => message.type === "plan" && message.plan.state === "applied"
      ? { ...message, plan: { ...message.plan, canUndo: false } }
      : message));
  };

  const commitTimeline = (next: KeepSegment[]) => {
    if (exportState === "rendering") { setStatus("Wait for the current render to finish before changing the timeline."); return; }
    if (next.length === 0) { setStatus("Keep at least one video segment. Use Restore at the playhead to bring removed footage back."); return; }
    invalidatePlanUndo();
    setTimelineUndo((history) => [...history.slice(-49), editSegments]);
    setTimelineRedo([]);
    setEditSegments(next);
    setEditPlan(cutsFromKeepSegments(next, duration));
    setOutputUrl(null);
    setExportDownloadUrl(null);
    setExportState("idle");
    if (timelineStorageKey) {
      try { localStorage.setItem(timelineStorageKey, JSON.stringify(next)); }
      catch { setStatus("Timeline edits could not be saved in this browser."); }
    }
    if (authUser && selectedClip?.videoId) {
      try { localStorage.removeItem(`voxcut:export:${authUser.id}:${selectedClip.videoId}`); } catch { /* stale result is hidden for this session */ }
    }
  };

  const trimSelected = (edge: "start" | "end") => {
    if (!selectedEditSegmentId) return;
    const selected = editSegments.find((segment) => segment.id === selectedEditSegmentId);
    if (!selected) return;
    try {
      const target = edge === "start" ? Math.min(selected.start + 0.5, selected.end - 0.1) : Math.max(selected.end - 0.5, selected.start + 0.1);
      commitTimeline(trimKeepSegment(editSegments, selected.id, edge, target));
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not trim this segment."); }
  };

  const beginTrimDrag = (event: React.PointerEvent<HTMLButtonElement>, segment: KeepSegment, edge: "start" | "end") => {
    if (exportState === "rendering" || !duration) return;
    const track = event.currentTarget.closest<HTMLElement>("[data-timeline-track]");
    const rect = track?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const segmentIndex = editSegments.findIndex((candidate) => candidate.id === segment.id);
    const timelineStart = editSegments.slice(0, segmentIndex).reduce((total, item) => total + item.end - item.start, 0);
    trimDragRef.current = { id: segment.id, edge, initial: editSegments, latest: editSegments, left: rect.left, width: rect.width, timelineStart, timelineDuration: getTimelineDuration(editSegments) };
    setSelectedEditSegmentId(segment.id);
    setOutputUrl(null); setExportDownloadUrl(null); setExportState("idle");
  };

  const moveTrimDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = trimDragRef.current;
    if (!drag) return;
    const timelineAt = pixelToTime(event.clientX - drag.left, drag.timelineDuration, drag.width);
    const segment = drag.initial.find((candidate) => candidate.id === drag.id);
    if (!segment) return;
    const at = Math.max(segment.start, Math.min(segment.end, segment.start + timelineAt - drag.timelineStart));
    try {
      const next = trimKeepSegment(drag.initial, drag.id, drag.edge, at);
      drag.latest = next;
      setEditSegments(next);
      setEditPlan(cutsFromKeepSegments(next, duration));
    } catch { /* The trim helper rejects positions that would invalidate the edit list. */ }
  };

  const finishTrimDrag = (event: React.PointerEvent<HTMLButtonElement>, cancel = false) => {
    const drag = trimDragRef.current;
    if (!drag) return;
    event.stopPropagation();
    if (cancel) {
      setEditSegments(drag.initial);
      setEditPlan(cutsFromKeepSegments(drag.initial, duration));
    } else if (JSON.stringify(drag.latest) !== JSON.stringify(drag.initial)) {
      invalidatePlanUndo();
      setTimelineUndo((history) => [...history.slice(-49), drag.initial]);
      setTimelineRedo([]);
      if (timelineStorageKey) {
        try { localStorage.setItem(timelineStorageKey, JSON.stringify(drag.latest)); }
        catch { setStatus("Timeline edits could not be saved in this browser."); }
      }
      if (authUser && selectedClip?.videoId) {
        try { localStorage.removeItem(`voxcut:export:${authUser.id}:${selectedClip.videoId}`); } catch { /* stale result is hidden for this session */ }
      }
    }
    trimDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const splitSelected = () => {
    if (!selectedEditSegmentId) return;
    try {
      const next = splitKeepSegment(editSegments, selectedEditSegmentId, currentTime);
      commitTimeline(next);
      setSelectedEditSegmentId(next.find((segment) => segment.end === currentTime)?.id ?? null);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not split this segment."); }
  };

  const deleteSelected = () => {
    if (!selectedEditSegmentId) return;
    if (editSegments.length <= 1) { setStatus("Restore or split footage before deleting the only kept segment."); return; }
    const next = editSegments.filter((segment) => segment.id !== selectedEditSegmentId);
    commitTimeline(next);
    setSelectedEditSegmentId(next[0]?.id ?? null);
  };

  const restoreAtPlayhead = () => {
    try {
      const next = addKeepSegment(editSegments, duration, currentTime);
      commitTimeline(next);
      setSelectedEditSegmentId(next.find((segment) => segment.start <= currentTime && segment.end > currentTime)?.id ?? null);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not restore footage at the playhead."); }
  };

  const undoTimeline = () => {
    if (exportState === "rendering") return;
    const previous = timelineUndo[timelineUndo.length - 1];
    if (!previous) return;
    invalidatePlanUndo();
    setTimelineRedo((history) => [...history, editSegments]);
    setTimelineUndo((history) => history.slice(0, -1));
    setEditSegments(previous);
    setEditPlan(cutsFromKeepSegments(previous, duration));
    setOutputUrl(null); setExportDownloadUrl(null); setExportState("idle");
    if (authUser && selectedClip?.videoId) { try { localStorage.removeItem(`voxcut:export:${authUser.id}:${selectedClip.videoId}`); } catch { /* stale result is hidden for this session */ } }
    if (timelineStorageKey) { try { localStorage.setItem(timelineStorageKey, JSON.stringify(previous)); } catch { setStatus("Timeline edits could not be saved in this browser."); } }
  };

  const redoTimeline = () => {
    if (exportState === "rendering") return;
    const next = timelineRedo[timelineRedo.length - 1];
    if (!next) return;
    invalidatePlanUndo();
    setTimelineUndo((history) => [...history, editSegments]);
    setTimelineRedo((history) => history.slice(0, -1));
    setEditSegments(next);
    setEditPlan(cutsFromKeepSegments(next, duration));
    setOutputUrl(null); setExportDownloadUrl(null); setExportState("idle");
    if (authUser && selectedClip?.videoId) { try { localStorage.removeItem(`voxcut:export:${authUser.id}:${selectedClip.videoId}`); } catch { /* stale result is hidden for this session */ } }
    if (timelineStorageKey) { try { localStorage.setItem(timelineStorageKey, JSON.stringify(next)); } catch { setStatus("Timeline edits could not be saved in this browser."); } }
  };

  useEffect(() => {
    if (!timelineStorageKey || !duration || initializedTimelineKeyRef.current === timelineStorageKey) return;
    let restored: KeepSegment[] | null = null;
    try {
      const saved = localStorage.getItem(timelineStorageKey);
      if (saved) restored = validateKeepSegments(JSON.parse(saved), duration);
    } catch { restored = null; }
    const initial = restored ?? [{ id: `source-${selectedClip?.videoId}`, start: 0, end: duration }];
    initializedTimelineKeyRef.current = timelineStorageKey;
    setEditSegments(initial);
    setEditPlan(cutsFromKeepSegments(initial, duration));
    setTimelineUndo([]);
    setTimelineRedo([]);
    setSelectedEditSegmentId(initial[0]?.id ?? null);
  }, [duration, selectedClip?.videoId, timelineStorageKey]);

  const handleExport = async () => {
    if (!selectedClip?.videoId || !authUser || !duration || exportState === "rendering") return;
    setExportState("rendering");
    setExportError("");
    try {
      const segments = validateKeepSegments(editSegments, duration);
      const response = await fetch("/api/export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: selectedClip.videoId, projectId: activeProjectId, segments, resolution: exportResolution, quality: exportQuality }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.mediaUrl || !payload.downloadUrl) throw new Error(payload.error ?? "Video export failed.");
      const url = new URL(payload.mediaUrl, window.location.origin);
      if (url.origin !== window.location.origin || url.pathname !== "/api/media") throw new Error("The export returned an invalid media reference.");
      setOutputUrl(`${url.pathname}${url.search}`);
      const download = new URL(payload.downloadUrl, window.location.origin);
      if (download.origin !== window.location.origin || download.pathname !== "/api/media") throw new Error("The export returned an invalid download reference.");
      setExportDownloadUrl(`${download.pathname}${download.search}`);
      try { localStorage.setItem(`voxcut:export:${authUser.id}:${selectedClip.videoId}`, JSON.stringify({ mediaUrl: `${url.pathname}${url.search}`, downloadUrl: payload.downloadUrl, duration: payload.duration })); } catch { /* export is still available for this session */ }
      setExportState("completed");
      setStatus("Export rendered successfully.");
    } catch (error) {
      setExportState("failed");
      setExportError(error instanceof Error ? error.message : "Video export failed.");
      setStatus(error instanceof Error ? error.message : "Video export failed.");
    }
  };

  const handleAssemble = async () => {
    if (!selectedClip?.videoId || editSegments.length < 2 || exportState === "rendering") return;
    setExportState("rendering");
    setExportError("");
    try {
      const response = await fetch("/api/assemble", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: selectedClip.videoId, projectId: activeProjectId, segments: validateKeepSegments(editSegments, duration) }),
      });
      const payload = await response.json();
      if (!response.ok || typeof payload.mediaUrl !== "string" || typeof payload.downloadUrl !== "string") throw new Error(payload.error ?? "Could not assemble the selected clips.");
      const media = new URL(payload.mediaUrl, window.location.origin);
      const download = new URL(payload.downloadUrl, window.location.origin);
      if (media.origin !== window.location.origin || media.pathname !== "/api/media" || download.origin !== window.location.origin || download.pathname !== "/api/media") throw new Error("The server returned an invalid assembly reference.");
      const mediaUrl = `${media.pathname}${media.search}`;
      const downloadUrl = `${download.pathname}${download.search}`;
      setOutputUrl(mediaUrl);
      setExportDownloadUrl(downloadUrl);
      setExportState("completed");
      setStatus(`Assembled ${payload.clipCount} timeline segments.`);
      try { localStorage.setItem(`voxcut:export:${authUser?.id}:${selectedClip.videoId}`, JSON.stringify({ mediaUrl, downloadUrl, duration: payload.duration })); } catch { /* assembly remains available in this session */ }
    } catch (error) {
      setExportState("failed");
      setExportError(error instanceof Error ? error.message : "Could not assemble the selected clips.");
      setStatus(error instanceof Error ? error.message : "Could not assemble the selected clips.");
    }
  };

  useEffect(() => {
    const active = document.querySelector<HTMLElement>("[data-active-transcript='true']");
    if (!active) return;
    const bounds = active.getBoundingClientRect();
    if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [activeTranscriptIndex]);

  useEffect(() => {
    if (!authUser || !selectedClip?.videoId) {
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const params = new URLSearchParams({ videoId: selectedClip.videoId, projectId: activeProjectId });
    const loadTranscript = async () => {
      try {
        const response = await fetch(`/api/transcription?${params}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Could not load the saved transcript.");
        if (cancelled) return;
        setTranscriptionVideoId(selectedClip.videoId!);
        setTranscriptionStatus(payload.status?.status ?? "not_started");
        setTranscript(payload.transcript ?? null);
        setTranscriptionError(payload.status?.error ?? "");
        setTranscriptionErrorCode(payload.status?.errorCode);
        if (payload.status?.status === "transcribing") timer = setTimeout(loadTranscript, 1500);
      } catch (error: unknown) {
        if (!cancelled) {
          setTranscriptionVideoId(selectedClip.videoId!);
          setTranscriptionError(error instanceof Error ? error.message : "Could not load the saved transcript.");
        }
      }
    };
    void loadTranscript();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [activeProjectId, authUser, selectedClip?.videoId, transcriptionStatus]);

  const handleTranscribe = async () => {
    if (!selectedClip?.videoId) return;
    setTranscriptionVideoId(selectedClip.videoId);
    setTranscriptionStatus("transcribing");
    setTranscriptionError("");
    setTranscriptionErrorCode(undefined);
    setTranscript(null);
    try {
      const response = await fetch("/api/transcription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: selectedClip.videoId, projectId: activeProjectId }),
      });
      const payload = await response.json();
      if (!response.ok && response.status !== 409) {
        setTranscriptionErrorCode(typeof payload.code === "string" ? payload.code : undefined);
        throw new Error(payload.error ?? "Could not start transcription.");
      }
      setTranscriptionStatus(payload.status?.status ?? "transcribing");
    } catch (error) {
      setTranscriptionStatus("failed");
      setTranscriptionError(error instanceof Error ? error.message : "Transcription failed.");
    }
  };

  const downloadCaptions = async (format: "srt" | "vtt") => {
    if (!selectedClip?.videoId) return;
    setCaptionStatus("Preparing captions…");
    try {
      const response = await fetch("/api/captions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: selectedClip.videoId, projectId: activeProjectId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not generate captions.");
      const text = format === "srt" ? payload.srt : payload.vtt;
      if (typeof text !== "string" || !text.trim()) throw new Error("The transcript contains no caption text.");
      const objectUrl = URL.createObjectURL(new Blob([text], { type: format === "srt" ? "application/x-subrip;charset=utf-8" : "text/vtt;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${selectedClip.name.replace(/\.mp4$/i, "")}.${format}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setCaptionStatus(`${format.toUpperCase()} captions downloaded. Captions are not burned into the MP4.`);
    } catch (error) { setCaptionStatus(error instanceof Error ? error.message : "Could not generate captions."); }
  };

  const findHighlights = async () => {
    if (!selectedClip?.videoId) return;
    setHighlightStatus("Analyzing recognized speech…");
    try {
      const response = await fetch("/api/highlights", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: selectedClip.videoId, projectId: activeProjectId }),
      });
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.highlights)) throw new Error(payload.error ?? "Could not find highlights.");
      setHighlights(payload.highlights);
      setHighlightStatus(payload.highlights.length ? "Candidates are ranked by recognized words per second." : "No speech-dense moments were found in this transcript.");
    } catch (error) { setHighlights([]); setHighlightStatus(error instanceof Error ? error.message : "Could not find highlights."); }
  };

  const applyHighlight = (highlight: TranscriptHighlight) => {
    if (!duration) return;
    const start = Math.max(0, Math.min(highlight.start, duration));
    const end = Math.max(start, Math.min(highlight.end, duration));
    if (end <= start) return;
    const next = [{ id: `highlight-${selectedClip?.videoId}-${Math.round(start * 1000)}`, start, end }];
    commitTimeline(next);
    setSelectedEditSegmentId(next[0].id);
    handleScrub(start);
  };

  useEffect(() => {
    let cancelled = false;
    getPendingUpload()
      .then((file) => { if (!cancelled) setPendingFile(file); })
      .catch((error: unknown) => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "Could not restore the selected video.");
      })
      .finally(() => { if (!cancelled) setPendingFileLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!authUser || !lastVideoStorageKey) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const stored = localStorage.getItem(lastVideoStorageKey);
        if (!stored) return;
        const reference = parseStoredVideoReference(JSON.parse(stored), window.location.origin);
        if (!reference || reference.projectId !== activeProjectId) {
          localStorage.removeItem(lastVideoStorageKey);
          return;
        }
        const clip: LoadedClip = {
          id: reference.videoId,
          videoId: reference.videoId,
          name: reference.name,
          url: reference.sourceUrl,
          duration: reference.duration,
          hasAudio: reference.hasAudio,
        };
        setClips((previous) => previous.length ? previous : [clip]);
        setSelectedClipId((previous) => previous ?? clip.id);
        setProjectName(reference.name.replace(/\.mp4$/i, ""));
      } catch {
        setStatus("The saved video reference could not be restored. Upload the MP4 again.");
      }
    });
    return () => { cancelled = true; };
  }, [activeProjectId, authUser, lastVideoStorageKey]);

  const uploadFile = useCallback(async (file: File, isPending = false) => {
    if (!authUser) {
      setStatus("Please sign in before uploading a video.");
      return;
    }
    const validation = isAllowedVideoUpload(file);
    if (!validation.ok) {
      setStatus(validation.reason ?? "Please choose an MP4 video.");
      return;
    }
    if (uploadInFlightRef.current) return;

    uploadInFlightRef.current = true;
    setIsUploading(true);
    setStatus(`Uploading ${file.name}...`);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", activeProjectId);
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        videoId?: string;
        userId?: string;
        projectId?: string;
        sourceUrl?: string;
        duration?: number;
        metadata?: { hasAudio?: boolean };
      };
      if (!response.ok) throw new Error(payload.error ?? (response.status === 401 ? "Your session expired. Sign in again to upload this video." : `Upload failed (${response.status}).`));
      if (!payload.videoId || payload.userId !== authUser.id || payload.projectId !== activeProjectId) {
        throw new Error("The server returned an invalid video reference. Please retry the upload.");
      }
      const mediaUrl = payload.sourceUrl ? new URL(payload.sourceUrl, window.location.origin) : null;
      if (!mediaUrl || mediaUrl.origin !== window.location.origin || mediaUrl.pathname !== "/api/media") {
        throw new Error("The server did not return a usable media URL. Please retry the upload.");
      }
      const actualDuration = Number(payload.duration);
      if (!Number.isFinite(actualDuration) || actualDuration <= 0) {
        throw new Error("The uploaded MP4 has no readable video duration.");
      }

      let pendingCleanupWarning = false;
      if (isPending) {
        try {
          await clearPendingUpload();
        } catch {
          pendingCleanupWarning = true;
        }
        setPendingFile(null);
      }
      const clip: LoadedClip = {
        id: payload.videoId,
        videoId: payload.videoId,
        name: file.name,
        url: `${mediaUrl.pathname}${mediaUrl.search}`,
        duration: actualDuration,
        hasAudio: payload.metadata?.hasAudio,
      };
      let restoreWarning = false;
      try {
        localStorage.setItem(lastVideoStorageKey!, JSON.stringify({
          videoId: clip.videoId,
          projectId: activeProjectId,
          name: clip.name,
          sourceUrl: clip.url,
          duration: clip.duration,
          ...(typeof clip.hasAudio === "boolean" ? { hasAudio: clip.hasAudio } : {}),
        }));
      } catch {
        restoreWarning = true;
      }
      setClips((previous) => [...previous, clip]);
      setChatMessages([]);
      setPendingPlan(null);
      setPrompt("");
      setSelectedClipId(clip.id);
      setProjectName(file.name.replace(/\.mp4$/i, ""));
      setOutputUrl(null);
      setExportDownloadUrl(null);
      setExportState("idle");
      setCurrentTime(0);
      setMediaReady(false);
      setIsPlaying(false);
      setStatus(pendingCleanupWarning
        ? "Video uploaded, but the browser could not clear its saved retry copy."
        : restoreWarning ? "Video uploaded, but this browser could not remember it for reload." : "");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed. Please retry.");
    } finally {
      uploadInFlightRef.current = false;
      setIsUploading(false);
    }
  }, [activeProjectId, authUser, lastVideoStorageKey]);

  useEffect(() => {
    if (!authUser || !pendingFileLoaded || !pendingFile || uploadInFlightRef.current) return;
    void uploadFile(pendingFile, true);
  }, [authUser, pendingFile, pendingFileLoaded, uploadFile]);

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-50">
        <div role="status" className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-4 text-[13px] text-slate-300">
          Checking your session…
        </div>
      </main>
    );
  }

  if (!authUser) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-slate-50">
        <div className="w-full max-w-md rounded-[28px] border border-white/[0.08] bg-white/[0.02] p-6 shadow-[0_30px_80px_rgba(15,23,42,0.7)]">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="6" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12" />
              </svg>
            </div>
            <div>
              <div className="text-[12px] font-medium uppercase tracking-[0.2em] text-cyan-300">Voxcut</div>
              <div className="text-[11px] text-slate-500">secure creator workspace</div>
            </div>
          </div>

          <div className="mb-4 flex rounded-xl border border-white/[0.06] bg-slate-950/60 p-1">
            <button
              onClick={() => setAuthMode("register")}
              className={`flex-1 rounded-lg px-3 py-2 text-[12px] font-medium transition ${
                authMode === "register" ? "bg-cyan-400/15 text-cyan-300" : "text-slate-400"
              }`}
            >
              Create account
            </button>
            <button
              onClick={() => setAuthMode("login")}
              className={`flex-1 rounded-lg px-3 py-2 text-[12px] font-medium transition ${
                authMode === "login" ? "bg-cyan-400/15 text-cyan-300" : "text-slate-400"
              }`}
            >
              Log in
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-slate-500">Email</label>
              <input
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthForm((previous) => ({ ...previous, email: event.target.value }))}
                className="w-full rounded-xl border border-white/[0.06] bg-slate-950/70 px-3 py-2.5 text-[13px] text-slate-50 outline-none placeholder:text-slate-600 focus:border-cyan-400/40"
                placeholder="creator@example.com"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-slate-500">Password</label>
              <input
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthForm((previous) => ({ ...previous, password: event.target.value }))}
                className="w-full rounded-xl border border-white/[0.06] bg-slate-950/70 px-3 py-2.5 text-[13px] text-slate-50 outline-none placeholder:text-slate-600 focus:border-cyan-400/40"
                placeholder="Minimum 8 characters"
                required
              />
            </div>

            {authError ? <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">{authError}</div> : null}
            {status ? <div role="status" className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100">{status}</div> : null}

            <button
              type="submit"
              disabled={authBusy}
              className="w-full rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-[13px] font-medium text-cyan-300 transition hover:bg-cyan-400/15 disabled:opacity-50"
            >
              {authBusy ? "Please wait..." : authMode === "login" ? "Log in" : "Create account"}
            </button>
          </form>

          <div className="mt-5 rounded-2xl border border-white/[0.06] bg-slate-950/60 p-3 text-[12px] leading-6 text-slate-400">
            Free-first security: sessions use signed cookies, user folders are isolated, and uploads are validated before they reach storage.
          </div>
          {pendingFile ? (
            <div role="status" className="mt-3 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3 text-[12px] text-cyan-200">
              {pendingFile.name} is saved in this browser. Sign in and it will upload into this editor.
            </div>
          ) : !pendingFileLoaded ? (
            <div role="status" className="mt-3 text-[12px] text-slate-400">Checking for a saved video…</div>
          ) : null}
        </div>
      </main>
    );
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const validation = isAllowedVideoUpload(file);
    if (!validation.ok) {
      setStatus(validation.reason ?? "Please choose an MP4 video.");
      return;
    }
    try {
      await setPendingUpload(file);
      setPendingFile(file);
      await uploadFile(file, true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save the selected video.");
    }
  };

  const handleGenerate = async (submittedPrompt = prompt, retryId?: string) => {
    const trimmedPrompt = submittedPrompt.trim();
    if (!trimmedPrompt || isGeneratingPlan || pendingPlan || !authUser || !selectedClip?.videoId) return;
    const requestId = retryId ?? `chat-${crypto.randomUUID()}`;
    setStatus("");
    setIsGeneratingPlan(true);
    setChatMessages((messages) => [
      ...messages.filter((message) => message.id !== requestId),
      ...(retryId ? [] : [{ id: `user-${requestId}`, type: "user" as const, text: trimmedPrompt }]),
      { id: requestId, type: "loading" as const },
    ]);
    try {
      const response = await fetch("/api/plan-cut", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: selectedClip.videoId, projectId: activeProjectId, prompt: trimmedPrompt }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not create an edit plan.");

      const planResult = payload.plan as { sourceVideoId?: string; operation?: string; cuts?: unknown } | undefined;
      if (planResult?.sourceVideoId !== selectedClip.videoId || !Array.isArray(planResult.cuts) || !["remove", "keep", "extract", "concise"].includes(planResult.operation ?? "")) {
        throw new Error("The planner returned an invalid plan for this video.");
      }
      const nextPlan = planResult.cuts as Array<{ action: "cut"; start: number; end: number; reason?: string }>;
      if (nextPlan.some((cut) => !cut || cut.action !== "cut" || !Number.isFinite(cut.start) || !Number.isFinite(cut.end) || cut.start < 0 || cut.end <= cut.start || cut.end > duration)) {
        throw new Error("The planner returned cut ranges outside this video.");
      }
      if (typeof payload.promptLogId !== "string") throw new Error("The edit plan was created, but its history record could not be saved.");
      const proposedSegments = keepSegmentsFromCuts(nextPlan, duration);
      const durationBefore = Number.isFinite(payload.durationBefore) && payload.durationBefore > 0 ? payload.durationBefore : duration;
      const durationAfter = getTimelineDuration(proposedSegments);
      const pending: PendingPlan = { id: payload.promptLogId, videoId: selectedClip.videoId, prompt: trimmedPrompt, operation: planResult.operation!, cuts: nextPlan, segments: proposedSegments, durationBefore, durationAfter };
      const card: ChatPlan = {
        id: pending.id,
        operation: pending.operation,
        summary: nextPlan.length ? `Remove ${nextPlan.length} source range${nextPlan.length === 1 ? "" : "s"}` : "Keep all source footage",
        durationBefore,
        durationAfter,
        cuts: nextPlan,
        state: "pending",
        canUndo: false,
      };
      setPendingPlan(pending);
      setChatMessages((messages) => [...messages.filter((message) => message.id !== requestId), { id: requestId, type: "plan", plan: card }]);
      setPrompt("");
    } catch (error) {
      setChatMessages((messages) => [...messages.filter((message) => message.id !== requestId), {
        id: requestId,
        type: "error",
        prompt: trimmedPrompt,
        message: error instanceof Error ? error.message : "The edit request failed.",
      }]);
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const applyPendingPlan = (planId: string) => {
    if (!pendingPlan || pendingPlan.id !== planId) return;
    if (pendingPlan.videoId !== selectedClip?.videoId) {
      setPendingPlan(null);
      setStatus("This plan belongs to a different video and was not applied.");
      return;
    }
    if (exportState === "rendering") {
      setStatus("Wait for the current render to finish before applying this plan.");
      return;
    }
    commitTimeline(pendingPlan.segments);
    appliedPlanIdRef.current = pendingPlan.id;
    setChatMessages((messages) => messages.map((message) => message.type === "plan" && message.plan.id === pendingPlan.id
      ? { ...message, plan: { ...message.plan, state: "applied", canUndo: true } }
      : message));
    setSelectedEditSegmentId(pendingPlan.segments[0]?.id ?? null);
    setCurrentTime(pendingPlan.segments[0]?.start ?? 0);
    setPrompt("");
    setPendingPlan(null);
    setStatus("");
  };

  const cancelPendingPlan = (planId: string) => {
    if (!pendingPlan || pendingPlan.id !== planId) return;
    setPendingPlan(null);
    setChatMessages((messages) => messages.map((message) => message.type === "plan" && message.plan.id === planId
      ? { ...message, plan: { ...message.plan, state: "discarded" } }
      : message));
    setStatus("");
  };

  const undoAppliedPlan = (planId: string) => {
    if (appliedPlanIdRef.current !== planId || !timelineUndo.length) return;
    undoTimeline();
    setChatMessages((messages) => messages.map((message) => message.type === "plan" && message.plan.id === planId
      ? { ...message, plan: { ...message.plan, state: "undone", canUndo: false } }
      : message));
  };

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setStatus("The uploaded video is still loading.");
      return;
    }

    if (video.paused) {
      const currentSegment = timelineSegments.find((segment) => video.currentTime >= segment.start && video.currentTime < segment.end);
      const segment = currentSegment ?? timelineSegments[0];
      if (segment) {
        playbackSegmentIdRef.current = segment.id;
        if (!currentSegment) {
          video.currentTime = segment.start;
          setCurrentTime(segment.start);
        }
      }
      try {
        await video.play();
      } catch {
        setStatus("Video playback could not start. Try again after the video finishes loading.");
      }
      return;
    }

    video.pause();
    setIsPlaying(false);
  };

  const requestPlayerFullscreen = async () => {
    const player = playerWrapperRef.current;
    if (!player) return;
    try {
      if (document.fullscreenElement === player) await document.exitFullscreen();
      else await player.requestFullscreen();
    } catch {
      setStatus("Fullscreen mode could not start in this browser.");
    }
  };

  const toggleExportPreview = async () => {
    const video = exportVideoRef.current;
    if (!video) return;
    if (video.paused) {
      try { await video.play(); }
      catch { setExportError("The export preview could not start. Try again."); }
    } else {
      video.pause();
    }
  };

  const handleScrub = (nextTime: number) => {
    const video = videoRef.current;
    if (!video) return;

    if (video.readyState < HTMLMediaElement.HAVE_METADATA || !Number.isFinite(video.duration)) return;
    const safeTime = Math.max(0, Math.min(nextTime, video.duration));
    const active = timelineSegments.find((segment) => safeTime >= segment.start && safeTime < segment.end);
    const next = timelineSegments.find((segment) => segment.start > safeTime);
    const targetTime = active ? safeTime : next?.start ?? timelineSegments[timelineSegments.length - 1]?.end ?? safeTime;
    video.currentTime = targetTime;
    playbackSegmentIdRef.current = (active ?? next ?? timelineSegments[timelineSegments.length - 1])?.id ?? null;
    setCurrentTime(targetTime);
  };

  const handleTimelineScrub = (timelineTime: number) => handleScrub(sourceTimeAtTimelineTime(timelineSegments, timelineTime));

  const seekBy = (offset: number) => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_METADATA) return;
    handleScrub(video.currentTime + offset);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    const nextVolume = video.volume > 0 ? 0 : volume || 0.8;
    video.volume = nextVolume;
    setVolume(nextVolume);
  };

  return (
    <main className="h-screen w-screen overflow-hidden bg-[#0e131f] text-[#dde2f3] select-none">
      <header className="fixed left-0 top-0 z-40 flex h-14 w-full items-center justify-between border-b border-[#3d494c]/30 bg-[#0e131f] px-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[16px] font-semibold tracking-tight text-[#dde2f3]">Voxcut</span>
            <span className="rounded border border-[#3d494c]/30 bg-[#1a202c] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[#4cd7f6]">
              Studio
            </span>
          </div>

          <div className="h-4 w-px bg-[#3d494c]/30" />

          <div className="flex items-center gap-3">
            <div className="group flex cursor-text items-center gap-1.5 rounded px-2 py-1 transition-colors hover:bg-[#1a202c]/40">
              <input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                className="w-36 border-0 bg-transparent px-0 py-0 text-[12px] font-medium text-[#dde2f3] outline-none focus:ring-0"
                aria-label="Project name"
              />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5 text-[#bcc9cd] transition-colors group-hover:text-[#dde2f3]">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM14.38 6.19l3.75 3.75" />
              </svg>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-[#bcc9cd]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#06b6d4]" />
              <span>Local editor</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-[#3d494c]/30 bg-[#161c28] p-0.5">
            <button type="button" onClick={undoTimeline} disabled={!timelineUndo.length || exportState === "rendering"} className="flex items-center gap-1 rounded px-2.5 py-1 text-[12px] text-[#bcc9cd] transition-colors hover:bg-[#242a36]/50 hover:text-[#dde2f3] disabled:opacity-40">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path d="M9 14 4 9l5-5" />
                <path d="M20 19v-1a4 4 0 0 0-4-4H4" />
              </svg>
              <span className="hidden sm:inline">Undo</span>
            </button>
            <div className="h-3.5 w-px bg-[#3d494c]/30" />
            <button type="button" onClick={redoTimeline} disabled={!timelineRedo.length || exportState === "rendering"} className="flex items-center gap-1 rounded px-2.5 py-1 text-[12px] text-[#bcc9cd] transition-colors hover:bg-[#242a36]/50 hover:text-[#dde2f3] disabled:opacity-40">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path d="m15 10 5 5-5 5" />
                <path d="M4 5v1a4 4 0 0 0 4 4h12" />
              </svg>
              <span className="hidden sm:inline">Redo</span>
            </button>
          </div>

          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="rounded-lg border border-[#3d494c]/40 px-3 py-2 text-[12px] text-[#dde2f3] disabled:opacity-50">
            Upload MP4
          </button>
          <button type="button" onClick={() => void handleSignOut()} className="rounded-lg border border-[#3d494c]/40 px-3 py-2 text-[12px] text-[#bcc9cd]">Sign out</button>
          <button
            type="button"
            onClick={() => setShowExport(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[#06b6d4] px-4 py-2 text-[12px] font-semibold text-[#0e131f] transition-all hover:bg-[#5de6ff]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <path d="M12 3v12" />
              <path d="m7 20 5 5 5-5" />
              <path d="M4 15v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            <span>Export</span>
          </button>
        </div>
      </header>

      {status ? (
        <div role="status" aria-live="polite" className="fixed left-1/2 top-16 z-50 max-w-[min(90vw,40rem)] -translate-x-1/2 rounded-lg border border-[#4cd7f6]/25 bg-[#161c28] px-4 py-2 text-[13px] text-[#dde2f3] shadow-xl">
          {status}
          {authUser && pendingFile && !isUploading ? (
            <div className="mt-2 flex gap-3">
              <button type="button" onClick={() => void uploadFile(pendingFile, true)} className="text-[#4cd7f6] underline">Retry upload</button>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="text-[#bcc9cd] underline">Choose another MP4</button>
            </div>
          ) : null}
        </div>
      ) : null}

      <aside className="fixed bottom-0 left-0 top-14 z-30 flex w-14 flex-col items-center justify-between border-r border-[#3d494c]/30 bg-[#0e131f] py-3">
        <div className="flex w-full flex-col items-center gap-2">
          <button type="button" onClick={toggleMute} className="flex w-full items-center justify-center py-2 text-[#bcc9cd] transition-colors hover:bg-[#1a202c]/30 hover:text-[#dde2f3]" title="Toggle audio" aria-label={volume > 0 ? "Mute video" : "Unmute video"}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <path d="M5 14V9h3l5-4v14l-5-4H5Z" />
              <path d="M16 9a4 4 0 0 1 0 6" />
              <path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" />
            </svg>
          </button>
        </div>

        <button type="button" onClick={() => setShowSettings(true)} className="flex w-full items-center justify-center py-2 text-[#bcc9cd] transition-colors hover:bg-[#1a202c]/30 hover:text-[#dde2f3]" title="Settings" aria-label="Settings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.86l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.86-.34 1.7 1.7 0 0 0-1 1.55V20a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9.8 18.4a1.7 1.7 0 0 0-1.86.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.86l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 14.2 4.6a1.7 1.7 0 0 0 1.86-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.34.32.76.49 1.21.49H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.21.49Z" />
          </svg>
        </button>
      </aside>

      <main className="ml-14 mt-14 flex h-[calc(100vh-56px)] flex-col overflow-hidden bg-[#0e131f]">
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <section className="relative min-w-0 flex-1 overflow-hidden bg-[#030712]">
            <div ref={playerWrapperRef} data-player-wrapper="true" className="flex h-full flex-col">
              <div data-player-stage="true" className="flex min-h-0 flex-1 items-center justify-center p-4">
                <div data-player-surface="true" className="relative aspect-video w-full max-w-4xl overflow-hidden rounded border border-[#3d494c]/30 bg-[#0e131f]">
                  {selectedClip ? (
                    <video
                      ref={videoRef}
                      key={selectedClip.id}
                      src={selectedClip.url}
                      className="h-full w-full object-cover"
                      playsInline
                      controlsList="nodownload noremoteplayback"
                      disablePictureInPicture
                      onContextMenu={(e) => e.preventDefault()}
                      onLoadStart={() => {
                        setMediaReady(false);
                        setIsPlaying(false);
                        setStatus("");
                      }}
                      onTimeUpdate={(e) => {
                        const time = e.currentTarget.currentTime;
                        if (!Number.isFinite(time)) return;
                        if (isPlaying) {
                          const boundary = getPlaybackBoundary(timelineSegments, time, playbackSegmentIdRef.current);
                          if (boundary.type === "seek") {
                            playbackSegmentIdRef.current = boundary.segmentId ?? null;
                            e.currentTarget.currentTime = boundary.time;
                            setCurrentTime(boundary.time);
                            return;
                          }
                          if (boundary.type === "end") {
                            playbackSegmentIdRef.current = boundary.segmentId ?? null;
                            e.currentTarget.pause();
                            e.currentTarget.currentTime = boundary.time;
                            setCurrentTime(boundary.time);
                            return;
                          }
                        }
                        setCurrentTime(time);
                      }}
                      onLoadedMetadata={(e) => {
                        const video = e.currentTarget;
                        const actualDuration = video.duration;
                        if (!Number.isFinite(actualDuration) || actualDuration <= 0) {
                          setStatus("The uploaded file has no readable video duration.");
                          return;
                        }
                        setClips((previous) => previous.map((clip) => clip.id === selectedClip.id ? { ...clip, duration: actualDuration } : clip));
                        setCurrentTime(Number.isFinite(video.currentTime) ? video.currentTime : 0);
                        playbackSegmentIdRef.current = timelineSegments.find((segment) => video.currentTime >= segment.start && video.currentTime < segment.end)?.id ?? timelineSegments[0]?.id ?? null;
                        video.volume = volume;
                        setMediaReady(true);
                        setOutputUrl(null);
                        setExportDownloadUrl(null);
                        setExportState("idle");
                        if (authUser && selectedClip.videoId) {
                          try {
                            const saved = localStorage.getItem(`voxcut:export:${authUser.id}:${selectedClip.videoId}`);
                            const reference = saved ? JSON.parse(saved) as { mediaUrl?: string; downloadUrl?: string } : null;
                            const media = reference?.mediaUrl ? new URL(reference.mediaUrl, window.location.origin) : null;
                            const download = reference?.downloadUrl ? new URL(reference.downloadUrl, window.location.origin) : null;
                            if (media?.origin === window.location.origin && media.pathname === "/api/media" && download?.origin === window.location.origin && download.pathname === "/api/media") {
                              void fetch(media, { headers: { Range: "bytes=0-0" }, cache: "no-store" }).then((response) => {
                                if (!response.ok) throw new Error("Saved export is unavailable.");
                                setOutputUrl(`${media.pathname}${media.search}`);
                                setExportDownloadUrl(`${download.pathname}${download.search}`);
                                setExportError("");
                                setExportState("completed");
                              }).catch(() => {
                                try { localStorage.removeItem(`voxcut:export:${authUser.id}:${selectedClip.videoId}`); } catch { /* browser storage may be unavailable */ }
                                setExportError("The saved export is unavailable. Render the current timeline again.");
                                setExportState("failed");
                              });
                            }
                          } catch {
                            try { localStorage.removeItem(`voxcut:export:${authUser.id}:${selectedClip.videoId}`); } catch { /* browser storage may be unavailable */ }
                            setExportError("The saved export reference is invalid. Render the current timeline again.");
                            setExportState("failed");
                          }
                        }
                        setStatus("");
                      }}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onError={() => {
                        setMediaReady(false);
                        setIsPlaying(false);
                        setStatus("The uploaded video could not be loaded. Check the media connection or upload it again.");
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.08),transparent_55%),#050b15] text-center">
                      <div className="max-w-sm px-6">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#3d494c]/40 bg-[#0e131f] text-[#4cd7f6]">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-8 w-8">
                            <path d="M12 16V4" />
                            <path d="m7 9 5-5 5 5" />
                            <path d="M4 15v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                          </svg>
                        </div>
                        <h2 className="text-[18px] font-semibold text-[#dde2f3]">Upload a video to start editing</h2>
                        <p className="mt-2 text-[13px] leading-6 text-[#bcc9cd]">Your actual transcript, cut plan, and export timeline will appear here once a video is loaded.</p>
                      </div>
                    </div>
                  )}

                  <div className="absolute right-3 top-3 rounded border border-[#3d494c]/30 bg-[#0e131f]/80 px-2.5 py-1 font-mono text-[11px] tracking-wider text-[#dde2f3]">
                    {selectedClip ? `${formatTime(currentTime)} / ${formatTime(duration)}` : "00:00 / 00:00"}
                  </div>

                  <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded border border-[#3d494c]/30 bg-[#0e131f]/80 px-2 py-0.5 text-[11px] text-[#4cd7f6]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#4cd7f6] animate-pulse" />
                    <span>{selectedClip ? "Uploaded video" : "No video loaded"}</span>
                  </div>
                </div>
              </div>

              <div className="flex h-12 items-center justify-between border-t border-[#3d494c]/30 bg-[#161c28] px-4">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-[#bcc9cd]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                      <path d="M4 14V10h3l5-4v12l-5-4H4Z" />
                      <path d="M15.5 9.5a4 4 0 0 1 0 5" />
                      <path d="M18.5 7a7 7 0 0 1 0 10" />
                    </svg>
                    <div className="h-1 w-16 overflow-hidden rounded-full bg-[#2f3542]">
                    <div className="h-full bg-[#bcc9cd]" style={{ width: `${volume * 100}%` }} />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => seekBy(-5)} disabled={!mediaReady} className="p-1 text-[#bcc9cd] transition-colors hover:text-[#dde2f3] disabled:opacity-40" aria-label="Rewind 5 seconds">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                      <path d="M11 7v10l-7-5 7-5Z" />
                      <path d="M21 7v10" />
                    </svg>
                  </button>
                  <button type="button" onClick={togglePlayback} disabled={!mediaReady} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4cd7f6] text-[#0e131f] transition-colors hover:bg-[#5de6ff] disabled:cursor-wait disabled:opacity-50" aria-label={isPlaying ? "Pause video" : "Play video"}>
                    {isPlaying ? (
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                        <rect x="6" y="5" width="4" height="14" rx="1" />
                        <rect x="14" y="5" width="4" height="14" rx="1" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>
                  <input
                    type="range"
                    aria-label="Seek video"
                    min={0}
                    max={duration || 0}
                    step={0.05}
                    value={Math.min(currentTime, duration || 0)}
                    onChange={(event) => handleScrub(Number(event.currentTarget.value))}
                    disabled={!mediaReady || duration <= 0}
                    className="w-36 accent-[#4cd7f6] disabled:opacity-40"
                  />
                  <button type="button" onClick={() => seekBy(5)} disabled={!mediaReady} className="p-1 text-[#bcc9cd] transition-colors hover:text-[#dde2f3] disabled:opacity-40" aria-label="Forward 5 seconds">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                      <path d="M13 7v10l7-5-7-5Z" />
                      <path d="M3 7v10" />
                    </svg>
                  </button>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-[#bcc9cd]">
                  <span className="font-mono">{selectedClip ? (mediaReady ? `${formatTime(timelineDuration)} runtime` : "Loading video metadata") : "Waiting for media"}</span>
                  <button type="button" onClick={() => void requestPlayerFullscreen()} disabled={!selectedClip} className="p-1 transition-colors hover:text-[#dde2f3] disabled:opacity-40" aria-label="Fullscreen">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                      <path d="M8 3H3v5" />
                      <path d="M16 3h5v5" />
                      <path d="M8 21H3v-5" />
                      <path d="M16 21h5v-5" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </section>

          <div className="flex w-2 items-center justify-center border-l border-r border-[#3d494c]/30 bg-[#0e131f]">
            <div className="flex flex-col gap-1 opacity-40">
              <span className="h-1 w-1 rounded-full bg-[#dde2f3]" />
              <span className="h-1 w-1 rounded-full bg-[#dde2f3]" />
              <span className="h-1 w-1 rounded-full bg-[#dde2f3]" />
              <span className="h-1 w-1 rounded-full bg-[#dde2f3]" />
            </div>
          </div>

          <ChatPanel
            capability={transcriptCapability}
            note={transcriptNote}
            onRetryTranscription={selectedClip?.videoId && selectedClip.hasAudio !== false ? () => void handleTranscribe() : undefined}
            hasVideo={!!selectedClip?.videoId}
            transcript={currentTranscript}
            activeTranscriptIndex={activeTranscriptIndex}
            transcriptionError={currentTranscriptionError}
            captionStatus={captionStatus}
            onDownloadCaptions={(format) => void downloadCaptions(format)}
            highlights={highlights}
            highlightStatus={highlightStatus}
            onFindHighlights={() => void findHighlights()}
            onKeepHighlight={applyHighlight}
            messages={chatMessages}
            suggestions={promptSuggestions}
            composerValue={prompt}
            onComposerChange={setPrompt}
            onSend={() => void handleGenerate(prompt)}
            blockedReason={!authUser ? "Sign in before sending a prompt." : !selectedClip?.videoId ? "Upload a video before sending a prompt." : ""}
            sending={isGeneratingPlan}
            locked={!!pendingPlan}
            onRetryMessage={(id) => {
              const failed = chatMessages.find((message) => message.id === id && message.type === "error");
              if (failed?.type === "error") void handleGenerate(failed.prompt, failed.id);
            }}
            onSeek={handleScrub}
            onApplyPlan={applyPendingPlan}
            onDiscardPlan={cancelPendingPlan}
            onUndoPlan={undoAppliedPlan}
          />
        </div>

        <footer className="relative h-32 shrink-0 border-t border-[#3d494c]/30 bg-[#161c28]">
          <div className="flex h-6 items-center justify-between border-b border-[#3d494c]/30 bg-[#0e131f] px-3 text-[11px] text-[#bcc9cd] font-mono">
            <span>Timeline ruler</span>
            <span className="text-[#869397]">{timelineDuration > 0 ? `Timeline · ${formatTime(timelineDuration)}` : "Timeline unavailable"}</span>
          </div>

          <div className="flex h-[calc(100%-24px)] min-h-0 flex-col gap-1 p-1.5">
            <div className="flex h-7 shrink-0 items-center gap-1 overflow-x-auto text-[10px]">
              <label className="flex shrink-0 items-center gap-1.5 px-1 text-[#bcc9cd]">Timeline zoom
                <input type="range" aria-label="Timeline zoom" min={0.5} max={4} step={0.25} value={timelineZoom} onChange={(event) => setTimelineZoom(Number(event.currentTarget.value))} className="w-16 accent-[#4cd7f6]" />
                <span className="font-mono">{timelineZoom.toFixed(2)}×</span>
              </label>
              <button type="button" disabled={!selectedEditSegmentId || exportState === "rendering"} onClick={() => trimSelected("start")} className="rounded border border-[#3d494c]/30 px-1.5 py-1 text-[#bcc9cd] disabled:opacity-40">Trim start +0.5s</button>
              <button type="button" disabled={!selectedEditSegmentId || exportState === "rendering"} onClick={() => trimSelected("end")} className="rounded border border-[#3d494c]/30 px-1.5 py-1 text-[#bcc9cd] disabled:opacity-40">Trim end −0.5s</button>
              <button type="button" disabled={editSegments.findIndex((segment) => segment.id === selectedEditSegmentId) <= 0 || exportState === "rendering"} onClick={() => commitTimeline(moveKeepSegment(editSegments, selectedEditSegmentId ?? "", -1))} className="rounded border border-[#3d494c]/30 px-1.5 py-1 text-[#bcc9cd] disabled:opacity-40">Move segment earlier</button>
              <button type="button" disabled={editSegments.findIndex((segment) => segment.id === selectedEditSegmentId) < 0 || editSegments.findIndex((segment) => segment.id === selectedEditSegmentId) >= editSegments.length - 1 || exportState === "rendering"} onClick={() => commitTimeline(moveKeepSegment(editSegments, selectedEditSegmentId ?? "", 1))} className="rounded border border-[#3d494c]/30 px-1.5 py-1 text-[#bcc9cd] disabled:opacity-40">Move segment later</button>
              <button type="button" disabled={!selectedEditSegmentId || exportState === "rendering"} onClick={splitSelected} className="rounded border border-[#3d494c]/30 px-1.5 py-1 text-[#bcc9cd] disabled:opacity-40">Split at playhead</button>
              <button type="button" disabled={!selectedEditSegmentId || exportState === "rendering"} onClick={deleteSelected} className="rounded border border-[#3d494c]/30 px-1.5 py-1 text-[#bcc9cd] disabled:opacity-40">Delete segment</button>
              <button type="button" disabled={!duration || exportState === "rendering"} onClick={restoreAtPlayhead} className="rounded border border-[#3d494c]/30 px-1.5 py-1 text-[#bcc9cd] disabled:opacity-40">Restore at playhead</button>
              <button type="button" disabled={editSegments.length < 2 || exportState === "rendering"} onClick={handleAssemble} className="rounded border border-[#3d494c]/30 px-1.5 py-1 text-[#bcc9cd] disabled:opacity-40">Assemble segments</button>
              <button type="button" disabled={!timelineUndo.length || exportState === "rendering"} onClick={undoTimeline} className="rounded border border-[#3d494c]/30 px-1.5 py-1 text-[#bcc9cd] disabled:opacity-40">Undo</button>
              <button type="button" disabled={!timelineRedo.length || exportState === "rendering"} onClick={redoTimeline} className="rounded border border-[#3d494c]/30 px-1.5 py-1 text-[#bcc9cd] disabled:opacity-40">Redo</button>
            </div>
            <div ref={timelineScrollerRef} className="flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-hidden rounded bg-[#0e131f]">
              <div aria-label="Timeline ruler" className="relative h-6 shrink-0 border-b border-[#3d494c]/30 font-mono text-[10px] text-[#bcc9cd]" style={{ minWidth: `max(100%, ${timelinePixelWidth}px)` }}>
                {timelineTicks.map((time, index) => (
                  <span key={index} className="absolute top-1/2 -translate-y-1/2" style={{ left: `${timeToPixel(time, timelineDuration, timelinePixelWidth)}px`, transform: index === 0 ? "translateY(-50%)" : index === timelineTicks.length - 1 ? "translate(-100%, -50%)" : "translate(-50%, -50%)" }}>
                    {formatTime(time)}
                  </span>
                ))}
              </div>
              {duration > 0 ? (
              <div className="shrink-0 py-1" style={{ minWidth: `max(100%, ${timelinePixelWidth}px)` }}>
                <div className="mb-1 flex items-center gap-2 text-[9px] text-[#a9b9bf]">
                  <span>Source coverage</span>
                  <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-[#26718a]" />Kept</span>
                  <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm" style={{ backgroundImage: "repeating-linear-gradient(135deg, #303a46 0px, #303a46 2px, #202833 2px, #202833 4px)" }} />Removed</span>
                </div>
                <div role="img" aria-label="Source coverage. Solid blue sections are kept; hatched sections are removed." className="relative h-2.5 overflow-hidden rounded-sm" style={{ backgroundImage: "repeating-linear-gradient(135deg, #303a46 0px, #303a46 5px, #202833 5px, #202833 10px)" }}>
                  {sourceCoverage.map((range, index) => (
                    <span key={`${range.type}-${range.start}-${index}`} aria-hidden="true" className={`absolute inset-y-0 ${range.type === "kept" ? "bg-[#26718a]" : ""}`} style={{ left: `${(range.start / duration) * 100}%`, width: `${((range.end - range.start) / duration) * 100}%` }} />
                  ))}
                </div>
              </div>
            ) : null}
            <div data-timeline-track="true" className="relative min-h-0 flex-1 overflow-hidden" style={{ minWidth: `max(100%, ${timelinePixelWidth}px)` }} onClick={(event) => {
              if (!timelineDuration || !mediaReady) return;
              const rect = event.currentTarget.getBoundingClientRect();
              handleTimelineScrub(pixelToTime(event.clientX - rect.left, timelineDuration, rect.width));
            }}>
              <div className="pointer-events-none absolute bottom-0 top-0 z-20 flex flex-col items-center" style={{ left: `${timeToPixel(timelineCurrentTime, timelineDuration, timelinePixelWidth)}px` }}>
                <div className="h-2.5 w-2.5 bg-[#4cd7f6]" style={{ clipPath: "polygon(0 0, 100% 0, 50% 100%)" }} />
                <div className="w-0.5 flex-1 bg-[#4cd7f6]" />
              </div>
              {sceneBreakdown.map((segment, index) => {
                const editSegment = editSegments[index];
                const selected = editSegment?.id === selectedEditSegmentId;
                const segmentKey = editSegment?.id ?? `${segment.start}-${segment.end}-${index}`;
                const commonHandleProps = {
                  disabled: exportState === "rendering",
                  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>, edge: "start" | "end") => editSegment && beginTrimDrag(event, editSegment, edge),
                  onPointerMove: moveTrimDrag,
                  onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => finishTrimDrag(event),
                  onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => finishTrimDrag(event, true),
                };
                return (
                  <div key={segmentKey} className="contents">
                    <button
                      type="button"
                      aria-label={`Kept segment ${formatTime(segment.start)} to ${formatTime(segment.end)}`}
                      aria-pressed={selected}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedEditSegmentId(editSegment?.id ?? null);
                        handleScrub(segment.start);
                      }}
                      className={`absolute bottom-1 top-1 overflow-hidden rounded border p-1 text-left transition-colors ${selected ? "border-[#4cd7f6] bg-[#12617a] shadow-[inset_0_0_0_1px_rgba(76,215,246,0.28)]" : "border-[#4380a0]/80 bg-[#245267] hover:bg-[#2d647c]"}`}
                      style={{ left: `${timeToPixel(segment.timelineStart, timelineDuration, timelinePixelWidth)}px`, width: `${timeToPixel(segment.end - segment.start, timelineDuration, timelinePixelWidth)}px` }}
                    >
                      <span className="block truncate text-[10px] font-medium text-[#dde2f3]">Keep {formatTime(segment.start)}–{formatTime(segment.end)}</span>
                    </button>
                    {editSegment ? <>
                      <button type="button" aria-label={`Drag trim start for segment ${index + 1}`} title="Drag to trim segment start" {...commonHandleProps} onPointerDown={(event) => commonHandleProps.onPointerDown(event, "start")} className="absolute top-1/2 z-10 h-9 w-2 -translate-x-1/2 -translate-y-1/2 touch-none rounded bg-[#4cd7f6] disabled:opacity-40" style={{ left: `${timeToPixel(segment.timelineStart, timelineDuration, timelinePixelWidth)}px` }} />
                      <button type="button" aria-label={`Drag trim end for segment ${index + 1}`} title="Drag to trim segment end" {...commonHandleProps} onPointerDown={(event) => commonHandleProps.onPointerDown(event, "end")} className="absolute top-1/2 z-10 h-9 w-2 -translate-x-1/2 -translate-y-1/2 touch-none rounded bg-[#4cd7f6] disabled:opacity-40" style={{ left: `${timeToPixel(segment.timelineStart + (segment.end - segment.start), timelineDuration, timelinePixelWidth)}px` }} />
                    </> : null}
                  </div>
                );
              })}
              {duration > 0 && sceneBreakdown.length === 0 ? <span className="p-2 text-[11px] text-[#bcc9cd]">Timeline unavailable.</span> : null}
            </div>
            </div>
          </div>
        </footer>
      </main>

      {showSettings ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e131f]/80 px-4">
          <div className="w-full max-w-md rounded-[28px] border border-[#3d494c]/30 bg-[#161c28] p-5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#bcc9cd]">Workspace settings</div>
                <div className="mt-1 text-[22px] font-semibold text-[#dde2f3]">Project preferences</div>
              </div>
              <button type="button" onClick={() => setShowSettings(false)} className="text-[12px] text-[#bcc9cd]">Close</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-[0.14em] text-[#bcc9cd]">Project name</label>
                <input value={projectName} onChange={(event) => setProjectName(event.target.value)} className="w-full rounded-xl border border-[#3d494c]/30 bg-[#0e131f] px-3 py-2.5 text-[13px] text-[#dde2f3] outline-none focus:border-[#4cd7f6]" />
              </div>

              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-[0.14em] text-[#bcc9cd]">Default export</label>
                <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value)} className="w-full rounded-xl border border-[#3d494c]/30 bg-[#0e131f] px-3 py-2.5 text-[13px] text-[#dde2f3] outline-none focus:border-[#4cd7f6]">
                  <option>MP4</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 block text-[11px] uppercase tracking-[0.14em] text-[#bcc9cd]">Resolution</label>
                  <select value={exportResolution} onChange={(event) => setExportResolution(event.target.value)} className="w-full rounded-xl border border-[#3d494c]/30 bg-[#0e131f] px-3 py-2.5 text-[13px] text-[#dde2f3] outline-none focus:border-[#4cd7f6]">
                    <option value="source">Source</option>
                    <option>720p</option>
                    <option>1080p</option>
                    <option>4K</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-[11px] uppercase tracking-[0.14em] text-[#bcc9cd]">Quality</label>
                  <select value={exportQuality} onChange={(event) => setExportQuality(event.target.value)} className="w-full rounded-xl border border-[#3d494c]/30 bg-[#0e131f] px-3 py-2.5 text-[13px] text-[#dde2f3] outline-none focus:border-[#4cd7f6]">
                    <option>Draft</option>
                    <option>High</option>
                    <option>Premium</option>
                  </select>
                </div>
              </div>
            </div>

            <button type="button" onClick={() => setShowSettings(false)} className="mt-6 w-full rounded-xl border border-[#4cd7f6]/30 bg-[#06b6d4]/10 px-4 py-2.5 text-[13px] font-medium text-[#4cd7f6]">
              Save changes
            </button>
          </div>
        </div>
      ) : null}

      {showExport ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e131f]/80 px-4">
          <div className="w-full max-w-lg rounded-[28px] border border-[#3d494c]/30 bg-[#161c28] p-5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#bcc9cd]">Export</div>
                <div className="mt-1 text-[22px] font-semibold text-[#dde2f3]">Render settings</div>
              </div>
              <button type="button" onClick={() => setShowExport(false)} className="text-[12px] text-[#bcc9cd]">Close</button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#3d494c]/30 bg-[#0e131f] p-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[#bcc9cd]">Format</div>
                <div className="mt-2 text-[15px] font-medium text-[#dde2f3]">{exportFormat}</div>
              </div>
              <div className="rounded-2xl border border-[#3d494c]/30 bg-[#0e131f] p-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[#bcc9cd]">Resolution</div>
                <div className="mt-2 text-[15px] font-medium text-[#dde2f3]">{exportResolution}</div>
              </div>
              <div className="rounded-2xl border border-[#3d494c]/30 bg-[#0e131f] p-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[#bcc9cd]">Quality</div>
                <div className="mt-2 text-[15px] font-medium text-[#dde2f3]">{exportQuality}</div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-[#4cd7f6]/20 bg-[#06b6d4]/10 p-4 text-[13px] leading-6 text-[#dde2f3]">
              {exportState === "rendering" ? <p role="status">Rendering your current timeline with FFmpeg…</p> : null}
              {exportState === "failed" ? <p role="alert" className="text-[#ffb4ab]">{exportError}</p> : null}
              {exportState === "completed" && outputUrl ? (
                <div>
                  <p>Export completed. Preview and download the stored MP4.</p>
                  <video
                    ref={exportVideoRef}
                    preload="metadata"
                    src={outputUrl}
                    playsInline
                    controlsList="nodownload noremoteplayback"
                    disablePictureInPicture
                    onContextMenu={(event) => event.preventDefault()}
                    onLoadStart={() => {
                      setIsExportPreviewPlaying(false);
                      setExportPreviewTime(0);
                      setExportPreviewDuration(0);
                    }}
                    onLoadedMetadata={(event) => {
                      setExportPreviewDuration(event.currentTarget.duration);
                      setExportPreviewTime(event.currentTarget.currentTime);
                    }}
                    onTimeUpdate={(event) => setExportPreviewTime(event.currentTarget.currentTime)}
                    onPlay={() => setIsExportPreviewPlaying(true)}
                    onPause={() => setIsExportPreviewPlaying(false)}
                    onError={() => { setExportState("failed"); setExportError("The stored export is unavailable. Render the current timeline again."); }}
                    className="mt-3 max-h-56 w-full rounded bg-black"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button type="button" onClick={() => void toggleExportPreview()} disabled={!exportPreviewDuration} className="rounded border border-[#3d494c]/40 px-2 py-1 text-[11px] text-[#dde2f3] disabled:opacity-40" aria-label={isExportPreviewPlaying ? "Pause export preview" : "Play export preview"}>
                      {isExportPreviewPlaying ? "Pause preview" : "Play preview"}
                    </button>
                    <input type="range" aria-label="Seek export preview" min={0} max={exportPreviewDuration || 0} step={0.05} value={Math.min(exportPreviewTime, exportPreviewDuration || 0)} onChange={(event) => {
                      const time = Number(event.currentTarget.value);
                      if (exportVideoRef.current) exportVideoRef.current.currentTime = time;
                      setExportPreviewTime(time);
                    }} disabled={!exportPreviewDuration} className="min-w-0 flex-1 accent-[#4cd7f6] disabled:opacity-40" />
                    <span className="font-mono text-[10px] text-[#bcc9cd]">{formatTime(exportPreviewTime)} / {formatTime(exportPreviewDuration)}</span>
                  </div>
                  {exportDownloadUrl ? <a href={exportDownloadUrl} className="mt-3 inline-block rounded border border-[#4cd7f6]/40 px-3 py-2 text-[#4cd7f6]">Download MP4</a> : null}
                </div>
              ) : exportState !== "rendering" && exportState !== "failed" ? <p>The current kept timeline segments will be rendered to an MP4.</p> : null}
            </div>

            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setShowExport(false)} className="flex-1 rounded-xl border border-[#3d494c]/30 bg-[#242a36] px-4 py-2.5 text-[13px] font-medium text-[#dde2f3]">Close</button>
              <button type="button" disabled={!selectedClip?.videoId || !mediaReady || exportState === "rendering" || editSegments.length === 0} onClick={handleExport} className="flex-1 rounded-xl border border-[#4cd7f6]/30 bg-[#06b6d4]/10 px-4 py-2.5 text-[13px] font-medium text-[#4cd7f6] disabled:opacity-40">{exportState === "rendering" ? "Rendering…" : "Render MP4"}</button>
            </div>
          </div>
        </div>
      ) : null}

      <input ref={fileInputRef} type="file" accept="video/mp4" className="hidden" onChange={handleFileSelect} />
    </main>
  );
}
