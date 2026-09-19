"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

const featureCards = [
  {
    icon: "content_cut",
    title: "Cut by prompt",
    description: "Trim pauses, filler words, or specific scenes automatically.",
  },
  {
    icon: "subtitles",
    title: "Auto captions",
    description: "Word-level animated subtitles styled for your brand.",
  },
  {
    icon: "view_timeline",
    title: "Multi-clip assembly",
    description: "Order multiple takes into a coherent sequence.",
  },
  {
    icon: "auto_awesome",
    title: "AI highlights",
    description: "Extract viral segments and key talking points instantly.",
  },
];

function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  const icons: Record<string, ReactNode> = {
    content_cut: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M7 8.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" />
        <path d="M16.5 20.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" />
        <path d="M7 6l10 12" />
        <path d="M7 18l10-12" />
      </svg>
    ),
    subtitles: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 11h10M7 15h6" />
      </svg>
    ),
    view_timeline: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <path d="M8 4v16M16 4v16" />
      </svg>
    ),
    auto_awesome: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="m12 2 1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7L12 2Z" />
        <path d="M19 15.5 20 18l2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1L19 15.5Z" />
      </svg>
    ),
    file_upload: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M4 15v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
    ),
    arrow_forward: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M5 12h14" />
        <path d="m13 5 7 7-7 7" />
      </svg>
    ),
    add_circle: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v10M7 12h10" />
      </svg>
    ),
    spark: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
    ),
  };

  return icons[name] ?? icons.spark;
}

export default function HomePage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [dropMessage, setDropMessage] = useState("");

  const goToStudio = () => router.push("/editor");

  const handleFile = (fileList?: FileList | null) => {
    if (fileList && fileList.length > 0) {
      setDropMessage(`Processing "${fileList[0].name}"...`);
      router.push("/editor");
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0e131f] text-[#dde2f3] selection:bg-[#06b6d4] selection:text-[#0e131f]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_480px_at_50%_32%,rgba(6,182,212,0.08),transparent_70%)]" />

      <header className="relative z-40 flex h-14 w-full items-center justify-between border-b border-white/[0.07] bg-[#0e131f]/90 px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <a href="#" className="group flex items-center gap-2">
            <img src="/favicon/lockup-dark-bg.svg" alt="Voxcut" className="h-8 w-auto" />
          </a>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" className="rounded px-3 py-1.5 text-[14px] text-[#bcc9cd] transition-colors hover:text-[#dde2f3]">
            Sign in
          </button>
          <button
            type="button"
            onClick={goToStudio}
            className="flex items-center gap-1.5 rounded-lg bg-[#4cd7f6] px-3.5 py-1.5 text-[14px] font-medium text-[#0e131f] transition-colors hover:bg-[#5de6ff]"
          >
            Get started
            <Icon name="arrow_forward" className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-4 py-10 md:py-12">
        <section className="mx-auto max-w-2xl text-center">
          <div className="mb-6 flex justify-center">
            <img src="/favicon/lockup-dark-bg.svg" alt="Voxcut" className="h-14 w-auto" />
          </div>
          <h1 className="mb-4 text-4xl font-semibold tracking-tight text-[#dde2f3] md:text-[40px] md:leading-[48px]">
            Edit video by typing
          </h1>
          <p className="text-[16px] leading-relaxed text-[#bcc9cd]">
            Describe your cuts, reorders, and captions in plain English — Voxcut turns prompts into polished edits.
          </p>
        </section>

        <section className="mx-auto mb-12 w-full max-w-2xl">
          <div
            className={`group relative flex cursor-pointer flex-col items-center rounded-xl border p-8 text-center transition-all duration-200 sm:p-12 ${
              dragActive
                ? "border-[#4cd7f6]/60 bg-[#0f172a]"
                : "border-white/[0.18] bg-[#0b1120] hover:border-[#4cd7f6]/50 hover:bg-[#0f172a]"
            }`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              handleFile(event.dataTransfer.files);
            }}
            onClick={goToStudio}
          >
            <input
              ref={inputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/x-m4v"
              className="hidden"
              onChange={(event) => handleFile(event.target.files)}
            />

            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg border border-white/[0.08] bg-[#1a202c] text-[#4cd7f6] transition-all duration-150 group-hover:scale-105 group-hover:border-[#4cd7f6]/40">
              <Icon name="file_upload" className="h-7 w-7" />
            </div>

            <h3 className="mb-1 text-[16px] font-medium text-[#dde2f3]">
              Drop a video to start editing
            </h3>
            <p className="mb-6 text-[12px] text-[#bcc9cd]">
              MP4, MOV, or ProRes up to 4GB
            </p>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                inputRef.current?.click();
              }}
              className="flex items-center gap-2 rounded-lg border border-white/[0.12] bg-[#242a36] px-4 py-2 text-[14px] font-medium text-[#dde2f3] transition-colors hover:bg-[#2f3542]"
            >
              <Icon name="add_circle" className="h-4 w-4 text-[#4cd7f6]" />
              Choose video
            </button>

            {dropMessage ? (
              <div className="mt-4 font-mono text-[12px] text-[#4cd7f6]">{dropMessage}</div>
            ) : null}
          </div>
        </section>

        <section className="w-full max-w-4xl">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {featureCards.map((card) => (
              <div key={card.title} className="rounded-lg border border-white/[0.07] bg-[#0b1120] p-4 transition-colors duration-150 hover:border-white/[0.14]">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[#4cd7f6]">
                    <Icon name={card.icon} className="h-[18px] w-[18px]" />
                  </span>
                  <span className="text-[16px] font-medium text-[#dde2f3]">{card.title}</span>
                </div>
                <p className="text-[13px] leading-snug text-[#bcc9cd]">{card.description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="relative z-10 w-full border-t border-white/[0.07] bg-[#0e131f]/80 px-6 py-2.5">
        <div className="mx-auto flex max-w-5xl items-center justify-center">
          <nav className="flex items-center justify-center gap-6 text-[12px] text-[#bcc9cd]">
            <a href="#" className="transition-colors hover:text-[#dde2f3]">Documentation</a>
            <a href="#" className="transition-colors hover:text-[#dde2f3]">Terms</a>
            <a href="#" className="transition-colors hover:text-[#dde2f3]">Privacy</a>
            <a href="#" className="transition-colors hover:text-[#dde2f3]">System status</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
