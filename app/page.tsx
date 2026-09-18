"use client";

import { useMemo, useState } from "react";

type TabName = "trim" | "captions" | "assembly" | "highlights";

type TranscriptSegmentLike = {
  start: number;
  end: number;
  text?: string;
  isSilence?: boolean;
  speaker?: string;
};

type VideoState = {
  videoId: string;
  userId: string;
  projectId: string;
  name: string;
  sourceUrl: string;
  duration: number;
  transcript?: {
    segments?: TranscriptSegmentLike[];
  };
};

type PlanEntry = {
  action: string;
  start: number;
  end: number;
  reason: string;
};

type PromptHistoryEntry = {
  id: string;
  prompt: string;
  plan: PlanEntry[];
  feedback: "up" | "down" | null;
};

type CaptionEntry = {
  id: string;
  start: number;
  end: number;
  text: string;
  style: string;
};

type HighlightEntry = {
  id: string;
  title: string;
  start: number;
  end: number;
  score: number;
  reason: string;
  approved: boolean;
};

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [video, setVideo] = useState<VideoState | null>(null);
  const [activeTab, setActiveTab] = useState<TabName>("trim");
  const [prompt, setPrompt] = useState("remove the silences");
  const [plan, setPlan] = useState<PlanEntry[]>([]);
  const [status, setStatus] = useState("Ready");
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [beforeDuration, setBeforeDuration] = useState<number | null>(null);
  const [afterDuration, setAfterDuration] = useState<number | null>(null);
  const [promptHistory, setPromptHistory] = useState<PromptHistoryEntry[]>([]);
  const [planHistory, setPlanHistory] = useState<PlanEntry[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [captionStyle, setCaptionStyle] = useState("clean");
  const [captions, setCaptions] = useState<CaptionEntry[]>([]);
  const [srtText, setSrtText] = useState("");
  const [assembly, setAssembly] = useState<{ timeline: Array<{ id: string; name: string; start: number; end: number; transition: string; clipId: string }>; totalDuration: number; summary: { clipCount: number; transition: string; mode: string } }>({
    timeline: [],
    totalDuration: 0,
    summary: { clipCount: 0, transition: "cut", mode: "multi-clip assembly preview" },
  });
  const [highlights, setHighlights] = useState<HighlightEntry[]>([]);

  const canUndo = useMemo(() => historyIndex > 0, [historyIndex]);
  const canRedo = useMemo(() => historyIndex >= 0 && historyIndex < planHistory.length - 1, [historyIndex, planHistory.length]);

  const handleUpload = async () => {
    if (!selectedFile) {
      setStatus("Choose an MP4 clip to upload first.");
      return;
    }

    setStatus("Uploading and transcribing...");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("userId", "demo-user");
      formData.append("projectId", "demo-project");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Upload failed.");
      }

      setVideo({
        videoId: payload.videoId,
        userId: payload.userId,
        projectId: payload.projectId,
        name: payload.name,
        sourceUrl: payload.sourceUrl,
        duration: payload.duration,
        transcript: payload.transcript,
      });

      setBeforeDuration(payload.duration);
      setAfterDuration(null);
      setOutputUrl(null);
      setPlan([]);
      setCaptions([]);
      setSrtText("");
      setAssembly({ timeline: [], totalDuration: 0, summary: { clipCount: 0, transition: "cut", mode: "multi-clip assembly preview" } });
      setHighlights([]);
      setStatus("Upload complete. Transcript ready.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed.");
    }
  };

  const handlePlan = async () => {
    if (!video) {
      setStatus("Upload a clip before generating an edit plan.");
      return;
    }

    setStatus("Generating cut plan from the prompt...");

    try {
      const response = await fetch("/api/plan-cut", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          videoId: video.videoId,
          userId: video.userId,
          projectId: video.projectId,
          prompt,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not create edit plan.");
      }

      const nextPlan = payload.plan ?? [];
      setPlan(nextPlan);
      setOutputUrl(payload.outputUrl ?? null);
      setBeforeDuration(payload.durationBefore ?? beforeDuration);
      setAfterDuration(payload.durationAfter ?? null);

      setPlanHistory((previous) => {
        const next = [...previous.slice(0, historyIndex + 1), nextPlan];
        const nextIndex = next.length - 1;
        setHistoryIndex(nextIndex);
        return next;
      });

      setPromptHistory((previous) => [
        ...previous,
        {
          id: payload.promptLogId ?? crypto.randomUUID(),
          prompt,
          plan: nextPlan,
          feedback: null,
        },
      ]);

      setStatus("AI cut plan generated and FFmpeg render completed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Plan generation failed.");
    }
  };

  const handleUndo = () => {
    if (!canUndo) return;
    const targetIndex = historyIndex - 1;
    setHistoryIndex(targetIndex);
    setPlan(planHistory[targetIndex] ?? []);
  };

  const handleRedo = () => {
    if (!canRedo) return;
    const targetIndex = historyIndex + 1;
    setHistoryIndex(targetIndex);
    setPlan(planHistory[targetIndex] ?? []);
  };

  const handleFeedback = async (logId: string, feedback: "up" | "down") => {
    try {
      const response = await fetch(`/api/prompt-logs/${logId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });

      if (!response.ok) {
        throw new Error("Could not save feedback.");
      }

      setPromptHistory((previous) =>
        previous.map((entry) => (entry.id === logId ? { ...entry, feedback } : entry)),
      );
      setStatus(`Saved ${feedback === "up" ? "thumbs up" : "thumbs down"} feedback.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Feedback failed.");
    }
  };

  const handleGenerateCaptions = async () => {
    if (!video?.transcript) {
      setStatus("Upload a clip before generating captions.");
      return;
    }

    try {
      const response = await fetch("/api/captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: video.transcript, style: captionStyle }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not generate captions.");
      }

      setCaptions(payload.captions ?? []);
      setSrtText(payload.srt ?? "");
      setStatus("Captions generated and exported in SRT format.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Caption generation failed.");
    }
  };

  const handleGenerateAssembly = async () => {
    if (!video) {
      setStatus("Upload a clip before previewing a multi-clip assembly.");
      return;
    }

    try {
      const clips = [
        { id: video.videoId, name: video.name, duration: video.duration, sourceUrl: video.sourceUrl },
        { id: "b-roll-1", name: "B-roll intro", duration: 4.8, sourceUrl: "" },
        { id: "b-roll-2", name: "Punchline detail", duration: 3.2, sourceUrl: "" },
      ];

      const response = await fetch("/api/assemble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clips, transition: "cut" }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not assemble timeline.");
      }

      setAssembly({
        timeline: payload.timeline ?? [],
        totalDuration: payload.totalDuration ?? 0,
        summary: payload.summary ?? { clipCount: 0, transition: "cut", mode: "multi-clip assembly preview" },
      });
      setStatus("Multi-clip assembly preview generated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Assembly generation failed.");
    }
  };

  const handleGenerateHighlights = async () => {
    if (!video?.transcript) {
      setStatus("Upload a clip before generating highlight suggestions.");
      return;
    }

    try {
      const response = await fetch("/api/highlights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: video.transcript }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not generate highlights.");
      }

      setHighlights(payload.highlights ?? []);
      setStatus("Highlight suggestions are ready for approval.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Highlight generation failed.");
    }
  };

  const toggleHighlight = (id: string) => {
    setHighlights((previous) => previous.map((entry) => (entry.id === id ? { ...entry, approved: !entry.approved } : entry)));
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-cyan-300">Phase 1–5</p>
            <h1 className="mt-2 text-4xl font-bold text-white">Voxcut</h1>
          </div>
          <div className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-200">
            Prompt editing suite
          </div>
        </header>

        <div className="mb-8 flex flex-wrap gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-2">
          {[
            { key: "trim", label: "Trim" },
            { key: "captions", label: "Captions" },
            { key: "assembly", label: "Assembly" },
            { key: "highlights", label: "Highlights" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as TabName)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${activeTab === tab.key ? "bg-cyan-500 text-slate-950" : "bg-slate-900 text-slate-300 hover:bg-slate-800"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "trim" && (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/40">
                <label className="mb-3 block text-sm font-medium text-slate-200">Upload MP4</label>
                <input
                  type="file"
                  accept="video/mp4"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  className="block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 file:mr-4 file:rounded-full file:border-0 file:bg-cyan-500 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-950"
                />
                <button
                  type="button"
                  onClick={handleUpload}
                  className="mt-5 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  Upload & transcribe
                </button>
                <p className="mt-4 text-sm text-slate-400">
                  {video ? `Loaded: ${video.name}` : "No clip selected yet."}
                </p>
              </section>

              <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/40">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <label className="block text-sm font-medium text-slate-200">Prompt</label>
                  <div className="flex gap-2 text-xs">
                    <button type="button" onClick={handleUndo} disabled={!canUndo} className="rounded border border-slate-700 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40">Undo</button>
                    <button type="button" onClick={handleRedo} disabled={!canRedo} className="rounded border border-slate-700 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40">Redo</button>
                  </div>
                </div>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={5}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400"
                  placeholder="Example: remove the silences"
                />
                <button
                  type="button"
                  onClick={handlePlan}
                  disabled={!video}
                  className="mt-5 rounded-xl bg-fuchsia-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Generate edit plan
                </button>
                <p className="mt-4 text-xs text-slate-300">{status}</p>
              </section>
            </div>

            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                <h2 className="mb-3 text-lg font-semibold text-slate-100">Original clip</h2>
                {video ? (
                  <video src={video.sourceUrl} controls className="w-full rounded-xl bg-black" />
                ) : (
                  <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-slate-700 text-sm text-slate-500">
                    Upload a clip to preview it here.
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                <h2 className="mb-3 text-lg font-semibold text-slate-100">Trimmed output</h2>
                {outputUrl ? (
                  <video src={outputUrl} controls className="w-full rounded-xl bg-black" />
                ) : (
                  <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-slate-700 text-sm text-slate-500">
                    Generated render appears here.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-slate-100">Duration summary</h3>
                <div className="flex gap-3 text-sm text-slate-300">
                  {beforeDuration !== null && <span>Before: {beforeDuration.toFixed(2)}s</span>}
                  {afterDuration !== null && <span>After: {afterDuration.toFixed(2)}s</span>}
                </div>
              </div>
            </div>

            <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-slate-100">Generated edit plan</h3>
                {plan.length > 0 && <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">{plan.length} cuts</span>}
              </div>

              {plan.length === 0 ? (
                <p className="text-sm text-slate-500">No AI cut operations generated yet.</p>
              ) : (
                <ul className="space-y-3">
                  {plan.map((item, index) => (
                    <li key={`${item.action}-${index}`} className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-slate-200">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-cyan-300">{item.action}</span>
                        <span className="text-slate-400">{item.reason}</span>
                      </div>
                      <div className="mt-2 text-slate-300">
                        Start: {item.start.toFixed(2)}s • End: {item.end.toFixed(2)}s
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
              <h3 className="text-lg font-semibold text-slate-100">Prompt history</h3>
              {promptHistory.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No prompts logged yet.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {promptHistory.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-slate-700 bg-slate-950 p-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-cyan-300">{entry.prompt}</p>
                          <p className="mt-2 text-xs text-slate-400">Plan: {entry.plan.length} operations</p>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => handleFeedback(entry.id, "up")} className={`rounded border px-2 py-1 text-xs ${entry.feedback === "up" ? "border-emerald-500 bg-emerald-500/15 text-emerald-200" : "border-slate-700 text-slate-200"}`}>
                            👍
                          </button>
                          <button type="button" onClick={() => handleFeedback(entry.id, "down")} className={`rounded border px-2 py-1 text-xs ${entry.feedback === "down" ? "border-rose-500 bg-rose-500/15 text-rose-200" : "border-slate-700 text-slate-200"}`}>
                            👎
                          </button>
                        </div>
                      </div>
                      <ul className="mt-3 space-y-1 text-xs text-slate-300">
                        {entry.plan.map((item, index) => (
                          <li key={`${entry.id}-${index}`}>
                            {item.action} {item.start.toFixed(2)}s → {item.end.toFixed(2)}s ({item.reason})
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === "captions" && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold text-white">Caption generator</h2>
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-300">Style</label>
                <select
                  value={captionStyle}
                  onChange={(event) => setCaptionStyle(event.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="clean">Clean</option>
                  <option value="bold">Bold</option>
                  <option value="minimal">Minimal</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGenerateCaptions}
              disabled={!video?.transcript}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Generate captions
            </button>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Caption list</h3>
                {captions.length === 0 ? (
                  <p className="text-sm text-slate-500">No captions generated yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {captions.map((caption) => (
                      <li key={caption.id} className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm text-slate-200">
                        <div className="mb-1 flex justify-between text-xs text-slate-400">
                          <span>{caption.start.toFixed(1)}s</span>
                          <span>{caption.end.toFixed(1)}s</span>
                        </div>
                        <p>{caption.text}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">SRT preview</h3>
                <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap text-xs leading-6 text-slate-200">{srtText || "Transcript export will appear here."}</pre>
              </div>
            </div>
          </section>
        )}

        {activeTab === "assembly" && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold text-white">Multi-clip assembly</h2>
              <button
                type="button"
                onClick={handleGenerateAssembly}
                disabled={!video}
                className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Preview timeline
              </button>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Timeline</h3>
                {assembly.timeline.length === 0 ? (
                  <p className="text-sm text-slate-500">No timeline yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {assembly.timeline.map((item) => (
                      <li key={item.id} className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm text-slate-200">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-cyan-300">{item.name}</span>
                          <span className="text-xs text-slate-400">{item.transition}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{item.start.toFixed(1)}s → {item.end.toFixed(1)}s</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Summary</h3>
                <dl className="space-y-3 text-sm text-slate-200">
                  <div className="flex justify-between gap-3"><dt>Clip count</dt><dd>{assembly.summary.clipCount}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Transition</dt><dd>{assembly.summary.transition}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Mode</dt><dd>{assembly.summary.mode}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Total duration</dt><dd>{assembly.totalDuration.toFixed(1)}s</dd></div>
                </dl>
              </div>
            </div>
          </section>
        )}

        {activeTab === "highlights" && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold text-white">Highlight detection</h2>
              <button
                type="button"
                onClick={handleGenerateHighlights}
                disabled={!video?.transcript}
                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Suggest highlights
              </button>
            </div>

            {highlights.length === 0 ? (
              <p className="text-sm text-slate-500">No highlight suggestions yet.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {highlights.map((highlight) => (
                  <div key={highlight.id} className="rounded-xl border border-slate-700 bg-slate-950 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-cyan-300">{highlight.title}</h3>
                        <p className="text-xs text-slate-400">{highlight.start.toFixed(1)}s → {highlight.end.toFixed(1)}s</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleHighlight(highlight.id)}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${highlight.approved ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-100"}`}
                      >
                        {highlight.approved ? "Approved" : "Approve"}
                      </button>
                    </div>
                    <p className="mt-3 text-sm text-slate-300">{highlight.reason}</p>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                      <span>Score</span>
                      <span>{highlight.score}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
