import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import type { BoardArrow, CoachFeedback, MoveQuality, TacticalMotif } from '../types/chess';
import { detectOpening } from '../data/openings';
import { evaluatePositionFast, PIECE_VALUES } from './chessAI';

const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

function sqToRC(sq: Square): [number, number] {
  const file = FILES.indexOf(sq[0]);
  const rank = RANKS.indexOf(sq[1]);
  return [rank, file];
}

function rcToSq(r: number, c: number): Square | null {
  if (r < 0 || r > 7 || c < 0 || c > 7) return null;
  return `${FILES[c]}${RANKS[r]}` as Square;
}

/**
 * Inspects a square to see which pieces attack it for a given color.
 * Uses chess.js's built-in attackers() if available, or geometric fallback.
 */
function getAttackersOf(chess: Chess, target: Square, byColor: Color): Square[] {
  const result: Square[] = [];
  const board = chess.board();
  const [tr, tc] = sqToRC(target);

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece || piece.color !== byColor) continue;
      const fromSq = rcToSq(r, c);
      if (!fromSq || fromSq === target) continue;

      const dr = tr - r;
      const dc = tc - c;
      const adr = Math.abs(dr);
      const adc = Math.abs(dc);

      if (piece.type === 'p') {
        const dir = byColor === 'w' ? -1 : 1;
        if (dr === dir && adc === 1) result.push(fromSq);
      } else if (piece.type === 'n') {
        if ((adr === 2 && adc === 1) || (adr === 1 && adc === 2)) result.push(fromSq);
      } else if (piece.type === 'k') {
        if (adr <= 1 && adc <= 1) result.push(fromSq);
      } else {
        const isDiag = adr === adc;
        const isOrtho = dr === 0 || dc === 0;
        const canSlide =
          (piece.type === 'b' && isDiag) ||
          (piece.type === 'r' && isOrtho) ||
          (piece.type === 'q' && (isDiag || isOrtho));
        if (canSlide) {
          const sr = Math.sign(dr);
          const sc = Math.sign(dc);
          let cr = r + sr;
          let cc = c + sc;
          let clear = true;
          while (cr !== tr || cc !== tc) {
            if (board[cr][cc]) {
              clear = false;
              break;
            }
            cr += sr;
            cc += sc;
          }
          if (clear) result.push(fromSq);
        }
      }
    }
  }
  return result;
}

/**
 * Detects tactical motifs (Forks, Pins, Loose Pieces, Outnumbered Pieces, Discovered Attacks)
 * directly inspired by Dr. Dave Regis's "Ten Steps to Learn Chess Tactics and Combinations".
 */
