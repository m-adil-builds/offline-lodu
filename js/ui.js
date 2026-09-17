/* Ludo UI — rendering + interaction on top of engine.js */
(function () {
  "use strict";
  const E = window.LudoEngine;
  const $ = (s) => document.querySelector(s);

  /* ---------- board geometry (15×15, cell = 100/15 %) ---------- */
  const CELL = 100 / 15;
  // 52 loop cells, index = engine global cell, [row, col]
  const PATH = [
    [6,1],[6,2],[6,3],[6,4],[6,5],
    [5,6],[4,6],[3,6],[2,6],[1,6],[0,6],
    [0,7],[0,8],
    [1,8],[2,8],[3,8],[4,8],[5,8],
    [6,9],[6,10],[6,11],[6,12],[6,13],[6,14],
    [7,14],[8,14],
    [8,13],[8,12],[8,11],[8,10],[8,9],
    [9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
    [14,7],[14,6],
    [13,6],[12,6],[11,6],[10,6],[9,6],
    [8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
    [7,0],[6,0],
  ];
  // home-column cell for seat, k = steps-51 (0..4)
  const HOMECOL = [
    (k) => [7, 1 + k],   // red
    (k) => [1 + k, 7],   // green
    (k) => [7, 13 - k],  // yellow
    (k) => [13 - k, 7],  // blue
  ];
  const YARD_ORIGIN = [[0, 0], [0, 9], [9, 9], [9, 0]];       // r,c of 6×6 yard
  const YARD_SLOTS = [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]];
  // finished tokens parked near the center, per seat
  const DONE_SPOT = [
    (t) => [7 + (t - 1.5) * 0.6, 5.6],
    (t) => [5.6, 7 + (t - 1.5) * 0.6],
    (t) => [7 + (t - 1.5) * 0.6, 8.4],
    (t) => [8.4, 7 + (t - 1.5) * 0.6],
  ];
  const NAME = ["Red", "Green", "Yellow", "Blue"];
  const CSSC = ["red", "green", "yellow", "blue"];
  const HEX = { red: "#e15b5b", green: "#3ddc97", yellow: "#fab219", blue: "#3987e5" };

  /* ---------- state ---------- */
  let G = null;               // engine game state
  let selChip = -1;           // selected index in G.pool
  let tokenEls = [];          // [playerIdx][tokenIdx] -> element
  let rolling = false;

  /* ---------- setup screen ---------- */
  let optPlayers = 2, optDice = 2;
  bindSeg("#opt-players", (v) => (optPlayers = +v));
  bindSeg("#opt-dice", (v) => {
    optDice = +v;
    $("#rule-dice-1").hidden = optDice !== 1;
    $("#rule-dice-2").hidden = optDice !== 2;
  });
  function bindSeg(sel, set) {
    document.querySelectorAll(sel + " button").forEach((b) =>
      b.addEventListener("click", () => {
        document.querySelectorAll(sel + " button").forEach((x) => x.classList.remove("on"));
        b.classList.add("on");
        set(b.dataset.v);
      }));
  }

  $("#btn-start").addEventListener("click", () => {
    G = E.newGame({ numPlayers: optPlayers, dice: optDice, rule1: $("#opt-rule1").checked });
    G.log.push(`${NAME[E.curSeat(G)]}'s turn.`);
    $("#setup").hidden = true;
    $("#game").hidden = false;
    buildBoard();
    buildDice();
    render();
  });
  $("#btn-again").addEventListener("click", () => location.reload());

  /* ---------- board construction ---------- */
  function buildBoard() {
    const b = $("#board");
    b.innerHTML = "";
    // yards
    YARD_ORIGIN.forEach(([r, c], seat) => {
      const y = div("yard y-" + CSSC[seat]);
      pos(y, r, c, 6, 6);
      y.appendChild(div("yard-inner"));
      b.appendChild(y);
    });
    // loop cells
    PATH.forEach(([r, c], i) => {
      const cell = div("cell");
      if (E.SAFE.has(i)) cell.classList.add("safe");
      const startSeat = E.OFFSET.indexOf(i);
      if (startSeat !== -1) cell.classList.add("c-" + CSSC[startSeat]);
      pos(cell, r, c, 1, 1);
      b.appendChild(cell);
    });
    // home columns
    HOMECOL.forEach((fn, seat) => {
      for (let k = 0; k < 5; k++) {
        const [r, c] = fn(k);
        const cell = div("cell c-" + CSSC[seat]);
        pos(cell, r, c, 1, 1);
        b.appendChild(cell);
      }
    });
    b.appendChild(Object.assign(div("center"), {}));
    // tokens
    tokenEls = G.seats.map((seat, p) =>
      [0, 1, 2, 3].map((t) => {
        const el = div("token t-" + CSSC[seat]);
        el.addEventListener("click", () => onToken(p, t));
        b.appendChild(el);
        return el;
      }));
  }
  function div(cls) { const d = document.createElement("div"); d.className = cls; return d; }
  function pos(el, r, c, h, w) {
    el.style.top = r * CELL + "%";
    el.style.left = c * CELL + "%";
    if (h) { el.style.height = h * CELL + "%"; el.style.width = w * CELL + "%"; }
  }

  /* ---------- dice ---------- */
  function buildDice() {
    const d = $("#dice");
    d.innerHTML = "";
    for (let i = 0; i < G.cfg.dice; i++) {
      const die = div("die");
      die.dataset.v = "6";
      for (let p = 0; p < 9; p++) die.appendChild(div("pip"));
      d.appendChild(die);
    }
  }
  $("#btn-roll").addEventListener("click", () => {
    if (!G || G.phase !== "roll" || rolling) return;
    rolling = true;
    const dice = document.querySelectorAll(".die");
    dice.forEach((d) => d.classList.add("rolling"));
    const spin = setInterval(() => dice.forEach((d) =>
      (d.dataset.v = 1 + Math.floor(Math.random() * 6))), 70);
    setTimeout(() => {
      clearInterval(spin);
      dice.forEach((d) => d.classList.remove("rolling"));
      const res = E.roll(G);
      if (res) res.faces.forEach((f, i) => (dice[i].dataset.v = f));
      rolling = false;
      autoSelectChip();
      render();
    }, 450);
  });

  /* ---------- interaction ---------- */
  function autoSelectChip() {
    selChip = -1;
    if (!G || G.phase !== "move") return;
    for (let i = 0; i < G.pool.length; i++) {
      if (E.movesFor(G, G.pool[i]).length > 0) { selChip = i; return; }
    }
  }

  function onToken(p, t) {
    if (!G || G.phase !== "move" || p !== G.cur || selChip < 0) return;
    const value = G.pool[selChip];
    const legal = E.movesFor(G, value).some((m) => m.t === t);
    if (!legal) return;
    E.move(G, t, value);
    autoSelectChip();
    render();
  }

  function onChip(i) {
    if (!G || G.phase !== "move") return;
    if (E.movesFor(G, G.pool[i]).length === 0) return;
    selChip = i;
    render();
  }

  /* ---------- render ---------- */
  function render() {
    if (!G) return;
    const seat = E.curSeat(G);

    // banner
    const banner = $("#turn-banner");
    if (G.phase === "over") banner.textContent = `${NAME[G.winner]} wins!`;
    else banner.textContent = `${NAME[seat]}'s turn — ${G.phase === "roll" ? "roll the dice" : "move a token"}`;
    banner.style.borderLeftColor = HEX[CSSC[seat]];

    // roll button
    $("#btn-roll").disabled = G.phase !== "roll";

    // pool chips
    const pool = $("#pool");
    pool.innerHTML = "";
    G.pool.forEach((v, i) => {
      const c = document.createElement("button");
      c.className = "chip";
      c.textContent = v;
      const usable = E.movesFor(G, v).length > 0;
      if (!usable) c.classList.add("dead");
      if (i === selChip) c.classList.add("sel");
      c.addEventListener("click", () => onChip(i));
      pool.appendChild(c);
    });

    // tokens
    const movers = new Set(
      G.phase === "move" && selChip >= 0
        ? E.movesFor(G, G.pool[selChip]).map((m) => m.t) : []);
    const stack = {};                       // cellKey -> count for offsets
    G.seats.forEach((s, p) => {
      G.tokens[p].forEach((steps, t) => {
        const el = tokenEls[p][t];
        let r, c;
        if (steps === -1) {
          const [yr, yc] = YARD_ORIGIN[s];
          const [sr, sc] = YARD_SLOTS[t];
          r = yr + sr; c = yc + sc;
        } else if (steps === E.HOME) {
          [r, c] = DONE_SPOT[s](t);
          el.classList.add("done");
        } else if (steps >= 51) {
          [r, c] = HOMECOL[s](steps - 51);
        } else {
          [r, c] = PATH[E.cellOf(s, steps)];
        }
        const key = r + "," + c;
        const n = stack[key] || 0;
        stack[key] = n + 1;
        el.style.top = (r + 0.12 + n * 0.22) * CELL + "%";
        el.style.left = (c + 0.12 + n * 0.22) * CELL + "%";
        el.classList.toggle("movable", p === G.cur && movers.has(t) && steps !== E.HOME);
      });
    });

    // players panel
    const pl = $("#players");
    pl.innerHTML = "";
    G.seats.forEach((s, p) => {
      const home = G.tokens[p].filter((x) => x === E.HOME).length;
      const row = div("p-row" + (p === G.cur && G.phase !== "over" ? " now" : ""));
      row.innerHTML = `<span class="p-dot" style="background:${HEX[CSSC[s]]}"></span>
        ${NAME[s]}<span class="p-home">${home}/4 home</span>`;
      pl.appendChild(row);
    });

    // log
    const log = $("#log");
    log.innerHTML = G.log.slice(-8).map((m) => `<div>${m}</div>`).join("");
    log.scrollTop = log.scrollHeight;

    // winner overlay
    if (G.phase === "over") {
      const w = CSSC[G.winner];
      $("#win-text").textContent = `${NAME[G.winner]} wins!`;
      $("#win-text").style.color = HEX[w];
      $("#overlay").hidden = false;
    }
  }

  /* dev/demo hooks: ?autostart=1&players=4&dice=2&demo=1 */
  const q = new URLSearchParams(location.search);
  if (q.get("autostart")) {
    optPlayers = +(q.get("players") || 4);
    optDice = +(q.get("dice") || 2);
    $("#btn-start").click();
    if (q.get("demo") && G) {
      G.tokens.forEach((tk, p) => { tk[0] = 3 + p * 5; tk[1] = 30 + p * 3; });
      E.roll(G, () => (G.cfg.dice === 2 ? [6, 4][Math.floor(Math.random() * 2)] : 6));
      autoSelectChip();
      render();
    }
  }
})();
