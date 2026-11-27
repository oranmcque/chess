import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type PieceSymbol, type Square } from 'chess.js';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Lightbulb,
  Play,
  RotateCcw,
  Swords,
} from 'lucide-react';
import type { BoardArrow, BoardThemeId, TacticsPuzzle } from '../types/chess';
import { BOARD_THEMES } from '../data/boardThemes';
import { COURSE_CHAPTERS, TACTICS_PUZZLES } from '../data/tacticsCourse';
import { chessAudio } from '../utils/sound';
import {
  loadSolvedPuzzleIds,
  saveSolvedPuzzleId,
  subscribeProgress,
} from '../utils/progression';
import { computeDailyStreak, getLocalDateKey, loadDailyProgress } from '../utils/dailyTactics';
import { ChessBoard } from './ChessBoard';
import { DailyTacticsSection } from './DailyTacticsSection';
import { PlayerProfileBar } from './PlayerProfileBar';
import { PieceStyleSelector } from './PieceStyleSelector';

interface TacticsAcademyProps {
  boardThemeId: BoardThemeId;
  initialChapter?: number;
  initialPuzzleId?: string;
  onPracticeFen: (fen: string) => void;
}

function buildStartPosition(puzzle: TacticsPuzzle): { fen: string; lastMove: { from: Square; to: Square; san: string } | null } {
  const chess = puzzle.fen ? new Chess(puzzle.fen) : new Chess();
  let last: { from: Square; to: Square; san: string } | null = null;
  if (puzzle.setupMoves) {
    for (const san of puzzle.setupMoves) {
      const m = chess.move(san);
      if (m) last = { from: m.from, to: m.to, san: m.san };
    }
  }
  return { fen: chess.fen(), lastMove: last };
}

