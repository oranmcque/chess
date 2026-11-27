import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { CheckCircle2, Lightbulb, RotateCcw, Swords } from 'lucide-react';
import type { BoardArrow, BoardThemeId, FundamentalLesson } from '../types/chess';
import { BOARD_THEMES } from '../data/boardThemes';
import { FUNDAMENTAL_LESSONS } from '../data/fundamentals';
import { chessAudio } from '../utils/sound';
import {
  loadCompletedFundamentalIds,
  saveCompletedFundamentalId,
  subscribeProgress,
} from '../utils/progression';
import { ChessBoard } from './ChessBoard';
import { ChessPieceSVG } from './ChessPieceSVG';
import { PlayerProfileBar } from './PlayerProfileBar';
import { PieceStyleSelector } from './PieceStyleSelector';

interface FundamentalsLabProps {
  boardThemeId: BoardThemeId;
  onPracticeFen: (fen: string) => void;
}

type CategoryFilter = 'all' | FundamentalLesson['category'];

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: 'All Techniques',
  basics: 'Basics',
  'special-moves': 'Special Moves',
  tactics: 'Advanced Tactics',
  'endgame-strategy': 'Endgame & Strategy',
};

const PIECE_REFERENCE: Array<{ type: PieceSymbol; name: string; letter: string; value: string; movement: string }> = [
  { type: 'p', name: 'Pawn', letter: '(none)', value: '1 pt', movement: 'Forward 1 (or 2 on first move), captures diagonally; promotes on final rank; en passant.' },
  { type: 'n', name: 'Knight', letter: 'N', value: '3 pts', movement: 'L-shape (2 + 1 squares); the only piece that leaps over others. Master of forks.' },
  { type: 'b', name: 'Bishop', letter: 'B', value: '3 pts', movement: 'Any distance diagonally on one square color; deadly in pins, skewers, and open games.' },
  { type: 'r', name: 'Rook', letter: 'R', value: '5 pts', movement: 'Any distance along ranks or files; castles with the King and dominates open files & 7th rank.' },
  { type: 'q', name: 'Queen', letter: 'Q', value: '9 pts', movement: 'Combines Rook and Bishop power in all 8 directions — strongest tactical attacker.' },
  { type: 'k', name: 'King', letter: 'K', value: 'Game', movement: '1 square in any direction (or 2 when castling); becomes a strong fighter in endgames.' },
];

const NOTATION_GUIDE = [
  { symbol: 'Rb5', meaning: 'White Rook moves to b5 (files a–h, ranks 1–8)' },
  { symbol: 'd6', meaning: 'Pawn moves to d6 (no "P" written for pawns)' },
  { symbol: 'Rxb8 / gxf4', meaning: 'Capture marked with "x" (pawns list starting file)' },
  { symbol: 'O-O / O-O-O', meaning: 'Kingside Castling / Queenside Castling' },
  { symbol: 'e8=Q / e8=N', meaning: 'Pawn promotes on the 8th rank to Queen or Knight' },
  { symbol: '+ / #', meaning: 'Check (+) and Checkmate (# or ++)' },
  { symbol: '! / !? / ?! / ?', meaning: 'Good (!), Risky (!?), Dodgy (?!), Bad (?)' },
];

