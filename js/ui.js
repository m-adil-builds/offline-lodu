/* Ludo UI — per-player control blocks + board rendering on top of engine.js */
(function () {
  "use strict";
  const E = window.LudoEngine;
  const $ = (s) => document.querySelector(s);

  /* ---------- board geometry (15×15, cell = 100/15 %) ---------- */
  const CELL = 100 / 15;
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
  const HOMECOL = [
    (k) => [7, 1 + k],
    (k) => [1 + k, 7],
    (k) => [7, 13 - k],
    (k) => [13 - k, 7],
  ];
  const YARD_ORIGIN = [[0, 0], [0, 9], [9, 9], [9, 0]];
  const YARD_SLOTS = [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]];
  const DONE_SPOT = [
    (t) => [7 + (t - 1.5) * 0.6, 5.6],
    (t) => [5.6, 7 + (t - 1.5) * 0.6],
    (t) => [7 + (t - 1.5) * 0.6, 8.4],
    (t) => [8.4, 7 + (t - 1.5) * 0.6],
  ];
  const NAME = ["Red", "Green", "Yellow", "Blue"];
  const CSSC = ["red", "green", "yellow", "blue"];
  const HEX = { red: "#e15b5b", green: "#3ddc97", yellow: "#fab219", blue: "#3987e5" };
  // seat -> corner row ("top"/"bottom") matching the yard position
  const ROW_OF = ["top", "top", "bottom", "bottom"]; // red TL, green TR, yellow BR, blue BL

  /* ---------- state ---------- */
  let G = null;
  let selChip = -1;
  let tokenEls = [];
  let blocks = [];            // per player: {root, dice[], roll, pool, status, home}
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
    G.log.push(`${NAME[E.curSeat(G)]} starts — roll the dice.`);
    $("#setup").hidden = true;
    $("#game").hidden = false;
    buildBoard();
    buildBlocks();
    render();
  });
  $("#btn-again").addEventListener("click", () => location.reload());

  /* ---------- board construction ---------- */
  function buildBoard() {
    const b = $("#board");
    b.innerHTML = "";
    YARD_ORIGIN.forEach(([r, c], seat) => {
      const y = div("yard y-" + CSSC[seat]);
      pos(y, r, c, 6, 6);
      y.appendChild(div("yard-inner"));
      b.appendChild(y);
    });
    PATH.forEach(([r, c], i) => {
      const cell = div("cell");
      if (E.SAFE.has(i)) cell.classList.add("safe");
      const startSeat = E.OFFSET.indexOf(i);
      if (startSeat !== -1) cell.classList.add("c-" + CSSC[startSeat]);
      pos(cell, r, c, 1, 1);
      b.appendChild(cell);
    });
    HOMECOL.forEach((fn, seat) => {
      for (let k = 0; k < 5; k++) {
        const [r, c] = fn(k);
        const cell = div("cell c-" + CSSC[seat]);
        pos(cell, r, c, 1, 1);
        b.appendChild(cell);
      }
    });
    b.appendChild(div("center"));
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

  /* ---------- per-player control blocks ---------- */
  function buildBlocks() {
    $("#row-top").innerHTML = "";
    $("#row-bottom").innerHTML = "";
    blocks = G.seats.map((seat, p) => {
      const root = div("pblock");
      root.style.setProperty("--pc", HEX[CSSC[seat]]);

      const head = div("pb-head");
      head.appendChild(div("pb-dot"));
      const name = div("pb-name"); name.textContent = NAME[seat];
      const turn = div("pb-turn"); turn.textContent = "YOUR TURN";
      const home = div("pb-home");
      head.append(name, turn, home);

      const diceRow = div("pb-dice");
      const dice = [];
      for (let i = 0; i < G.cfg.dice; i++) {
        const die = div("die");
        die.dataset.v = "6";
        for (let k = 0; k < 9; k++) die.appendChild(div("pip"));
        diceRow.appendChild(die);
        dice.push(die);
      }
      const roll = document.createElement("button");
      roll.className = "roll";
      roll.textContent = "Roll";
      roll.addEventListener("click", () => onRoll(p));
      diceRow.appendChild(roll);

      const pool = div("pb-pool");
      const status = div("pb-status");

      root.append(head, diceRow, pool, status);
      // right-side seats (green TR, yellow BR) sit on the right of their row
      const right = seat === 1 || seat === 2;
      root.style.order = right ? 1 : 0;
      if (right) root.style.marginLeft = "auto";
      $(ROW_OF[seat] === "top" ? "#row-top" : "#row-bottom").appendChild(root);
      return { root, dice, roll, pool, status, home };
    });
  }

  /* ---------- interaction ---------- */
  function onRoll(p) {
    if (!G || G.phase !== "roll" || p !== G.cur || rolling) return;
    rolling = true;
    const dice = blocks[p].dice;
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
  }

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
    if (!E.movesFor(G, value).some((m) => m.t === t)) return;
    E.move(G, t, value);
    autoSelectChip();
    render();
  }

  /* ---------- render ---------- */
  function render() {
    if (!G) return;
    const seat = E.curSeat(G);

    // board glow follows the current player
    $("#board").style.boxShadow = G.phase === "over"
      ? "none"
      : `0 0 30px color-mix(in srgb, ${HEX[CSSC[seat]]} 30%, transparent)`;

    // player blocks
    blocks.forEach((bl, p) => {
      const isCur = p === G.cur && G.phase !== "over";
      bl.root.classList.toggle("active", isCur);
      bl.home.textContent =
        G.tokens[p].filter((x) => x === E.HOME).length + "/4 home";
      bl.roll.disabled = !(isCur && G.phase === "roll");
      bl.status.textContent = G.phase === "over"
        ? (G.winner === G.seats[p] ? "Winner!" : "")
        : isCur
          ? (G.phase === "roll" ? "Roll the dice" : "Tap a highlighted token")
          : "Waiting…";

      // pool chips only in the active block
      bl.pool.innerHTML = "";
      if (isCur && G.phase === "move") {
        G.pool.forEach((v, i) => {
          const c = document.createElement("button");
          c.className = "chip";
          c.textContent = v;
          if (E.movesFor(G, v).length === 0) c.classList.add("dead");
          if (i === selChip) c.classList.add("sel");
          c.addEventListener("click", () => {
            if (E.movesFor(G, v).length === 0) return;
            selChip = i;
            render();
          });
          bl.pool.appendChild(c);
        });
      }
    });

    // tokens
    const movers = new Set(
      G.phase === "move" && selChip >= 0
        ? E.movesFor(G, G.pool[selChip]).map((m) => m.t) : []);
    const stack = {};
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

    // log
    const log = $("#log");
    log.innerHTML = G.log.slice(-5).map((m) => `<div>${m}</div>`).join("");
    log.scrollTop = log.scrollHeight;

    // winner overlay
    if (G.phase === "over") {
      $("#win-text").textContent = `${NAME[G.winner]} wins!`;
      $("#win-text").style.color = HEX[CSSC[G.winner]];
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
      E.roll(G, () => [6, 4][Math.floor(Math.random() * 2)]);
      autoSelectChip();
      render();
    }
  }
})();
