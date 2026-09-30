"use client";

import { useEffect, useRef } from "react";
import { formatTime } from "@/lib/time-format";
import type { Transcript } from "@/lib/types";
import type { TranscriptHighlight } from "@/lib/highlight-detection";

export type ChatPlan = {
  id: string;
  operation: string;
  summary: string;
  durationBefore: number;
  durationAfter: number;
  cuts: Array<{ start: number; end: number; reason?: string }>;
  state: "pending" | "applied" | "discarded" | "undone";
  canUndo: boolean;
};

export type ChatMessage =
  | { id: string; type: "user"; text: string }
  | { id: string; type: "plan"; plan: ChatPlan }
  | { id: string; type: "error"; prompt: string; message: string }
  | { id: string; type: "loading" };

export type TranscriptCapability = "ready" | "transcribing" | "no-audio" | "no-speech" | "failed" | "not-started";

const chipStyles: Record<TranscriptCapability, string> = {
  ready: "border-emerald-400/40 bg-emerald-950/70 text-emerald-200",
  transcribing: "border-sky-400/40 bg-sky-950/70 text-sky-200",
  "no-audio": "border-amber-300/40 bg-amber-950/60 text-amber-100",
  "no-speech": "border-amber-300/40 bg-amber-950/60 text-amber-100",
  failed: "border-rose-300/40 bg-rose-950/60 text-rose-100",
  "not-started": "border-slate-400/40 bg-slate-900 text-slate-200",
};

const chipLabels: Record<TranscriptCapability, string> = {
  ready: "Transcript ready",
  transcribing: "Transcribing",
  "no-audio": "No audio track",
  "no-speech": "No speech detected",
  failed: "Transcription failed",
  "not-started": "Transcript not ready",
};

export function TranscriptStatusChip({ capability, onRetry }: { capability: TranscriptCapability; onRetry?: () => void }) {
  return (
    <span role="status" className={`inline-flex min-h-7 items-center gap-2 rounded-full border px-2.5 py-1 text-[13px] font-medium ${chipStyles[capability]}`}>
      <span>{chipLabels[capability]}</span>
      {capability === "transcribing" ? <span className="text-sky-100/80">In progress</span> : null}
      {(capability === "failed" || capability === "not-started") && onRetry ? <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2">{capability === "failed" ? "Retry" : "Transcribe"}</button> : null}
    </span>
  );
}

export function PlanCard({
  plan, onSeek, onApply, onDiscard, onUndo,
}: {
  plan: ChatPlan;
  onSeek: (time: number) => void;
  onApply: () => void;
  onDiscard: () => void;
  onUndo: () => void;
}) {
  return (
    <article aria-label="Edit plan" className="w-full max-w-[95%] rounded-xl border border-[#4cd7f6]/30 bg-[#161c28] p-3 text-[13px] text-[#dde2f3] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold leading-5">{plan.summary}</p>
          <p className="mt-1 text-[#bcc9cd]">{formatTime(plan.durationBefore)} before · {formatTime(plan.durationAfter)} after</p>
        </div>
        <span className="rounded-full border border-[#3d494c]/60 px-2 py-0.5 text-[13px] text-[#d1d5db]">{plan.operation}</span>
      </div>
      <ul className="mt-3 space-y-1.5">
        {plan.cuts.length ? plan.cuts.map((cut, index) => (
          <li key={`${cut.start}-${cut.end}-${index}`}>
            <button type="button" onClick={() => onSeek(cut.start)} className="w-full rounded-md border border-[#3d494c]/50 px-2.5 py-2 text-left leading-5 text-[#e2e8f0] hover:border-[#4cd7f6]/60 hover:bg-[#0e131f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4cd7f6]">
              <span className="font-medium">Remove {formatTime(cut.start)}–{formatTime(cut.end)}</span>
              {cut.reason ? <span className="block text-[#b8c4ce]">{cut.reason}</span> : null}
            </button>
          </li>
        )) : <li className="rounded-md border border-[#3d494c]/50 px-2.5 py-2 text-[#bcc9cd]">Keep all source footage</li>}
      </ul>
      <div className="mt-3 flex min-h-8 items-center gap-3">
        {plan.state === "pending" ? <>
          <button type="button" onClick={onApply} className="rounded-md bg-[#4cd7f6] px-3 py-1.5 font-semibold text-[#0e131f] hover:bg-[#83e8ff]">Apply</button>
          <button type="button" onClick={onDiscard} className="rounded-md border border-[#65727c] px-3 py-1.5 font-medium text-[#e2e8f0] hover:bg-[#242a36]">Discard</button>
        </> : null}
        {plan.state === "applied" ? <>
          <span className="font-semibold text-emerald-200">Applied</span>
          {plan.canUndo ? <button type="button" onClick={onUndo} className="font-semibold text-[#7dd3fc] underline underline-offset-2">Undo</button> : null}
        </> : null}
        {plan.state === "discarded" ? <span className="text-[#bcc9cd]">Discarded</span> : null}
        {plan.state === "undone" ? <span className="text-[#bcc9cd]">Undone</span> : null}
      </div>
    </article>
  );
}

export function Composer({
  value, onChange, onSubmit, suggestions, blockedReason, sending, locked,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  suggestions: string[];
  blockedReason: string;
  sending: boolean;
  locked: boolean;
}) {
  const canSend = value.trim().length > 0 && !blockedReason && !sending && !locked;
  const hint = sending ? "Generating an edit plan…" : blockedReason || (locked ? "Apply or discard the current plan before sending another prompt." : value.trim() ? "Press Enter to send · Shift+Enter for a new line" : "Describe an edit to enable sending.");
  return (
    <div className="border-t border-[#3d494c]/50 bg-[#0e131f] p-3">
      {suggestions.length ? <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Suggested prompts">
        {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => onChange(suggestion)} className="rounded-full border border-[#64748b] px-2.5 py-1 text-[13px] text-[#e2e8f0] hover:border-[#7dd3fc] hover:bg-[#172333]">{suggestion}</button>)}
      </div> : null}
      <form onSubmit={(event) => { event.preventDefault(); if (canSend) onSubmit(); }}>
        <label className="sr-only" htmlFor="ai-edit-composer">Describe an edit</label>
        <div className="flex items-end gap-2 rounded-xl border border-[#64748b] bg-[#161c28] p-2 focus-within:border-[#7dd3fc] focus-within:ring-1 focus-within:ring-[#7dd3fc]">
          <textarea
            id="ai-edit-composer"
            rows={2}
            value={value}
            onChange={(event) => onChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (canSend) onSubmit();
              }
            }}
            placeholder="Describe the edit you want…"
            className="max-h-36 min-h-12 min-w-0 flex-1 resize-y border-0 bg-transparent p-1 text-[13px] leading-5 text-[#f1f5f9] placeholder:text-[#cbd5e1] focus:ring-0"
          />
          <button type="submit" disabled={!canSend} aria-disabled={!canSend} aria-label="Send prompt" className="mb-0.5 rounded-lg bg-[#4cd7f6] px-3 py-2 text-[13px] font-semibold text-[#082f40] hover:bg-[#83e8ff] disabled:cursor-not-allowed disabled:opacity-60">Send</button>
        </div>
        <p aria-live="polite" className="mt-2 min-h-5 px-1 text-[13px] leading-5 text-[#d1d5db]">{hint}</p>
      </form>
    </div>
  );
}

