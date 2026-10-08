# Hollowsong

A browser game about singing your way up out of a cave.

You are a seed of blown glass at the bottom of Hollowdeep. The cave's crystals each hold one note of a pentatonic scale. Holding a key sings that note, and singing pulls you toward the nearest crystal of the same note. Hold several notes at once and you are pulled several ways at once, so chords are how you steer. Your climb is recorded as a song, and you can play it back when the run ends.

## Run it

Open `index.html` in a modern browser. There is no build step and nothing to install. Plain HTML, Canvas 2D and the Web Audio API.

## Controls

Choose a keyboard layout on the title screen. The game remembers your choice.

| Layout | Ash | Amber | Moss | Tide | Iris | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Left hand (default) | `A` | `S` | `D` | `F` | `Space` | Piano fingering: the left thumb plays the top note. `G` also plays Iris. |
| Right hand | `Space` | `J` | `K` | `L` | `;` | Piano fingering: the right thumb plays the bottom note. `'` also plays Iris. |
| Classic | `A` | `S` | `D` | `F` | `G` | The original layout. |
| Custom | your choice | | | | | Press a key for each note in turn. Good for two hands. |

The number keys `1`–`5` play the five notes in every layout. The tiles, crystal labels and coach prompts always show the keys for your current layout.

The note tiles along the bottom of the screen show which notes are in reach. Once you know your keys you can turn them off on the title screen (**Note tiles: on/off**) for more room. They always show if you play with a mouse or touch. Crystals in reach show their key below them either way.

| Action | Keyboard | Gamepad | Mouse / touch |
| --- | --- | --- | --- |
| Sing the five notes | your layout, or `1`–`5` | A, B, X, Y, RB (LB also works) | Hold the five tiles at the bottom (touch: bottom 40% of the screen, split into five columns) |
| Start / sing again | `Enter` (any note key also starts) | Start | Click |
| Pause | `P` or `Esc` | Start | |
| Mute | `M` | | |
| Hear your song (end screen) | `R` | Y | Button |
| Back to the title screen | `Esc` on the end screen, or **Title screen** in the pause menu | | Button |

`Enter`, `Esc`, `Tab`, `P`, `M`, `R` and `1`–`5` run the game, so they can't be used in a custom layout.

## Rules

- **Breath.** Each held note spends breath. When you're quiet your breath refills, but you fall. If you run out, you can't sing until you've recovered about a third of your breath.
- **Wear.** A crystal cracks while you're tethered to it, and shatters after about five seconds.
- **The Hush.** It rises from below and silences any crystal it reaches. It waits until you've climbed a few metres (or 20 seconds pass) before it starts rising. If it swallows you, you have a moment to sing your way back out before the run ends. It never falls more than 26 m behind you, or 50 m near the start.
- **Handoff.** Start singing the next crystal above before you let go of the one you're on. Then go quiet while your momentum carries you up, so your breath refills.
- **Gentle start.** The first 250 m ease you in: the Hush is slower, falls are slower, swings settle faster, crystals last about twice as long and singing costs less breath. A note also lifts you up past its crystal, so you can let go and coast. All of this tapers off to full difficulty by 250 m, where a single note only pulls you up to just below its crystal. For the first 60 m a coach marks the crystal to aim for and tells you which keys to hold and when to let go, teaching the handoff.
- **First sightings.** The first time a shard, moth or echo comes into view, the game points at it and says what it does. Shards and moths also slow time for a moment. This happens in your first three runs that meet each one. Each stratum's banner names its new danger.
- **Shards** (red, jagged) crack your glass. Three cracks and you shatter.
- **Moths** (pale, from the third stratum) chase any song within reach and drink your breath while they're touching you. Go quiet and they lose interest.
- **Echoes** (gold) refill 30% of your breath and push the Hush back 4.5 m. The extra room fades over about 7 seconds, and collecting several echoes stacks it, up to 13.5 m.

## Practice

Choose **Practice** on the title screen and pick a stratum to start in. There is no Hush: you start on a rock ledge at the bottom of that stratum, and if you fall you land back on it. Shards still crack your glass, so a practice run ends if you shatter. To end it yourself, pause (`P` or `Esc`) and choose **End practice** to see your song, or **Title screen** to go straight back. Practice runs don't count toward your best height. All five strata are open from the start, so you can learn the shards and moths before you reach them in a real climb.

## Strata

| Height | Stratum | Key | New danger |
| --- | --- | --- | --- |
| 0 m | The Root Choir | A | — |
| 220 m | Gallery of Lanterns | D | shards |
| 520 m | The Moth Vaults | G | moths |
| 900 m | Throat of the Mountain | C | narrower cave, faster Hush |
| 1400 m | The Last Aperture | E | stars appear |

Each stratum changes the cave's colours, the key of every note you sing, and the drone underneath. Your best height is saved in the browser's local storage.

## Play stats

The live game reports anonymous events to GoatCounter (https://hollowsong.goatcounter.com). It uses no cookies and collects nothing personal. Nothing is sent when the game runs from a local file, localhost, or with `#debug` in the URL.

| Event path | When |
| --- | --- |
| `start/first`, `start/again` | A run begins (first run of the visit, or a retry) |
| `start/practice/s<stratum>` | A practice run begins in that stratum |
| `practice/s<stratum>/<cause>/<climbed>/<duration>` | A practice run ends. Cause is `shatter` or `quit`. Climbed is how far above the starting ledge you got, as a range. |
| `run/<cause>/s<stratum>/<height>/<layout>/<input>/<duration>` | A run ends. Cause is `hush`, `shatter` or `quit` (tab closed mid-run). Height and duration are ranges, for example `100-149m` and `1-2min`. Input is `keyboard`, `gamepad`, `mouse`, `touch`, `mixed` or `none`. |
| `listen` | Someone plays back their song |
| `layout/<id>` | Someone picks a keyboard layout on the title screen |
| `tiles/on`, `tiles/off` | Someone switches the note tiles on or off on the title screen |

## Files

- `index.html`: page, overlays (title, pause, end screen) and styles
- `game.js`: everything else, including generation, physics, rendering, audio synthesis and song playback

Add `#debug` to the URL to expose `window.__hollowsong()` (a state snapshot) and `window.__hollowsongStep()` (advances one frame) for scripted testing.
