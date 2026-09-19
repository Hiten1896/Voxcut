---
name: Pro Studio Darkness
colors:
  surface: '#0e131f'
  surface-dim: '#0e131f'
  surface-bright: '#343946'
  surface-container-lowest: '#080e1a'
  surface-container-low: '#161c28'
  surface-container: '#1a202c'
  surface-container-high: '#242a36'
  surface-container-highest: '#2f3542'
  on-surface: '#dde2f3'
  on-surface-variant: '#bcc9cd'
  inverse-surface: '#dde2f3'
  inverse-on-surface: '#2b303d'
  outline: '#869397'
  outline-variant: '#3d494c'
  surface-tint: '#4cd7f6'
  primary: '#4cd7f6'
  on-primary: '#003640'
  primary-container: '#06b6d4'
  on-primary-container: '#00424f'
  inverse-primary: '#00687a'
  secondary: '#5de6ff'
  on-secondary: '#00363e'
  secondary-container: '#00cbe6'
  on-secondary-container: '#00515d'
  tertiary: '#7bd0ff'
  on-tertiary: '#00354a'
  tertiary-container: '#23b2ec'
  on-tertiary-container: '#00415a'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#acedff'
  primary-fixed-dim: '#4cd7f6'
  on-primary-fixed: '#001f26'
  on-primary-fixed-variant: '#004e5c'
  secondary-fixed: '#a2eeff'
  secondary-fixed-dim: '#2fd9f4'
  on-secondary-fixed: '#001f25'
  on-secondary-fixed-variant: '#004e5a'
  tertiary-fixed: '#c4e7ff'
  tertiary-fixed-dim: '#7bd0ff'
  on-tertiary-fixed: '#001e2c'
  on-tertiary-fixed-variant: '#004c69'
  background: '#0e131f'
  on-background: '#dde2f3'
  surface-variant: '#2f3542'
typography:
  display:
    fontFamily: Geist
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Geist
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-lg:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0em
  label-md:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Geist
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
  code-mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: -0.01em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

The design system establishes a high-performance, distraction-free creative studio environment tailored for AI video generation and editing. The target audience comprises video creators, motion designers, directors, and technical storytellers who demand deep focus, pixel precision, and minimal cognitive load during generative prompt-and-cut workflows.

The visual aesthetic is strictly flat, technical, and restrained. It avoids skeuomorphism, glassmorphic frosted panes, decorative gradients, and heavy drop shadows. The design system leverages deliberate structural boundaries, crisp 1px hairpins, deep navy-black canvas surfaces, and high-visibility cyan telemetry to communicate state, timeline position, and processing cues with clinical clarity. The emotional tone is authoritative, hyper-focused, quiet, and fluidly creative.

## Colors

The palette relies on absolute darkness for canvas neutrality, complemented by razor-sharp cyan accents and calibrated slate layers.

### Palette Roles
- **Canvas Base:** `#030712` (slate-950 deep navy tone) anchors the overall window backdrop and preview letterboxing.
- **Surface Containers:** `#0b1120` (surface low) for docking bays, tool trays, and navigation; `#0f172a` (surface mid) for timeline lanes, inspector panels, and cards; `#1e293b` (surface high / hover states) for interactive rows and secondary badges.
- **Primary Accent (`#06b6d4`):** Anchors destructive-safe execution cues, generation buttons, active navigation markers, and timeline selection boundaries.
- **Interactive Light Accent (`#22d3ee`):** Reserved for timeline playheads, scrubber indicators, video progress tracks, and real-time generation tokens.
- **Borders & Dividers:** Strict 1px solid `rgba(255, 255, 255, 0.08)` across all panels and modules. Never use blurred or diffused borders.
- **Typography Neutrals:** High-emphasis white (`#f8fafc`) for headings, track titles, and active inputs; medium-emphasis slate (`#94a3b8`) for descriptions, meta tags, and inactive labels; muted slate (`#475569`) for disabled states, hotkey glyphs, and grid rules.

## Typography

Geist delivers clean geometric construction, balanced counters, and uncompromised legibility in dense editing environments. JetBrains Mono is utilized solely for timecode, frame numbers, audio sample rates, and parameter values.

### Formatting Rules
- **Sentence Case Standard:** All headings, button actions, tab labels, context menus, and tooltips strictly use sentence case (e.g., "Generate video clip", "Render queue", "Export settings").
- **Never Uppercase Body or Action Labels:** Avoid tracking out capitalized buttons. Restraint maintains the quiet, high-end tool atmosphere.
- **Timecode & Data:** Frame markers (`00:04:12:18`), bitrates, and keyframe counters use `code-mono` with tabular lining figures to prevent text shifting during live scrubbing.

## Layout & Spacing

The editing canvas operates on a responsive workspace docking layout with variable-ratio split containers rather than an advertising column grid.

