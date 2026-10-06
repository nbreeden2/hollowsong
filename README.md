# Hollowsong

A browser game about singing your way up out of a cave.

You are a seed of blown glass at the bottom of Hollowdeep. The cave's crystals each hold one note of a pentatonic scale. Holding a key sings that note, and singing pulls you toward the nearest crystal of the same note. Hold several notes at once and you are pulled several ways at once, so chords are how you steer. Your climb is recorded as a song, and you can play it back when the run ends.

## Run it

Open `index.html` in a modern browser. There is no build step and nothing to install. Plain HTML, Canvas 2D and the Web Audio API.

## Controls

| Action | Keyboard | Gamepad | Mouse / touch |
| --- | --- | --- | --- |
| Sing Ash / Amber / Moss / Tide / Iris | `A` `S` `D` `F` `G` (or `1`–`5`) | A, B, X, Y, RB (LB also works) | Hold the five tiles at the bottom (touch: bottom 40% of the screen, split into five columns) |
| Start / sing again | `Space` | Start | Click |
| Pause | `P` or `Esc` | Start | |
| Mute | `M` | | |
| Hear your song (end screen) | `L` | Y | Button |

## Rules

- **Breath.** Each held note spends breath. When you're quiet your breath refills, but you fall. If you run out, you can't sing until you've recovered about a third of your breath.
- **Wear.** A crystal cracks while you're tethered to it, and shatters after about five seconds.
- **The Hush.** It rises from below and silences any crystal it reaches. It waits until you've climbed a few metres (or 20 seconds pass) before it starts rising. If it swallows you, you have a moment to sing your way back out before the run ends. It never falls more than 26 m behind you, or 50 m near the start.
- **Gentle start.** The first 250 m ease you in: the Hush is slower, falls are slower, swings settle faster, crystals last about twice as long and singing costs less breath. All of this tapers off to full difficulty by 250 m. For the first 60 m a coach marks the crystal to aim for and tells you which key to hold and when to let go.
- **Shards** (red, jagged) crack your glass. Three cracks and you shatter.
- **Moths** (pale, from the third stratum) chase any song within reach and drink your breath while they're touching you. Go quiet and they lose interest.
- **Echoes** (gold) refill 30% of your breath and push the Hush back 4.5 m.

## Strata

| Height | Stratum | Key | New danger |
| --- | --- | --- | --- |
| 0 m | The Root Choir | A | — |
| 220 m | Gallery of Lanterns | D | shards |
| 520 m | The Moth Vaults | G | moths |
| 900 m | Throat of the Mountain | C | narrower cave, faster Hush |
| 1400 m | The Last Aperture | E | stars appear |

Each stratum changes the cave's colours, the key of every note you sing, and the drone underneath. Your best height is saved in the browser's local storage.

## Files

- `index.html`: page, overlays (title, pause, end screen) and styles
- `game.js`: everything else, including generation, physics, rendering, audio synthesis and song playback

Add `#debug` to the URL to expose `window.__hollowsong()` (a state snapshot) and `window.__hollowsongStep()` (advances one frame) for scripted testing.
