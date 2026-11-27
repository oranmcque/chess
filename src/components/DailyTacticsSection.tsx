import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type PieceSymbol, type Square } from 'chess.js';
import {
  Calendar,
  CheckCircle2,
  Eye,
  Flame,
  Lightbulb,
  RefreshCw,
  RotateCcw,
  Shuffle,
  Swords,
} from 'lucide-react';
import type { BoardArrow, BoardThemeId } from '../types/chess';
import type { DailyDifficulty, DailyTacticPuzzle } from '../data/dailyTactics';
import { BOARD_THEMES } from '../data/boardThemes';
import {
  computeDailyStreak,
  fetchDailyTactic,
  formatReadableDate,
  generateChallengingPuzzle,
  getCuratedDailyPuzzle,
  getLocalDateKey,
  loadDailyProgress,
  markDailyPuzzleSolved,
  type DailyProgressState,
} from '../utils/dailyTactics';
import { chessAudio } from '../utils/sound';
import { subscribeProgress } from '../utils/progression';
import { ChessBoard } from './ChessBoard';

interface DailyTacticsSectionProps {
  boardThemeId: BoardThemeId;
  onPracticeFen: (fen: string) => void;
}

const DIFFICULTY_LABELS: Record<DailyDifficulty | 'any', string> = {
  any: 'All Levels',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  pro: 'Pro',
};