### Spatial Principles
- **Editor Canvas Layout:** Composed of three primary work zones: Top Navigation/Prompt Bar (fixed 56px height), Main Studio (flexible vertical partition containing an Asset/Prompt Panel [320px–420px], Central Preview Monitor [auto-ratio fill], and Right Inspector [280px]), and Bottom Timeline Deck (fixed 260px–360px collapsible drawer).
- **Docking Gap:** Adjacent docked panels abut with a strict 1px boundary line or a `space-xs` (4px) structural channel.
- **Panel Interiors:** Maintain calm, uncluttered spacing. Inspector forms use `space-md` gaps between property groups and `space-sm` between input fields and their descriptors.
- **Responsive Adaptations:**
  - *Desktop (>1280px):* Full 3-column split view with persistent bottom multi-track timeline.
  - *Tablet (768px - 1279px):* Collapses left/right docks into contextual overlay side-drawers. Timeline transforms into a 2-track simplified sequence view.
  - *Mobile (<768px):* Stacked vertical format: Fixed 16:9 monitor, conversational prompt input dock, scrollable clip ribbon underneath.

## Elevation & Depth

This design system avoids physical drop shadows, blurred light leaks, and multi-tone glow filters. Visual depth is established through tonal stepping and crisp 1px borders.

### Surface Stratification
- **Level 0 (Root Canvas):** `#030712` — Root viewport and video monitor bezel.
- **Level 1 (Docked Shells):** `#0b1120` with a 1px border of `rgba(255, 255, 255, 0.07)`.
- **Level 2 (Nested Workspaces & Timeline Tracks):** `#0f172a` with a 1px border of `rgba(255, 255, 255, 0.08)`.
- **Level 3 (Interactive Controls, Modals & Floating Popovers):** `#111827` with a 1px border of `rgba(255, 255, 255, 0.12)`.

### Overlays & Menus
Context menus and prompt assistance popovers float on Level 3 (`#111827`) with zero drop shadow. Contrast and detachment from base panels are secured purely by the elevated panel fill and 1px brightened border perimeter.

## Shapes

The interface embraces a unified, measured corner profile:
- **Panels & Docked Containers:** 10px to 12px outer radius when detached; 0px flush radius when hard-docked against window perimeters.
- **Interactive Inputs & Buttons:** Strict 8px (`rounded-md` equivalent in standard 8pt grids).
- **Chips, Keyframe Nodes, & Badges:** 6px radius for compact metadata tags; true circular pills reserved exclusively for playhead needles and status indicators.
- **Video Track Blocks:** 6px internal corner radius to preserve filmstrip structural continuity without harsh box edges.

## Components

### Buttons
- **Primary:** Solid `#06b6d4` fill with `#030712` bold text. On hover, shifts to `#22d3ee`. No gradients or outer glows. 8px radius, 36px height for standard actions.
- **Secondary:** Surface `#0f172a` fill with 1px `rgba(255, 255, 255, 0.08)` border, `#f8fafc` text. On hover, background shifts to `#1e293b`.
- **Ghost / Tool Button:** Transparent fill, `#94a3b8` icon. On hover, background turns `rgba(255, 255, 255, 0.05)`, icon brightens to `#f8fafc`. Active state displays a 1px solid cyan bottom bar or outline.
- **Icon-Only Buttons:** 32x32px or 36x36px bounding square with 8px radius.

### Input Fields & Prompt Box
- **Editor Prompt Input:** Deep `#0b1120` or `#0f172a` container, 1px `rgba(255, 255, 255, 0.08)` border. Focused state: 1px border transitions to `#06b6d4` (no outer halo/box-shadow). Text is `#f8fafc`, placeholder text is `#475569`.
- **Numeric Scrubbers:** Monospace numerical display with subtle left/right step handles. Hover shows cursor resize indicator; scrubbing dynamically fills background horizontally with `#06b6d4` at 15% opacity.

### Timeline & Playhead
- **Track Lanes:** Horizontal bars with `#0b1120` base and 1px bottom border. Audio/video clips sit inside with `#0f172a` background and a `#334155` border. Selected clip has a 1px border of `#06b6d4`.
- **Playhead:** A 1px line in `#22d3ee` spanning all tracks, crowned by an 8px inverted-polygon head. Zero blur or glow.

### Chips & Badges
- **Model / Tag Chips:** Background `#0f172a`, border 1px `rgba(255, 255, 255, 0.08)`, text `#94a3b8`. 6px radius, sentence case.
- **Active State Chip:** Cyan text (`#22d3ee`) with cyan tinted border (`rgba(34, 211, 238, 0.3)`) and dark navy backing.

### Checkboxes, Radio Buttons & Toggles
- **Checkboxes & Radios:** 16x16px frame, 1px `rgba(255, 255, 255, 0.2)` border, `#0f172a` fill. Checked state: `#06b6d4` solid fill with dark `#030712` checkmark icon.
- **Switch/Toggle:** 36x20px capsule. Inactive: `#1e293b` track with `#94a3b8` thumb. Active: `#06b6d4` track with `#030712` thumb.

### Iconography Rules
- Icons must strictly use 1.5px or 1.75px stroke outline weights (Lucide/Tabler style).
- Never render solid/filled glyphs.
- Never use emojis or multicolor illustrations within tool controls.