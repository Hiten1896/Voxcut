"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

type Recommendation = {
  id: string;
  title: string;
  subtitle: string;
  prompt: string;
  badge: string;
  benefit: string;
};

const recommendations: Recommendation[] = [
  {
    id: "hook",
    title: "Create a viral hook",
    subtitle: "Strong opening for short-form content",
    prompt: "Create a tight, high-energy clip with a strong hook, remove silences, and keep only the most engaging moments.",
    badge: "Best for reels",
    benefit: "Boosts retention in the first 3 seconds",
  },
  {
    id: "podcast",
    title: "Podcast teaser",
    subtitle: "Turn a long podcast into a punchy teaser",
    prompt: "Find the most insightful and emotional moments, remove pauses and filler, and create a concise teaser under 45 seconds.",
    badge: "Creator favorite",
    benefit: "Turns long-form audio into shareable clips",
  },
  {
    id: "talking-head",
    title: "Clean talking-head cut",
    subtitle: "Polished interview or talking-head edit",
    prompt: "Trim dead air, keep the strongest statements, and create a clean talking-head cut with natural flow and clear pacing.",
    badge: "Interview mode",
    benefit: "Feels premium and professional",
  },
  {
    id: "product-demo",
    title: "Product highlight",
    subtitle: "Best moments for a product demo or tutorial",
    prompt: "Cut the essential product moments, remove filler, and create a focused highlight reel with a clear feature story.",
    badge: "Business use",
    benefit: "Perfect for ads and product education",
  },
  {
    id: "sports",
    title: "Match recap",
    subtitle: "Fast recap with only the winning moments",
    prompt: "Pull only the decisive, exciting, and high-impact moments, keep the action flowing, and create a shorter recap edit.",
    badge: "High energy",
    benefit: "Makes long footage feel exciting and concise",
  },
];

const featureHighlights = [
  "AI-powered clip extraction",
  "Short-form social presets",
  "Caption + highlight workflow",
  "Creator-focused editing prompts",
];