export const TacticsAcademy: React.FC<TacticsAcademyProps> = ({
  boardThemeId,
  initialChapter,
  initialPuzzleId,
  onPracticeFen,
}) => {
  const [academyMode, setAcademyMode] = useState<'course' | 'daily'>('course');
  const [selectedChapter, setSelectedChapter] = useState<number>(initialChapter ?? 1);
  const [dailySolvedToday, setDailySolvedToday] = useState<boolean>(() =>
    loadDailyProgress().completedDates.includes(getLocalDateKey())
  );
  const [dailyStreak, setDailyStreak] = useState<number>(() =>
    computeDailyStreak(loadDailyProgress().completedDates)
  );
  const [solvedIds, setSolvedIds] = useState<string[]>(() => loadSolvedPuzzleIds());

  const chapterPuzzles = useMemo(
    () => TACTICS_PUZZLES.filter((p) => p.chapter === selectedChapter),
    [selectedChapter]
  );

  const [puzzleId, setPuzzleId] = useState<string>(
    initialPuzzleId ?? chapterPuzzles[0]?.id ?? TACTICS_PUZZLES[0].id
  );

  useEffect(() => {
    const syncAll = () => {
      const prog = loadDailyProgress();
      setDailySolvedToday(prog.completedDates.includes(getLocalDateKey()));
      setDailyStreak(computeDailyStreak(prog.completedDates));
      setSolvedIds(loadSolvedPuzzleIds());
    };
    syncAll();
    return subscribeProgress(syncAll);
  }, [academyMode]);

  useEffect(() => {
    if (initialChapter) {
      setSelectedChapter(initialChapter);
      setAcademyMode('course');
    }
  }, [initialChapter]);

  useEffect(() => {
    if (initialPuzzleId) {
      const found = TACTICS_PUZZLES.find((p) => p.id === initialPuzzleId);
      if (found) {
        setSelectedChapter(found.chapter);
        setPuzzleId(found.id);
        setAcademyMode('course');
      }
    }
  }, [initialPuzzleId]);

  const puzzle = useMemo(
    () => TACTICS_PUZZLES.find((p) => p.id === puzzleId) ?? chapterPuzzles[0] ?? TACTICS_PUZZLES[0],
    [puzzleId, chapterPuzzles]
  );

  const chapterMeta = useMemo(
    () => COURSE_CHAPTERS.find((c) => c.number === puzzle.chapter) ?? COURSE_CHAPTERS[0],
    [puzzle.chapter]
  );

  const [fen, setFen] = useState<string>(() => buildStartPosition(puzzle).fen);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square; san?: string } | null>(
    () => buildStartPosition(puzzle).lastMove
  );
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [status, setStatus] = useState<'solving' | 'wrong' | 'solved' | 'replaying'>('solving');
  const [wrongMessage, setWrongMessage] = useState<string>('');
  const [hintTier, setHintTier] = useState<0 | 1 | 2 | 3>(0);

  const replyTimerRef = useRef<number | null>(null);
  const replayTimerRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (replyTimerRef.current) {
      window.clearTimeout(replyTimerRef.current);
      replyTimerRef.current = null;
    }
    if (replayTimerRef.current) {
      window.clearInterval(replayTimerRef.current);
      replayTimerRef.current = null;
    }
  };

  const resetPuzzle = useCallback((target: TacticsPuzzle) => {
    clearTimers();
    const init = buildStartPosition(target);
    setFen(init.fen);
    setLastMove(init.lastMove);
    setStepIndex(0);
    setStatus('solving');
    setWrongMessage('');
    setHintTier(0);
  }, []);

  useEffect(() => {
    resetPuzzle(puzzle);
    return clearTimers;
  }, [puzzle, resetPuzzle]);

  const markSolved = useCallback((id: string) => {
    const next = saveSolvedPuzzleId(id);
    setSolvedIds(next);
  }, []);

  // Compute next expected move details for hints
  const expectedMoveDetails = useMemo(() => {
    if (status === 'solved' || stepIndex >= puzzle.solutionMoves.length) return null;
    const expectedSan = puzzle.solutionMoves[stepIndex];
    const c = new Chess(fen);
    try {
      const m = c.move(expectedSan);
      return m ? { from: m.from, to: m.to, san: m.san } : null;
    } catch {
      return null;
    }
  }, [fen, puzzle.solutionMoves, stepIndex, status]);

  const handleMove = (from: Square, to: Square, promotion?: PieceSymbol): boolean => {
    if (status === 'solved' || status === 'replaying') return false;
    const chess = new Chess(fen);
    let attempted;
    try {
      attempted = chess.move({ from, to, promotion: promotion || 'q' });
    } catch {
      return false;
    }
    if (!attempted) return false;

    const expectedSan = puzzle.solutionMoves[stepIndex];
    // Compare normalized SAN (ignoring trailing +/# differences in case of variation)
    const norm = (s: string) => s.replace(/[+#!?]/g, '');
    const isCorrect = norm(attempted.san) === norm(expectedSan) || chess.isCheckmate();

    if (!isCorrect) {
      chessAudio.playWrong();
      setStatus('wrong');
      setWrongMessage(
        `${attempted.san} is not the sharpest tactical strike here. Look again or ask the coach for a hint!`
      );
      return false;
    }

    const nextIdx = stepIndex + 1;
    const isFinished = nextIdx >= puzzle.solutionMoves.length || chess.isCheckmate();

    if (isFinished) {
      chessAudio.playVictory();
    } else if (chess.inCheck()) {
      chessAudio.playCheck();
    } else if (attempted.captured) {
      chessAudio.playCapture();
    } else {
      chessAudio.playMove();
    }

    const nextFen = chess.fen();
    setFen(nextFen);
    setLastMove({ from: attempted.from, to: attempted.to, san: attempted.san });
    setWrongMessage('');
    setHintTier(0);

    if (isFinished) {
      setStepIndex(nextIdx);
      setStatus('solved');
      markSolved(puzzle.id);
      return true;
    }

    // Opponent auto-reply after smooth pause
    setStatus('solving');
    setStepIndex(nextIdx);
    replyTimerRef.current = window.setTimeout(() => {
      const replyChess = new Chess(nextFen);
      const replySan = puzzle.solutionMoves[nextIdx];
      const replyMove = replyChess.move(replySan);
      if (replyMove) {
        if (replyMove.captured) chessAudio.playCapture();
        else chessAudio.playMove();
        setFen(replyChess.fen());
        setLastMove({ from: replyMove.from, to: replyMove.to, san: replyMove.san });
        const afterReplyIdx = nextIdx + 1;
        setStepIndex(afterReplyIdx);
        if (afterReplyIdx >= puzzle.solutionMoves.length) {
          setStatus('solved');
          markSolved(puzzle.id);
          chessAudio.playVictory();
        }
      }
    }, 440);

    return true;
  };

  // Dr. Dave Regis's signature feature: Play the short opening from Move 1 up to the diagram!
  const handleReplayOpening = () => {
    if (!puzzle.setupMoves || puzzle.setupMoves.length === 0) return;
    clearTimers();
    setStatus('replaying');
    setWrongMessage('');
    setHintTier(0);

    const replayChess = new Chess();
    setFen(replayChess.fen());
    setLastMove(null);

    let i = 0;
    replayTimerRef.current = window.setInterval(() => {
      if (!puzzle.setupMoves || i >= puzzle.setupMoves.length) {
        clearTimers();
        setStepIndex(0);
        setStatus('solving');
        return;
      }
      const m = replayChess.move(puzzle.setupMoves[i]);
      if (m) {
        if (m.captured) chessAudio.playCapture();
        else chessAudio.playMove();
        setFen(replayChess.fen());
        setLastMove({ from: m.from, to: m.to, san: m.san });
      }
      i++;
    }, 480);
  };

  const handleRevealSolution = () => {
    clearTimers();
    const init = buildStartPosition(puzzle);
    const sim = new Chess(init.fen);
    setFen(init.fen);
    setLastMove(init.lastMove);
    setStatus('replaying');

    let i = 0;
    replayTimerRef.current = window.setInterval(() => {
      if (i >= puzzle.solutionMoves.length) {
        clearTimers();
        setStepIndex(puzzle.solutionMoves.length);
        setStatus('solved');
        return;
      }
      const m = sim.move(puzzle.solutionMoves[i]);
      if (m) {
        if (sim.isCheckmate()) chessAudio.playVictory();
        else if (sim.inCheck()) chessAudio.playCheck();
        else if (m.captured) chessAudio.playCapture();
        else chessAudio.playMove();
        setFen(sim.fen());
        setLastMove({ from: m.from, to: m.to, san: m.san });
      }
      i++;
    }, 650);
  };

  const allIdx = TACTICS_PUZZLES.findIndex((p) => p.id === puzzle.id);
  const goToPuzzleOffset = (delta: number) => {
    const next = TACTICS_PUZZLES[allIdx + delta];
    if (next) {
      setSelectedChapter(next.chapter);
      setPuzzleId(next.id);
    }
  };

  const boardArrows = useMemo<BoardArrow[]>(() => {
    const list: BoardArrow[] = [];
    if (hintTier >= 3 && expectedMoveDetails) {
      list.push({ from: expectedMoveDetails.from, to: expectedMoveDetails.to, color: 'emerald' });
    }
    if (status === 'solved' && puzzle.visualArrows) {
      list.push(...puzzle.visualArrows);
    }
    return list;
  }, [hintTier, expectedMoveDetails, status, puzzle.visualArrows]);

  const theme = BOARD_THEMES[boardThemeId];

  return (
    <div className="w-full max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Academy Header & Section Switcher */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-5 mb-6 border-b border-white/8">
        <div>
          <p className="text-xs text-[#D99B38] font-medium mb-1">
            Dr. Dave Regis · Exeter Chess Club
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#F2EFE9] tracking-tight">
            {academyMode === 'daily'
              ? 'Daily Tactics Challenge'
              : 'Ten Steps to Learn Chess Tactics and Combinations'}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <PieceStyleSelector compact />
          <PlayerProfileBar compact />

          <div className="font-mono-tabular text-xs text-[#9A9892]">
            {academyMode === 'course' ? (
              <>
                <span className="text-[#F2EFE9] font-semibold">{solvedIds.length}</span> /{' '}
                {TACTICS_PUZZLES.length} solved
              </>
            ) : (
              <>
                Streak: <span className="text-[#F4D08A] font-semibold">{dailyStreak}d</span>
              </>
            )}
          </div>

          <div className="flex items-center p-1 bg-[#1A1C21] border border-white/8 rounded-lg">
            <button
              type="button"
              onClick={() => setAcademyMode('course')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                academyMode === 'course'
                  ? 'bg-[#D99B38] text-[#141517] font-semibold'
                  : 'text-[#A8A59E] hover:text-[#F2EFE9]'
              }`}
            >
              10-Step Course
            </button>
            <button
              type="button"
              onClick={() => setAcademyMode('daily')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                academyMode === 'daily'
                  ? 'bg-[#D99B38] text-[#141517] font-semibold'
                  : 'text-[#A8A59E] hover:text-[#F2EFE9]'
              }`}
            >
              Daily Tactics {dailySolvedToday ? '· Done' : '· New'}
            </button>
          </div>
        </div>
      </div>

      {academyMode === 'daily' ? (
        <DailyTacticsSection boardThemeId={boardThemeId} onPracticeFen={onPracticeFen} />
      ) : (
        <>

      {/* 10-Step Chapter Selector Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-1.5 mb-6">
        {COURSE_CHAPTERS.map((ch) => {
          const puzzlesInCh = TACTICS_PUZZLES.filter((p) => p.chapter === ch.number);
          const solvedInCh = puzzlesInCh.filter((p) => solvedIds.includes(p.id)).length;
          const active = selectedChapter === ch.number;

          return (
            <button
              key={ch.number}
              type="button"
              onClick={() => {
                setSelectedChapter(ch.number);
                const first = TACTICS_PUZZLES.find((p) => p.chapter === ch.number);
                if (first) setPuzzleId(first.id);
              }}
              className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                active
                  ? 'bg-[#D99B38]/16 border-[#D99B38]/55 text-[#F2EFE9]'
                  : 'bg-[#1A1C21] border-white/8 text-[#A8A59E] hover:text-[#F2EFE9] hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between gap-1 font-mono-tabular text-[11px]">
                <span className={active ? 'text-[#F4D08A] font-semibold' : 'text-[#8B8881]'}>
                  Step {ch.number}
                </span>
                <span className="text-[10px] text-[#7D7B76]">
                  {solvedInCh}/{puzzlesInCh.length}
                </span>
              </div>
              <p className="text-xs font-medium mt-1 truncate">{ch.title}</p>
            </button>
          );
        })}
      </div>

      {/* 3-Column Tactics Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-[270px_minmax(0,560px)_1fr] gap-6 items-start">
        {/* Left: Chapter Overview & Game List */}
        <aside className="rounded-xl bg-[#1A1C21] border border-white/8 p-4 space-y-4">
          <div className="pb-3 border-b border-white/8">
            <p className="text-xs text-[#9A9892]">
              Chapter {chapterMeta.number} · {chapterMeta.pageRange}
            </p>
            <h2 className="font-display text-base font-semibold text-[#F2EFE9] mt-1">
              {chapterMeta.title}
            </h2>
            <p className="text-xs text-[#A8A59E] leading-relaxed mt-2">
              {chapterMeta.summary}
            </p>
          </div>

          <div className="space-y-1 max-h-[430px] overflow-y-auto pr-1">
            {chapterPuzzles.map((item) => {
              const isSelected = item.id === puzzle.id;
              const isSolved = solvedIds.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPuzzleId(item.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-white/10 border-[#D99B38]/45 text-[#F2EFE9]'
                      : 'bg-transparent border-transparent hover:bg-white/5 text-[#CFCBC2]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold truncate">{item.title}</span>
                    {isSolved && <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981] shrink-0" />}
                  </div>
                  <p className="text-[11px] text-[#8B8881] mt-0.5 truncate">
                    {item.subchapter} · p.{item.pageNumber}
                  </p>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Center: Interactive Course Board */}
        <div className="w-full max-w-[560px] mx-auto">
          <div className="flex items-center justify-between gap-2 mb-2.5 text-xs text-[#A8A59E]">
            <span className="font-medium text-[#F2EFE9]">
              {puzzle.solverColor === 'w' ? 'White to move' : 'Black to move'}
            </span>
            <span className="font-mono-tabular">
              PDF Page {puzzle.pageNumber}
              {puzzle.eco ? ` · ECO ${puzzle.eco}` : ''}
            </span>
          </div>

          <ChessBoard
            fen={fen}
            orientation={puzzle.solverColor}
            theme={theme}
            interactive={status !== 'solved' && status !== 'replaying'}
            allowedColor={puzzle.solverColor}
            lastMove={lastMove}
            arrows={boardArrows}
            hintSquare={hintTier >= 2 && expectedMoveDetails ? expectedMoveDetails.from : null}
            onMove={handleMove}
          />

          {/* Bottom Board Navigation */}
          <div className="flex items-center justify-between gap-2 mt-3">
            <button
              type="button"
              onClick={() => goToPuzzleOffset(-1)}
              disabled={allIdx <= 0}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg bg-[#1A1C21] border border-white/10 text-[#CFCBC2] hover:text-[#F2EFE9] disabled:opacity-35 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>

            <div className="flex items-center gap-2">
              {puzzle.setupMoves && puzzle.setupMoves.length > 0 && (
                <button
                  type="button"
                  onClick={handleReplayOpening}
                  disabled={status === 'replaying'}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#1A1C21] border border-white/10 text-[#F4D08A] hover:border-[#D99B38]/50 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5" />
                  Replay Opening ({puzzle.setupMoves.length} plies)
                </button>
              )}
              <button
                type="button"
                onClick={() => resetPuzzle(puzzle)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#1A1C21] border border-white/10 text-[#CFCBC2] hover:text-[#F2EFE9] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            </div>

            <button
              type="button"
              onClick={() => goToPuzzleOffset(1)}
              disabled={allIdx >= TACTICS_PUZZLES.length - 1}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg bg-[#D99B38] text-[#141517] font-semibold hover:bg-[#E4AA49] disabled:opacity-35 cursor-pointer"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right: Coaching Briefing, Moves & Solution */}
        <section className="rounded-xl bg-[#1A1C21] border border-white/8 p-5 space-y-4">
          <div className="pb-3.5 border-b border-white/8">
            <p className="text-xs text-[#9A9892]">
              {puzzle.subchapter}
              {puzzle.players ? ` · ${puzzle.players}` : ''}
              {puzzle.event ? ` · ${puzzle.event}` : ''}
            </p>
            <h2 className="font-display text-xl font-semibold text-[#F2EFE9] mt-1">
              {puzzle.title}
            </h2>
            <p className="text-xs text-[#A8A59E] mt-1.5">
              Themes: {puzzle.themes.join(' · ')}
            </p>
          </div>

          <p className="text-sm text-[#E6E2D9] leading-relaxed">{puzzle.prompt}</p>

          {/* Status Feedback */}
          {status === 'wrong' && (
            <div className="p-3.5 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/35 text-xs text-[#FCA5A5] leading-relaxed">
              {wrongMessage}
            </div>
          )}

          {status === 'solved' && (
            <div className="p-4 rounded-lg bg-[#10B981]/12 border border-[#10B981]/40 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#34D399]">
                <CheckCircle2 className="w-4 h-4" />
                Tactic Mastered!
              </div>
              <p className="text-xs text-[#E6E2D9] leading-relaxed">{puzzle.explanation}</p>
              <p className="font-mono-tabular text-xs text-[#34D399] pt-1">
                Solution: {puzzle.solutionMoves.join(' ')}
              </p>
            </div>
          )}

          {status === 'replaying' && (
            <div className="p-3 rounded-lg bg-[#D99B38]/10 border border-[#D99B38]/35 text-xs text-[#F4D08A]">
              Stepping through the moves on the board…
            </div>
          )}

          {/* Progressive Coach Hints */}
          {status !== 'solved' && (
            <div className="space-y-2.5 pt-1">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setHintTier((h) => (h < 3 ? ((h + 1) as 1 | 2 | 3) : 3))}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#10B981]/14 border border-[#10B981]/35 text-[#34D399] hover:bg-[#10B981]/22 transition-colors cursor-pointer"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  {hintTier === 0
                    ? 'Coach Hint'
                    : hintTier === 1
                    ? 'Highlight Piece'
                    : 'Show Move Arrow'}
                </button>

                <button
                  type="button"
                  onClick={handleRevealSolution}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-white/5 border border-white/10 text-[#CFCBC2] hover:text-[#F2EFE9] transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Animate Solution
                </button>
              </div>

              {hintTier >= 1 && (
                <div className="p-3 rounded-lg bg-[#14161A] border border-white/8 text-xs text-[#CFCBC2] leading-relaxed">
                  <span className="font-semibold text-[#34D399]">Coach Clue: </span>
                  {puzzle.hintText}
                </div>
              )}
            </div>
          )}

          {/* Opening Moves Notation from the PDF */}
          {puzzle.setupMoves && puzzle.setupMoves.length > 0 && (
            <div className="pt-3 border-t border-white/8">
              <p className="text-xs font-semibold text-[#9A9892] mb-1.5">
                Game Opening Leading to Diagram
              </p>
              <p className="font-mono-tabular text-xs text-[#CFCBC2] leading-relaxed">
                {puzzle.setupMoves
                  .map((san, idx) => (idx % 2 === 0 ? `${Math.floor(idx / 2) + 1}.${san}` : san))
                  .join(' ')}
              </p>
            </div>
          )}

          {/* Practice vs Engine Action */}
          <div className="pt-3 border-t border-white/8 flex items-center justify-between gap-2">
            <p className="text-xs text-[#8B8881]">
              Want to test alternative lines against the engine?
            </p>
            <button
              type="button"
              onClick={() => onPracticeFen(buildStartPosition(puzzle).fen)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-white/6 border border-white/12 text-[#F2EFE9] hover:border-[#D99B38]/50 transition-colors whitespace-nowrap cursor-pointer shrink-0"
            >
              <Swords className="w-3.5 h-3.5 text-[#D99B38]" />
              Play vs Bot
            </button>
          </div>
        </section>
      </div>
        </>
      )}
    </div>
  );
};
