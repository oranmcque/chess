import { Chess, type Move, type PieceSymbol } from 'chess.js';
import type { Difficulty } from '../types/chess';

export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Classic PeSTO-inspired piece-square tables (from White's perspective, rank 8 -> rank 1)
const PAWN_PST = [
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  12, 12, 22, 32, 32, 22, 12, 12,
   5,  5, 12, 27, 27, 12,  5,  5,
   0,  0,  4, 24, 24,  4,  0,  0,
   5, -4, -8,  2,  2, -8, -4,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0,
];

const KNIGHT_PST = [
 -50,-40,-30,-30,-30,-30,-40,-50,
 -40,-20,  0,  4,  4,  0,-20,-40,
 -30,  4, 14, 18, 18, 14,  4,-30,
 -30,  6, 18, 22, 22, 18,  6,-30,
 -30,  2, 16, 20, 20, 16,  2,-30,
 -30,  6, 12, 15, 15, 12,  6,-30,
 -40,-20,  0,  5,  5,  0,-20,-40,
 -50,-40,-30,-30,-30,-30,-40,-50,
];

const BISHOP_PST = [
 -20,-10,-10,-10,-10,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  2,  8, 12, 12,  8,  2,-10,
 -10,  6,  8, 12, 12,  8,  6,-10,
 -10,  2, 12, 12, 12, 12,  2,-10,
 -10, 10, 10, 10, 10, 10, 10,-10,
 -10,  6,  0,  0,  0,  0,  6,-10,
 -20,-10,-10,-10,-10,-10,-10,-20,
];

const ROOK_PST = [
   0,  0,  0,  2,  2,  0,  0,  0,
   6, 12, 12, 12, 12, 12, 12,  6,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   0,  0,  2,  8,  8,  4,  0,  0,
];

const QUEEN_PST = [
 -20,-10,-10, -5, -5,-10,-10,-20,
 -10,  0,  0,  0,  0,  0,  0,-10,
 -10,  0,  5,  5,  5,  5,  0,-10,
  -5,  0,  5,  5,  5,  5,  0, -5,
   0,  0,  5,  5,  5,  5,  0, -5,
 -10,  5,  5,  5,  5,  5,  0,-10,
 -10,  0,  5,  0,  0,  0,  0,-10,
 -20,-10,-10, -5, -5,-10,-10,-20,
];

const KING_MID_PST = [
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -30,-40,-40,-50,-50,-40,-40,-30,
 -20,-30,-30,-40,-40,-30,-30,-20,
 -10,-20,-20,-20,-20,-20,-20,-10,
  20, 20,  0,  0,  0,  0, 20, 20,
  22, 32, 12,  0,  0, 12, 32, 22,
];

const KING_END_PST = [
 -50,-40,-30,-20,-20,-30,-40,-50,
 -30,-20,-10,  0,  0,-10,-20,-30,
 -30,-10, 20, 30, 30, 20,-10,-30,
 -30,-10, 30, 40, 40, 30,-10,-30,
 -30,-10, 30, 40, 40, 30,-10,-30,
 -30,-10, 20, 30, 30, 20,-10,-30,
 -30,-30,  0,  0,  0,  0,-30,-30,
 -50,-30,-30,-30,-30,-30,-30,-50,
];

const PST: Record<PieceSymbol, number[]> = {
  p: PAWN_PST,
  n: KNIGHT_PST,
  b: BISHOP_PST,
  r: ROOK_PST,
  q: QUEEN_PST,
  k: KING_MID_PST,
};

const MATE_SCORE = 100000;

/**
 * Static board evaluation in centipawns from White's perspective (+White, -Black).
 */
export function evaluateBoardStatic(chess: Chess): number {
  if (chess.isCheckmate()) {
    return chess.turn() === 'w' ? -MATE_SCORE : MATE_SCORE;
  }
  if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition() || chess.isInsufficientMaterial()) {
    return 0;
  }

  const board = chess.board();
  let score = 0;
  let whiteBishops = 0;
  let blackBishops = 0;
  let nonPawnMaterial = 0;

  // Quick pass to detect endgame phase
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      if (piece.type !== 'p' && piece.type !== 'k') {
        nonPawnMaterial += PIECE_VALUES[piece.type];
      }
    }
  }
  const isEndgame = nonPawnMaterial <= 2600;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;

      const idx = piece.color === 'w' ? r * 8 + c : (7 - r) * 8 + c;
      const base = PIECE_VALUES[piece.type];
      const table = piece.type === 'k' && isEndgame ? KING_END_PST : PST[piece.type];
      const positional = table[idx];

      if (piece.color === 'w') {
        score += base + positional;
        if (piece.type === 'b') whiteBishops++;
      } else {
        score -= base + positional;
        if (piece.type === 'b') blackBishops++;
      }
    }
  }

  // Bishop pair bonus
  if (whiteBishops >= 2) score += 28;
  if (blackBishops >= 2) score -= 28;

  return score;
}

