Investment Game — Project Overview

Type: Jackbox-style multiplayer web game Audience: University students Scale target: 500+ concurrent players Role split: Planning/architecture happens here; an AI coding agent handles implementation.

1. Concept
A live, room-based investment simulation. One big screen (projector) drives the shared narrative and shows aggregate results; each player joins on their own phone via a room code / QR code, with no app install required. Players make timed investment decisions each round, and the story branches based on both individual and collective choices.

2. Core Gameplay Loop
The game runs 15 rounds, each representing one "month" or time period. Each round runs on a fixed 3–5 minute cycle:
- Market Event: Big screen shows a "market news" event affecting specific asset categories.
- Decision Window: Each phone shows investment options (with rough risk indicator and probability hints) plus a countdown timer.
- Resolution: Server processes all choices: new investments enter the maturity pipeline (§3), any investments maturing this round pay out, and market events apply their effects to affected locked assets.
- Feedback: Big screen shows aggregate room behavior, maturity payouts, and how the market "reacts" to what the room collectively did.

3. Player State Model
Player balance is split into two parts, both visible on the phone screen:
- Liquid Cash: Money available to invest right now. Starts at $100,000.
- Locked Assets: Money already invested, held in a maturity pipeline until it matures; cannot be touched until then.

The Maturity Pipeline:
- Round N: Invest -> Amount deducted from cash, enters queue with maturity length (min. 3 rounds).
- Rounds N+1 ... N+k-1: Waiting -> Amount is locked; market events may adjust projected value. Player plays with remaining cash.
- Round N+k: Matures -> Return calculated and added back to Liquid Cash with notifications.

Also tracked:
- Risk Appetite: Accumulates when high-risk options are chosen; drives the player's evolving title (§6) and end-game outcome category.

Open decisions:
- Exact formula linking Risk Appetite and final Cash + Assets to end-game outcome categories.
- End-of-game handling for unmatured assets (mark-to-market vs stopping long-maturity offerings after round 12).
- "Dead rounds" mitigation (e.g. quick-trade options so players are never fully locked out).

4. Market Events & Narrative Structure
- Event-driven market news format (15 rounds).
- Partial probabilistic hints before decisions (strategy layer).
- Events can affect currently maturing assets.
- Categories: Influential persona, Geopolitical, Regulatory/Government, Industrial/Tech.
- Recurring fictional personas (original creations with predictable behavior archetypes).
- Extensibility Principle: Scenarios, assets, and event definitions must be pure data (JSON/DB config), decoupled from engine code.

5. Technical Architecture
- Realtime server: Node.js + Socket.io.
- In-memory state during play.
- Bandwidth safety: Lightweight mobile client (<50KB), server absolute timestamp, private targeted emits only.
- Host screen displays aggregate room behavior & leaderboard.
- Anonymous auth & reconnection resilience.

6. Engagement & Retention Design
- In-room excitement: Rank/percentile comparisons, "Oddest decision in the room" spotlight, delayed reveal suspense, random black swan event.
- Replayability: Collective crowd feedback, evolving player titles ("The Gambler", "The Wolf", etc.), shareable end-of-game scorecard.

7. Open Questions / Next Steps
- Maturity pipeline edge cases & end-game resolution formula.
- Persona definitions & 15-round data content.
- Full technical spec for data-driven multi-round engine.
