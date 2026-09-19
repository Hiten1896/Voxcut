"use client";

import { useRouter } from "next/navigation";

const appIdentity = {
  username: "Hiten1896",
  fullName: "Hiten Sharma",
};

const recommendations = [
  {
    id: "hook",
    title: "Create a viral hook",
    subtitle: "Strong opening for short-form content",
    badge: "Best for reels",
    benefit: "Boosts retention in the first 3 seconds",
  },
  {
    id: "podcast",
    title: "Podcast teaser",
    subtitle: "Turn a long podcast into a punchy teaser",
    badge: "Creator favorite",
    benefit: "Turns long-form audio into shareable clips",
  },
  {
    id: "talking-head",
    title: "Clean talking-head cut",
    subtitle: "Polished interview or talking-head edit",
    badge: "Interview mode",
    benefit: "Feels premium and professional",
  },
  {
    id: "product-demo",
    title: "Product highlight",
    subtitle: "Best moments for a product demo or tutorial",
    badge: "Business use",
    benefit: "Perfect for ads and product education",
  },
];

const workflowSteps = [
  { title: "Upload your source video", description: "Drop a long-form recording and let Voxcut organize the best moments automatically." },
  { title: "Prompt the edit", description: "Use AI prompts or choose a smart recommendation tuned for reels, interviews, or product demos." },
  { title: "Export and publish", description: "Review, refine, and export clean short-form clips ready for distribution." },
];

const featureCards = [
  { title: "Repurpose faster", description: "Turn long content into short-form clips in minutes instead of hours." },
  { title: "Prompt-first workflow", description: "Edit with natural language prompts instead of spending time on manual trimming." },
  { title: "Secure by default", description: "Signed sessions, isolated user data, and upload validation keep your workspace safer." },
  { title: "Launch-ready output", description: "Built for creators who need clean short clips for social, promos, and storytelling." },
];

export default function Home() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        <header className="mb-10 flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="6" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium uppercase tracking-[0.22em] text-cyan-300">Voxcut</span>
                <span className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-slate-300">
                  Public
                </span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                by {appIdentity.fullName} · @{appIdentity.username}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push("/editor")}
            className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-[13px] font-medium text-cyan-300 transition hover:bg-cyan-400/15"
          >
            Open editor
          </button>
        </header>

        <section className="grid items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[28px] border border-white/[0.08] bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.15),transparent_25%),linear-gradient(135deg,rgba(15,23,42,0.95),rgba(2,6,23,0.9))] p-8 shadow-[0_30px_90px_rgba(2,6,23,0.75)]">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-300">
              AI video repurposing
            </div>
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
              Turn long videos into scroll-stopping clips.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300 md:text-lg">
              Voxcut helps creators, founders, and teams repurpose raw footage into punchy, platform-ready shorts with clear prompts, faster edits, and a safer workspace.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => router.push("/editor")}
                className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-5 py-3 text-[13px] font-medium text-cyan-300 transition hover:bg-cyan-400/15"
              >
                Start free
              </button>
              <button
                type="button"
                onClick={() => router.push("/editor")}
                className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-5 py-3 text-[13px] font-medium text-slate-200 transition hover:bg-white/[0.05]"
              >
                Try sample prompt
              </button>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="text-2xl font-semibold text-white">3x</div>
                <div className="mt-1 text-[12px] text-slate-400">faster repurposing</div>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="text-2xl font-semibold text-white">5 clips</div>
                <div className="mt-1 text-[12px] text-slate-400">from one upload</div>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="text-2xl font-semibold text-white">1 click</div>
                <div className="mt-1 text-[12px] text-slate-400">social export</div>
              </div>
            </div>
          </div>

          <aside className="rounded-[28px] border border-white/[0.08] bg-white/[0.02] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Smart recommendations</div>
                <div className="mt-1 text-[18px] font-semibold text-white">Launch-ready ideas</div>
              </div>
              <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[10px] font-medium text-cyan-300">
                AI tuned
              </div>
            </div>

            <div className="space-y-3">
              {recommendations.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => router.push("/editor")}
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

        <section className="mt-12 grid gap-4 md:grid-cols-3">
          {workflowSteps.map((step, index) => (
            <div key={step.title} className="rounded-[24px] border border-white/[0.08] bg-white/[0.02] p-5">
              <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-cyan-400/25 bg-cyan-400/10 text-[12px] font-medium text-cyan-300">
                0{index + 1}
              </div>
              <h2 className="text-[18px] font-semibold text-white">{step.title}</h2>
              <p className="mt-2 text-[13px] leading-6 text-slate-400">{step.description}</p>
            </div>
          ))}
        </section>

        <section className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {featureCards.map((card) => (
            <div key={card.title} className="rounded-[24px] border border-white/[0.08] bg-slate-900/60 p-5">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12.5L9 16.5L19 6.5" />
                </svg>
              </div>
              <h3 className="text-[16px] font-semibold text-white">{card.title}</h3>
              <p className="mt-2 text-[13px] leading-6 text-slate-400">{card.description}</p>
            </div>
          ))}
        </section>

        <section className="mt-12 rounded-[28px] border border-cyan-400/20 bg-cyan-400/10 p-8 text-center">
          <div className="text-[11px] uppercase tracking-[0.2em] text-cyan-300">Built for real-world creators</div>
          <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">Launch faster, stay secure, and keep your workflow simple.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-[14px] leading-7 text-slate-200">
            Start with a free-first setup, keep your project files isolated, and upgrade when your workflow needs more scale, control, or cloud storage.
          </p>
          <button
            type="button"
            onClick={() => router.push("/editor")}
            className="mt-6 rounded-xl border border-cyan-400/30 bg-slate-950/60 px-5 py-3 text-[13px] font-medium text-cyan-300 transition hover:bg-slate-950"
          >
            Launch the editor
          </button>
        </section>
      </div>
    </main>
  );
}