function scoreMoveForOrdering(move: Move): number {
  let score = 0;
  if (move.captured) {
    // MVV-LVA: prioritize capturing high-value piece with low-value attacker
    score += 10 * PIECE_VALUES[move.captured] - PIECE_VALUES[move.piece];
  }
  if (move.promotion) {
    score += PIECE_VALUES[move.promotion];
  }
  if (move.san.includes('+')) {
    score += 90;
  }
  if (move.san === 'O-O' || move.san === 'O-O-O') {
    score += 45;
  }
  return score;
}

function quiescence(chess: Chess, alpha: number, beta: number, maximizing: boolean, qDepth: number): number {
  const standPat = evaluateBoardStatic(chess);

  if (Math.abs(standPat) >= MATE_SCORE - 100 || qDepth <= 0) {
    return standPat;
  }

  if (maximizing) {
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;

    const tacticalMoves = chess
      .moves({ verbose: true })
      .filter((m) => m.captured || m.promotion)
      .sort((a, b) => scoreMoveForOrdering(b) - scoreMoveForOrdering(a));

    for (const move of tacticalMoves) {
      chess.move(move);
      const val = quiescence(chess, alpha, beta, false, qDepth - 1);
      chess.undo();
      if (val >= beta) return beta;
      if (val > alpha) alpha = val;
    }
    return alpha;
  } else {
    if (standPat <= alpha) return alpha;
    if (standPat < beta) beta = standPat;

    const tacticalMoves = chess
      .moves({ verbose: true })
      .filter((m) => m.captured || m.promotion)
      .sort((a, b) => scoreMoveForOrdering(b) - scoreMoveForOrdering(a));

    for (const move of tacticalMoves) {
      chess.move(move);
      const val = quiescence(chess, alpha, beta, true, qDepth - 1);
      chess.undo();
      if (val <= alpha) return alpha;
      if (val < beta) beta = val;
    }
    return beta;
  }
}

function minimax(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  useQuiescence: boolean,
  nodeBudget: { count: number; max: number }
): number {
  nodeBudget.count++;
  if (nodeBudget.count > nodeBudget.max) {
    return evaluateBoardStatic(chess);
  }

  if (chess.isGameOver()) {
    if (chess.isCheckmate()) {
      // Prefer faster checkmates
      return chess.turn() === 'w' ? -(MATE_SCORE - (10 - depth) * 100) : MATE_SCORE - (10 - depth) * 100;
    }
    return 0;
  }

  if (depth === 0) {
    return useQuiescence
      ? quiescence(chess, alpha, beta, maximizing, 3)
      : evaluateBoardStatic(chess);
  }

  const moves = chess.moves({ verbose: true }).sort((a, b) => scoreMoveForOrdering(b) - scoreMoveForOrdering(a));

  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      chess.move(move);
      const val = minimax(chess, depth - 1, alpha, beta, false, useQuiescence, nodeBudget);
      chess.undo();
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const move of moves) {
      chess.move(move);
      const val = minimax(chess, depth - 1, alpha, beta, true, useQuiescence, nodeBudget);
      chess.undo();
      if (val < best) best = val;
      if (best < beta) beta = best;
      if (beta <= alpha) break;
    }
    return best;
  }
}

// Small classical opening book replies for natural, instructive computer play
const BOOK_RESPONSES: Record<string, string[]> = {
  '': ['e4', 'd4', 'Nf3', 'c4'],
  'e4': ['e5', 'c5', 'e6', 'c6'],
  'e4 e5': ['Nf3', 'Bc4', 'Nc3'],
  'e4 e5 Nf3': ['Nc6', 'Nf6', 'd6'],
  'e4 e5 Nf3 Nc6': ['Bc4', 'Bb5', 'd4', 'Nc3'],
  'e4 e5 Nf3 Nc6 Bc4': ['Nf6', 'Bc5'],
  'e4 e5 Nf3 Nc6 Bb5': ['a6', 'Nf6'],
  'e4 e5 Nf3 Nc6 d4': ['exd4'],
  'e4 e5 Nf3 Nc6 d4 exd4': ['Nxd4', 'Bc4'],
  'e4 e5 Nf3 Nf6': ['Nxe5', 'd4', 'Nc3'],
  'd4': ['d5', 'Nf6'],
  'd4 d5': ['c4', 'Nf3'],
  'd4 d5 c4': ['e6', 'c6'],
};

