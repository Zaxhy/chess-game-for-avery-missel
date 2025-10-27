// app.js — Chess game with AI, highlights, move history, themes

const STOCKFISH_WORKER = 'stockfish.wasm.js'; // Local copy required
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
  setStatus('Analysis cleared');
});

const game = new Chess();
let board = null;
let engine = null;
let playerColor = 'white';

function setStatus(text){ statusEl.textContent=text; }

function initBoard(){
  board = Chessboard('board', {
    draggable:true,
    position:'start',
    onDragStart: (s, p) => { if(game.game_over()) return false; },
    onDrop: (s, t) => {
      const move = game.move({ from:s, to:t, promotion:'q' });
      if(!move) return 'snapback';
      movesData.push({san:move.san, from:move.from, to:move.to, side:move.color==='w'?'white':'black'});
      board.position(game.fen(),true);
      fenInput.value = game.fen();
      renderMoves();
      maybeEngineMove();
    },
    onSnapEnd: () => board.position(game.fen())
  });
}

function startEngine(){
  engine = new Worker(STOCKFISH_WORKER);
  engine.onmessage = e=>{
    if(!e.data) return;
    if(e.data.startsWith('bestmove')){
      const mv=e.data.split(' ')[1
