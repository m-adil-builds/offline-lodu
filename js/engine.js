/* Ludo engine — pure game logic, no DOM. Testable in node. */
(function (root) {
  "use strict";

  const TRACK = 52;          // main loop cells
  const HOME = 56;           // steps value when a token is home (finished)
  const OFFSET = [0, 13, 26, 39];              // seat -> start cell on loop
  const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]); // starts + stars
  const SEATS_FOR = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] };
  const COLOR = ["red", "green", "yellow", "blue"];

  function newGame(cfg) {
    const seats = SEATS_FOR[cfg.numPlayers];
    return {
      cfg: { numPlayers: cfg.numPlayers, dice: cfg.dice, rule1: !!cfg.rule1 },
      seats,
      // tokens[i][t] = steps: -1 yard, 0..55 on board, 56 home
      tokens: seats.map(() => [-1, -1, -1, -1]),
      cur: 0,                 // index into seats
      phase: "roll",          // roll | move | over
      pool: [],               // dice values to spend
      pendingRolls: 1,        // rolls owed right now (before moving)
      sixChain: 0,            // 1-die: consecutive sixes
      dblChain: 0,            // 2-dice: consecutive double sixes
      extraOwed: 0,           // rolls owed after pool empties (6 in 1-die, kills)
      missKillers: [],        // token idx with an unused kill chance this turn
      winner: null,
      log: [],
    };
  }

  const curSeat = (g) => g.seats[g.cur];
  const colorOf = (g) => COLOR[curSeat(g)];
  const say = (g, m) => { g.log.push(m); if (g.log.length > 60) g.log.shift(); };

  function cellOf(seat, steps) {           // loop cell or null (home column/yard)
    return steps >= 0 && steps <= 50 ? (OFFSET[seat] + steps) % TRACK : null;
  }

  function enemiesOn(g, cell) {            // [{p, t}] enemy tokens on a loop cell
    const out = [];
    g.seats.forEach((seat, p) => {
      if (p === g.cur) return;
      g.tokens[p].forEach((steps, t) => {
        if (cellOf(seat, steps) === cell) out.push({ p, t });
      });
    });
    return out;
  }

  function movesFor(g, value) {            // legal moves for one pool value
    const seat = curSeat(g), out = [];
    g.tokens[g.cur].forEach((steps, t) => {
      if (steps === HOME) return;
      if (steps === -1) {
        if (value === 6) out.push({ t, value, from: -1, to: 0, capture: false, open: true });
        return;
      }
      const to = steps + value;
      if (to > HOME) return;               // exact roll needed for home
      const cell = cellOf(seat, to);
      const capture = cell !== null && !SAFE.has(cell) && enemiesOn(g, cell).length > 0;
      out.push({ t, value, from: steps, to, capture, open: false });
    });
    return out;
  }

  function allMoves(g) {
    const seen = new Set(), out = [];
    for (const v of g.pool) {
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(...movesFor(g, v));
    }
    return out;
  }

  function rng() { return 1 + Math.floor(Math.random() * 6); }

  function roll(g, rand) {
    if (g.phase !== "roll" || g.pendingRolls < 1) return null;
    rand = rand || rng;
    g.pendingRolls--;
    let faces;
    if (g.cfg.dice === 1) {
      faces = [rand()];
      g.pool.push(faces[0]);
      if (faces[0] === 6) {
        g.sixChain++;
        if (g.sixChain >= 3) {
          say(g, `${colorOf(g)} rolled three sixes — turn void.`);
          g.pool = [];
          finalizeTurn(g);
          return { faces, voided: true };
        }
        g.extraOwed++;
        say(g, `${colorOf(g)} rolled a 6 — extra roll after moving.`);
      }
    } else {
      faces = [rand(), rand()];
      g.pool.push(...faces);
      if (faces[0] === 6 && faces[1] === 6) {
        g.dblChain++;
        if (g.dblChain >= 2) {
          say(g, `${colorOf(g)} rolled 6,6,6,6 — turn void.`);
          g.pool = [];
          finalizeTurn(g);
          return { faces, voided: true };
        }
        g.pendingRolls++;                   // immediate extra roll, pool grows
        say(g, `${colorOf(g)} rolled double six — roll again!`);
      } else {
        g.dblChain = 0;
      }
    }
    if (g.pendingRolls === 0) enterMovePhase(g);
    return { faces, voided: false };
  }

  function enterMovePhase(g) {
    g.phase = "move";
    pruneOrEnd(g);
  }

  function pruneOrEnd(g) {                 // end turn when nothing in the pool is usable
    if (g.phase !== "move") return;
    // values stay in the pool even if unusable right now — a 6 spent on opening
    // a token can make them usable. Only when NO value has a legal move is the
    // rest forfeited.
    const anyUsable = g.pool.some((v) => movesFor(g, v).length > 0);
    if (!anyUsable) {
      if (g.pool.length > 0) say(g, `${colorOf(g)} forfeits ${g.pool.length} unusable value(s).`);
      g.pool = [];
      afterPoolEmpty(g);
    }
  }

  function afterPoolEmpty(g) {
    if (g.extraOwed > 0) {
      g.extraOwed--;
      g.pendingRolls = 1;
      g.phase = "roll";
      return;
    }
    finalizeTurn(g);
  }

  function recordKillChances(g) {          // custom rule 1 bookkeeping
    if (!g.cfg.rule1) return;
    for (const m of allMoves(g)) {
      if (m.capture && !g.missKillers.includes(m.t)) g.missKillers.push(m.t);
    }
  }

  function move(g, tokenIdx, value) {
    if (g.phase !== "move") return null;
    const legal = movesFor(g, value).find((m) => m.t === tokenIdx);
    const iv = g.pool.indexOf(value);
    if (!legal || iv === -1) return null;

    recordKillChances(g);                  // chances available BEFORE this move
    g.pool.splice(iv, 1);

    const seat = curSeat(g);
    g.tokens[g.cur][tokenIdx] = legal.to;
    const ev = { captured: [], finished: false, won: false, open: legal.open };

    if (legal.capture) {
      const cell = cellOf(seat, legal.to);
      for (const e of enemiesOn(g, cell)) {
        g.tokens[e.p][e.t] = -1;
        ev.captured.push(e);
        say(g, `${colorOf(g)} killed ${COLOR[g.seats[e.p]]}'s token!`);
      }
      g.missKillers = g.missKillers.filter((t) => t !== tokenIdx); // it killed
      g.extraOwed++;                       // kill = extra roll
      say(g, `${colorOf(g)} gets an extra roll for the kill.`);
    }
    if (legal.open) say(g, `${colorOf(g)} opened a token.`);
    if (legal.to === HOME) {
      ev.finished = true;
      say(g, `${colorOf(g)} brought a token home!`);
      if (g.tokens[g.cur].every((s) => s === HOME)) {
        g.winner = curSeat(g);
        g.phase = "over";
        ev.won = true;
        say(g, `${colorOf(g).toUpperCase()} WINS!`);
        return ev;
      }
    }
    pruneOrEnd(g);
    return ev;
  }

  function finalizeTurn(g) {
    if (g.cfg.rule1 && g.missKillers.length) {
      for (const t of g.missKillers) {
        const s = g.tokens[g.cur][t];
        if (s >= 0 && s < HOME) {
          g.tokens[g.cur][t] = -1;
          say(g, `Penalty: ${colorOf(g)}'s token closed — it missed a kill.`);
        }
      }
    }
    g.missKillers = [];
    g.pool = [];
    g.sixChain = 0;
    g.dblChain = 0;
    g.extraOwed = 0;
    g.cur = (g.cur + 1) % g.seats.length;
    g.pendingRolls = 1;
    g.phase = "roll";
    say(g, `${colorOf(g)}'s turn.`);
  }

  const api = {
    newGame, roll, move, movesFor, allMoves, cellOf,
    TRACK, HOME, OFFSET, SAFE, COLOR, curSeat,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LudoEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
