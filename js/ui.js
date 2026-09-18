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
  let tokenEls = [];
  let cellEls = [];           // loop-cell index -> cell element

  /* ---------- sound effects (default OFF) ----------
     sounds/<kind>/1.mp3 … 5.mp3 — one picked at random per event */
  let soundOn = false;
  function playSound(kind) {
    if (!soundOn) return;
    const n = 1 + Math.floor(Math.random() * 5);
    const a = new Audio(`sounds/${kind}/${n}.mp3`);
    a.volume = 0.8;
    a.play().catch(() => {});          // missing file / autoplay block: stay silent
  }
  const soundBtn = document.querySelector("#btn-sound");
  soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    soundBtn.textContent = soundOn ? "🔊" : "🔇";
    soundBtn.classList.toggle("on", soundOn);
  });

  /* every move goes through here so sounds fire in one place */
  function doMove(t, v) {
    const ev = E.move(G, t, v);
    if (ev) {
      if (ev.captured.length) playSound("kill");
      else if (ev.open) playSound("open");
    }
    postAction();
  }
  let blocks = [];            // per player: {root, dice[], roll, pool, status, home}
  let rolling = false;

  /* ---------- setup screen ---------- */
  let optPlayers = 2, optDice = 2;
  bindSeg("#opt-players", (v) => {
    optPlayers = +v;
    $("#rule4-row").classList.toggle("off", optPlayers !== 4);
  });
  $("#rule4-row").classList.add("off");            // default: 2 players selected
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
    G = E.newGame({
      numPlayers: optPlayers, dice: optDice,
      rule1: $("#opt-rule1").checked,
      rule3: $("#opt-rule3").checked,
      rule4: optPlayers === 4 && $("#opt-rule4").checked,
    });
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
      // empty slot rings under the tokens
      YARD_SLOTS.forEach(([sr, sc]) => {
        const s = div("yslot s-" + CSSC[seat]);
        pos(s, r + sr + 0.09, c + sc + 0.09);
        b.appendChild(s);
      });
    });
    const ENTRY_ROT = [0, 90, 180, 270];   // travel direction out of each start cell
    cellEls = [];
    PATH.forEach(([r, c], i) => {
      const cell = div("cell");
      cellEls[i] = cell;
      if (E.SAFE.has(i)) {
        cell.classList.add("safe");
        // the 4 star cells (start + 8) get a bright color-matched highlight
        const starSeat = E.OFFSET.indexOf((i - 8 + 52) % 52);
        if (starSeat !== -1) cell.classList.add("star", "st-" + CSSC[starSeat]);
      }
      const startSeat = E.OFFSET.indexOf(i);
      if (startSeat !== -1) {
        cell.classList.add("c-" + CSSC[startSeat], "entry");
        cell.style.setProperty("--rot", ENTRY_ROT[startSeat] + "deg");
      }
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
    closePopup();
    const dice = blocks[p].dice;
    // one token left in a 2-dice game -> only one die rolls
    const n = (G.cfg.dice === 2 &&
      G.tokens[p].filter((s) => s !== E.HOME).length === 1) ? 1 : G.cfg.dice;
    const active = dice.slice(0, n);
    dice.forEach((d, i) => d.classList.toggle("idle", i >= n));
    active.forEach((d) => d.classList.add("rolling"));
    const spin = setInterval(() => active.forEach((d) =>
      (d.dataset.v = 1 + Math.floor(Math.random() * 6))), 70);
    setTimeout(() => {
      clearInterval(spin);
      active.forEach((d) => d.classList.remove("rolling"));
      const res = E.roll(G);
      if (res) res.faces.forEach((f, i) => (dice[i].dataset.v = f));
      rolling = false;
      postAction();
    }, 450);
  }

  /* central post-action: miss-kill animation first, then render + auto-move */
  function postAction() {
    const pen = G.lastPenalty;
    if (pen && pen.items.length) {
      G.lastPenalty = null;
      animatePenalty(pen);
      return;
    }
    render();
    maybeAuto();
  }

  function coordAt(seat, s) {
    return s >= 51 ? HOMECOL[seat](s - 51) : PATH[E.cellOf(seat, s)];
  }
  function placeToken(el, r, c) {
    el.style.top = (r + 0.12) * CELL + "%";
    el.style.left = (c + 0.12) * CELL + "%";
  }

  /* miss-kill: blink the missed capture path tile by tile,
     then walk the guilty token backwards along its route to the yard */
  function animatePenalty(pen) {
    const seat = G.seats[pen.p];
    playSound("miss");
    render();
    // freeze penalized tokens at their last position
    pen.items.forEach(({ t, from }) => {
      const el = tokenEls[pen.p][t];
      placeToken(el, ...coordAt(seat, from));
      el.classList.add("missed");
    });

    // phase A — light up the tiles of the kill that was skipped
    let phaseA = 700;
    pen.items.forEach(({ kill }) => {
      if (!kill) return;
      showToast(`💥 ${NAME[seat]} missed the kill by ${kill.value}!`);
      const steps = [];
      for (let s = kill.from + 1; s <= kill.to; s++) steps.push(s);
      steps.forEach((s, i) => {
        const cell = cellEls[E.cellOf(seat, s)];
        if (!cell) return;
        setTimeout(() => {
          cell.classList.add(s === kill.to ? "blink-target" : "blink");
          setTimeout(() => cell.classList.remove("blink", "blink-target"), 1600);
        }, 400 + i * 190);
      });
      phaseA = Math.max(phaseA, 400 + steps.length * 190 + 900);
    });

    // phase B — walk back the way it came, then into the yard slot
    setTimeout(() => {
      let longest = 0;
      pen.items.forEach(({ t, from }) => {
        const el = tokenEls[pen.p][t];
        const trail = [];
        for (let s = from - 1; s >= 0; s--) trail.push(coordAt(seat, s));
        const [yr, yc] = YARD_ORIGIN[seat];
        const [sr, sc] = YARD_SLOTS[t];
        trail.push([yr + sr, yc + sc]);
        const step = Math.max(45, Math.min(130, Math.floor(1700 / trail.length)));
        el.style.transition = `left ${step}ms linear, top ${step}ms linear`;
        trail.forEach((rc, i) => setTimeout(() => placeToken(el, rc[0], rc[1]), i * step));
        longest = Math.max(longest, trail.length * step);
      });
      setTimeout(() => {
        pen.items.forEach(({ t }) => {
          const el = tokenEls[pen.p][t];
          el.classList.remove("missed");
          el.style.transition = "";
        });
        render();
        maybeAuto();
      }, longest + 300);
    }, phaseA);
  }

  let toastTimer = null;
  function showToast(msg) {
    let el = document.querySelector("#toast");
    if (!el) {
      el = div("toast");
      el.id = "toast";
      $("#board").appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2100);
  }

  /* auto-run: when only one token can move, play its values automatically.
     Exception: a kill on the table with any alternative — the user decides,
     otherwise auto could skip the kill and trigger the miss-kill penalty. */
  function forcedMove(ms) {
    if (ms.length === 0) return null;
    if (ms.length === 1) return ms[0];                 // truly forced (kill or not)
    if (new Set(ms.map((m) => m.t)).size > 1) return null;  // several tokens — user plays
    if (ms.some((m) => m.capture)) return null;        // kill available — user plays
    return ms[0];                                      // one token, no kill at stake
  }
  let autoTimer = null;
  function maybeAuto() {
    if (!G || G.phase !== "move") return;
    if (!forcedMove(E.allMoves(G))) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      if (!G || G.phase !== "move") return;
      const m = forcedMove(E.allMoves(G));
      if (!m) { render(); return; }
      G.log.push(`${NAME[E.curSeat(G)]} auto-moved — only option.`);
      doMove(m.t, m.value);                            // chains remaining values
    }, 450);
  }

  /* token-first interaction: tap your token -> popup with its playable values */
  function legalValuesFor(t) {
    const vals = [];
    for (const v of new Set(G.pool)) {
      if (E.movesFor(G, v).some((m) => m.t === t)) vals.push(v);
    }
    return vals;
  }

  function onToken(p, t) {
    if (!G || G.phase !== "move" || p !== G.cur || rolling) return;
    closePopup();
    const vals = legalValuesFor(t);
    if (vals.length === 0) return;
    // yard token (only a 6 opens it) or a single option: act immediately, no popup
    if (G.tokens[p][t] === -1 || vals.length === 1) {
      doMove(t, vals[0]);
      return;
    }
    openPopup(p, t, vals);
  }

  let popEl = null;
  function openPopup(p, t, vals) {
    closePopup();
    popEl = div("tokpop");
    vals.forEach((v) => {
      const b = document.createElement("button");
      b.textContent = v;
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        closePopup();
        if (G.phase === "move" && E.movesFor(G, v).some((m) => m.t === t)) {
          doMove(t, v);
        }
      });
      popEl.appendChild(b);
    });
    const el = tokenEls[p][t];
    popEl.style.left = el.style.left;
    popEl.style.top = "calc(" + el.style.top + " - 8.5%)";
    $("#board").appendChild(popEl);
  }
  function closePopup() {
    if (popEl) { popEl.remove(); popEl = null; }
  }
  document.addEventListener("click", (e) => {
    if (popEl && !popEl.contains(e.target) && !e.target.classList.contains("token")) closePopup();
  });

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
      const needKill = G.cfg.rule3 && !G.hasKill[p];
      const place = G.finishedOrder.indexOf(p);
      const medal = ["🥇", "🥈", "🥉"][place] || "🏁";
      bl.root.classList.toggle("done-block", place !== -1);
      bl.status.textContent = place !== -1
        ? `Finished ${medal} #${place + 1}`
        : G.phase === "over"
          ? "Lost"
          : (isCur
            ? (G.phase === "roll" ? "Roll the dice" : "Tap a highlighted token")
            : "Waiting…") + (needKill ? " · 🔒 kill to unlock home" : "");

      // pool chips only in the active block
      // pool values are display-only — moves are made by tapping tokens
      bl.pool.innerHTML = "";
      if (isCur && G.phase === "move") {
        G.pool.forEach((v) => {
          const c = div("chip passive");
          c.textContent = v;
          if (E.movesFor(G, v).length === 0) c.classList.add("dead");
          bl.pool.appendChild(c);
        });
      }
    });

    // tokens — highlight every token that can play any pool value
    const movers = new Set();
    if (G.phase === "move") {
      for (const v of new Set(G.pool)) {
        E.movesFor(G, v).forEach((m) => movers.add(m.t));
      }
    }
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

    // winner overlay with full ranking
    if (G.phase === "over") {
      $("#win-text").textContent = G.cfg.rule4
        ? `${NAME[G.winner]} & ${NAME[G.seats[G.finishedOrder[1]]]} win!`
        : `${NAME[G.winner]} wins!`;
      $("#win-text").style.color = HEX[CSSC[G.winner]];
      const ranked = G.finishedOrder.concat(
        G.seats.map((_, p) => p).filter((p) => !G.finishedOrder.includes(p)));
      const winners = G.cfg.rule4 ? 2 : G.seats.length - 1;
      $("#rank-list").innerHTML = ranked.map((p, i) => {
        const s = G.seats[p];
        const win = i < winners && G.finishedOrder.includes(p);
        return `<div class="rk">
          <span class="p-dot" style="width:11px;height:11px;border-radius:50%;background:${HEX[CSSC[s]]}"></span>
          <b>${NAME[s]}</b> ${["🥇","🥈","🥉",""][i] ?? ""}
          <span class="tag ${win ? "win" : "lose"}">${win ? "WINNER" : "LOSER"}</span>
        </div>`;
      }).join("");
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
      render();
    }
    if (q.get("misskill") && G) {        // penalty animation demo (1 die, 2 players)
      G.tokens[0] = [1, 20, -1, -1];
      G.tokens[1] = [29, -1, -1, -1];
      E.roll(G, () => 2);
      E.move(G, 1, 2);                   // ignores the kill at cell 3
      postAction();
    }
  }
})();