export function detectTacticalMotifs(chessAfter: Chess, lastMove: Move): TacticalMotif[] {
  const motifs: TacticalMotif[] = [];
  const mover = lastMove.color;
  const opp: Color = mover === 'w' ? 'b' : 'w';
  const board = chessAfter.board();

  // 1. Special Move Recognition
  if (lastMove.san === 'O-O' || lastMove.san === 'O-O-O') {
    motifs.push({
      name: lastMove.san === 'O-O' ? 'Kingside Castling' : 'Queenside Castling',
      description: 'Tucks the King behind protective pawns while activating the Rook toward the center.',
      squares: [lastMove.to],
      chapterRef: 8,
    });
  }
  if (lastMove.flags.includes('e')) {
    motifs.push({
      name: 'En Passant Capture',
      description: 'Special pawn capture executed immediately after an opposing pawn advances two squares.',
      squares: [lastMove.from, lastMove.to],
      arrows: [{ from: lastMove.from, to: lastMove.to, color: 'emerald' }],
    });
  }
  if (lastMove.promotion) {
    motifs.push({
      name: `Pawn Promotion to ${PIECE_NAMES[lastMove.promotion]}`,
      description: `Reaching the final rank transforms the pawn into a ${PIECE_NAMES[lastMove.promotion]}.`,
      squares: [lastMove.to],
    });
  }

  // 2. Fork Detection (Chapter 3.1): Does the moved piece attack >= 2 valuable enemy targets?
  const attackedTargets: Array<{ sq: Square; type: PieceSymbol }> = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece || piece.color !== opp) continue;
      const sq = rcToSq(r, c);
      if (!sq) continue;
      const attackers = getAttackersOf(chessAfter, sq, mover);
      if (attackers.includes(lastMove.to)) {
        const defenders = getAttackersOf(chessAfter, sq, opp);
        const isHighValue = piece.type === 'k' || piece.type === 'q' || piece.type === 'r';
        const isProfitable = PIECE_VALUES[piece.type] > PIECE_VALUES[lastMove.piece] || defenders.length === 0;
        if (isHighValue || (piece.type !== 'p' && isProfitable)) {
          attackedTargets.push({ sq, type: piece.type });
        }
      }
    }
  }

  if (attackedTargets.length >= 2) {
    const names = attackedTargets.slice(0, 2).map((t) => `${PIECE_NAMES[t.type]} (${t.sq})`).join(' and ');
    motifs.push({
      name: 'Fork (Double Attack)',
      description: `${PIECE_NAMES[lastMove.piece]} on ${lastMove.to} attacks ${names} simultaneously — Chapter 3.1.`,
      squares: [lastMove.to, ...attackedTargets.map((t) => t.sq)],
      arrows: attackedTargets.slice(0, 3).map((t) => ({ from: lastMove.to, to: t.sq, color: 'amber' })),
      chapterRef: 3,
    });
  }

  // 3. Pin & Skewer Detection (Chapters 3.2 & 3.3)
  if (lastMove.piece === 'b' || lastMove.piece === 'r' || lastMove.piece === 'q') {
    const dirs =
      lastMove.piece === 'b'
        ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
        : lastMove.piece === 'r'
        ? [[-1, 0], [1, 0], [0, -1], [0, 1]]
        : [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]];

    const [mr, mc] = sqToRC(lastMove.to);
    for (const [dr, dc] of dirs) {
      let r = mr + dr;
      let c = mc + dc;
      let first: { sq: Square; type: PieceSymbol; color: Color } | null = null;
      let second: { sq: Square; type: PieceSymbol; color: Color } | null = null;

      while (r >= 0 && r < 8 && c >= 0 && c < 8) {
        const p = board[r][c];
        if (p) {
          const sq = rcToSq(r, c)!;
          if (!first) {
            first = { sq, type: p.type, color: p.color };
          } else {
            second = { sq, type: p.type, color: p.color };
            break;
          }
        }
        r += dr;
        c += dc;
      }

      if (first && second && first.color === opp && second.color === opp) {
        if (PIECE_VALUES[second.type] > PIECE_VALUES[first.type] && PIECE_VALUES[second.type] >= 500) {
          motifs.push({
            name: second.type === 'k' ? 'Absolute Pin' : 'Relative Pin',
            description: `${PIECE_NAMES[lastMove.piece]} on ${lastMove.to} pins the ${PIECE_NAMES[first.type]} on ${first.sq} against the ${PIECE_NAMES[second.type]} on ${second.sq} — Chapter 3.2.`,
            squares: [lastMove.to, first.sq, second.sq],
            arrows: [{ from: lastMove.to, to: second.sq, color: 'amber' }],
            chapterRef: 3,
          });
          break;
        } else if (PIECE_VALUES[first.type] > PIECE_VALUES[second.type] && PIECE_VALUES[first.type] >= 900 && PIECE_VALUES[second.type] >= 300) {
          motifs.push({
            name: 'Skewer',
            description: `${PIECE_NAMES[lastMove.piece]} on ${lastMove.to} skewers the ${PIECE_NAMES[first.type]} on ${first.sq} to reach the ${PIECE_NAMES[second.type]} behind it on ${second.sq} — Chapter 3.3.`,
            squares: [lastMove.to, first.sq, second.sq],
            arrows: [{ from: lastMove.to, to: second.sq, color: 'amber' }],
            chapterRef: 3,
          });
          break;
        }
      }
    }
  }

  // 4. Loose / Outnumbered Piece Check on Mover's Own Pieces (Chapter 2 & Chapter 7.3 LDPO)
  const enemyAttackers = getAttackersOf(chessAfter, lastMove.to, opp);
  const friendlyDefenders = getAttackersOf(chessAfter, lastMove.to, mover);
  if (enemyAttackers.length > 0 && friendlyDefenders.length === 0 && lastMove.piece !== 'p') {
    motifs.push({
      name: 'Loose Piece Warning (LDPO)',
      description: `Your ${PIECE_NAMES[lastMove.piece]} on ${lastMove.to} has no defenders and is attacked — remember John Nunn's rule: Loose Pieces Drop Off (Chapter 7.3).`,
      squares: [lastMove.to],
      arrows: [{ from: enemyAttackers[0], to: lastMove.to, color: 'crimson' }],
      chapterRef: 2,
    });
  } else if (enemyAttackers.length > friendlyDefenders.length && lastMove.piece !== 'p') {
    motifs.push({
      name: 'Outnumbered Piece',
      description: `${PIECE_NAMES[lastMove.piece]} on ${lastMove.to} has ${enemyAttackers.length} attackers vs ${friendlyDefenders.length} defender${friendlyDefenders.length === 1 ? '' : 's'} (Chapter 2.3).`,
      squares: [lastMove.to],
      arrows: [{ from: enemyAttackers[0], to: lastMove.to, color: 'crimson' }],
      chapterRef: 2,
    });
  }

  return motifs;
}

