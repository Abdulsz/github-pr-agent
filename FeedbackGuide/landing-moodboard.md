# DevFeedback Landing Page Mood Board

## Direction

**Signal Room**

The landing page should feel like an AI operations desk for product teams: fast, high-signal, technical, and slightly editorial. The current page is clean but too flat and generic. The stronger direction is a layered interface that combines:

- dark control-room atmosphere
- sharp editorial typography
- bright operational accents
- visible flow from user feedback to triage to shipped PR

This should feel closer to "mission control for product feedback" than "generic SaaS dashboard."

## Brand Traits

- precise
- technical
- urgent, not frantic
- operator-first
- credible enough for engineering teams
- polished enough for product teams

## Visual Thesis

Use a dark graphite base with cold neutrals, then punctuate key moments with acid mint and electric blue. The landing page should visualize signal moving through a system: intake, classification, routing, action. Instead of a centered block on empty black, build depth with panels, rails, overlays, and structured information density.

## Color System

### Core

- `#0A0F14` Night
- `#111827` Control
- `#1B2430` Panel
- `#E8EDF2` Fog
- `#94A3B8` Quiet text

### Accents

- `#7CFFB2` Signal Mint
- `#49B3FF` Electric Blue
- `#FFB84D` Alert Amber
- `#FF6B6B` Fault Red

### Support Surfaces

- `#151C24` Deep panel
- `#202A36` Border
- `#D9E2EC` Soft line
- `#F7F9FB` Light dashboard card

## Gradient Ideas

- Hero background: `radial-gradient(circle at 20% 20%, rgba(73,179,255,0.16), transparent 35%), radial-gradient(circle at 80% 0%, rgba(124,255,178,0.14), transparent 30%), linear-gradient(180deg, #0A0F14 0%, #0F1720 100%)`
- Accent line: `linear-gradient(90deg, #49B3FF 0%, #7CFFB2 100%)`
- Card glow: subtle outer glow only on active items, not every card

## Typography

### Recommended Pairing

- Headline: `Space Grotesk`
- Body/UI: `Manrope`

### Alternate Pairing

- Headline: `Sora`
- Body/UI: `Inter Tight` or keep `Manrope`

### Type Mood

- headlines should feel compressed, assertive, and modern
- body copy should stay neutral and highly legible
- use uppercase micro-labels for system cues: `LIVE TRIAGE`, `AUTO-ROUTED`, `PR READY`

## Imagery And Texture

Avoid stock-productivity imagery. Use abstract product-native visuals instead:

- feedback cards moving through a routed pipeline
- stacked UI windows with highlighted technical vs non-technical labels
- code diff snippets paired with customer comments
- grid textures, scan lines, faint dot matrices, and chart traces
- blurred ambient glows behind key panels

The imagery should show transformation of messy user input into organized action.

## UI Motifs

- left rail or command-strip framing
- floating inspector cards
- highlighted filter chips
- queue cards with status pills
- diff fragments, PR badges, and event ticks
- data ribbons and horizontal progress bars
- thin borders with selective glow on hover/active

## Layout References

### Hero

Split the hero into two visual zones:

- left: strong value proposition and CTA stack
- right: a layered product composition showing the workflow

Instead of one centered paragraph, show a visual chain:

`Widget submission -> AI classification -> Inbox triage -> GitHub PR`

### Section Rhythm

1. bold hero with product system visual
2. proof strip with routing states or metrics
3. "How it works" in 3 or 4 operational steps
4. dashboard/inbox showcase
5. widget embed and developer ergonomics
6. final CTA

## Motion Direction

- slow background drift in the hero glow
- staggered reveal for system cards
- animated route line connecting feedback to PR
- filter-chip hover states with subtle fill transitions
- avoid playful bounce effects

Motion should communicate flow and confidence, not whimsy.

## Component Cues

### Buttons

- primary: mint or off-white on dark surface
- secondary: dark ghost with luminous border
- avoid generic rounded-pill SaaS buttons; use medium radius and firm weight

### Cards

- dark layered cards in hero
- light cards inside dashboard mock where readability matters
- mix dense meta text with one or two bright status anchors

### Badges

- technical: electric blue
- non-technical: amber
- completed/shipped: mint
- errors/blockers: muted red

## Copy Tone

Shift away from generic feature-summary copy toward a sharper operating-language voice.

### Good Tone

- "Turn raw user feedback into an actionable queue."
- "Route technical issues to engineering before they rot in a spreadsheet."
- "From widget submission to triaged inbox to PR-ready work."

### Avoid

- vague "streamline your workflow" phrasing
- broad startup cliches
- trying to sound friendly at the expense of precision

## Landing Page Concept

### Headline Options

- **Turn user feedback into shipped work**
- **The feedback inbox built for product and engineering**
- **Collect feedback. Classify it. Route it to a PR.**

### Supporting Copy

Embed a lightweight widget, separate technical from non-technical feedback, triage everything in one inbox, and send engineering-ready issues toward GitHub without losing context.

## Recommended Hero Composition

- top-left micro label: `AI FEEDBACK OPS`
- headline on 2 to 3 lines
- short supporting paragraph
- two CTA buttons
- compact proof row beneath CTA
- right-side visual made of:
  - floating widget card
  - inbox list
  - classification panel
  - PR confirmation card

## Proof Elements To Add

- `Technical vs non-technical routing`
- `Project-scoped API keys`
- `Auto-PR for engineering feedback`
- `Embeddable widget for any app`

## Style Guardrails

- keep the page darker and more atmospheric than the dashboard
- maintain high contrast and low visual noise in text areas
- do not use purple as the primary brand accent
- do not make the hero feel centered and empty
- do not use oversized gradients without structural UI elements

## Suggested CSS Variables

```css
:root {
  --bg: #0a0f14;
  --bg-elevated: #111827;
  --panel: #151c24;
  --panel-2: #1b2430;
  --text: #e8edf2;
  --text-muted: #94a3b8;
  --line: #202a36;
  --mint: #7cffb2;
  --blue: #49b3ff;
  --amber: #ffb84d;
  --red: #ff6b6b;
  --card-light: #f7f9fb;
}
```

## Implementation Notes For This Repo

- preserve the product split between feedback operations and PR automation
- use the darker, more expressive visual system only on the landing page
- keep dashboard pages lighter and more utilitarian for readability
- reuse existing dashboard motifs in the hero mock so the page feels connected to the app

## Best Direction To Build Next

If you want the strongest improvement with minimal confusion, redesign the landing page around **Signal Room**:

- dark editorial hero
- split-screen product workflow visual
- stronger type hierarchy
- mint/blue operational accents
- explicit feedback-to-PR narrative

That is the clearest upgrade from the current monochrome landing page while still fitting the existing app.