const appIdentity = {
  username: "Hiten1896",
  fullName: "Hiten Sharma",
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
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
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
    setAuthUser(null);
  };

  const selectedClip = useMemo(
    () => clips.find((clip) => clip.id === selectedClipId) ?? clips[0] ?? null,
    [clips, selectedClipId],
  );

  const hasClips = clips.length > 0;

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
        </div>
      </main>
    );
  }

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith("video/")) {
      setStatus("Please choose a video file.");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const clipId = crypto.randomUUID();
    const newClip: LoadedClip = { id: clipId, name: file.name, url: objectUrl, duration: 0 };

    setClips((previous) => [...previous, newClip]);
    setSelectedClipId(clipId);
    setStatus(`Loading ${file.name}...`);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("userId", "Hiten1896");
      formData.append("projectId", "voxcut-project");

      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Upload failed.");

      setClips((previous) =>
        previous.map((clip) =>
          clip.id === clipId
            ? { ...clip, duration: Number(payload.duration ?? 0), videoId: payload.videoId }
            : clip,
        ),
      );
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed.");
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await uploadFile(file);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) await uploadFile(file);
  };

  const handleGenerate = async () => {
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
          userId: "Hiten1896",
          projectId: "voxcut-project",
          prompt: prompt.trim(),
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not create an edit plan.");

      const nextCount = Array.isArray(payload.plan) ? payload.plan.length : 0;
      setOutputUrl(payload.outputUrl ?? null);
      setCurrentTime(0);
      setHistory((previous) => [
        { id: payload.promptLogId ?? crypto.randomUUID(), prompt: prompt.trim(), cuts: nextCount, feedback: null },
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

  const duration = selectedClip?.duration || 0;
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-[1600px] px-4 py-6">
        <header className="mb-8 flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="6" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium uppercase tracking-[0.22em] text-cyan-300/80">Voxcut</span>
                <span className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-slate-300">
                  Public
                </span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                by {appIdentity.fullName} · @{appIdentity.username}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12px] text-slate-200 transition hover:bg-white/[0.04]"
            >
              Settings
            </button>
            <button
              type="button"
              onClick={() => setShowExport(true)}
              className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-[12px] text-cyan-300 transition hover:bg-cyan-400/15"
            >
              Export
            </button>
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12px] text-slate-300">
              @{appIdentity.username}
            </div>
            <button onClick={handleSignOut} className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12px] text-slate-300 transition hover:bg-white/[0.04]">
              Sign out
            </button>
          </div>
        </header>

        <section className="mb-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-white/[0.08] bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.15),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.9))] p-6 shadow-[0_20px_80px_rgba(10,14,30,0.6)]">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-300">
              AI video repurposing
            </div>
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white md:text-5xl">
              Turn long videos into short clips that people actually watch.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">
              Upload a video, let Voxcut identify the strongest moments, remove dead air, and turn your content into polished short-form cuts built for reels, clips, and quick publishing.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-[13px] font-medium text-cyan-300 transition hover:bg-cyan-400/15"
              >
                Upload video
              </button>
              <button
                onClick={() => setPrompt(recommendations[0].prompt)}
                className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-[13px] font-medium text-slate-200 transition hover:bg-white/[0.05]"
              >
                Try recommended prompt
              </button>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="text-2xl font-semibold text-white">3x</div>
                <div className="mt-1 text-[12px] text-slate-400">faster content repurposing</div>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="text-2xl font-semibold text-white">5 clips</div>
                <div className="mt-1 text-[12px] text-slate-400">auto-generated from one video</div>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="text-2xl font-semibold text-white">1 click</div>
                <div className="mt-1 text-[12px] text-slate-400">social export workflow</div>
              </div>
            </div>
          </div>

          <aside className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Smart recommendations</div>
                <div className="mt-1 text-[18px] font-semibold text-white">Launch-ready prompt ideas</div>
              </div>
              <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[10px] font-medium text-cyan-300">
                AI tuned
              </div>
            </div>

            <div className="space-y-3">
              {recommendations.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setPrompt(item.prompt)}
                  className="w-full rounded-2xl border border-white/[0.06] bg-slate-950/70 p-3 text-left transition hover:border-cyan-400/30 hover:bg-slate-900"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-cyan-300">{item.badge}</span>
                    <span className="text-[10px] text-slate-500">{item.benefit}</span>
                  </div>
                  <div className="mt-2 text-[15px] font-medium text-white">{item.title}</div>
                  <div className="mt-1 text-[12px] text-slate-400">{item.subtitle}</div>
                </button>
              ))}
            </div>
          </aside>
        </section>

        <section className="mb-8 flex flex-wrap gap-2">
          {featureHighlights.map((feature) => (
            <span
              key={feature}
              className="rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[12px] text-slate-300"
            >
              {feature}
            </span>
          ))}
        </section>

        {!hasClips ? (
          <div
            className="flex min-h-[500px] items-center justify-center px-4"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <div
              className={`flex w-full max-w-3xl flex-col items-center gap-4 rounded-[28px] border border-dashed px-8 py-16 text-center transition ${
                isDragging ? "border-cyan-400/50 bg-cyan-400/[0.04]" : "border-white/[0.08] bg-white/[0.02]"
              }`}
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-cyan-400/10 text-cyan-300">
                <i className="ti ti-video-plus text-[30px]" />
              </div>
              <div className="text-[16px] font-medium text-slate-200">Drop a video to turn it into short-form content</div>
              <p className="max-w-xl text-[13px] leading-relaxed text-slate-400">
                Upload one long clip and let Voxcut suggest the strongest hooks, remove dead air, and shape a clean short-form edit ready for social channels.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-[13px] font-medium text-cyan-300 transition hover:bg-cyan-400/15"
                >
                  Choose video
                </button>
                <button
                  onClick={() => setPrompt(recommendations[1].prompt)}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-[13px] font-medium text-slate-200 transition hover:bg-white/[0.05]"
                >
                  Use sample prompt
                </button>
              </div>

              {status ? <p className="text-[12px] text-slate-500">{status}</p> : null}
            </div>
            <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileSelect} />
          </div>
        ) : (
          <div className="mt-4 grid min-h-[620px] gap-4 lg:grid-cols-[1.45fr_0.85fr]">
            <section className="flex flex-col rounded-[28px] border border-white/[0.08] bg-white/[0.02] p-4 shadow-[0_15px_45px_rgba(2,6,23,0.4)]">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[12px] uppercase tracking-[0.18em] text-slate-500">Studio preview</div>
                <div className="text-[12px] text-slate-400">{projectName}</div>
              </div>

              <div className="flex flex-1 items-center justify-center overflow-hidden rounded-2xl bg-black">
                {selectedClip ? (
                  <video
                    key={selectedClip.id}
                    src={outputUrl ?? selectedClip.url}
                    controls
                    className="h-full max-h-full w-full object-contain"
                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                    onLoadedMetadata={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  />
                ) : null}
              </div>

              <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-slate-950/60 px-3 py-2">
                <span className="w-10 text-[12px] text-slate-500">{formatTime(currentTime)}</span>
                <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                  <div className="absolute left-0 top-0 h-full rounded-full bg-cyan-400" style={{ width: `${progressPct}%` }} />
                </div>
                <span className="w-10 text-right text-[12px] text-slate-500">{formatTime(duration)}</span>
              </div>

              {status ? <p className="mt-2 text-[12px] text-slate-500">{status}</p> : null}
            </section>

            <aside className="flex flex-col gap-4 rounded-[28px] border border-white/[0.08] bg-white/[0.02] p-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Prompt system</div>
                <div className="mt-2 rounded-2xl border border-white/[0.06] bg-slate-950/60 p-3">
                  <div className="mb-2 text-[12px] text-slate-500">Recommended prompt</div>
                  <div className="text-[13px] leading-6 text-slate-200">{prompt || "Describe the type of clip you want to create."}</div>
                </div>
              </div>

              <div className="space-y-2">
                {recommendations.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setPrompt(item.prompt)}
                    className="w-full rounded-2xl border border-white/[0.06] bg-slate-950/60 p-3 text-left transition hover:border-cyan-400/30 hover:bg-slate-900"
                  >
                    <div className="text-[11px] uppercase tracking-[0.12em] text-cyan-300">{item.badge}</div>
                    <div className="mt-1 text-[14px] font-medium text-white">{item.title}</div>
                  </button>
                ))}
              </div>

              <div className="mt-auto flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-slate-950/60 px-3 py-3">
                <input
                  value={prompt}
                  placeholder="Describe the edit you want..."
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-slate-600"
                />
                <button
                  onClick={handleGenerate}
                  disabled={!prompt.trim()}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-400/15 text-cyan-300 transition hover:bg-cyan-400/25 disabled:opacity-30"
                >
                  <i className="ti ti-arrow-up text-[15px]" />
                </button>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Prompt history</div>
                {history.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/[0.08] p-3 text-[12px] text-slate-500">
                    No generated clips yet. Start with a recommended prompt.
                  </div>
                ) : (
                  history.map((entry) => (
                    <div key={entry.id} className="rounded-2xl border border-white/[0.06] bg-slate-950/60 p-3">
                      <div className="text-[12px] text-slate-200">{entry.prompt}</div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-medium text-emerald-300">
                          <i className="ti ti-check text-[10px]" />
                          {entry.cuts} cuts
                        </span>
                        <div className="flex items-center gap-2">
                          <button aria-label="Good result" onClick={() => handleFeedback(entry.id, "up")} className={`rounded-md p-1 ${entry.feedback === "up" ? "bg-cyan-400/15 text-cyan-300" : "text-slate-500 hover:text-slate-300"}`}>
                            <i className="ti ti-thumb-up text-[12px]" />
                          </button>
                          <button aria-label="Bad result" onClick={() => handleFeedback(entry.id, "down")} className={`rounded-md p-1 ${entry.feedback === "down" ? "bg-red-400/15 text-red-300" : "text-slate-500 hover:text-slate-300"}`}>
                            <i className="ti ti-thumb-down text-[12px]" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </aside>
          </div>
        )}

        {showSettings ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 px-4">
            <div className="w-full max-w-md rounded-[28px] border border-white/[0.08] bg-slate-900 p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Workspace settings</div>
                  <div className="mt-1 text-[22px] font-semibold text-white">Project preferences</div>
                </div>
                <button type="button" onClick={() => setShowSettings(false)} className="text-[12px] text-slate-400">Close</button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-[11px] uppercase tracking-[0.14em] text-slate-500">Project name</label>
                  <input value={projectName} onChange={(event) => setProjectName(event.target.value)} className="w-full rounded-xl border border-white/[0.06] bg-slate-950/70 px-3 py-2.5 text-[13px] text-slate-50 outline-none focus:border-cyan-400/40" />
                </div>
                <div>
                  <label className="mb-2 block text-[11px] uppercase tracking-[0.14em] text-slate-500">Default export</label>
                  <select value={exportFormat} onChange={(event) => setExportFormat(event.target.value)} className="w-full rounded-xl border border-white/[0.06] bg-slate-950/70 px-3 py-2.5 text-[13px] text-slate-50 outline-none focus:border-cyan-400/40">
                    <option>MP4</option>
                    <option>GIF</option>
                    <option>WebM</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block text-[11px] uppercase tracking-[0.14em] text-slate-500">Resolution</label>
                    <select value={exportResolution} onChange={(event) => setExportResolution(event.target.value)} className="w-full rounded-xl border border-white/[0.06] bg-slate-950/70 px-3 py-2.5 text-[13px] text-slate-50 outline-none focus:border-cyan-400/40">
                      <option>720p</option>
                      <option>1080p</option>
                      <option>4K</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-[11px] uppercase tracking-[0.14em] text-slate-500">Quality</label>
                    <select value={exportQuality} onChange={(event) => setExportQuality(event.target.value)} className="w-full rounded-xl border border-white/[0.06] bg-slate-950/70 px-3 py-2.5 text-[13px] text-slate-50 outline-none focus:border-cyan-400/40">
                      <option>Draft</option>
                      <option>High</option>
                      <option>Premium</option>
                    </select>
                  </div>
                </div>
              </div>

              <button type="button" onClick={() => setShowSettings(false)} className="mt-6 w-full rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-[13px] font-medium text-cyan-300">
                Save changes
              </button>
            </div>
          </div>
        ) : null}

        {showExport ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 px-4">
            <div className="w-full max-w-lg rounded-[28px] border border-white/[0.08] bg-slate-900 p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Export</div>
                  <div className="mt-1 text-[22px] font-semibold text-white">Render settings</div>
                </div>
                <button type="button" onClick={() => setShowExport(false)} className="text-[12px] text-slate-400">Close</button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/[0.06] bg-slate-950/70 p-3">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Format</div>
                  <div className="mt-2 text-[15px] font-medium text-white">{exportFormat}</div>
                </div>
                <div className="rounded-2xl border border-white/[0.06] bg-slate-950/70 p-3">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Resolution</div>
                  <div className="mt-2 text-[15px] font-medium text-white">{exportResolution}</div>
                </div>
                <div className="rounded-2xl border border-white/[0.06] bg-slate-950/70 p-3">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Quality</div>
                  <div className="mt-2 text-[15px] font-medium text-white">{exportQuality}</div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-[13px] leading-6 text-slate-200">
                Render queue is prepared for a clean final export. This screen is ready to be connected to a production export endpoint when you add backend delivery or cloud storage.
              </div>

              <div className="mt-6 flex gap-3">
                <button type="button" onClick={() => setShowExport(false)} className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2.5 text-[13px] font-medium text-slate-200">Cancel</button>
                <button type="button" onClick={() => { setShowExport(false); setStatus("Export queued for render."); }} className="flex-1 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-[13px] font-medium text-cyan-300">Render now</button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-4 text-[12px] text-slate-500">{status}</div>
        <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileSelect} />
      </div>
    </main>
  );
}
