"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearPendingUpload, getPendingUpload, setPendingUpload } from "@/lib/pending-upload";
import { parseStoredVideoReference } from "@/lib/project-media";
import { isAllowedVideoUpload } from "@/lib/security";
import type { Transcript } from "@/lib/types";

type HistoryItem = {
  id: string;
  prompt: string;
  cuts: number;
  feedback: "up" | "down" | null;
};

type LoadedClip = {
  id: string;
  name: string;
  url: string;
  duration: number;
  videoId?: string;
};

type ChatMessage = {
  role: "assistant" | "user";
  text: string;
};

type SessionUser = {
  id: string;
  email: string;
};

function formatTime(seconds: number) {
  const s = Number.isFinite(seconds) ? Math.max(seconds, 0) : 0;
  const mins = String(Math.floor(s / 60)).padStart(2, "0");
  const secs = String(Math.floor(s % 60)).padStart(2, "0");
  return `${mins}:${secs}`;
}

export default function EditorPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [projectName, setProjectName] = useState("untitled project");
  const [clips, setClips] = useState<LoadedClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [editPlan, setEditPlan] = useState<Array<{ action: "cut"; start: number; end: number; reason?: string }>>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingFileLoaded, setPendingFileLoaded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const videoRef = useRef<HTMLVideoElement | null>(null);
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
  const lastVideoStorageKey = authUser ? `voxcut:last-video:${authUser.id}` : null;
  const [authLoading, setAuthLoading] = useState(true);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [transcriptionVideoId, setTranscriptionVideoId] = useState<string | null>(null);
  const [transcriptionStatus, setTranscriptionStatus] = useState<"not_started" | "transcribing" | "completed" | "failed">("not_started");
  const [transcriptionError, setTranscriptionError] = useState("");

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
    setProjectName("untitled project");
    setChatMessages([]);
    setHistory([]);
    setClips([]);
    setSelectedClipId(null);
    setOutputUrl(null);
    setEditPlan([]);
  };

  const selectedClip = useMemo(
    () => clips.find((clip) => clip.id === selectedClipId) ?? clips[0] ?? null,
    [clips, selectedClipId],
  );

  const duration = selectedClip?.duration || 0;
  const progressPct = duration > 0 ? Math.max(0, Math.min((currentTime / duration) * 100, 100)) : 0;
  const activeProjectId = useMemo(() => (authUser ? `project-${authUser.id.slice(0, 8)}` : "default-project"), [authUser]);
  const historyCountLabel = history.length === 1 ? "1 edit" : `${history.length} edits`;
  const timelineTicks = useMemo(
    () => duration > 0 ? Array.from({ length: 6 }, (_, index) => duration * index / 5) : [],
    [duration],
  );
  const currentTranscript = selectedClip?.videoId === transcriptionVideoId ? transcript : null;
  const currentTranscriptionStatus = selectedClip?.videoId === transcriptionVideoId ? transcriptionStatus : "not_started";
  const currentTranscriptionError = selectedClip?.videoId === transcriptionVideoId ? transcriptionError : "";
  const activeTranscriptIndex = currentTranscript?.segments.findIndex(
    (segment) => currentTime >= segment.start && currentTime <= segment.end,
  ) ?? -1;

  const timelineSegments = useMemo(() => {
    if (!duration) return [{ start: 0, end: 0, kept: true }];
    if (editPlan.length === 0) return [{ start: 0, end: duration, kept: true }];

    const sortedCuts = [...editPlan].sort((a, b) => a.start - b.start);
    const segments: Array<{ start: number; end: number; kept: boolean }> = [];
    let cursor = 0;

    sortedCuts.forEach((cut) => {
      const safeStart = Math.max(0, Math.min(cut.start, duration));
      const safeEnd = Math.max(safeStart, Math.min(cut.end, duration));

      if (cursor < safeStart) {
        segments.push({ start: cursor, end: safeStart, kept: true });
      }

      if (safeEnd > cursor) {
        segments.push({ start: safeStart, end: safeEnd, kept: false });
      }

      cursor = Math.max(cursor, safeEnd);
    });

    if (cursor < duration) {
      segments.push({ start: cursor, end: duration, kept: true });
    }

    return segments;
  }, [duration, editPlan]);

  const sceneBreakdown = useMemo(() => {
    if (!duration || timelineSegments.length === 0) return [];

    return timelineSegments.map((segment, index) => ({
      ...segment,
      label: segment.kept ? `Scene ${index + 1}` : `Cut ${index + 1}`,
      width: (((segment.end - segment.start) / Math.max(duration, 0.01)) * 100),
    }));
  }, [duration, timelineSegments]);

  const hasClips = clips.length > 0;

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
  }, [activeProjectId, authUser, selectedClip?.videoId]);

  const handleTranscribe = async () => {
    if (!selectedClip?.videoId) return;
    setTranscriptionVideoId(selectedClip.videoId);
    setTranscriptionStatus("transcribing");
    setTranscriptionError("");
    setTranscript(null);
    try {
      const response = await fetch("/api/transcription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: selectedClip.videoId, projectId: activeProjectId }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.transcript) throw new Error(payload.error ?? "Transcription failed.");
      setTranscript(payload.transcript as Transcript);
      setTranscriptionStatus("completed");
    } catch (error) {
      setTranscriptionStatus("failed");
      setTranscriptionError(error instanceof Error ? error.message : "Transcription failed.");
    }
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
      };
      let restoreWarning = false;
      try {
        localStorage.setItem(lastVideoStorageKey!, JSON.stringify({
          videoId: clip.videoId,
          projectId: activeProjectId,
          name: clip.name,
          sourceUrl: clip.url,
          duration: clip.duration,
        }));
      } catch {
        restoreWarning = true;
      }
      setClips((previous) => [...previous, clip]);
      setSelectedClipId(clip.id);
      setProjectName(file.name.replace(/\.mp4$/i, ""));
      setOutputUrl(null);
      setCurrentTime(0);
      setMediaReady(false);
      setIsPlaying(false);
      setChatMessages([{ role: "assistant", text: "Video uploaded. Loading stored media…" }]);
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

  const handleGenerate = async () => {
    if (!authUser) {
      setStatus("Please sign in before creating an edit plan.");
      return;
    }

    if (!selectedClip || !selectedClip.videoId) {
      setStatus("Upload a video clip before prompting edits.");
      return;
    }
    if (!prompt.trim()) return;

    try {
      setStatus("Generating edit plan...");
      const response = await fetch("/api/plan-cut", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: selectedClip.videoId,
          projectId: activeProjectId,
          prompt: prompt.trim(),
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not create an edit plan.");

      const nextCount = Array.isArray(payload.plan) ? payload.plan.length : 0;
      const nextPlan = Array.isArray(payload.plan) ? payload.plan : [];
      const trimmedPrompt = prompt.trim();
      setOutputUrl(payload.outputUrl ?? null);
      setEditPlan(nextPlan);
      setCurrentTime(0);
      setChatMessages([
        { role: "user", text: trimmedPrompt },
        {
          role: "assistant",
          text: nextCount > 0 ? `I cut ${nextCount} section${nextCount === 1 ? "" : "s"} to keep the strongest rhythm and remove filler.` : "I kept the footage mostly intact and focused on the strongest pacing moments.",
        },
      ]);
      setHistory((previous) => [
        { id: payload.promptLogId ?? crypto.randomUUID(), prompt: trimmedPrompt, cuts: nextCount, feedback: null },
        ...previous,
      ]);
      setStatus("");
      setPrompt("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Prompt failed.");
    }
  };

  const handleFeedback = (id: string, feedback: "up" | "down") => {
    setHistory((previous) => previous.map((entry) => (entry.id === id ? { ...entry, feedback } : entry)));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") handleGenerate();
  };

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setStatus("The uploaded video is still loading.");
      return;
    }

    if (video.paused) {
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

  const handleScrub = (nextTime: number) => {
    const video = videoRef.current;
    if (!video) return;

    if (video.readyState < HTMLMediaElement.HAVE_METADATA || !Number.isFinite(video.duration)) return;
    const safeTime = Math.max(0, Math.min(nextTime, video.duration));
    video.currentTime = safeTime;
    setCurrentTime(safeTime);
  };

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
            <button type="button" className="flex items-center gap-1 rounded px-2.5 py-1 text-[12px] text-[#bcc9cd] transition-colors hover:bg-[#242a36]/50 hover:text-[#dde2f3]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path d="M9 14 4 9l5-5" />
                <path d="M20 19v-1a4 4 0 0 0-4-4H4" />
              </svg>
              <span className="hidden sm:inline">Undo</span>
            </button>
            <div className="h-3.5 w-px bg-[#3d494c]/30" />
            <button type="button" className="flex items-center gap-1 rounded px-2.5 py-1 text-[12px] text-[#bcc9cd] transition-colors hover:bg-[#242a36]/50 hover:text-[#dde2f3]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path d="m15 10 5 5-5 5" />
                <path d="M4 5v1a4 4 0 0 0 4 4h12" />
              </svg>
              <span className="hidden sm:inline">Redo</span>
            </button>
          </div>

          <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-[#bcc9cd] transition-colors hover:bg-[#242a36]/50 hover:text-[#dde2f3]" aria-label="Help">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <circle cx="12" cy="12" r="9" />
              <path d="M9.09 9a3 3 0 1 1 5.82 1c-.92 1.74-2.93 2.13-3.58 4.22" />
              <circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" />
            </svg>
          </button>

          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="rounded-lg border border-[#3d494c]/40 px-3 py-2 text-[12px] text-[#dde2f3] disabled:opacity-50">
            Upload MP4
          </button>
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
          <button type="button" className="flex w-full items-center justify-center border-l-2 border-[#4cd7f6] bg-[#1a202c]/40 py-2 text-[#4cd7f6]" title="Layers" aria-label="Layers">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <path d="M12 3 3 8l9 5 9-5-9-5Z" />
              <path d="m3 12 9 5 9-5" />
              <path d="m3 16 9 5 9-5" />
            </svg>
          </button>

          <button type="button" className="flex w-full items-center justify-center py-2 text-[#bcc9cd] transition-colors hover:bg-[#1a202c]/30 hover:text-[#dde2f3]" title="Home" aria-label="Home">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <path d="m3 10 9-7 9 7" />
              <path d="M5 9v10h14V9" />
            </svg>
          </button>

          <button type="button" className="flex w-full items-center justify-center py-2 text-[#bcc9cd] transition-colors hover:bg-[#1a202c]/30 hover:text-[#dde2f3]" title="Media library" aria-label="Media library">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m15 9 5 3-5 3V9Z" />
            </svg>
          </button>

          <button type="button" className="flex w-full items-center justify-center py-2 text-[#bcc9cd] transition-colors hover:bg-[#1a202c]/30 hover:text-[#dde2f3]" title="Audio" aria-label="Audio">
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
            <div className="flex h-full flex-col">
              <div className="flex flex-1 items-center justify-center p-4">
                <div className="relative aspect-video w-full max-w-4xl overflow-hidden rounded border border-[#3d494c]/30 bg-[#0e131f]">
                  {selectedClip ? (
                    <video
                      ref={videoRef}
                      key={selectedClip.id}
                      src={outputUrl ?? selectedClip.url}
                      className="h-full w-full object-cover"
                      playsInline
                      disablePictureInPicture
                      onContextMenu={(e) => e.preventDefault()}
                      onLoadStart={() => setMediaReady(false)}
                      onTimeUpdate={(e) => {
                        const time = e.currentTarget.currentTime;
                        if (Number.isFinite(time)) setCurrentTime(time);
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
                        video.volume = volume;
                        setMediaReady(true);
                        setChatMessages([{ role: "assistant", text: "Video uploaded. Playback is ready in the editor." }]);
                        setStatus("");
                      }}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onError={() => {
                        setMediaReady(false);
                        setIsPlaying(false);
                        setChatMessages([{ role: "assistant", text: "The video was uploaded, but the stored media could not be loaded." }]);
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
                  <button type="button" className="rounded border border-[#3d494c]/30 bg-[#1a202c] px-2 py-1 text-[11px] text-[#bcc9cd]">
                    16:9
                  </button>
                  <div className="flex items-center gap-1.5 text-[#bcc9cd]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                      <path d="M4 14V10h3l5-4v12l-5-4H4Z" />
                      <path d="M15.5 9.5a4 4 0 0 1 0 5" />
                      <path d="M18.5 7a7 7 0 0 1 0 10" />
                    </svg>
                    <div className="h-1 w-16 overflow-hidden rounded-full bg-[#2f3542]">
                      <div className="h-full w-3/4 bg-[#bcc9cd]" />
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
                  <span className="font-mono">{selectedClip ? (mediaReady ? `${formatTime(duration)} runtime` : "Loading video metadata") : "Waiting for media"}</span>
                  <button type="button" className="p-1 transition-colors hover:text-[#dde2f3]" aria-label="Fullscreen">
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

          <aside className="flex w-96 shrink-0 flex-col border-l border-[#3d494c]/30 bg-[#1a202c]">
            <div className="flex h-11 items-center justify-between border-b border-[#3d494c]/30 bg-[#161c28] px-4">
              <div className="flex items-center gap-2">
                <span className="text-[16px] font-medium text-[#dde2f3]">Prompt history</span>
                <span className="rounded border border-[#3d494c]/30 bg-[#242a36] px-1.5 py-0.5 text-[10px] text-[#4cd7f6]">
                  {historyCountLabel}
                </span>
              </div>
              <button type="button" className="p-1 text-[#bcc9cd] transition-colors hover:text-[#dde2f3]" aria-label="Tune settings">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <path d="M4 7h16" />
                  <path d="M7 12h10" />
                  <path d="M10 17h4" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              <section aria-label="Video transcript" className="mb-3 rounded-lg border border-[#3d494c]/30 bg-[#161c28] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="text-[12px] font-medium uppercase tracking-[0.12em] text-[#4cd7f6]">Transcript</h2>
                  {selectedClip?.videoId && currentTranscriptionStatus !== "transcribing" && currentTranscriptionStatus !== "completed" ? (
                    <button type="button" onClick={handleTranscribe} className="rounded border border-[#4cd7f6]/30 px-2 py-1 text-[11px] text-[#4cd7f6] hover:bg-[#4cd7f6]/10">
                      {currentTranscriptionStatus === "failed" ? "Retry" : "Transcribe video"}
                    </button>
                  ) : null}
                </div>
                {!selectedClip?.videoId ? <p className="text-[12px] text-[#869397]">Upload a video to transcribe its speech.</p> : null}
                {currentTranscriptionStatus === "transcribing" ? <p role="status" className="text-[12px] text-[#bcc9cd]">Transcribing the uploaded video…</p> : null}
                {currentTranscriptionError ? <p role="alert" className="mb-2 text-[12px] text-[#ffb4ab]">{currentTranscriptionError}</p> : null}
                {currentTranscript && currentTranscript.segments.length === 0 ? <p className="text-[12px] text-[#bcc9cd]">No speech was detected in this video.</p> : null}
                {currentTranscript?.text ? <p className="mb-2 text-[12px] leading-5 text-[#dde2f3]">{currentTranscript.text}</p> : null}
                {currentTranscript?.segments.map((segment, index) => (
                  <button
                    key={`${segment.start}-${index}`}
                    type="button"
                    data-active-transcript={index === activeTranscriptIndex ? "true" : "false"}
                    aria-current={index === activeTranscriptIndex ? "time" : undefined}
                    onClick={() => handleScrub(segment.start)}
                    className={`block w-full border-t border-[#3d494c]/20 py-2 text-left text-[12px] ${index === activeTranscriptIndex ? "bg-[#4cd7f6]/10 text-[#4cd7f6]" : "text-[#dde2f3]"}`}
                  >
                    <span className="mr-2 font-mono text-[#869397]">{formatTime(segment.start)}–{formatTime(segment.end)}</span>{segment.text}
                  </button>
                ))}
              </section>
              <div className="flex flex-col gap-2.5">
                {history.length > 0 ? history.map((entry) => (
                  <div key={entry.id} className="flex flex-col gap-2 rounded-lg border border-[#3d494c]/30 bg-[#161c28] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] leading-snug text-[#dde2f3]">{entry.prompt}</p>
                      <div className="flex shrink-0 items-center gap-1 text-[#bcc9cd]">
                        <button type="button" className="p-0.5 transition-colors hover:text-[#4cd7f6]" aria-label="Helpful prompt">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                            <path d="M7 10v9m0 0H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3m0 0 4.5-7.8A1.4 1.4 0 0 1 16.7 3c1 0 1.8.8 1.8 1.8 0 .3-.1.7-.2.9L16 10h4.8a2 2 0 0 1 2 2.3l-1 6a2 2 0 0 1-2 1.7H7Z" />
                          </svg>
                        </button>
                        <button type="button" className="p-0.5 transition-colors hover:text-[#ffb4ab]" aria-label="Unhelpful prompt">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                            <path d="M17 14V5m0 0h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3m0 0-4.5 7.8A1.4 1.4 0 0 1 7.3 21c-1 0-1.8-.8-1.8-1.8 0-.3.1-.7.2-.9L8 14H3.2a2 2 0 0 1-2-2.3l1-6a2 2 0 0 1 2-1.7H17Z" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="inline-flex w-fit items-center gap-1.5 rounded border border-[#06b6d4]/30 bg-[#0e131f] px-2 py-0.5 text-[10px] text-[#4cd7f6]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#06b6d4]" />
                      <span>{entry.cuts} cut{entry.cuts === 1 ? "" : "s"}{entry.feedback ? ` • ${entry.feedback === "up" ? "Helpful" : "Needs work"}` : ""}</span>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-lg border border-dashed border-[#3d494c]/30 bg-[#0e131f] p-4 text-left">
                    <div className="mb-2 text-[12px] font-medium uppercase tracking-[0.14em] text-[#4cd7f6]">No edits yet</div>
                    <p className="text-[13px] leading-6 text-[#bcc9cd]">Upload a video and describe the cut you want. Your prompt history and generated edit plan will appear here.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-[#3d494c]/30 bg-[#0e131f] p-3">
              <div className="flex items-center gap-2 rounded-lg border border-[#3d494c]/30 bg-[#161c28] px-2.5 py-1.5 focus-within:border-[#4cd7f6]">
                <input
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe the edit you want..."
                  className="w-full border-0 bg-transparent p-0 text-[13px] text-[#dde2f3] placeholder:text-[#869397] focus:ring-0"
                />
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!prompt.trim()}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[#06b6d4] text-[#0e131f] transition-colors hover:bg-[#5de6ff] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Send prompt"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-[#bcc9cd]">
                <span>Press Enter to generate</span>
                <span className="font-mono text-[#869397]">Cut planning service</span>
              </div>
            </div>
          </aside>
        </div>

        <footer className="relative h-32 shrink-0 border-t border-[#3d494c]/30 bg-[#161c28]">
          <div className="relative flex h-6 items-center border-b border-[#3d494c]/30 bg-[#0e131f] px-4 text-[11px] text-[#bcc9cd] font-mono">
            <div className="relative h-full w-full">
              {timelineTicks.map((time, index) => (
                <span key={index} className="absolute top-1/2 -translate-y-1/2" style={{ left: `${duration ? (time / duration) * 100 : 0}%`, transform: index === 0 ? "translateY(-50%)" : index === timelineTicks.length - 1 ? "translate(-100%, -50%)" : "translate(-50%, -50%)" }}>
                  {formatTime(time)}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[#869397]">Sequence 1080p</span>
              <button type="button" className="p-0.5 text-[#bcc9cd] transition-colors hover:text-[#dde2f3]" aria-label="Zoom in">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <circle cx="11" cy="11" r="5" />
                  <path d="M16 16 21 21" />
                  <path d="M11 8v6M8 11h6" />
                </svg>
              </button>
              <button type="button" className="p-0.5 text-[#bcc9cd] transition-colors hover:text-[#dde2f3]" aria-label="Zoom out">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <circle cx="11" cy="11" r="5" />
                  <path d="M16 16 21 21" />
                  <path d="M8 11h6" />
                </svg>
              </button>
            </div>
          </div>

          <div className="relative flex h-[calc(100%-24px)] items-center gap-2 overflow-x-auto p-2">
            <div className="pointer-events-none absolute bottom-0 top-0 z-20 flex flex-col items-center" style={{ left: `calc(${progressPct}% + 8px)` }}>
              <div className="h-2.5 w-2.5 bg-[#4cd7f6]" style={{ clipPath: "polygon(0 0, 100% 0, 50% 100%)" }} />
              <div className="w-0.5 flex-1 bg-[#4cd7f6]" />
            </div>

            {sceneBreakdown.length > 0 ? sceneBreakdown.map((segment, index) => (
              <div
                key={`${segment.start}-${segment.end}-${index}`}
                className={`relative h-20 shrink-0 overflow-hidden rounded border p-2 ${segment.kept ? "border-[#3d494c]/30 bg-[#1a202c]" : "border-[#4cd7f6]/40 bg-[#0f172a]"}`}
                style={{ width: `${segment.width}%` }}
              >
                <div className="flex items-center justify-between">
                  <span className="max-w-[80%] truncate text-[11px] font-medium text-[#dde2f3]">{segment.kept ? "Keep" : "Cut"}</span>
                  <span className="font-mono text-[10px] text-[#bcc9cd]">{formatTime(segment.start)} - {formatTime(segment.end)}</span>
                </div>

                <div className="mt-4 flex h-8 items-center gap-0.5">
                  {Array.from({ length: 12 }).map((_, barIndex) => (
                    <div
                      key={`${segment.start}-${barIndex}`}
                      className={`w-1 ${segment.kept ? "bg-[#7bd0ff]" : "bg-[#4cd7f6]"}`}
                      style={{ height: `${(barIndex % 6) * 4 + 10}px` }}
                    />
                  ))}
                </div>
              </div>
            )) : (
              <div className="flex h-20 w-full items-center justify-center rounded border border-dashed border-[#3d494c]/40 bg-[#0e131f]/50 px-4 text-center text-[12px] text-[#bcc9cd]">
                Timeline will appear after the first valid edit plan is generated.
              </div>
            )}

            <button type="button" className="flex h-20 w-12 shrink-0 flex-col items-center justify-center rounded border border-dashed border-[#3d494c]/40 bg-[#0e131f]/50 text-[#bcc9cd] transition-colors hover:border-[#4cd7f6] hover:text-[#4cd7f6]" aria-label="Add clip">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
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
                  <option>GIF</option>
                  <option>WebM</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 block text-[11px] uppercase tracking-[0.14em] text-[#bcc9cd]">Resolution</label>
                  <select value={exportResolution} onChange={(event) => setExportResolution(event.target.value)} className="w-full rounded-xl border border-[#3d494c]/30 bg-[#0e131f] px-3 py-2.5 text-[13px] text-[#dde2f3] outline-none focus:border-[#4cd7f6]">
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
              Render queue is prepared for a clean final export. This screen is ready to be connected to a production export endpoint when you add backend delivery or cloud storage.
            </div>

            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setShowExport(false)} className="flex-1 rounded-xl border border-[#3d494c]/30 bg-[#242a36] px-4 py-2.5 text-[13px] font-medium text-[#dde2f3]">Cancel</button>
              <button type="button" onClick={() => { setShowExport(false); setStatus("Export queued for render."); }} className="flex-1 rounded-xl border border-[#4cd7f6]/30 bg-[#06b6d4]/10 px-4 py-2.5 text-[13px] font-medium text-[#4cd7f6]">Render now</button>
            </div>
          </div>
        </div>
      ) : null}

      <input ref={fileInputRef} type="file" accept="video/mp4" className="hidden" onChange={handleFileSelect} />
    </main>
  );
}