export function ChatPanel({
  capability, note, onRetryTranscription, hasVideo, transcript, activeTranscriptIndex,
  transcriptionError, captionStatus, onDownloadCaptions, highlights, highlightStatus,
  onFindHighlights, onKeepHighlight, messages, suggestions, composerValue,
  onComposerChange, onSend, blockedReason, sending, locked, onRetryMessage,
  onSeek, onApplyPlan, onDiscardPlan, onUndoPlan,
}: {
  capability: TranscriptCapability;
  note: string;
  onRetryTranscription?: () => void;
  hasVideo: boolean;
  transcript: Transcript | null;
  activeTranscriptIndex: number;
  transcriptionError: string;
  captionStatus: string;
  onDownloadCaptions: (format: "srt" | "vtt") => void;
  highlights: TranscriptHighlight[];
  highlightStatus: string;
  onFindHighlights: () => void;
  onKeepHighlight: (highlight: TranscriptHighlight) => void;
  messages: ChatMessage[];
  suggestions: string[];
  composerValue: string;
  onComposerChange: (value: string) => void;
  onSend: () => void;
  blockedReason: string;
  sending: boolean;
  locked: boolean;
  onRetryMessage: (id: string) => void;
  onSeek: (time: number) => void;
  onApplyPlan: (id: string) => void;
  onDiscardPlan: (id: string) => void;
  onUndoPlan: (id: string) => void;
}) {
  const threadRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-[#3d494c]/50 bg-[#1a202c]" aria-label="AI editor chat">
      <header className="border-b border-[#3d494c]/50 bg-[#161c28] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[16px] font-semibold text-[#f1f5f9]">AI editor</h2>
          <TranscriptStatusChip capability={capability} onRetry={capability === "failed" ? onRetryTranscription : undefined} />
        </div>
        <p className="mt-2 line-clamp-1 text-[13px] leading-5 text-[#d1d5db]" title={note}>{note}</p>
      </header>
      {hasVideo ? <details className="max-h-48 shrink-0 overflow-y-auto border-b border-[#3d494c]/50 bg-[#111827] px-3 py-2">
        <summary className="cursor-pointer text-[13px] font-semibold text-[#e2e8f0]">Transcript {transcript ? `· ${transcript.segments.length} sections` : "· not available"}</summary>
        {transcriptionError ? <p role="alert" className="mt-2 text-[13px] leading-5 text-rose-200">{transcriptionError}</p> : null}
        {transcript?.text ? <p className="mt-2 text-[13px] leading-5 text-[#e2e8f0]">{transcript.text}</p> : null}
        {transcript?.segments.map((segment, index) => <button key={`${segment.start}-${index}`} type="button" onClick={() => onSeek(segment.start)} aria-current={index === activeTranscriptIndex ? "time" : undefined} className={`block w-full border-t border-[#475569]/60 py-2 text-left text-[13px] leading-5 ${index === activeTranscriptIndex ? "bg-cyan-950 text-cyan-100" : "text-[#e2e8f0]"}`}>
          <span className="mr-2 font-mono text-[#cbd5e1]">{formatTime(segment.start)}–{formatTime(segment.end)}</span>{segment.text}
        </button>)}
        {!transcript && !transcriptionError ? <p className="mt-2 text-[13px] text-[#d1d5db]">Transcribe this video to see timed speech.</p> : null}
        {transcript ? <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={onFindHighlights} className="rounded border border-[#64748b] px-2 py-1 text-[13px] text-[#e2e8f0]">Find highlights</button>
          <button type="button" onClick={() => onDownloadCaptions("srt")} className="rounded border border-[#64748b] px-2 py-1 text-[13px] text-[#e2e8f0]">Download SRT</button>
          <button type="button" onClick={() => onDownloadCaptions("vtt")} className="rounded border border-[#64748b] px-2 py-1 text-[13px] text-[#e2e8f0]">Download VTT</button>
        </div> : null}
        {captionStatus ? <p role="status" className="mt-2 text-[13px] text-[#d1d5db]">{captionStatus}</p> : null}
        {highlightStatus ? <p role="status" className="mt-2 text-[13px] text-[#d1d5db]">{highlightStatus}</p> : null}
        {highlights.map((highlight) => <article key={highlight.id} className="mt-2 rounded border border-[#475569]/60 p-2 text-[13px]">
          <button type="button" onClick={() => onSeek(highlight.start)} className="block text-left text-[#e2e8f0]"><span className="mr-2 font-mono">{formatTime(highlight.start)}–{formatTime(highlight.end)}</span>{highlight.text}</button>
          <p className="mt-1 text-[#cbd5e1]">{highlight.reason}</p>
          <button type="button" onClick={() => onKeepHighlight(highlight)} className="mt-1 font-semibold text-[#7dd3fc] underline underline-offset-2">Keep this highlight</button>
        </article>)}
      </details> : null}
      <div ref={threadRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" aria-label="Conversation" aria-live="polite">
        {messages.length === 0 ? <div className="rounded-xl border border-dashed border-[#64748b] bg-[#0e131f] p-4 text-[13px] leading-5 text-[#d1d5db]">
          <p className="font-semibold text-[#f1f5f9]">Describe the change you want</p>
          <p className="mt-1">Plans appear here for review before they change the timeline.</p>
        </div> : null}
        {messages.map((message) => {
          if (message.type === "user") return <div key={message.id} className="flex justify-end">
            <p className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[#164e63] px-3 py-2 text-[13px] leading-5 text-white">{message.text}</p>
          </div>;
          if (message.type === "plan") return <div key={message.id} className="flex justify-start">
            <PlanCard plan={message.plan} onSeek={onSeek} onApply={() => onApplyPlan(message.plan.id)} onDiscard={() => onDiscardPlan(message.plan.id)} onUndo={() => onUndoPlan(message.plan.id)} />
          </div>;
          if (message.type === "error") return <div key={message.id} className="flex justify-start">
            <div role="alert" className="w-full max-w-[95%] rounded-xl border border-rose-300/50 bg-rose-950/50 p-3 text-[13px] leading-5 text-rose-100">
              <p>{message.message}</p>
              <button type="button" onClick={() => onRetryMessage(message.id)} className="mt-2 font-semibold underline underline-offset-2">Retry</button>
            </div>
          </div>;
          return <div key={message.id} role="status" className="text-[13px] text-[#d1d5db]">Preparing an edit plan…</div>;
        })}
      </div>
      <Composer value={composerValue} onChange={onComposerChange} onSubmit={onSend} suggestions={suggestions} blockedReason={blockedReason} sending={sending} locked={locked} />
    </aside>
  );
}
