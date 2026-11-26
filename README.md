[![best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/0x-zeze/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/0x-zeze/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard)

# RIDGE RUNNER

**Canyon mail run:** pilot a backcountry bush plane through a red-rock river gorge, thread 8 beacon rings, surf ridge lift and sunny thermals to conserve fuel, and land on the Red Mesa dirt strip before the tank runs dry.

## Modes
- **Ring Run** — Thread all 8 canyon rings in sequence, manage fuel using ridge lift, and land smoothly on Runway 36.
- **Canyon Dash** — Timed express run with countdown bonuses per ring and a fast approach to the strip.
- **Dusk Landing** — Twilight final approach on tight fuel with canyon crosswind and lit runway edge/PAPI beacons.

## Controls
- **Pitch:** `ArrowUp` / `ArrowDown` or `W` / `S` (invertable via toggle on menu)
- **Roll & Turn:** `ArrowLeft` / `ArrowRight` or `A` / `D`
- **Throttle:** `Shift` (increase) / `Ctrl` (decrease) — also `E` / `Q`
- **Airbrake / Wheel Brake:** `Space`
- **Pause:** `P` | **Restart:** `R` | **Mute Audio:** `M`
- **Mouse:** Menu controls and optional right/left-drag camera look-around during flight

## Run Locally
```bash
node serve.ts
```
Then open `http://localhost:8080` in a desktop browser (runs completely offline with zero network requests).

## Build Submission Output
```bash
MAKEFUN_OUTPUT_DIR=out node main.ts
```
