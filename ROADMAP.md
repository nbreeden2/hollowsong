# Hollowsong roadmap

A working checklist. Tick items as they ship and note the commit.

Sources: the two playtest reports (Round 1 on 8 Oct, Round 2 on 10 Oct; IDs like R2 and N3 come from them), GoatCounter play stats, player feedback, and the Grok review (11 Oct).

Ground rule: every change keeps "singing is movement" at the centre. No combat, inventories or ordinary platforming.

How to check changes: the bot harness from the Round 2 report (`#debug` hooks, fake clock) for difficulty, and GoatCounter `run/` events for real players. Bots compare builds; they don't predict human scores.

---

## Done

- [x] Teach the handoff: coach for the first 60 m; eased lift above crystals for the first 250 m (cfb04ee)
- [x] Echoes really push the Hush back (cfb04ee)
- [x] First-sighting callouts for shards, moths and echoes; stratum banners name the new danger (cfb04ee)
- [x] More screen for the cave, bigger key labels, tiles can be hidden (0a42545)
- [x] Practice mode (58072a0)
- [x] Two hands mode, nine notes (59b90cd)
- [x] Round 2 fixes: small lift past 250 m, coach returns at 150 m until 3 handoffs, Hush-death tip names the handoff, practice cleans up below you, number-key fixes (c1406b3)

---

## Phase 1: Musical feel (small, low risk)

- [x] **1.1 Clean-handoff reward**
  - When a handoff happens (the moment that already counts `handoffs`), play a short harmonic chime (the two notes as an interval) and a bloom of light from the new crystal.
  - Make it subtly stronger for a fast handoff (caught soon after the last one) to reward flow (R5).
  - Check: easy to notice in play without clutter; no new sound on single-note grabs.
- [x] **1.2 Sound that changes with height**
  - A quiet background drone per stratum, built on each stratum's existing `root` pitch, crossfading at stratum boundaries.
  - Reverb that grows with height: a small chamber in the Root Choir, wide and open at the Last Aperture.
  - Respect the mute key and existing volume; nothing that tires the ear over a 5-minute run.
- [x] **1.3 Resonance on a held note**
  - The longer a crystal is held, the more its tone swells and shimmers. This doubles as the wear warning.
  - In the last second before a crystal shatters, add a clear sound and visual cue (R5 / Round 1: "short warning just before a crystal shatters").
  - Check: a player can tell a crystal is about to break without looking at it.

## Phase 2: Difficulty, using data (do after a GoatCounter read)

- [x] **2.1 Read GoatCounter** for runs on c1406b3 and later: do deaths still cluster at 150–300 m (`run/hush/s2/...`)? How many runs reach stratum III and beyond?
  - 11 Oct read (all events since 30 Sept): 13 climbs, 1 practice. Every climb that got going ended in the Hush, mostly at 100–219 m (4 at 150–219 m); none reached stratum III. 3 quits under 10 m, one of them on a phone (touch). Real players struggle early, so don't make the Hush harsher yet.
- [ ] **2.2 The Hush chase (R2 / N3)**
  - [ ] Skilled players ride the Hush limit (`HUSH_LEAD`, 26 m) instead of racing its speed. Loosen it after the easy opening (e.g. 520 → 900 px) so the per-stratum Hush speeds matter. *Deferred: wait until real players reach stratum III.*
  - [x] Add a "the Hush is gaining" cue when the gap shrinks fast: red glow from the bottom edge, low rumble, HUD reads THE HUSH IS GAINING.
  - Check: expert bot `limitPct` below 30%; some deaths from the Hush catching up, not only from falls.
- [x] **2.3 Moths (R3 / F5)**
  - Introduce them gently: the first few moths in the Moth Vaults are slow. *Done: 100 px/s at 520 m rising to 140 by 900 m (was 144).*
  - Then make deeper ones a real threat: faster per stratum (was `120 + stratumIdx * 12` px/s), or a longer muffle on contact. *Done: 170 px/s in IV, 200 in V; touch muffles 0.55 s in IV, 0.8 s in V (was 0.3 s). Revisit once real players get there.*
  - Clearer warning when a moth is about to drink your breath. *Done: pulsing red ring and a wing flutter within 120 px while you sing.*
  - Check: some expert runs above 520 m lose real breath to moths; beginners still get past the first ones.