export interface EngineResult {
  move: Move | null;
  evalCp: number;
}

/**
 * Computes the computer's best move for a given FEN & difficulty level.
 */
export function computeBestMove(fen: string, difficulty: Difficulty, historySan: string[] = []): EngineResult {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) {
    return { move: null, evalCp: evaluateBoardStatic(chess) };
  }

  // Opening book lookup for Intermediate / Advanced / Pro
  if (difficulty !== 'rookie' && historySan.length <= 7) {
    const key = historySan.join(' ');
    const candidates = BOOK_RESPONSES[key];
    if (candidates && candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      const found = moves.find((m) => m.san === pick);
      if (found) {
        chess.move(found);
        const evalCp = evaluateBoardStatic(chess);
        return { move: found, evalCp };
      }
    }
  }

  const config: Record<Difficulty, { depth: number; quiescence: boolean; noise: number; maxNodes: number }> = {
    rookie: { depth: 1, quiescence: false, noise: 160, maxNodes: 2500 },
    intermediate: { depth: 2, quiescence: false, noise: 45, maxNodes: 8000 },
    advanced: { depth: 3, quiescence: true, noise: 12, maxNodes: 22000 },
    pro: { depth: 3, quiescence: true, noise: 0, maxNodes: 45000 },
  };

  const { depth, quiescence: useQ, noise, maxNodes } = config[difficulty];
  const maximizing = chess.turn() === 'w';
  const orderedMoves = moves.sort((a, b) => scoreMoveForOrdering(b) - scoreMoveForOrdering(a));

  const scored: Array<{ move: Move; score: number }> = [];
  const budget = { count: 0, max: maxNodes };

  let alpha = -Infinity;
  let beta = Infinity;

  for (const move of orderedMoves) {
    chess.move(move);
    const val = minimax(chess, depth - 1, alpha, beta, !maximizing, useQ, budget);
    chess.undo();

    const jitter = noise > 0 ? (Math.random() * 2 - 1) * noise : 0;
    scored.push({ move, score: val + jitter });

    if (maximizing && val > alpha) alpha = val;
    if (!maximizing && val < beta) beta = val;
  }

  scored.sort((a, b) => (maximizing ? b.score - a.score : a.score - b.score));
  const best = scored[0];

  // Re-evaluate true score without jitter for display
  chess.move(best.move);
  const cleanEval = depth >= 2 ? (maximizing ? alpha : beta) : evaluateBoardStatic(chess);
  const safeEval = Number.isFinite(cleanEval) ? cleanEval : evaluateBoardStatic(chess);

  return { move: best.move, evalCp: safeEval };
}

/**
 * Fast synchronous analysis used by the live Training Coach (runs in ~15–45ms).
 */
export function evaluatePositionFast(fen: string, depth = 2): EngineResult {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) {
    return { move: null, evalCp: evaluateBoardStatic(chess) };
  }

  const maximizing = chess.turn() === 'w';
  const ordered = moves.sort((a, b) => scoreMoveForOrdering(b) - scoreMoveForOrdering(a));
  const budget = { count: 0, max: 14000 };

  let bestMove = ordered[0];
  let bestVal = maximizing ? -Infinity : Infinity;
  let alpha = -Infinity;
  let beta = Infinity;

  for (const move of ordered) {
    chess.move(move);
    const val = minimax(chess, depth - 1, alpha, beta, !maximizing, true, budget);
    chess.undo();

    if (maximizing) {
      if (val > bestVal) {
        bestVal = val;
        bestMove = move;
      }
      if (bestVal > alpha) alpha = bestVal;
    } else {
      if (val < bestVal) {
        bestVal = val;
        bestMove = move;
      }
      if (bestVal < beta) beta = bestVal;
    }
  }

  return { move: bestMove, evalCp: Number.isFinite(bestVal) ? bestVal : evaluateBoardStatic(chess) };
}

export function formatEvalScore(evalCp: number): string {
  if (Math.abs(evalCp) >= MATE_SCORE - 2000) {
    return evalCp > 0 ? '+M' : '-M';
  }
  const pawns = evalCp / 100;
  if (Math.abs(pawns) < 0.05) return '0.0';
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
}

export function evalToWhitePercentage(evalCp: number): number {
  if (Math.abs(evalCp) >= MATE_SCORE - 2000) {
    return evalCp > 0 ? 97 : 3;
  }
  // Smooth sigmoid mapping [-800, +800] -> [5%, 95%]
  const clamped = Math.max(-1000, Math.min(1000, evalCp));
  const pct = 50 + (46 * Math.tanh(clamped / 450));
  return Math.max(4, Math.min(96, pct));
}
