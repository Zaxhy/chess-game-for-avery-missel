// app.js — main behavior: board, engine, highlights, move history + analysis toggle
const STOCKFISH_WORKER = 'https://cdn.jsdelivr.net/npm/stockfish.wasm@0.10.0/stockfish.worker.js';

// elements
const statusEl = document.getElementById('status');
const eloEl = document.getElementById('elo');
const eloVal = document.getElementById('eloVal');
const sideEl = document.getElementById('side');
const newBtn = document.getElementById('newBtn');
const undoBtn = document.getElementById('undoBtn');
const flipBtn = document.getElementById('flipBtn');
const themeEl = document.getElementById('theme');
const fenInput = document.getElementById('fen');
const setFenBtn = document.getElementById('setFen');
const movesList = document.getElementById('movesList');
const analysisToggle = document.getElementById('analysisToggle');
const clearAnalysis = document.getElementById('clearAnalysis');
const lastMoveOverlay = document.getElementById('lastMoveOverlay');

let showAnalysis = false;
analysisToggle.addEventListener('click', () => {
  showAnalysis = !showAnalysis;
  analysisToggle.textContent = showAnalysis ? 'Hide Move Analysis' : 'Show Move Analysis';
  renderMoves();
});
clearAnalysis.addEventListener('click', () => {
  movesData = [];
  renderMoves();
  setStatus('Analysis cleared');
});

// chess + engine
const game = new Chess();
let board = null;
let engine = null;
let engineReady = false;
let playerColor = 'white';

// store moves with optional evals
let movesData = [];

function setStatus(text) { statusEl.textContent = text; }

const boardWrap = document.getElementById('board');

function squareToCoords(square) {
  const sq = document.querySelector('.square-' + square);
  if (!sq) return null;
  const r = sq.getBoundingClientRect();
  const b = boardWrap.getBoundingClientRect();
  return { left: r.left - b.left, top: r.top - b.top, w: r.width, h: r.height };
}

let dots = {}, illegalOverlays = {}, lastMoveElems = [];

function clearDots() { Object.values(dots).forEach(e => e.remove()); dots = {}; }
function clearIllegal() { Object.values(illegalOverlays).forEach(e => e.remove()); illegalOverlays = {}; }
function clearLastMove() { lastMoveElems.forEach(e => e.remove()); lastMoveElems = []; }

function showLegalDots(square, destList) {
  clearDots();
  for (const dst of destList) {
    const coords = squareToCoords(dst);
    if (!coords) continue;
    const dot = document.createElement('div');
    dot.className = 'square-dot';
    dot.style.left = (coords.left + coords.w/2) + 'px';
    dot.style.top = (coords.top + coords.h/2) + 'px';
    dot.style.background = 'rgba(37, 211, 102, 0.95)';
    boardWrap.appendChild(dot);
    requestAnimationFrame(() => { dot.style.opacity = '1'; dot.style.transform = 'translate(-50%,-50%) scale(1)'; });
    dots[dst] = dot;
  }
}

function showIllegalOverlay(square) {
  clearIllegal();
  const coords = squareToCoords(square);
  if (!coords) return;
  const ov = document.createElement('div');
  ov.className = 'illegal-overlay';
  ov.style.left = coords.left + 'px';
  ov.style.top = coords.top + 'px';
  ov.style.width = coords.w + 'px';
  ov.style.height = coords.h + 'px';
  boardWrap.appendChild(ov);
  requestAnimationFrame(() => { ov.style.opacity = '1'; });
  setTimeout(() => { ov.style.opacity = '0'; setTimeout(() => ov.remove(), 250); }, 500);
}

function showLastMove(from, to) {
  clearLastMove();
  const f = squareToCoords(from), t = squareToCoords(to);
  [f, t].forEach(coords => {
    if (!coords) return;
    const el = document.createElement('div');
    el.className = 'last-move';
    el.style.left = coords.left + 'px';
    el.style.top = coords.top + 'px';
    el.style.width = coords.w + 'px';
    el.style.height = coords.h + 'px';
    el.style.opacity = '1';
    boardWrap.appendChild(el);
    lastMoveElems.push(el);
  });
  setTimeout(() => { lastMoveElems.forEach(el => el.style.opacity = '0'); setTimeout(clearLastMove, 400); }, 800);
}