export const DailyTacticsSection: React.FC<DailyTacticsSectionProps> = ({
  boardThemeId,
  onPracticeFen,
}) => {
  const todayKey = getLocalDateKey();
  const [dailyPuzzle, setDailyPuzzle] = useState<DailyTacticPuzzle>(() =>
    getCuratedDailyPuzzle(todayKey)
  );
  const [activePuzzle, setActivePuzzle] = useState<DailyTacticPuzzle>(() =>
    getCuratedDailyPuzzle(todayKey)
  );
  const [isDailyMode, setIsDailyMode] = useState<boolean>(true);
  const [isFetchingDaily, setIsFetchingDaily] = useState<boolean>(true);
  const [genDifficulty, setGenDifficulty] = useState<DailyDifficulty | 'any'>('any');
  const [dailyProgress, setDailyProgress] = useState<DailyProgressState>(() =>
    loadDailyProgress()
  );

  const [fen, setFen] = useState<string>(activePuzzle.fen);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square; san?: string } | null>(
    activePuzzle.setupLastMove ?? null
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

  const resetToPuzzle = useCallback((puzzle: DailyTacticPuzzle) => {
    clearTimers();
    setFen(puzzle.fen);
    setLastMove(puzzle.setupLastMove ?? null);
    setStepIndex(0);
    setStatus('solving');
    setWrongMessage('');
    setHintTier(0);
  }, []);

  // Load today's daily tactic (tries live fetch with verified fallback)
  const loadTodayPuzzle = useCallback(async (forceRefresh = false) => {
    setIsFetchingDaily(true);
    const fetched = await fetchDailyTactic(forceRefresh);
    setDailyPuzzle(fetched);
    setIsDailyMode(true);
    setActivePuzzle(fetched);
    setIsFetchingDaily(false);
  }, []);

  useEffect(() => {
    loadTodayPuzzle(false);
    return clearTimers;
  }, [loadTodayPuzzle]);

  useEffect(() => {
    const sync = () => setDailyProgress(loadDailyProgress());
    sync();
    return subscribeProgress(sync);
  }, []);

  useEffect(() => {
    resetToPuzzle(activePuzzle);
    return clearTimers;
  }, [activePuzzle, resetToPuzzle]);

  const expectedMoveDetails = useMemo(() => {
    if (status === 'solved' || stepIndex >= activePuzzle.solutionMoves.length) return null;
    const c = new Chess(fen);
    try {
      const m = c.move(activePuzzle.solutionMoves[stepIndex]);
      return m ? { from: m.from, to: m.to, san: m.san } : null;
    } catch {
      return null;
    }
  }, [fen, activePuzzle.solutionMoves, stepIndex, status]);

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

    const expectedSan = activePuzzle.solutionMoves[stepIndex];
    const norm = (s: string) => s.replace(/[+#!?]/g, '');
    const isCorrect = norm(attempted.san) === norm(expectedSan) || chess.isCheckmate();

    if (!isCorrect) {
      chessAudio.playWrong();
      setStatus('wrong');
      setWrongMessage(
        `${attempted.san} misses the sharpest tactical continuation. Re-evaluate the position or reveal a hint.`
      );
      return false;
    }

    const nextIdx = stepIndex + 1;
    const isFinished = nextIdx >= activePuzzle.solutionMoves.length || chess.isCheckmate();

    if (isFinished) chessAudio.playVictory();
    else if (chess.inCheck()) chessAudio.playCheck();
    else if (attempted.promotion) chessAudio.playPromote();
    else if (attempted.captured) chessAudio.playCapture();
    else chessAudio.playMove();

    const nextFen = chess.fen();
    setFen(nextFen);
    setLastMove({ from: attempted.from, to: attempted.to, san: attempted.san });
    setWrongMessage('');
    setHintTier(0);

    if (isFinished) {
      setStepIndex(nextIdx);
      setStatus('solved');
      const nextProg = markDailyPuzzleSolved(activePuzzle, isDailyMode);
      setDailyProgress(nextProg);
      return true;
    }

    // Play opponent's forced reply
    setStatus('solving');
    setStepIndex(nextIdx);
    replyTimerRef.current = window.setTimeout(() => {
      const replyChess = new Chess(nextFen);
      const replyMove = replyChess.move(activePuzzle.solutionMoves[nextIdx]);
      if (replyMove) {
        if (replyMove.captured) chessAudio.playCapture();
        else chessAudio.playMove();
        setFen(replyChess.fen());
        setLastMove({ from: replyMove.from, to: replyMove.to, san: replyMove.san });
        const afterReply = nextIdx + 1;
        setStepIndex(afterReply);
        if (afterReply >= activePuzzle.solutionMoves.length) {
          setStatus('solved');
          const nextProg = markDailyPuzzleSolved(activePuzzle, isDailyMode);
          setDailyProgress(nextProg);
          chessAudio.playVictory();
        }
      }
    }, 440);

    return true;
  };

  const handleAnimateSolution = () => {
    clearTimers();
    setFen(activePuzzle.fen);
    setLastMove(activePuzzle.setupLastMove ?? null);
    setStatus('replaying');

    const sim = new Chess(activePuzzle.fen);
    let i = 0;
    replayTimerRef.current = window.setInterval(() => {
      if (i >= activePuzzle.solutionMoves.length) {
        clearTimers();
        setStepIndex(activePuzzle.solutionMoves.length);
        setStatus('solved');
        return;
      }
      const m = sim.move(activePuzzle.solutionMoves[i]);
      if (m) {
        if (sim.isCheckmate()) chessAudio.playVictory();
        else if (sim.inCheck()) chessAudio.playCheck();
        else if (m.captured) chessAudio.playCapture();
        else chessAudio.playMove();
        setFen(sim.fen());
        setLastMove({ from: m.from, to: m.to, san: m.san });
      }
      i++;
    }, 660);
  };

  const handleGenerateChallenge = () => {
    const next = generateChallengingPuzzle(genDifficulty, activePuzzle.id);
    setIsDailyMode(false);
    setActivePuzzle(next);
  };

  const handleSwitchToToday = () => {
    setIsDailyMode(true);
    setActivePuzzle(dailyPuzzle);
  };

  const boardArrows = useMemo<BoardArrow[]>(() => {
    const list: BoardArrow[] = [];
    if (hintTier >= 3 && expectedMoveDetails) {
      list.push({ from: expectedMoveDetails.from, to: expectedMoveDetails.to, color: 'emerald' });
    }
    if (status === 'solved' && activePuzzle.visualArrows) {
      list.push(...activePuzzle.visualArrows);
    }
    return list;
  }, [hintTier, expectedMoveDetails, status, activePuzzle.visualArrows]);

  const theme = BOARD_THEMES[boardThemeId];
  const streak = computeDailyStreak(dailyProgress.completedDates);
  const todaySolved = dailyProgress.completedDates.includes(todayKey);
  const currentPuzzleAlreadySolved = isDailyMode
    ? todaySolved
    : dailyProgress.bonusSolvedIds.includes(activePuzzle.id);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[270px_minmax(0,560px)_1fr] gap-6 items-start">
      {/* Left: Daily Tracker & Challenge Generator */}
      <aside className="rounded-xl bg-[#1A1C21] border border-white/8 p-4 space-y-5">
        <div className="pb-3.5 border-b border-white/8 space-y-1">
          <div className="flex items-center gap-2 text-xs text-[#D99B38] font-medium">
            <Calendar className="w-3.5 h-3.5" />
            <span>{formatReadableDate(todayKey)}</span>
          </div>
          <h2 className="font-display text-lg font-semibold text-[#F2EFE9]">
            Daily Tactics
          </h2>
          <p className="text-xs text-[#9A9892] leading-relaxed">
            A fresh tactical challenge every calendar day, plus on-demand puzzles graded from Intermediate to Pro.
          </p>
        </div>

        {/* Streak & Daily Completion Summary */}
        <div className="grid grid-cols-2 divide-x divide-white/8 rounded-lg bg-[#14161A] py-2.5 text-xs">
          <div className="px-3">
            <div className="flex items-center gap-1.5 text-[#9A9892]">
              <Flame className="w-3.5 h-3.5 text-[#D99B38]" />
              <span>Streak</span>
            </div>
            <p className="font-mono-tabular text-base font-semibold text-[#F2EFE9] mt-0.5">
              {streak} {streak === 1 ? 'day' : 'days'}
            </p>
          </div>
          <div className="px-3">
            <span className="text-[#9A9892]">Daily Solved</span>
            <p className="font-mono-tabular text-base font-semibold text-[#F2EFE9] mt-0.5">
              {dailyProgress.completedDates.length}
            </p>
          </div>
        </div>

        {/* Today's Daily Puzzle Button */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleSwitchToToday}
            className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors cursor-pointer ${
              isDailyMode
                ? 'bg-[#D99B38]/16 border-[#D99B38]/55 text-[#F2EFE9]'
                : 'bg-[#14161A] border-white/8 text-[#CFCBC2] hover:border-white/20'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">Today’s Daily Puzzle</span>
              {todaySolved && <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981] shrink-0" />}
            </div>
            <p className="text-[11px] text-[#9A9892] mt-0.5 truncate">
              {isFetchingDaily ? 'Loading daily challenge…' : dailyPuzzle.title}
            </p>
          </button>

          <button
            type="button"
            onClick={() => loadTodayPuzzle(true)}
            disabled={isFetchingDaily}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-white/5 border border-white/8 text-[#CFCBC2] hover:text-[#F2EFE9] disabled:opacity-40 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetchingDaily ? 'animate-spin' : ''}`} />
            {isFetchingDaily ? 'Fetching Today’s Puzzle…' : 'Refresh Daily Fetch'}
          </button>
        </div>

        {/* On-Demand Challenging Puzzle Generator */}
        <div className="pt-4 border-t border-white/8 space-y-2.5">
          <p className="text-xs font-semibold text-[#F2EFE9]">Bonus Challenge Generator</p>
          <p className="text-[11px] text-[#8B8881] leading-relaxed">
            Want extra practice after today’s tactic? Generate a challenging multi-move puzzle by skill tier.
          </p>

          <select
            aria-label="Challenge difficulty"
            value={genDifficulty}
            onChange={(e) => setGenDifficulty(e.target.value as DailyDifficulty | 'any')}
            className="w-full px-3 py-2 text-xs font-medium bg-[#14161A] border border-white/10 rounded-lg text-[#F2EFE9] focus:outline-none focus:border-[#D99B38] cursor-pointer"
          >
            {(Object.keys(DIFFICULTY_LABELS) as Array<DailyDifficulty | 'any'>).map((d) => (
              <option key={d} value={d}>
                Tier: {DIFFICULTY_LABELS[d]}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleGenerateChallenge}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-[#D99B38] text-[#141517] hover:bg-[#E4AA49] transition-colors cursor-pointer"
          >
            <Shuffle className="w-3.5 h-3.5" />
            Generate New Puzzle
          </button>
        </div>
      </aside>

      {/* Center: Interactive Daily Tactics Board */}
      <div className="w-full max-w-[560px] mx-auto">
        <div className="flex items-center justify-between gap-2 mb-2.5 text-xs text-[#A8A59E]">
          <span className="font-medium text-[#F2EFE9]">
            {activePuzzle.solverColor === 'w' ? 'White to move' : 'Black to move'}
            {currentPuzzleAlreadySolved && status !== 'solved' ? ' · Previously solved' : ''}
          </span>
          <span className="font-mono-tabular">
            {DIFFICULTY_LABELS[activePuzzle.difficulty]} · {activePuzzle.rating} Elo · +
            {isDailyMode ? 85 : 45} XP
          </span>
        </div>

        <ChessBoard
          fen={fen}
          orientation={activePuzzle.solverColor}
          theme={theme}
          interactive={status !== 'solved' && status !== 'replaying'}
          allowedColor={activePuzzle.solverColor}
          lastMove={lastMove}
          arrows={boardArrows}
          hintSquare={hintTier >= 2 && expectedMoveDetails ? expectedMoveDetails.from : null}
          onMove={handleMove}
        />

        <div className="flex items-center justify-between gap-2 mt-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => resetToPuzzle(activePuzzle)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#1A1C21] border border-white/10 text-[#CFCBC2] hover:text-[#F2EFE9] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Puzzle
            </button>
            {!isDailyMode && (
              <button
                type="button"
                onClick={handleSwitchToToday}
                className="px-3 py-2 text-xs font-medium rounded-lg bg-[#1A1C21] border border-white/10 text-[#F4D08A] hover:border-[#D99B38]/45 cursor-pointer"
              >
                Back to Today’s
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => onPracticeFen(activePuzzle.fen)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-white/6 border border-white/12 text-[#F2EFE9] hover:border-[#D99B38]/50 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Swords className="w-3.5 h-3.5 text-[#D99B38]" />
            Play vs Bot
          </button>
        </div>
      </div>

      {/* Right: Puzzle Prompt, Progressive Hints & Solution */}
      <section className="rounded-xl bg-[#1A1C21] border border-white/8 p-5 space-y-4">
        <div className="pb-3.5 border-b border-white/8">
          <p className="text-xs text-[#9A9892]">
            {isDailyMode
              ? activePuzzle.source === 'lichess'
                ? 'Live Daily Puzzle'
                : 'Daily Tactical Challenge'
              : 'Bonus Tactical Challenge'}
            {activePuzzle.players ? ` · ${activePuzzle.players}` : ''}
          </p>
          <h2 className="font-display text-xl font-semibold text-[#F2EFE9] mt-1">
            {activePuzzle.title}
          </h2>
          <p className="text-xs text-[#A8A59E] mt-1.5">
            Themes: {activePuzzle.themes.join(' · ')}
          </p>
        </div>

        <p className="text-sm text-[#E6E2D9] leading-relaxed">{activePuzzle.prompt}</p>

        {status === 'wrong' && (
          <div className="p-3.5 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/35 text-xs text-[#FCA5A5] leading-relaxed">
            {wrongMessage}
          </div>
        )}

        {status === 'solved' && (
          <div className="p-4 rounded-lg bg-[#10B981]/12 border border-[#10B981]/40 space-y-2">
            <div className="flex items-center justify-between gap-2 text-sm font-semibold text-[#34D399]">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                {isDailyMode ? 'Daily Tactic Solved!' : 'Challenge Solved!'}
              </span>
              <span className="font-mono-tabular text-xs text-[#F4D08A]">
                +{isDailyMode ? 85 : 45} XP
              </span>
            </div>
            <p className="text-xs text-[#E6E2D9] leading-relaxed">{activePuzzle.explanation}</p>
            <p className="font-mono-tabular text-xs text-[#34D399] pt-1">
              Solution: {activePuzzle.solutionMoves.join(' ')}
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleGenerateChallenge}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#D99B38] text-[#141517] hover:bg-[#E4AA49] transition-colors cursor-pointer"
              >
                <Shuffle className="w-3.5 h-3.5" />
                Try Another Challenging Puzzle
              </button>
            </div>
          </div>
        )}

        {status === 'replaying' && (
          <div className="p-3 rounded-lg bg-[#D99B38]/10 border border-[#D99B38]/35 text-xs text-[#F4D08A]">
            Animating tactical sequence on the board…
          </div>
        )}

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
                onClick={handleAnimateSolution}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-white/5 border border-white/10 text-[#CFCBC2] hover:text-[#F2EFE9] transition-colors cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                Animate Solution
              </button>
            </div>

            {hintTier >= 1 && (
              <div className="p-3 rounded-lg bg-[#14161A] border border-white/8 text-xs text-[#CFCBC2] leading-relaxed">
                <span className="font-semibold text-[#34D399]">Coach Clue: </span>
                {activePuzzle.hintText}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
