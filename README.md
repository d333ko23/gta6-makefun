# Midnight Meridian

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/d333ko23/gta6-makefun/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/d333ko23/gta6-makefun/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

A top-down open-world crime game in the fictional night city of **Meridian Bay**. You are **Rook**, a courier for **Marla Voss**: steal a car, run three jobs, and do not let the Meridian PD take you in.

## How to play

Serve the `game/` folder with any static server (or run `node serve.ts` from this repo) and open `http://localhost:8080`.

| Key | Action |
| --- | --- |
| WASD / arrows | Walk, or drive when in a car |
| E | Steal the nearest car / get out |
| Space | Punch (on foot) / honk (in a car) |
| Shift | Sprint |
| P / Esc | Pause |
| M | Mute |
| R | Restart |
| Enter / click | Start, continue a saved run, or play again |

## The city

Meridian Bay is a 3200 x 3200 night city: a road grid with lit windows, two parks, the harbour along the south edge, and districts (Neon Plaza, The Docks, Old Town, Central Park, Safehouse). Traffic drives the roads, pedestrians walk the sidewalks and flee from danger.

## Wanted level

Stealing a car, punching a pedestrian, or running one down raises your wanted level (1–5 stars). Patrol cars spawn to match it and chase you; a cop car that corners you on foot busts you, and one that rams your car damages you. Lay low out of sight and the heat fades one star at a time.

## Missions

1. **First Run** — pick up a package at the Docks, deliver it to Neon Plaza ($250).
2. **Street Collection** — pick up five cash drops around the city ($400).
3. **The Getaway** — the crew is hot at 3 stars; reach the Safehouse without getting busted ($650).

Finish all three to become a Meridian Legend. Progress (best score and the job reached) is saved in `localStorage`.

## Tech

Plain HTML + canvas + ES modules, no libraries and no network requests. All art is drawn from code and all sound is synthesised with WebAudio. Screenshots are staged deterministically with `?shot=start|play|chase|end&seed=N` (see `shots.json`).

## License

MIT — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=cj5m3y17&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
