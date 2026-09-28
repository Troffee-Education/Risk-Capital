# CONTEXT.md — Project: Risk Capital (Architecture Update)

## 1. STRATEGIC PIVOT: MODES VS. LEVELS
We are pivoting the core game architecture to maximize audience engagement and accommodate different event formats:
- **Modes (Engines):** Define the mechanical rules, game duration, and complexity. Selected exclusively by the Host/Admin from a dropdown before creating a room.
- **Levels (Scenarios):** Specific thematic content/narratives executed inside that Mode's engine.
- **Immediate Focus:** We are pausing the 15-round macroeconomic pipeline to build and perfect **Mode 1: The Cash Sprint** first.

---

## 2. MODE 1 SPECIFICATION: "THE CASH SPRINT"
An arcade-style, high-energy, rapid-fire game designed as an icebreaker or fast tournament for lecture halls (500+ concurrent players).

### 2.1 Core Rules
- **Starting Capital:** $10,000 (or $100,000 depending on level theme).
- **Target Win Condition:** First player to cross **$500,000** wins. If no one reaches the target by the end of **Round 5**, the wealthiest player wins.
- **Round Completion Rule:** If one or more players cross $500,000 during a round, the round still completes in full for everyone so all pending payouts resolve before crowning the winner.
- **Commitment Model:** 100% "All-In" single-tap allocation. No sliders, no partial percentages, no locked maturity delays.
- **Fast Pacing:** 15-second decision timer. Full game wraps up in 3–5 minutes.
- **Zero Inaction Survival:** If a player fails to submit before the 15s timer expires, they are defaulted to the Safe option with a 3% cash penalty.

---

## 3. GAMEPLAY & NARRATIVE ARCHETYPES
Each round in Mode 1 presents 3 core archetypes:
1. **The Safe Anchor:** Low volatility, steady gains (e.g., Real Estate, Treasury Bonds).
2. **The Balanced Engine:** Moderate risk/reward (e.g., Logistics, Traditional Businesses).
3. **The Rocket:** Extreme volatility (e.g., Meme Coins, Pre-revenue Deep Tech).

---

## 4. "BLACK SWAN" / EXTREME EVENT MECHANIC (NEW)
To make every round dynamic and hilarious in a live room, choices are not pure deterministic formulas. Outcomes feature a probability split resolved server-side:

### 4.1 Probability Distribution (per Option)
- **Standard Outcome (~85%–90% chance):** The normal expected return/drawdown for that risk tier.
- **Black Swan Event (~10%–15% chance):** An extreme macroeconomic surprise with narrative justification:
  - *Safe Bet Disaster:* An "unshakeable" asset suffers a freak event (e.g., "Hurricane flattens coastal properties" -> -50% loss for Real Estate).
  - *Rocket Moonshot:* A hyper-speculative asset goes viral (e.g., "Celebrity accidentally tweets the coin's ticker" -> +300% to +400% gain).
  - *Balanced Choke:* Sudden regulatory embargo or supply-chain fire -> -30%.

### 4.2 Narrative Justification ("The Receipt")
Every resolution payload to the player and host MUST include the story reason behind the outcome:
- **On Host Screen:** Headline of what rocked the market this round (e.g., *"CATEGORY 5 HURRICANE HITS COASTAL REAL ESTATE"*).
- **On Player Screen:** Personalized outcome card explaining their gain/loss (e.g., *"You thought Real Estate was safe? Nature had other plans: -$45,000"*).

---

## 5. TECHNICAL ARCHITECTURE INVARIANTS (UNCHANGED)
- **Host Screen Selection:** Host selects the Mode from a UI dropdown (`mode_1_sprint`).
- **In-Memory RAM:** Game state, room maps, and live player sessions exist strictly in server RAM.
- **Bandwidth Safety:** NEVER broadcast full player lists or full leaderboards to mobile clients. Send aggregated stats & Top 3 only to the Host screen. Players receive strictly their personal outcome payload.
- **Reconnection:** Player UUID in `localStorage` + Host Token in `sessionStorage`. Reconnecting rebinds the socket without dropping session state.
- **Zero Client Frameworks:** Mobile controller must remain <50KB vanilla HTML/CSS/JS.

---

## 6. PHASE FOCUS FOR IMPLEMENTATION
1. Add Mode selector to Host room-creation flow (defaults to Mode 1).
2. Implement Mode 1 game loop: 5 rounds max, $500K target check at round end.
3. Integrate the Black Swan RNG and narrative explanation payloads in `server.js`.
4. Render "The Receipt" narrative card on mobile resolution screens.