- [ ] **2.4 Watch the eased-climb edge at 250 m.** If players still stall there, consider raising `TETHER_AIM_FULL` above 10.

## Phase 3: A destination

- [ ] **3.1 Ending**
  - The cave gets a top above the Last Aperture (1,400 m+): a final chamber or the surface.
  - Reaching it ends the run with an outro: light, then your whole climb played back as a finished song.
  - Ending screen shows time and song; "reached the surface" becomes its own best (e.g. fastest time).
  - Decide: fixed height for the top, or a final stretch that is hand-built rather than random (see 4.1).
- [ ] **3.2 Story, light touch**
  - One carved line per stratum boundary hinting at what the Hush is and who sang here before.
  - The ending gives the payoff (working idea: the Hush is the cave forgetting; your song is what it remembers).
  - No text walls; each line readable in a glance while climbing.

## Phase 4: A more memorable cave

- [ ] **4.1 Hand-built landmarks** between the random bands, one or two per stratum: e.g. a sunken bell chamber, a crystal that only answers a chord, a narrow shaft. Each must keep the "always a way up" guarantee the spine gives.
- [ ] **4.2 A rule change per stratum,** not just a new danger: e.g. drifting crystals, a stratum where silence lifts you, air that carries your song further. Pick at most one per stratum and test each with the bots.
- [ ] **4.3 Ghost echoes:** an echo plays a few bars from your previous run's song (stored locally). Turns a power-up into a memory of an earlier climb.

## Phase 5: Replay and sharing

- [ ] **5.1 Daily cave**
  - Seed `mulberry32` from the date instead of `Math.random()` (in `reset()`), so everyone gets the same cave that day.
  - Separate daily best; optionally a twist rule per day (no echoes, chords only).
  - Choose it from the title screen; GoatCounter event `start/daily`.
- [ ] **5.2 Share a song as a link**
  - Pack the recorded song (note, on/off, time) into the URL hash, compressed.
  - Opening the link plays the song roll with no game needed; button to "climb it yourself".
  - Works on GitHub Pages with no server. Check the URL length on a long two-hands run.

## Phase 6: Polish and accessibility

- [x] **6.0 Game speed slider,** 50–150% with Normal in the middle, so players who need more time to map fingers to notes can slow the whole game. Best height shows its speed ("241 m at 70%"); GoatCounter runs carry `/speed<pct>` when not Normal. Follow-up ideas for finger mapping: bigger or always-on key labels on crystals, finger-numbered notes, a hand diagram on the tiles.

- [ ] **6.1 Colour-blind check.** Notes already have distinct shapes (spire, lozenge, bloom, prism, star) and key labels. Confirm the tiles and song roll use shape too, and that the high notes in two-hands mode (same shape plus chevron) are readable. Add a mode only if there's a real gap.
- [ ] **6.2 Breath readability.** Check the breath ring is readable at a glance when low, without watching it all the time.
- [ ] **6.3 Portrait phones** still render everything small (the whole 960-wide design is scaled down). The 11 Oct GoatCounter read had a touch player quit at under 10 m after 30–60 s.

## Hosting and outreach

- [ ] **H.1 Subdomain** `games.retrotechreboot.com`: user adds a CNAME to `nbreeden2.github.io` in GoDaddy DNS, then set the custom domain on GitHub Pages.
- [ ] **H.2 Triage player feedback** from the social media post into concrete items here.

## Considered and skipped (for now)

- Placing crystals or composing in Practice: turns the game into an editor.
- Cosmetic unlocks and skins: low value for this game.
- Toggle singing: removes the breath tension. Revisit only as an accessibility request.
- An easier "Guided" difficulty: tune the normal curve from data first.
- Gallery of other players' songs, or their songs as echoes: needs a server. Song links (5.2) cover most of it.
- Gating Practice strata by best height: all open by choice; easy to add if wanted.