/**
 * Real-time Training Coach evaluation of the player's latest move.
 */
export function analyzeMoveWithCoach(
  fenBefore: string,
  move: Move,
  fenAfter: string,
  historySan: string[]
): CoachFeedback {
  const chessAfter = new Chess(fenAfter);
  const opening = detectOpening(historySan);

  // Check if early book move
  const isBookMove = opening !== null && historySan.length <= opening.moves.length;

  const beforeResult = evaluatePositionFast(fenBefore, 2);
  const afterResult = evaluatePositionFast(fenAfter, 2);

  const evalBefore = beforeResult.evalCp;
  const evalAfter = afterResult.evalCp;

  // Centipawn delta from the perspective of the player who just moved
  const moverSign = move.color === 'w' ? 1 : -1;
  const scoreBeforeForMover = evalBefore * moverSign;
  const scoreAfterForMover = evalAfter * moverSign;
  const cpLoss = Math.max(0, scoreBeforeForMover - scoreAfterForMover);

  const bestMove = beforeResult.move;
  const playedBest = bestMove?.san === move.san;
  const motifs = detectTacticalMotifs(chessAfter, move);

  let quality: MoveQuality = 'good';
  let symbol = '';
  let headline = 'Solid move';
  let explanation = 'Maintains a healthy balance on the board.';

  if (chessAfter.isCheckmate()) {
    quality = 'brilliant';
    symbol = '#';
    headline = 'Checkmate!';
    explanation = `${move.san} delivers a decisive checkmate — the opposing King has no escape.`;
  } else if (isBookMove && cpLoss < 75) {
    quality = 'book';
    symbol = 'Book';
    headline = `Opening theory (${opening.eco})`;
    explanation = `${opening.name}. ${opening.description}`;
  } else if (playedBest && motifs.some((m) => ['Fork (Double Attack)', 'Absolute Pin', 'Skewer'].includes(m.name))) {
    quality = 'brilliant';
    symbol = '!!';
    headline = 'Sharp tactical strike!';
    explanation = `${move.san} finds the strongest move and creates a concrete tactical motif.`;
  } else if (playedBest || cpLoss <= 25) {
    quality = 'best';
    symbol = '!';
    headline = 'Best move';
    explanation = `${move.san} keeps maximum pressure and preserves your best positional and tactical chances.`;
  } else if (cpLoss <= 70) {
    quality = 'good';
    symbol = '';
    headline = 'Good move';
    explanation = bestMove
      ? `${move.san} is playable. ${bestMove.san} was slightly more accurate.`
      : `${move.san} keeps your position solid.`;
  } else if (cpLoss <= 150) {
    quality = 'inaccuracy';
    symbol = '?!';
    headline = 'Inaccuracy';
    explanation = bestMove
      ? `${move.san} gives away a small edge. Consider ${bestMove.san} to stay more active.`
      : `${move.san} concedes slight initiative.`;
  } else if (cpLoss <= 280) {
    quality = 'mistake';
    symbol = '?';
    headline = 'Mistake';
    explanation = bestMove
      ? `${move.san} drops significant advantage. ${bestMove.san} was much stronger here.`
      : `${move.san} weakens your position noticeably.`;
  } else {
    quality = 'blunder';
    symbol = '??';
    headline = 'Blunder — tactical oversight!';
    const looseWarn = motifs.find((m) => m.name.includes('Loose') || m.name.includes('Outnumbered'));
    explanation = looseWarn
      ? `${looseWarn.description} Stronger was ${bestMove?.san ?? 'defending first'}.`
      : `${move.san} allows a decisive tactical reply. ${bestMove ? `${bestMove.san} kept you in the fight.` : ''}`;
  }

  return {
    moveSan: move.san,
    moveColor: move.color,
    quality,
    symbol,
    headline,
    explanation,
    evalBefore,
    evalAfter,
    cpLoss,
    bestMoveSan: bestMove?.san,
    bestMoveFrom: bestMove?.from,
    bestMoveTo: bestMove?.to,
    motifs,
    openingName: opening?.name,
    eco: opening?.eco,
  };
}

