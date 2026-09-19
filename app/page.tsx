"use client";

import { useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";

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

type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
  speaker?: string;
  isSilence?: boolean;
};

type CaptionItem = {
  id: string;
  start: number;
  end: number;
  text: string;
  style: string;
};

type HighlightItem = {
  id: string;
  title: string;
  start: number;
  end: number;
  score: number;
  reason: string;
  approved: boolean;
};

type TimelineItem = {
  id: string;
  clipId: string;
  name: string;
  start: number;
  end: number;
  transition: string;
  sourceUrl: string;
};

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [projectName, setProjectName] = useState("untitled project");
  const [clips, setClips] = useState<LoadedClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("Ready");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [captions, setCaptions] = useState<CaptionItem[]>([]);
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [transcript, setTranscript] = useState<{ segments: TranscriptSegment[] } | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const selectedClip = useMemo(
    () => clips.find((clip) => clip.id === selectedClipId) ?? clips[0] ?? null,
    [clips, selectedClipId],
  );

  const durationLabel = selectedClip?.duration ? Math.max(selectedClip.duration, 0.1) : 0.1;

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      setStatus("Please choose a video file.");
      event.target.value = "";
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const clipId = crypto.randomUUID();
    const newClip: LoadedClip = {
      id: clipId,
      name: file.name,
      url: objectUrl,
      duration: 0,
    };

    setClips((previous) => [...previous, newClip]);
    setSelectedClipId(clipId);
    setStatus(`Loading ${file.name}...`);

    try {
      const formData = new FormData();
      formData.append("file", file);
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

      setTranscript(payload.transcript ?? { segments: [] });
      setClips((previous) =>
        previous.map((clip) =>
          clip.id === clipId
            ? {
                ...clip,
                duration: Number(payload.duration ?? 0),
                videoId: payload.videoId,
              }
            : clip,
        ),
      );
      setStatus(`${file.name} uploaded and ready.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      event.target.value = "";
    }
  };

  const handleGenerate = async () => {
    if (!selectedClip || !selectedClip.videoId) {
      setStatus("Upload a video clip before prompting edits.");
      return;
    }

    if (!prompt.trim()) {
      setStatus("Type a prompt to edit the clip.");
      return;
    }

    try {
      setStatus("Generating edit plan...");
      const response = await fetch("/api/plan-cut", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: selectedClip.videoId,
          userId: "demo-user",
          projectId: "demo-project",
          prompt: prompt.trim(),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not create an edit plan.");
      }

      setTranscript(payload.transcript ?? transcript ?? { segments: [] });
      setOutputUrl(payload.outputUrl ?? null);
      setCurrentTime(0);
      setHistory((previous) => [
        {
          id: payload.promptLogId ?? crypto.randomUUID(),
          prompt: prompt.trim(),
          cuts: Array.isArray(payload.plan) ? payload.plan.length : 0,
          feedback: null,
        },
        ...previous,
      ]);
      setStatus("Edit plan generated.");
      setPrompt("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Prompt failed.");
    }
  };

  const handleFeedback = (id: string, feedback: "up" | "down") => {
    setHistory((previous) =>
      previous.map((entry) => (entry.id === id ? { ...entry, feedback } : entry)),
    );
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      handleGenerate();
    }
  };

  const runCaptions = async () => {
    if (!transcript) {
      setStatus("Upload a video to generate captions.");
      return;
    }

    setStatus("Generating captions...");
    const response = await fetch("/api/captions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, style: "clean" }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "Captions generation failed.");
    }

    setCaptions(payload.captions ?? []);
    setStatus("Captions generated.");
  };

  const runAssembly = async () => {
    const assemblyClips = clips.map((clip) => ({
      id: clip.id,
      name: clip.name,
      duration: clip.duration || 0,
      sourceUrl: clip.url,
    }));

    if (!assemblyClips.length) {
      setStatus("Add a video clip to assemble a timeline.");
      return;
    }

    setStatus("Building assembly preview...");
    const response = await fetch("/api/assemble", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clips: assemblyClips, transition: "cut" }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "Timeline generation failed.");
    }

    setTimeline(payload.timeline ?? []);
    setStatus("Assembly preview ready.");
  };

  const runHighlights = async () => {
    if (!transcript) {
      setStatus("Upload a video to detect highlights.");
      return;
    }

    setStatus("Finding highlight moments...");
    const response = await fetch("/api/highlights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "Highlight detection failed.");
    }

    setHighlights(payload.highlights ?? []);
    setStatus("Highlights ready.");
  };

  const handlePrimaryAction = async () => {
    if (clips.length === 0) {
      fileInputRef.current?.click();
      return;
    }
    await handleGenerate();
  };

  return (
    <main className="min-h-screen bg-[#f3f3f1] text-[#1f2937]">
      <div className="mx-auto max-w-[1440px] border-x border-[#d9d9d5] bg-[#f7f7f5]">
        <header className="flex items-center justify-between border-b border-[#d9d9d5] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-[#d4d4d4] bg-white text-lg text-[#1f2937]">
              ✦
            </div>
            <div className="flex items-center gap-3 text-[18px] font-semibold tracking-tight">
              <span>Voxcut</span>
            </div>
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value || "untitled project")}
              className="ml-2 border-0 bg-transparent text-[14px] text-[#666] outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <button className="rounded-xl border border-[#cfcfc9] bg-white px-4 py-2 text-sm font-medium text-[#1f2937] transition hover:bg-[#f3f3f1]">
              ↩ Undo
            </button>
            <button className="rounded-xl border border-[#cfcfc9] bg-white px-4 py-2 text-sm font-medium text-[#1f2937] transition hover:bg-[#f3f3f1]">
              ↓ Export
            </button>
          </div>
        </header>

        <div className="grid grid-cols-[1.7fr_0.9fr] gap-0">
          <section className="border-r border-[#d9d9d5] p-4">
            <div className="overflow-hidden rounded-2xl border border-[#d9d9d5] bg-[#f5f5f3]">
              <div className="flex h-[420px] items-center justify-center overflow-hidden bg-[#f1f1ef]">
                {selectedClip ? (
                  <video
                    key={selectedClip.id}
                    src={selectedClip.url}
                    controls
                    className="h-full w-full object-cover"
                    onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                    onLoadedMetadata={(event) => setCurrentTime(event.currentTarget.currentTime)}
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#c9c9c4] bg-white/80">
                    <div className="ml-1 h-0 w-0 border-y-[12px] border-l-[20px] border-y-transparent border-l-[#7f7f7a]" />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 border-t border-[#d9d9d5] bg-[#f7f7f5] px-4 py-3">
                <span className="w-14 text-right text-xs font-medium text-[#666]">
                  {String(Math.floor(currentTime / 60)).padStart(2, "0")}:{String(Math.floor(currentTime % 60)).padStart(2, "0")}
                </span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[#dfe0dc]">
                  <div
                    className="absolute left-0 top-0 h-full rounded-full bg-[#4e8fff]"
                    style={{ width: `${selectedClip && selectedClip.duration ? (currentTime / selectedClip.duration) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-14 text-left text-xs font-medium text-[#666]">
                  {String(Math.floor(durationLabel / 60)).padStart(2, "0")}:{String(Math.floor(durationLabel % 60)).padStart(2, "0")}
                </span>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-[#d3d3cf] bg-[#f8f8f7] px-3 py-2">
                {clips.length === 0 ? (
                  <div className="text-sm text-[#7a7a76]">No clips selected yet.</div>
                ) : (
                  clips.map((clip) => (
                    <button
                      key={clip.id}
                      onClick={() => setSelectedClipId(clip.id)}
                      className={`flex items-center gap-2 rounded-md border px-2 py-1 text-sm font-medium ${
                        selectedClip?.id === clip.id
                          ? "border-[#4e8fff] bg-[#eaf2ff] text-[#1d4ed8]"
                          : "border-[#d3d3cf] bg-white text-[#374151]"
                      }`}
                    >
                      <span>{clip.name}</span>
                      {clip.id === selectedClipId && <span className="text-[#7a7a76]">•</span>}
                    </button>
                  ))
                )}
              </div>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#d3d3cf] bg-white text-xl text-[#374151] hover:bg-[#f7f7f5]"
              >
                +
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-3">
              <button
                onClick={runCaptions}
                className="rounded-2xl border border-[#d9d9d5] bg-white px-3 py-3 text-left text-sm font-medium text-[#1f2937] shadow-sm hover:bg-[#f8f8f7]"
              >
                <div className="text-xs uppercase tracking-[0.18em] text-[#6b7280]">Stage 2</div>
                <div className="mt-2 text-base font-semibold">Captions</div>
              </button>
              <button
                onClick={runAssembly}
                className="rounded-2xl border border-[#d9d9d5] bg-white px-3 py-3 text-left text-sm font-medium text-[#1f2937] shadow-sm hover:bg-[#f8f8f7]"
              >
                <div className="text-xs uppercase tracking-[0.18em] text-[#6b7280]">Stage 3</div>
                <div className="mt-2 text-base font-semibold">Assembly</div>
              </button>
              <button
                onClick={runHighlights}
                className="rounded-2xl border border-[#d9d9d5] bg-white px-3 py-3 text-left text-sm font-medium text-[#1f2937] shadow-sm hover:bg-[#f8f8f7]"
              >
                <div className="text-xs uppercase tracking-[0.18em] text-[#6b7280]">Stage 4</div>
                <div className="mt-2 text-base font-semibold">Highlights</div>
              </button>
            </div>

            {outputUrl ? (
              <div className="mt-5 rounded-2xl border border-[#d9d9d5] bg-[#f5f5f3] p-3">
                <div className="mb-2 text-sm font-medium text-[#1f2937]">Rendered output</div>
                <video src={outputUrl} controls className="w-full rounded-xl border border-[#d9d9d5] bg-black" />
              </div>
            ) : null}
          </section>

          <aside className="bg-[#f7f7f5] p-5">
            <div className="mb-5 text-[16px] font-semibold text-[#1f2937]">Prompt history</div>

            <div className="space-y-4">
              {history.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#d9d9d5] bg-[#f5f5f3] p-4 text-sm text-[#666]">
                  No prompt history yet. Add a video and type your first edit prompt.
                </div>
              ) : (
                history.map((entry) => (
                  <div
                    key={entry.id}
                    className={`rounded-2xl border p-3 ${
                      entry.feedback === "up" ? "border-[#d9d9d5] bg-[#edf7ee]" : "border-[#d9d9d5] bg-[#f5f5f3]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[19px] font-medium text-[#1f2937]">{entry.prompt}</div>
                        <div className="mt-2 inline-flex rounded-full bg-[#d7f2dc] px-2.5 py-1 text-xs font-medium text-[#1c7a3f]">
                          ✓ {entry.cuts} cuts applied
                        </div>
                      </div>

                      <div className="flex gap-2 pt-1 text-lg text-[#3b82f6]">
                        <button
                          aria-label="Like"
                          onClick={() => handleFeedback(entry.id, "up")}
                          className={`rounded-md border p-1.5 ${entry.feedback === "up" ? "border-[#4e8fff] bg-[#eaf2ff]" : "border-[#d9d9d5] bg-white"}`}
                        >
                          👍
                        </button>
                        <button
                          aria-label="Dislike"
                          onClick={() => handleFeedback(entry.id, "down")}
                          className={`rounded-md border p-1.5 ${entry.feedback === "down" ? "border-[#4e8fff] bg-[#eaf2ff]" : "border-[#d9d9d5] bg-white"}`}
                        >
                          👎
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 rounded-2xl border border-[#d9d9d5] bg-[#f5f5f3] p-3">
              <div className="mb-2 text-sm font-medium text-[#1f2937]">Workspace status</div>
              <div className="text-xs text-[#666]">{status}</div>
            </div>

            <div className="mt-5 space-y-4">
              {captions.length ? (
                <div className="rounded-2xl border border-[#d9d9d5] bg-white p-3">
                  <div className="mb-2 text-sm font-semibold text-[#1f2937]">Generated captions</div>
                  <div className="space-y-2">
                    {captions.slice(0, 4).map((caption) => (
                      <div key={caption.id} className="rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-2 text-xs">
                        <span className="font-medium text-[#374151]">{caption.text}</span>
                        <div className="mt-1 text-[#6b7280]">
                          {String(Math.floor(caption.start / 60)).padStart(2, "0")}:{String(Math.floor(caption.start % 60)).padStart(2, "0")} → {String(Math.floor(caption.end / 60)).padStart(2, "0")}:{String(Math.floor(caption.end % 60)).padStart(2, "0")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {timeline.length ? (
                <div className="rounded-2xl border border-[#d9d9d5] bg-white p-3">
                  <div className="mb-2 text-sm font-semibold text-[#1f2937]">Assembly preview</div>
                  <div className="space-y-2">
                    {timeline.map((item) => (
                      <div key={item.id} className="rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-2 text-xs text-[#374151]">
                        <div className="font-medium">{item.name}</div>
                        <div className="mt-1 text-[#6b7280]">
                          {item.start.toFixed(1)}s → {item.end.toFixed(1)}s · {item.transition}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {highlights.length ? (
                <div className="rounded-2xl border border-[#d9d9d5] bg-white p-3">
                  <div className="mb-2 text-sm font-semibold text-[#1f2937]">Highlight picks</div>
                  <div className="space-y-2">
                    {highlights.map((item) => (
                      <div key={item.id} className="rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-2 text-xs text-[#374151]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{item.title}</span>
                          <span className="rounded-full bg-[#eaf2ff] px-2 py-0.5 text-[10px] font-semibold text-[#1d4ed8]">{item.score}%</span>
                        </div>
                        <div className="mt-1 text-[#6b7280]">
                          {item.start.toFixed(1)}s → {item.end.toFixed(1)}s
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[#d9d9d5] bg-[#f5f5f3] px-3 py-3">
              <input
                value={prompt}
                placeholder="Describe the edit you want..."
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 border-0 bg-transparent text-[18px] text-[#1f2937] placeholder:text-[#7a7a76] outline-none"
              />
              <button
                onClick={handlePrimaryAction}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d9d9d5] bg-white text-xl text-[#374151] hover:bg-[#f7f7f5]"
              >
                ↑
              </button>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
