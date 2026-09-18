# Ludo — Offline

Classic Ludo in plain HTML/CSS/JavaScript. No build step, no dependencies,
no online play — 2–4 players pass one device. Dark theme.

## Play

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8300
# http://127.0.0.1:8300
```

## Rules

- 2–4 players, 1 or 2 dice (chosen on the setup screen).
- Tokens enter the board only with a 6.
- **2-dice mode:** both dice roll together into a value pool; spend each value
  on any token. Double six = one extra roll. Two double sixes in a row
  (6,6,6,6) = the whole turn is void.
- **1-die mode:** a 6 grants an extra roll; three consecutive 6s void the turn.
- Star squares are safe — no kills there. Killing grants an extra roll.
- Home needs the exact number. Finishing a token grants an extra roll.
- **Both dice must be playable (2-dice mode):** if no ordering of the rolled
  values can be fully played, the turn is void — no cherry-picking one die.
  The game only offers moves that keep the remaining values playable.
- **One token left → one die:** a 2-dice player with a single token still in
  play rolls one die (classic single-die rules apply to it).
- **Play by token:** tap your token — a popup shows which dice values it can
  run; pick one. A yard token opens instantly when a 6 is available. Forced
  moves play automatically.
- **Custom rule — miss-kill penalty (toggle):** if a token could kill with an
  available dice value and the turn ends without that kill, that token is
  closed (returned to its yard).
- **Custom rule — no undo (always on):** a move is final once made.

## Structure

```
index.html      setup screen + game screen
css/style.css   dark theme, board, dice, tokens
js/engine.js    game logic (DOM-free, node-testable)
js/ui.js        rendering + interaction
```

## Deploy (Vercel)

Pure static site — import the repo in Vercel, framework preset "Other",
no build command, output directory `./`.