export interface PositionBriefing {
  turnLabel: string;
  planSummary: string;
  loosePieces: Square[];
  bestMove: Move | null;
  threatMove: Move | null;
  hintTier1: string;
  hintTier2Square: Square | null;
  hintTier3Arrow: BoardArrow | null;
}

/**
 * Generates an on-demand Training Coach briefing + 3-tier hints + opponent threat vision.
 */
export function getCoachPositionBriefing(fen: string): PositionBriefing {
  const chess = new Chess(fen);
  const turn = chess.turn();
  const opp: Color = turn === 'w' ? 'b' : 'w';
  const turnLabel = turn === 'w' ? 'White to move' : 'Black to move';

  const bestRes = evaluatePositionFast(fen, 2);
  const bestMove = bestRes.move;

  // Detect any loose pieces for the side to move (LDPO check)
  const loosePieces: Square[] = [];
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.color !== turn || p.type === 'k' || p.type === 'p') continue;
      const sq = rcToSq(r, c)!;
      const attackers = getAttackersOf(chess, sq, opp);
      const defenders = getAttackersOf(chess, sq, turn);
      if (attackers.length > defenders.length) {
        loosePieces.push(sq);
      }
    }
  }

  // Compute opponent threat if it were their turn (swap active color in FEN if not in check)
  let threatMove: Move | null = null;
  if (!chess.inCheck()) {
    const parts = fen.split(' ');
    parts[1] = opp;
    parts[3] = '-'; // clear ep for null-move threat check
    try {
      const swappedFen = parts.join(' ');
      const testChess = new Chess(swappedFen);
      if (!testChess.inCheck()) {
        const threatRes = evaluatePositionFast(swappedFen, 1);
        if (threatRes.move && (threatRes.move.captured || threatRes.move.san.includes('+') || threatRes.move.san.includes('#'))) {
          threatMove = threatRes.move;
        }
      }
    } catch {
      // Ignore invalid null-move FEN
    }
  }

  let planSummary = '';
  if (chess.inCheck()) {
    planSummary = 'Your King is in check! Remember the three ways out: Capture the checker, Block the line, or Move your King to safety.';
  } else if (loosePieces.length > 0) {
    planSummary = `Watch out: your piece on ${loosePieces.join(', ')} is loose or outnumbered. Defend it, move it to safety, or counterattack with a forcing check!`;
  } else if (bestMove?.san.includes('#')) {
    planSummary = 'Checkmate is on the board! Look closely at forcing checks against the enemy King.';
  } else if (bestMove?.captured) {
    planSummary = `Look for a concrete capture — check whether an enemy piece on ${bestMove.to} is undefended or outnumbered.`;
  } else if (bestMove?.san === 'O-O' || bestMove?.san === 'O-O-O') {
    planSummary = 'Your King is still in the center. Castling now secures your King and connects your Rooks.';
  } else {
    planSummary = 'Follow classical principles: check for forcing moves (checks, captures, threats), activate your least-active piece, and watch for loose enemy pieces.';
  }

  const hintTier1 = bestMove
    ? bestMove.san === 'O-O' || bestMove.san === 'O-O-O'
      ? 'Think about King safety — castling is your strongest move.'
      : bestMove.captured
      ? `Look for a winning capture with your ${PIECE_NAMES[bestMove.piece]}.`
      : bestMove.san.includes('+')
      ? `Find a forcing check using your ${PIECE_NAMES[bestMove.piece]}.`
      : `Improve your ${PIECE_NAMES[bestMove.piece]} to a more commanding square.`
    : 'No legal moves available.';

  return {
    turnLabel,
    planSummary,
    loosePieces,
    bestMove,
    threatMove,
    hintTier1,
    hintTier2Square: bestMove?.from ?? null,
    hintTier3Arrow: bestMove ? { from: bestMove.from, to: bestMove.to, color: 'emerald' } : null,
  };
}

