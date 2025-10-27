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

let showAnalysis = false;
let movesData = [];

analysisToggle.addEventListener('click', () => {
  showAnalysis = !showAnalysis;
  analysisToggle.textContent = showAnalysis ? 'Hide Move Analysis' : 'Show Move Analysis';
  renderMoves();
});

clearAnalysis.addEventListener('click', () => {
  movesData = [];
  renderMoves();
  statusEl.textContent = 'Analysis cleared';
});

const game = new Chess();
let board = null;
let engine = null;
let playerColor = 'white';

function initBoard() {
  board = Chessboard('board', {
    draggable: true,
    position: 'start',
    pieceTheme: 'https://upload.wikimedia.org/wikipedia/commons/{piece}.png',
    onDragStart: (source, piece) => {
      if (game.game_over()) return false;
    },
    onDrop: (source, target) => {
      const move = game.move({ from: source, to: target, promotion: 'q' });
      if (!move) return 'snapback';
      movesData.push({ san: move.san, from: move.from, to: move.to, side: move.color === 'w' ? 'white' : 'black' });
      board.position(game.fen(), true);
      fenInput.value = game.fen();
      renderMoves();
      maybeEngineMove();
    },
    onSnapEnd: () => board.position(game.fen())
  });
}

function startEngine() {
  engine = new Worker(STOCKFISH_WORKER);
  engine.onmessage = e => {
    if (!e.data) return;
    if (e.data.startsWith('bestmove')) {
      const mv = e.data.split(' ')[1];
      if (mv) {
        game.move({ from: mv.substr(0, 2), to: mv.substr(2, 2), promotion: 'q' });
        board.position(game.fen(), true);
        fenInput.value = game.fen();
        movesData.push({ san: game.history({ verbose: true }).slice(-1)[0].san, side: playerColor === 'white' ? 'black' : 'white' });
        renderMoves();
      }
    }
  };
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
    const moveNo = i / 2 + 1;
    const w = movesData[i], b = movesData[i + 1];
    const row = document.createElement('div');
    row.className = 'move-row fade-in';
    row.innerHTML = `<div><b>${moveNo}.</b> ${w ? w.san : ''}</div><div>${b ? b.san : ''}</div>`;
    movesList.appendChild(row);
  }
}

newBtn.addEventListener('click', () => {
  game.reset();
  movesData = [];
  board.position('start');
  renderMoves();
  if (playerColor === 'black') maybeEngineMove();
});

undoBtn.addEventListener('click', () => {
  game.undo();
  board.position(game.fen());
  movesData.pop();
  renderMoves();
});

flipBtn.addEventListener('click', () => board.flip());

themeEl.addEventListener('change', () => document.body.className = themeEl.value);

fenInput.value = game.fen();
setFenBtn.addEventListener('click', () => {
  if (game.load(fenInput.value)) {
    board.position(fenInput.value);
    movesData = [];
    renderMoves();
  } else alert('Invalid FEN');
});

eloEl.addEventListener('input', () => {
  eloVal.textContent = eloEl.value;
});

sideEl.addEventListener('change', () => {
  playerColor = sideEl.value;
});

initBoard();
startEngine();