export const FundamentalsLab: React.FC<FundamentalsLabProps> = ({ boardThemeId, onPracticeFen }) => {
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [lessonId, setLessonId] = useState<string>(FUNDAMENTAL_LESSONS[0].id);
  const [completedIds, setCompletedIds] = useState<string[]>(() =>
    loadCompletedFundamentalIds()
  );

  useEffect(() => {
    const sync = () => setCompletedIds(loadCompletedFundamentalIds());
    sync();
    return subscribeProgress(sync);
  }, []);

  const filteredLessons = useMemo(
    () => (filter === 'all' ? FUNDAMENTAL_LESSONS : FUNDAMENTAL_LESSONS.filter((l) => l.category === filter)),
    [filter]
  );

  const lesson = useMemo(
    () => FUNDAMENTAL_LESSONS.find((l) => l.id === lessonId) ?? FUNDAMENTAL_LESSONS[0],
    [lessonId]
  );

  const [fen, setFen] = useState<string>(lesson.fen);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square; san?: string } | null>(null);
  const [stepIdx, setStepIdx] = useState<number>(0);
  const [status, setStatus] = useState<'ready' | 'intro' | 'wrong' | 'done'>('ready');
  const [showArrowHint, setShowArrowHint] = useState<boolean>(false);
  const [wrongMsg, setWrongMsg] = useState<string>('');

  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const loadLesson = useCallback((target: FundamentalLesson) => {
    clearTimer();
    setFen(target.fen);
    setLastMove(null);
    setStepIdx(0);
    setShowArrowHint(false);
    setWrongMsg('');

    if (target.introMove) {
      setStatus('intro');
      timerRef.current = window.setTimeout(() => {
        const c = new Chess(target.fen);
        const m = c.move(target.introMove!);
        if (m) {
          chessAudio.playMove();
          setFen(c.fen());
          setLastMove({ from: m.from, to: m.to, san: m.san });
        }
        setStatus('ready');
      }, 650);
    } else {
      setStatus('ready');
    }
  }, []);

  useEffect(() => {
    loadLesson(lesson);
    return clearTimer;
  }, [lesson, loadLesson]);

  const markDone = (id: string) => {
    const next = saveCompletedFundamentalId(id);
    setCompletedIds(next);
  };

  const expectedMoveDetails = useMemo(() => {
    if (status === 'done' || status === 'intro' || stepIdx >= lesson.solutionMoves.length) return null;
    const c = new Chess(fen);
    try {
      const m = c.move(lesson.solutionMoves[stepIdx]);
      return m ? { from: m.from, to: m.to, san: m.san } : null;
    } catch {
      return null;
    }
  }, [fen, lesson.solutionMoves, stepIdx, status]);

  const handleMove = (from: Square, to: Square, promotion?: PieceSymbol): boolean => {
    if (status === 'done' || status === 'intro') return false;
    const c = new Chess(fen);
    let m;
    try {
      m = c.move({ from, to, promotion: promotion || 'q' });
    } catch {
      return false;
    }
    if (!m) return false;

    const expectedSan = lesson.solutionMoves[stepIdx];
    const norm = (s: string) => s.replace(/[+#!?]/g, '');
    const exactMatch = norm(m.san) === norm(expectedSan);

    if (!exactMatch) {
      chessAudio.playWrong();
      setStatus('wrong');
      if (expectedSan.includes('=N') && m.promotion && m.promotion !== 'n') {
        setWrongMsg(
          `You promoted to ${m.promotion.toUpperCase()}, but here underpromoting to a Knight (${expectedSan}) forks Black's King and Queen with check! Try again.`
        );
      } else {
        setWrongMsg(`${m.san} doesn't execute this drill's technique. Re-read the coach tip or show the move arrow.`);
      }
      return false;
    }

    const nextIdx = stepIdx + 1;
    const isFinished = nextIdx >= lesson.solutionMoves.length;

    if (isFinished || c.isCheckmate()) chessAudio.playVictory();
    else if (c.inCheck()) chessAudio.playCheck();
    else if (m.san === 'O-O' || m.san === 'O-O-O') chessAudio.playCastle();
    else if (m.promotion) chessAudio.playPromote();
    else if (m.captured) chessAudio.playCapture();
    else chessAudio.playMove();

    const nextFen = c.fen();
    setFen(nextFen);
    setLastMove({ from: m.from, to: m.to, san: m.san });
    setWrongMsg('');
    setShowArrowHint(false);

    if (isFinished) {
      setStepIdx(nextIdx);
      setStatus('done');
      markDone(lesson.id);
      return true;
    }

    // Play opponent reply in multi-step drills (e.g., Philidor's Legacy Smothered Mate)
    setStepIdx(nextIdx);
    setStatus('ready');
    timerRef.current = window.setTimeout(() => {
      const rc = new Chess(nextFen);
      const rm = rc.move(lesson.solutionMoves[nextIdx]);
      if (rm) {
        if (rm.captured) chessAudio.playCapture();
        else chessAudio.playMove();
        setFen(rc.fen());
        setLastMove({ from: rm.from, to: rm.to, san: rm.san });
        const afterReply = nextIdx + 1;
        setStepIdx(afterReply);
        if (afterReply >= lesson.solutionMoves.length) {
          setStatus('done');
          markDone(lesson.id);
          chessAudio.playVictory();
        }
      }
    }, 450);

    return true;
  };

  const boardArrows = useMemo<BoardArrow[]>(() => {
    const list: BoardArrow[] = [];
    if (showArrowHint && expectedMoveDetails) {
      list.push({ from: expectedMoveDetails.from, to: expectedMoveDetails.to, color: 'emerald' });
    } else if (status === 'ready' && lesson.arrows) {
      list.push(...lesson.arrows);
    }
    return list;
  }, [showArrowHint, expectedMoveDetails, status, lesson.arrows]);

  const theme = BOARD_THEMES[boardThemeId];

  return (
    <div className="w-full max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      {/* Header & Filter Bar */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-5 border-b border-white/8">
        <div>
          <p className="text-xs text-[#D99B38] font-medium mb-1">
            Interactive Rules, Special Moves &amp; Strategy
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#F2EFE9] tracking-tight">
            Chess Fundamentals &amp; Advanced Techniques
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PieceStyleSelector compact />
          <PlayerProfileBar compact />
          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#1A1C21] border border-white/8 rounded-lg">
            {(Object.keys(CATEGORY_LABELS) as CategoryFilter[]).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setFilter(cat);
                  const list = cat === 'all' ? FUNDAMENTAL_LESSONS : FUNDAMENTAL_LESSONS.filter((l) => l.category === cat);
                  if (list.length > 0 && !list.some((l) => l.id === lessonId)) {
                    setLessonId(list[0].id);
                  }
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  filter === cat
                    ? 'bg-[#D99B38] text-[#141517] font-semibold'
                    : 'text-[#A8A59E] hover:text-[#F2EFE9]'
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Interactive Drill Split */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,540px)_1fr] gap-6 items-start">
        {/* Left: Drill List */}
        <aside className="rounded-xl bg-[#1A1C21] border border-white/8 p-4 space-y-1.5">
          <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-white/8 text-xs text-[#9A9892]">
            <span>Interactive Drills</span>
            <span className="font-mono-tabular">
              {completedIds.length}/{FUNDAMENTAL_LESSONS.length}
            </span>
          </div>
          {filteredLessons.map((item) => {
            const active = item.id === lesson.id;
            const done = completedIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setLessonId(item.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                  active
                    ? 'bg-white/10 border-[#D99B38]/45 text-[#F2EFE9]'
                    : 'bg-transparent border-transparent hover:bg-white/5 text-[#CFCBC2]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold truncate">{item.title}</span>
                  {done && <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981] shrink-0" />}
                </div>
                <p className="text-[11px] text-[#8B8881] mt-0.5 truncate">{item.subtitle}</p>
              </button>
            );
          })}
        </aside>

        {/* Center: Live Practice Board */}
        <div className="w-full max-w-[540px] mx-auto">
          <div className="flex items-center justify-between text-xs text-[#9A9892] mb-2">
            <span className="text-[#F2EFE9] font-medium">
              {status === 'intro' ? 'Watch opponent’s setup move…' : 'Your turn — execute the technique'}
            </span>
            <span>{CATEGORY_LABELS[lesson.category]}</span>
          </div>

          <ChessBoard
            fen={fen}
            orientation={lesson.solverColor}
            theme={theme}
            interactive={status === 'ready' || status === 'wrong'}
            allowedColor={lesson.solverColor}
            lastMove={lastMove}
            arrows={boardArrows}
            highlights={lesson.highlightSquares}
            onMove={handleMove}
          />

          <div className="flex items-center justify-between gap-2 mt-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => loadLesson(lesson)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#1A1C21] border border-white/10 text-[#CFCBC2] hover:text-[#F2EFE9] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Drill
              </button>
              {status !== 'done' && (
                <button
                  type="button"
                  onClick={() => setShowArrowHint(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#10B981]/14 border border-[#10B981]/35 text-[#34D399] hover:bg-[#10B981]/22 cursor-pointer"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  Show Move Arrow
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => onPracticeFen(fen)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-white/6 border border-white/12 text-[#F2EFE9] hover:border-[#D99B38]/50 cursor-pointer whitespace-nowrap"
            >
              <Swords className="w-3.5 h-3.5 text-[#D99B38]" />
              Play vs Bot
            </button>
          </div>
        </div>

        {/* Right: Technique Explanation & Rules */}
        <section className="rounded-xl bg-[#1A1C21] border border-white/8 p-5 space-y-4">
          <div className="pb-3.5 border-b border-white/8">
            <p className="text-xs text-[#D99B38]">{lesson.subtitle}</p>
            <h2 className="font-display text-xl font-semibold text-[#F2EFE9] mt-1">
              {lesson.title}
            </h2>
          </div>

          <p className="text-sm text-[#E6E2D9] leading-relaxed">{lesson.summary}</p>

          <ul className="space-y-2 text-xs text-[#CFCBC2] leading-relaxed list-disc pl-4">
            {lesson.rules.map((rule, i) => (
              <li key={i}>{rule}</li>
            ))}
          </ul>

          <div className="p-3.5 rounded-lg bg-[#14161A] border border-white/8 text-xs text-[#CFCBC2] leading-relaxed">
            <span className="font-semibold text-[#F4D08A]">Coach Instruction: </span>
            {lesson.coachTip}
          </div>

          {status === 'wrong' && (
            <div className="p-3.5 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/35 text-xs text-[#FCA5A5] leading-relaxed">
              {wrongMsg}
            </div>
          )}

          {status === 'done' && (
            <div className="p-4 rounded-lg bg-[#10B981]/12 border border-[#10B981]/40 space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#34D399]">
                <CheckCircle2 className="w-4 h-4" />
                Technique Completed!
              </div>
              <p className="font-mono-tabular text-xs text-[#E6E2D9]">
                Executed: {lesson.solutionMoves.join(' ')}
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Reference Section: Piece Values & Algebraic Notation (PDF Pages 6–7) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-white/8">
        <section className="rounded-xl bg-[#1A1C21] border border-white/8 p-5">
          <h2 className="font-display text-lg font-semibold text-[#F2EFE9] mb-1">
            Pieces, Values &amp; Movement
          </h2>
          <p className="text-xs text-[#9A9892] mb-4">
            Core relative material scale and movement geometry
          </p>
          <div className="divide-y divide-white/8">
            {PIECE_REFERENCE.map((p) => (
              <div key={p.type} className="py-2.5 flex items-start gap-3">
                <div className="w-9 h-9 rounded-md bg-white/5 border border-white/8 p-1 shrink-0">
                  <ChessPieceSVG type={p.type} color="w" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-[#F2EFE9]">
                      {p.name}{' '}
                      <span className="font-mono-tabular text-xs font-normal text-[#9A9892]">
                        · Symbol {p.letter}
                      </span>
                    </span>
                    <span className="font-mono-tabular text-xs font-semibold text-[#D99B38]">
                      {p.value}
                    </span>
                  </div>
                  <p className="text-xs text-[#A8A59E] mt-0.5 leading-relaxed">{p.movement}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl bg-[#1A1C21] border border-white/8 p-5">
          <h2 className="font-display text-lg font-semibold text-[#F2EFE9] mb-1">
            How to Read &amp; Write Chess Notation
          </h2>
          <p className="text-xs text-[#9A9892] mb-4">
            From Pages 6–7 of Dr. Dave Regis’s Ten Steps to Learn Chess Tactics and Combinations
          </p>
          <div className="divide-y divide-white/8">
            {NOTATION_GUIDE.map((row) => (
              <div key={row.symbol} className="py-2.5 flex items-baseline justify-between gap-4">
                <span className="font-mono-tabular text-xs font-semibold text-[#F4D08A] shrink-0">
                  {row.symbol}
                </span>
                <span className="text-xs text-[#CFCBC2] text-right leading-relaxed">{row.meaning}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