function initBoard() {
  const cfg = {
    draggable: true,
    position: 'start',
    onDragStart: (s, p) => {
      if (game.game_over()) return false;
      const moves = game.moves({ square: s, verbose: true }).map(m => m.to);
      showLegalDots(s, moves);
    },
    onDrop: (s, t) => {
      const move = game.move({ from: s, to: t, promotion: 'q' });
      if (!move) { showIllegalOverlay(t); return 'snapback'; }
      movesData.push({ san: move.san, from: move.from, to: move.to, side: move.color === 'w' ? 'white' : 'black' });
      updateBoard();
      showLastMove(move.from, move.to);
      analyzeLastMove();
      maybeEngineMove();
      setTimeout(clearDots, 500);
    },
    onMouseoverSquare: (sq) => {
      const moves = game.moves({ square: sq, verbose: true });
      if (!moves.length) { showIllegalOverlay(sq); return; }
      showLegalDots(sq, moves.map(m => m.to));
    },
    onMouseoutSquare: () => setTimeout(clearDots, 500),
    onSnapEnd: () => board.position(game.fen())
  };
  if (board) board.destroy();
  board = Chessboard('board', cfg);
}

function updateBoard() { board.position(game.fen(), true); fenInput.value = game.fen(); renderMoves(); }

function newGame() { game.reset(); movesData = []; updateBoard(); if (playerColor === 'black') maybeEngineMove(); }
function undo() { game.undo(); game.undo(); updateBoard(); }

function startEngine() {
  engine = new Worker(STOCKFISH_WORKER);
  engine.onmessage = e => {
    const line = e.data;
    if (line.startsWith('bestmove')) {
      const mv = line.split(' ')[1];
      if (mv) {
        game.move({ from: mv.substr(0, 2), to: mv.substr(2, 2), promotion: 'q' });
        updateBoard();
        showLastMove(mv.substr(0, 2), mv.substr(2, 2));
      }
    }
  };
  engine.postMessage('uci');
}

function setEngineElo(elo) {
  if (!engine) return;
  engine.postMessage('setoption name UCI_LimitStrength value true');
  engine.postMessage('setoption name UCI_Elo value ' + Math.round(elo));
}

function maybeEngineMove() {
  if (game.game_over()) return;
  if (game.turn() === (playerColor === 'white' ? 'b' : 'w')) {
    engine.postMessage('position fen ' + game.fen());
    engine.postMessage('go movetime 300');
  }
}

function renderMoves() {
  movesList.innerHTML = '';
  for (let i = 0; i < movesData.length; i += 2) {
    const moveNo = (i / 2) + 1;
    const w = movesData[i], b = movesData[i + 1];
    const row = document.createElement('div');
    row.className = 'move-row fade-in';
    row.innerHTML = `<div><b>${moveNo}.</b> ${w ? w.san : ''}</div><div>${b ? b.san : ''}</div>`;
    if (showAnalysis && (w?.evalLabel || b?.evalLabel)) {
      const lbl = document.createElement('div');
      lbl.className = 'move-eval';
      lbl.textContent = `${w?.evalLabel || ''} ${b?.evalLabel || ''}`;
      row.appendChild(lbl);
    }
    movesList.appendChild(row);
  }
  movesList.scrollTop = movesList.scrollHeight;
}

function analyzeLastMove() {
  if (!engine) return;
  const w = new Worker(STOCKFISH_WORKER);
  const fen = game.fen();
  w.onmessage = e => {
    const line = e.data;
    const match = line.match(/score cp (-?\\d+)/);
    if (match) {
      const cp = parseInt(match[1], 10);
      const idx = movesData.length - 1;
      if (idx >= 0) {
        movesData[idx].evalCp = cp;
        movesData[idx].evalLabel = labelFromCp(cp);
      }
    }
    if (line.includes('bestmove')) { w.terminate(); renderMoves(); }
  };
  w.postMessage('uci');
  w.postMessage('position fen ' + fen);
  w.postMessage('go depth 12');
}

function labelFromCp(cp) {
  const abs = Math.abs(cp);
  if (abs < 50) return '♟️ Good';
  if (abs < 100) return '⚠️ Inaccuracy';
  if (abs < 300) return '❗ Mistake';
  return '❌ Blunder';
}

// UI wiring
eloEl.addEventListener('input', () => { eloVal.textContent = eloEl.value; setEngineElo(eloEl.value); });
sideEl.addEventListener('change', () => { playerColor = sideEl.value; newGame(); });
newBtn.addEventListener('click', newGame);
undoBtn.addEventListener('click', undo);
flipBtn.addEventListener('click', () => board.flip());
themeEl.addEventListener('change', () => { document.body.className = themeEl.value; });
setFenBtn.addEventListener('click', () => {
  try { game.load(fenInput.value); updateBoard(); } catch { alert('Invalid FEN'); }
});

// boot
(function() {
  initBoard();
  startEngine();
  eloVal.textContent = eloEl.value;
  setTimeout(() => { setEngineElo(eloEl.value); }, 800);
})();