export interface OpponentReplyCue {
  moveSan: string;
  severity: 'alert' | 'warning' | 'opportunity' | 'info';
  headline: string;
  guidance: string;
  arrows: BoardArrow[];
  highlightSquares: Square[];
}

/**
 * Interprets the computer/opponent's last move strictly from the USER's perspective:
 * alerts the user to checks, hanging pieces, forks/pins, or loose enemy pieces to punish.
 */
export function analyzeOpponentReplyForUser(
  fenAfter: string,
  opponentMove: { san: string; to: Square; from: Square; piece: PieceSymbol; color: Color; captured?: PieceSymbol },
  userColor: Color
): OpponentReplyCue {
  const chess = new Chess(fenAfter);
  const oppColor: Color = userColor === 'w' ? 'b' : 'w';
  const board = chess.board();

  // 1. User King is in check
  if (chess.inCheck()) {
    return {
      moveSan: opponentMove.san,
      severity: 'alert',
      headline: `Your King is in check (${opponentMove.san})`,
      guidance:
        'Respond to the check first: see if you can safely Capture the checking piece, Block the line, or Move your King to safety.',
      arrows: [{ from: opponentMove.from, to: opponentMove.to, color: 'crimson', opacity: 0.7 }],
      highlightSquares: [],
    };
  }

  // 2. Check if opponent created a Fork, Pin, or Skewer against the user
  const oppMotifs = detectTacticalMotifs(chess, opponentMove as Move);
  const dangerMotif = oppMotifs.find((m) =>
    ['Fork (Double Attack)', 'Absolute Pin', 'Relative Pin', 'Skewer'].includes(m.name)
  );
  if (dangerMotif) {
    return {
      moveSan: opponentMove.san,
      severity: 'warning',
      headline: `Watch out: Opponent threatens a ${dangerMotif.name}`,
      guidance: `After ${opponentMove.san}, check how to defend both targets, break the line, or counterattack with a check.`,
      arrows: dangerMotif.arrows ?? [],
      highlightSquares: dangerMotif.squares,
    };
  }

  // 3. Scan user's own pieces for newly threatened / loose pieces (LDPO)
  let highestThreat: { sq: Square; type: PieceSymbol; attackerSq: Square; val: number } | null = null;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.color !== userColor || p.type === 'k') continue;
      const sq = rcToSq(r, c);
      if (!sq) continue;
      const attackers = getAttackersOf(chess, sq, oppColor);
      if (attackers.length === 0) continue;
      const defenders = getAttackersOf(chess, sq, userColor);

      let lowerValueAttacker: Square | null = null;
      for (const attSq of attackers) {
        const attPiece = chess.get(attSq);
        if (attPiece && PIECE_VALUES[attPiece.type] < PIECE_VALUES[p.type]) {
          lowerValueAttacker = attSq;
          break;
        }
      }

      if (attackers.length > defenders.length || lowerValueAttacker) {
        const val = PIECE_VALUES[p.type];
        if (!highestThreat || val > highestThreat.val) {
          highestThreat = {
            sq,
            type: p.type,
            attackerSq: lowerValueAttacker ?? attackers[0],
            val,
          };
        }
      }
    }
  }

  if (highestThreat) {
    const pieceLabel = PIECE_NAMES[highestThreat.type];
    return {
      moveSan: opponentMove.san,
      severity: 'warning',
      headline: `Your ${pieceLabel} on ${highestThreat.sq} is under attack`,
      guidance: `${opponentMove.san} puts pressure on ${highestThreat.sq}. Check whether to move it, add a defender, trade cleanly, or counterattack.`,
      arrows: [{ from: highestThreat.attackerSq, to: highestThreat.sq, color: 'crimson', opacity: 0.78 }],
      highlightSquares: [highestThreat.sq],
    };
  }

  // 4. Opportunity: Did opponent leave their moved piece loose or hanging for the user?
  if (opponentMove.piece !== 'p' && opponentMove.piece !== 'k') {
    const userAttackers = getAttackersOf(chess, opponentMove.to, userColor);
    const oppDefenders = getAttackersOf(chess, opponentMove.to, oppColor);
    if (userAttackers.length > oppDefenders.length) {
      return {
        moveSan: opponentMove.san,
        severity: 'opportunity',
        headline: `Loose target on ${opponentMove.to}!`,
        guidance: `Opponent left their ${PIECE_NAMES[opponentMove.piece]} on ${opponentMove.to} outnumbered (${userAttackers.length} vs ${oppDefenders.length}). Check if capturing it is safe!`,
        arrows: [{ from: userAttackers[0], to: opponentMove.to, color: 'emerald', opacity: 0.78 }],
        highlightSquares: [opponentMove.to],
      };
    }
    if (oppDefenders.length === 0) {
      return {
        moveSan: opponentMove.san,
        severity: 'opportunity',
        headline: `Undefended ${PIECE_NAMES[opponentMove.piece]} on ${opponentMove.to}`,
        guidance: `Note Dr. Regis's LDPO rule: opponent's ${PIECE_NAMES[opponentMove.piece]} on ${opponentMove.to} has no defender — scan for a fork or tempo attack against it.`,
        arrows: [],
        highlightSquares: [opponentMove.to],
      };
    }
  }

  // 5. General constructive coaching cue for the user's upcoming move
  const oppWord = opponentMove.captured ? 'captures' : 'plays';
  return {
    moveSan: opponentMove.san,
    severity: 'info',
    headline: `Your turn — Opponent ${oppWord} ${opponentMove.san}`,
    guidance:
      'Before moving, scan in order: Checks, Captures, and Threats. Ensure your pieces stay defended and improve your least-active piece.',
    arrows: [],
    highlightSquares: [],
  };
}

