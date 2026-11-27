import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import {
  ArrowRight,
  Compass,
  Copy,
  Cpu,
  Eye,
  Flag,
  Lightbulb,
  RotateCcw,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  Undo2,
  Volume2,
  VolumeX,
  Check,
} from 'lucide-react';
import type {
  BoardArrow,
  BoardTheme,
  BoardThemeId,
  CoachFeedback,
  Difficulty,
  GameMode,
  MoveRecord,
  SquareHighlight,
  TimeControlId,
} from '../types/chess';
import { BOARD_THEMES, BOARD_THEME_LIST } from '../data/boardThemes';
import { detectOpening } from '../data/openings';
import {
  DIFFICULTY_INFO,
  describeEvalPosition,
  evaluateSideMoves,
  getCoachTrainingFocus,
  getProgressSnapshot,
  recordCompletedGame,
  subscribeProgress,
  type ComputedProgressSnapshot,
} from '../utils/progression';
import {
  getActiveProfile,
  getProfiles,
  subscribeProfiles,
  type PlayerProfile,
} from '../utils/profiles';
import { computeBestMove, evaluatePositionFast, formatEvalScore, PIECE_VALUES } from '../engine/chessAI';
import { stockfishEngine, type StockfishAnalysis } from '../engine/stockfish';
import {
  analyzeMoveWithCoach,
  analyzeOpponentReplyForUser,
  getCoachPositionBriefing,
  type OpponentReplyCue,
  type PositionBriefing,
} from '../engine/coach';
import { chessAudio } from '../utils/sound';
import { ChessBoard } from './ChessBoard';
import { EvalBar } from './EvalBar';
import { ChessPieceSVG } from './ChessPieceSVG';
import { MoveHistoryPanel } from './MoveHistoryPanel';
import { PlayerProfileBar } from './PlayerProfileBar';
import { PieceStyleSelector } from './PieceStyleSelector';

interface PlayArenaProps {
  boardThemeId: BoardThemeId;
  onChangeBoardTheme: (id: BoardThemeId) => void;
  initialFen?: string | null;
  onClearInitialFen?: () => void;
  requestedDifficulty?: Difficulty | null;
  onClearRequestedDifficulty?: () => void;
  onOpenProgress: () => void;
  onJumpToChapter?: (chapter: number) => void;
  onJumpToFundamentals?: () => void;
  newGameTrigger: number;
}

interface PendingBlunderPause {
  moveSan: string;
  quality: 'mistake' | 'blunder';
  headline: string;
  reasonWithoutAnswer: string;
  bestMoveSan?: string;
  bestMoveFrom?: Square;
  bestMoveTo?: Square;
  motifArrows: BoardArrow[];
  revealAnswer: boolean;
}

const TIME_CONTROLS: Record<TimeControlId, { label: string; baseSec: number; incSec: number }> = {
  unlimited: { label: 'Unlimited', baseSec: 0, incSec: 0 },
  rapid10: { label: '10 + 0', baseSec: 600, incSec: 0 },
  blitz5: { label: '5 + 3', baseSec: 300, incSec: 3 },
  blitz3: { label: '3 + 2', baseSec: 180, incSec: 2 },
};

const DIFFICULTY_ORDER: Difficulty[] = ['rookie', 'intermediate', 'advanced', 'pro'];

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function computeCapturedAndMaterial(fen: string): {
  capturedByWhite: PieceSymbol[];
  capturedByBlack: PieceSymbol[];
  whiteAdvantage: number;
} {
  const startCounts: Record<PieceSymbol, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
  const curW: Record<PieceSymbol, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  const curB: Record<PieceSymbol, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };

  const chess = new Chess(fen);
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p) continue;
      if (p.color === 'w') curW[p.type]++;
      else curB[p.type]++;
    }
  }

  const order: PieceSymbol[] = ['q', 'r', 'b', 'n', 'p'];
  const capturedByWhite: PieceSymbol[] = [];
  const capturedByBlack: PieceSymbol[] = [];

  for (const type of order) {
    const missingB = Math.max(0, startCounts[type] - curB[type]);
    const missingW = Math.max(0, startCounts[type] - curW[type]);
    for (let i = 0; i < missingB; i++) capturedByWhite.push(type);
    for (let i = 0; i < missingW; i++) capturedByBlack.push(type);
  }

  let matW = 0;
  let matB = 0;
  for (const type of order) {
    matW += curW[type] * (PIECE_VALUES[type] / 100);
    matB += curB[type] * (PIECE_VALUES[type] / 100);
  }

  return {
    capturedByWhite,
    capturedByBlack,
    whiteAdvantage: Math.round(matW - matB),
  };
}

export const PlayArena: React.FC<PlayArenaProps> = ({
  boardThemeId,
  onChangeBoardTheme,
  initialFen,
  onClearInitialFen,
  requestedDifficulty,
  onClearRequestedDifficulty,
  onOpenProgress,
  onJumpToChapter,
  onJumpToFundamentals,
  newGameTrigger,
}) => {
  const [gameMode, setGameMode] = useState<GameMode>('pvc');
  const [difficulty, setDifficulty] = useState<Difficulty>('rookie');
  const [playerColor, setPlayerColor] = useState<Color>('w');
  const [orientation, setOrientation] = useState<Color>('w');
  const [autoFlipPvP, setAutoFlipPvP] = useState<boolean>(false);
  const [timeControl, setTimeControl] = useState<TimeControlId>('unlimited');

  const [gameSessionId, setGameSessionId] = useState<string>(() => `game-${Date.now()}`);
  const [startFen, setStartFen] = useState<string>(new Chess().fen());
  const [startEvalCp, setStartEvalCp] = useState<number>(20);
  const [records, setRecords] = useState<MoveRecord[]>([]);
  /** null = live latest move; -1 = initial position before move 1; 0..n-1 = historical ply */
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [isReplaying, setIsReplaying] = useState<boolean>(false);
  const [evalCp, setEvalCp] = useState<number>(20);

  // Player Profiles (per-user progress + PvP seat assignment)
  const [profiles, setProfiles] = useState<PlayerProfile[]>(() => getProfiles());
  const [activeProfile, setActiveProfile] = useState<PlayerProfile>(() => getActiveProfile());
  const [pvpWhiteProfileId, setPvpWhiteProfileId] = useState<string>(() => getActiveProfile().id);
  const [pvpBlackProfileId, setPvpBlackProfileId] = useState<string>(() => {
    const all = getProfiles();
    return all.length > 1 ? all[1].id : 'guest';
  });

  // Coach & Progression state
  const [coachEnabled, setCoachEnabled] = useState<boolean>(true);
  const [guidedTraining, setGuidedTraining] = useState<boolean>(true);
  const [pendingBlunderPause, setPendingBlunderPause] = useState<PendingBlunderPause | null>(null);
  const [showThreatVision, setShowThreatVision] = useState<boolean>(false);
  const [hintLevel, setHintLevel] = useState<0 | 1 | 2 | 3>(0);
  const [briefing, setBriefing] = useState<PositionBriefing | null>(null);
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const [liveAnalysis, setLiveAnalysis] = useState<StockfishAnalysis | null>(null);
  const [isEngineEvaluating, setIsEngineEvaluating] = useState<boolean>(false);
  const [showEngineBestArrow, setShowEngineBestArrow] = useState<boolean>(false);
  const [progressSnap, setProgressSnap] = useState<ComputedProgressSnapshot>(() =>
    getProgressSnapshot()
  );
  const [lastMatchXp, setLastMatchXp] = useState<{
    xpEarned: number;
    accuracy: number;
    profileName: string;
    secondProfileSummary?: string;
  } | null>(null);

  // Clocks & Game Over
  const [whiteTime, setWhiteTime] = useState<number>(0);
  const [blackTime, setBlackTime] = useState<number>(0);
  const [resignedBy, setResignedBy] = useState<Color | null>(null);
  const [timeoutWinner, setTimeoutWinner] = useState<Color | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(chessAudio.isEnabled());
  const [copiedPgn, setCopiedPgn] = useState<boolean>(false);
  const [showMobileOptions, setShowMobileOptions] = useState<boolean>(false);

  const aiTimerRef = useRef<number | null>(null);
  const analysisCacheRef = useRef<Record<string, StockfishAnalysis>>({});
  const activeSessionRef = useRef<string>(gameSessionId);
  activeSessionRef.current = gameSessionId;
  const theme: BoardTheme = BOARD_THEMES[boardThemeId];

  const liveFen = records.length > 0 ? records[records.length - 1].fenAfter : startFen;
  const activeViewIdx = viewIndex === null ? records.length - 1 : viewIndex;
  const displayedFen =
    activeViewIdx >= 0 && records[activeViewIdx] ? records[activeViewIdx].fenAfter : startFen;
  const isViewingHistory = viewIndex !== null && viewIndex < records.length - 1;
  const activeLiveAnalysis =
    gameMode === 'pvc' && liveAnalysis && liveAnalysis.fen === displayedFen ? liveAnalysis : null;
  const displayedEvalCp =
    activeLiveAnalysis !== null
      ? activeLiveAnalysis.evalCp
      : activeViewIdx === -1
      ? startEvalCp
      : records[activeViewIdx]?.evalCp ?? evalCp;

  const liveChess = useMemo(() => new Chess(liveFen), [liveFen]);
  const liveTurn = liveChess.turn();
  const historySan = useMemo(() => records.map((r) => r.move.san), [records]);
  const currentOpening = useMemo(() => detectOpening(historySan), [historySan]);

  const gameOverStatus = useMemo(() => {
    if (resignedBy) {
      return {
        over: true,
        winner: resignedBy === 'w' ? ('b' as Color) : ('w' as Color),
        reason: 'Resignation',
        title: resignedBy === 'w' ? 'Black wins by resignation' : 'White wins by resignation',
        detail: `${resignedBy === 'w' ? 'White' : 'Black'} resigned the match.`,
      };
    }
    if (timeoutWinner) {
      return {
        over: true,
        winner: timeoutWinner,
        reason: 'Timeout',
        title: `${timeoutWinner === 'w' ? 'White' : 'Black'} wins on time`,
        detail: `${timeoutWinner === 'w' ? 'Black' : 'White'} ran out of time.`,
      };
    }
    if (liveChess.isCheckmate()) {
      const winnerColor: Color = liveTurn === 'w' ? 'b' : 'w';
      const winner = winnerColor === 'w' ? 'White' : 'Black';
      return {
        over: true,
        winner: winnerColor,
        reason: 'Checkmate',
        title: `${winner} wins by checkmate`,
        detail: 'The opposing King has no legal escape.',
      };
    }
    if (liveChess.isStalemate()) {
      return {
        over: true,
        winner: null,
        reason: 'Stalemate',
        title: 'Draw by stalemate',
        detail: 'No legal moves while not in check.',
      };
    }
    if (liveChess.isThreefoldRepetition()) {
      return {
        over: true,
        winner: null,
        reason: 'Repetition',
        title: 'Draw by repetition',
        detail: 'Position repeated three times.',
      };
    }
    if (liveChess.isInsufficientMaterial()) {
      return {
        over: true,
        winner: null,
        reason: 'Insufficient material',
        title: 'Draw by insufficient material',
        detail: 'Neither side can force checkmate.',
      };
    }
    if (liveChess.isDraw()) {
      return {
        over: true,
        winner: null,
        reason: '50-move rule',
        title: 'Draw (50-move rule)',
        detail: 'Fifty moves without pawn push or capture.',
      };
    }
    return { over: false, winner: null, reason: '', title: '', detail: '' };
  }, [liveChess, liveTurn, resignedBy, timeoutWinner]);

  const startFreshGame = useCallback(
    (customFen?: string, nextMode?: GameMode, nextColor?: Color, nextTc?: TimeControlId) => {
      if (aiTimerRef.current) {
        window.clearTimeout(aiTimerRef.current);
        aiTimerRef.current = null;
      }
      stockfishEngine.stopCurrentSearch();
      const modeToUse = nextMode ?? gameMode;
      const colorToUse = nextColor ?? playerColor;
      const tcToUse = nextTc ?? timeControl;
      const fenToUse = customFen ?? new Chess().fen();

      setGameSessionId(`game-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
      setStartFen(fenToUse);
      setRecords([]);
      setViewIndex(null);
      setIsReplaying(false);
      setResignedBy(null);
      setTimeoutWinner(null);
      setLastMatchXp(null);
      setHintLevel(0);
      setBriefing(null);
      setPendingBlunderPause(null);
      setIsAiThinking(false);
      setLiveAnalysis(null);
      setIsEngineEvaluating(false);
      setOrientation(modeToUse === 'pvc' ? colorToUse : new Chess(fenToUse).turn());

      const base = TIME_CONTROLS[tcToUse].baseSec;
      setWhiteTime(base);
      setBlackTime(base);

      const initEval = evaluatePositionFast(fenToUse, 1).evalCp;
      setStartEvalCp(initEval);
      setEvalCp(initEval);
    },
    [gameMode, playerColor, timeControl]
  );

  // Warm up Stockfish WASM worker on mount for instant PvC analysis
  useEffect(() => {
    stockfishEngine.warmup();
  }, []);

  // Keep player profiles, progression snapshot & audio mute state synced
  useEffect(() => {
    const syncProfilesAndProg = () => {
      const nextProfiles = getProfiles();
      const nextActive = getActiveProfile();
      setProfiles(nextProfiles);
      setActiveProfile(nextActive);
      setProgressSnap(getProgressSnapshot(nextActive.id));
      setPvpWhiteProfileId((prev) =>
        prev === 'guest' || nextProfiles.some((p) => p.id === prev) ? prev : nextActive.id
      );
      setPvpBlackProfileId((prev) =>
        prev === 'guest' || nextProfiles.some((p) => p.id === prev) ? prev : 'guest'
      );
    };
    syncProfilesAndProg();
    const unsubProfiles = subscribeProfiles(syncProfilesAndProg);
    const unsubProg = subscribeProgress(syncProfilesAndProg);
    const unsubAudio = chessAudio.subscribe(setSoundEnabled);
    return () => {
      unsubProfiles();
      unsubProg();
      unsubAudio();
    };
  }, []);

  // Load custom FEN when launched from Tactics Academy or Fundamentals
  useEffect(() => {
    if (initialFen) {
      const side = new Chess(initialFen).turn();
      setGameMode('pvc');
      setPlayerColor(side);
      startFreshGame(initialFen, 'pvc', side);
      onClearInitialFen?.();
    }
  }, [initialFen, onClearInitialFen, startFreshGame]);

  // Load requested difficulty when launched from Progress ladder
  useEffect(() => {
    if (requestedDifficulty) {
      setGameMode('pvc');
      setDifficulty(requestedDifficulty);
      startFreshGame(undefined, 'pvc', playerColor);
      onClearRequestedDifficulty?.();
    }
  }, [requestedDifficulty, onClearRequestedDifficulty, playerColor, startFreshGame]);

  // Trigger fresh game from Top Bar "New Game" CTA
  const prevTrigger = useRef(newGameTrigger);
  useEffect(() => {
    if (newGameTrigger !== prevTrigger.current) {
      prevTrigger.current = newGameTrigger;
      startFreshGame();
    }
  }, [newGameTrigger, startFreshGame]);

  // Record evaluated match once when game finishes (scoped per player profile)
  useEffect(() => {
    if (!gameOverStatus.over) return;

    if (gameMode === 'pvc') {
      const result: 'win' | 'draw' | 'loss' =
        gameOverStatus.winner === null
          ? 'draw'
          : gameOverStatus.winner === playerColor
          ? 'win'
          : 'loss';

      const recorded = recordCompletedGame({
        id: `${gameSessionId}-${activeProfile.id}`,
        mode: 'pvc',
        difficulty,
        playerColor,
        result,
        reason: gameOverStatus.reason,
        records,
        openingName: currentOpening?.name,
        profileId: activeProfile.id,
      });
      if (recorded) {
        setLastMatchXp({
          xpEarned: recorded.xpEarned,
          accuracy: recorded.playerAccuracy,
          profileName: activeProfile.name,
        });
      }
      return;
    }

    // PvP: save separately for White and/or Black assigned profiles
    const whiteResult: 'win' | 'draw' | 'loss' =
      gameOverStatus.winner === null ? 'draw' : gameOverStatus.winner === 'w' ? 'win' : 'loss';
    const blackResult: 'win' | 'draw' | 'loss' =
      gameOverStatus.winner === null ? 'draw' : gameOverStatus.winner === 'b' ? 'win' : 'loss';

    const whiteRec =
      pvpWhiteProfileId !== 'guest'
        ? recordCompletedGame({
            id: `${gameSessionId}-w-${pvpWhiteProfileId}`,
            mode: 'pvp',
            difficulty,
            playerColor: 'w',
            result: whiteResult,
            reason: gameOverStatus.reason,
            records,
            openingName: currentOpening?.name,
            profileId: pvpWhiteProfileId,
          })
        : null;

    const blackRec =
      pvpBlackProfileId !== 'guest' && pvpBlackProfileId !== pvpWhiteProfileId
        ? recordCompletedGame({
            id: `${gameSessionId}-b-${pvpBlackProfileId}`,
            mode: 'pvp',
            difficulty,
            playerColor: 'b',
            result: blackResult,
            reason: gameOverStatus.reason,
            records,
            openingName: currentOpening?.name,
            profileId: pvpBlackProfileId,
          })
        : null;

    const whiteName = profiles.find((p) => p.id === pvpWhiteProfileId)?.name ?? 'White';
    const blackName = profiles.find((p) => p.id === pvpBlackProfileId)?.name ?? 'Black';

    if (whiteRec) {
      setLastMatchXp({
        xpEarned: whiteRec.xpEarned,
        accuracy: whiteRec.playerAccuracy,
        profileName: whiteName,
        secondProfileSummary: blackRec
          ? `${blackName}: ${blackRec.playerAccuracy}% (+${blackRec.xpEarned} XP)`
          : undefined,
      });
    } else if (blackRec) {
      setLastMatchXp({
        xpEarned: blackRec.xpEarned,
        accuracy: blackRec.playerAccuracy,
        profileName: blackName,
      });
    }
  }, [
    gameOverStatus.over,
    gameOverStatus.winner,
    gameOverStatus.reason,
    gameSessionId,
    gameMode,
    difficulty,
    playerColor,
    records,
    currentOpening?.name,
    activeProfile.id,
    activeProfile.name,
    pvpWhiteProfileId,
    pvpBlackProfileId,
    profiles,
  ]);

  // Live chess clock countdown
  useEffect(() => {
    if (timeControl === 'unlimited' || gameOverStatus.over || records.length === 0) return;

    const id = window.setInterval(() => {
      if (liveTurn === 'w') {
        setWhiteTime((t) => {
          if (t <= 1) {
            setTimeoutWinner('b');
            return 0;
          }
          return t - 1;
        });
      } else {
        setBlackTime((t) => {
          if (t <= 1) {
            setTimeoutWinner('w');
            return 0;
          }
          return t - 1;
        });
      }
    }, 1000);

    return () => window.clearInterval(id);
  }, [timeControl, gameOverStatus.over, records.length, liveTurn]);

  const playSoundForMove = (move: Move, afterChess: Chess) => {
    if (afterChess.isCheckmate()) {
      chessAudio.playVictory();
    } else if (afterChess.inCheck()) {
      chessAudio.playCheck();
    } else if (move.promotion) {
      chessAudio.playPromote();
    } else if (move.san === 'O-O' || move.san === 'O-O-O') {
      chessAudio.playCastle();
    } else if (move.captured) {
      chessAudio.playCapture();
    } else {
      chessAudio.playMove();
    }
  };

  const commitMove = useCallback(
    (from: Square, to: Square, promotion?: PieceSymbol): boolean => {
      if (gameOverStatus.over || isViewingHistory) return false;
      const chess = new Chess(liveFen);
      const fenBefore = chess.fen();

      let move: Move | null = null;
      try {
        move = chess.move({ from, to, promotion: promotion || 'q' });
      } catch {
        return false;
      }
      if (!move) return false;

      const fenAfter = chess.fen();
      const nextHistorySan = [...historySan, move.san];

      playSoundForMove(move, chess);

      // Add time increment if applicable
      const inc = TIME_CONTROLS[timeControl].incSec;
      if (inc > 0) {
        if (move.color === 'w') setWhiteTime((t) => t + inc);
        else setBlackTime((t) => t + inc);
      }

      // Live Training Coach & Evaluation computation
      let feedback: CoachFeedback | undefined;
      let nextEval = 0;
      let cpLoss = 0;
      if (coachEnabled) {
        feedback = analyzeMoveWithCoach(fenBefore, move, fenAfter, nextHistorySan);
        nextEval = feedback.evalAfter;
        cpLoss = feedback.cpLoss ?? 0;
      } else {
        const beforeEval = evaluatePositionFast(fenBefore, 1).evalCp;
        nextEval = evaluatePositionFast(fenAfter, 1).evalCp;
        const moverSign = move.color === 'w' ? 1 : -1;
        cpLoss = Math.max(0, (beforeEval - nextEval) * moverSign);
      }
      setEvalCp(nextEval);

      // Guided Training Blunder Guard: pause AI reply when the USER plays a Mistake/Blunder
      const isHumanMoveInPvC = gameMode === 'pvc' && move.color === playerColor;
      if (
        isHumanMoveInPvC &&
        coachEnabled &&
        guidedTraining &&
        feedback &&
        (feedback.quality === 'mistake' || feedback.quality === 'blunder') &&
        !chess.isGameOver()
      ) {
        const looseWarn = feedback.motifs.find(
          (m) => m.name.includes('Loose') || m.name.includes('Outnumbered')
        );
        const pawnDrop = (cpLoss / 100).toFixed(1);
        const motifArrows: BoardArrow[] = [];
        for (const m of feedback.motifs) {
          if (m.arrows) motifArrows.push(...m.arrows);
        }
        setPendingBlunderPause({
          moveSan: move.san,
          quality: feedback.quality,
          headline:
            feedback.quality === 'blunder'
              ? `Coach Pause: ${move.san} is a tactical oversight`
              : `Coach Pause: ${move.san} loses momentum (~${pawnDrop} pawns)`,
          reasonWithoutAnswer: looseWarn
            ? `${looseWarn.description} Take a moment to defend that piece or check forcing replies before continuing.`
            : `${move.san} concedes significant advantage (~${pawnDrop} pawns). Scan for loose pieces, opponent checks, or a stronger candidate move.`,
          bestMoveSan: feedback.bestMoveSan,
          bestMoveFrom: feedback.bestMoveFrom,
          bestMoveTo: feedback.bestMoveTo,
          motifArrows,
          revealAnswer: false,
        });
      } else if (isHumanMoveInPvC) {
        setPendingBlunderPause(null);
      }

      setRecords((prev) => [
        ...prev,
        {
          move: {
            san: move!.san,
            from: move!.from,
            to: move!.to,
            color: move!.color,
            piece: move!.piece,
            captured: move!.captured,
            promotion: move!.promotion,
            flags: move!.flags,
          },
          fenBefore,
          fenAfter,
          evalCp: nextEval,
          cpLoss,
          feedback,
        },
      ]);
      setViewIndex(null);
      setIsReplaying(false);
      setHintLevel(0);
      setBriefing(null);

      if (gameMode === 'pvp' && autoFlipPvP) {
        setOrientation(chess.turn());
      }

      return true;
    },
    [
      gameOverStatus.over,
      isViewingHistory,
      liveFen,
      historySan,
      timeControl,
      coachEnabled,
      guidedTraining,
      gameMode,
      playerColor,
      autoFlipPvP,
    ]
  );

  const playSoundForRecord = (rec: MoveRecord) => {
    if (rec.move.san.includes('#')) chessAudio.playVictory();
    else if (rec.move.san.includes('+')) chessAudio.playCheck();
    else if (rec.move.promotion) chessAudio.playPromote();
    else if (rec.move.san === 'O-O' || rec.move.san === 'O-O-O') chessAudio.playCastle();
    else if (rec.move.captured) chessAudio.playCapture();
    else chessAudio.playMove();
  };

  const cacheStockfishAnalysis = useCallback((analysis: StockfishAnalysis) => {
    const cache = analysisCacheRef.current;
    const keys = Object.keys(cache);
    if (keys.length > 160) {
      delete cache[keys[0]];
    }
    cache[analysis.fen] = analysis;
  }, []);

  const refineRecordWithStockfish = useCallback(
    (targetFenAfter: string, sfAfter: StockfishAnalysis) => {
      setRecords((prev) => {
        const idx = prev.findIndex((r) => r.fenAfter === targetFenAfter);
        if (idx === -1) return prev;
        const rec = prev[idx];
        const sfBefore = analysisCacheRef.current[rec.fenBefore];
        const moverSign = rec.move.color === 'w' ? 1 : -1;
        const refinedEvalBefore = sfBefore ? sfBefore.evalCp : rec.feedback?.evalBefore;
        const refinedCpLoss =
          sfBefore !== undefined
            ? Math.max(0, (sfBefore.evalCp - sfAfter.evalCp) * moverSign)
            : rec.cpLoss;

        if (
          rec.evalCp === sfAfter.evalCp &&
          rec.cpLoss === refinedCpLoss &&
          rec.feedback?.bestMoveSan === (sfBefore?.bestMoveSan ?? rec.feedback?.bestMoveSan)
        ) {
          return prev;
        }

        const next = [...prev];
        next[idx] = {
          ...rec,
          evalCp: sfAfter.evalCp,
          cpLoss: refinedCpLoss,
          feedback: rec.feedback
            ? {
                ...rec.feedback,
                evalBefore: refinedEvalBefore ?? rec.feedback.evalBefore,
                evalAfter: sfAfter.evalCp,
                cpLoss: refinedCpLoss ?? rec.feedback.cpLoss,
                bestMoveSan: sfBefore?.bestMoveSan ?? rec.feedback.bestMoveSan,
                bestMoveFrom: sfBefore?.bestMoveFrom ?? rec.feedback.bestMoveFrom,
                bestMoveTo: sfBefore?.bestMoveTo ?? rec.feedback.bestMoveTo,
              }
            : undefined,
        };
        return next;
      });
    },
    []
  );

  // Real-time Stockfish evaluation & best-move analysis during PvC games
  useEffect(() => {
    if (gameMode !== 'pvc') {
      setLiveAnalysis(null);
      setIsEngineEvaluating(false);
      return;
    }

    const cached = analysisCacheRef.current[displayedFen];
    if (cached && cached.isFinal) {
      setLiveAnalysis(cached);
      setIsEngineEvaluating(false);
      if (!isViewingHistory && cached.fen === liveFen) {
        setEvalCp(cached.evalCp);
        if (records.length > 0 && records[records.length - 1].fenAfter === cached.fen) {
          refineRecordWithStockfish(cached.fen, cached);
        } else if (records.length === 0 && cached.fen === startFen) {
          setStartEvalCp(cached.evalCp);
        }
      }
      return;
    }

    // During live AI turn (when not paused by Guided Guard), the AI turn effect
    // handles both evaluation and move selection sequentially to avoid queue contention.
    const aiColor: Color = playerColor === 'w' ? 'b' : 'w';
    if (!isViewingHistory && !gameOverStatus.over && !pendingBlunderPause && liveTurn === aiColor) {
      return;
    }

    let cancelled = false;
    const sessionSnap = gameSessionId;
    const targetFen = displayedFen;
    setIsEngineEvaluating(true);

    stockfishEngine
      .analyzePosition(targetFen, {
        depth: 14,
        movetimeMs: 650,
        onProgress: (partial) => {
          if (cancelled || activeSessionRef.current !== sessionSnap) return;
          setLiveAnalysis(partial);
          if (!isViewingHistory && targetFen === liveFen) {
            setEvalCp(partial.evalCp);
          }
        },
      })
      .then((finalRes) => {
        if (cancelled || activeSessionRef.current !== sessionSnap) return;
        cacheStockfishAnalysis(finalRes);
        setLiveAnalysis(finalRes);
        setIsEngineEvaluating(false);
        if (!isViewingHistory && targetFen === liveFen) {
          setEvalCp(finalRes.evalCp);
          if (targetFen === startFen && records.length === 0) {
            setStartEvalCp(finalRes.evalCp);
          } else {
            refineRecordWithStockfish(targetFen, finalRes);
          }
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    gameMode,
    displayedFen,
    liveFen,
    startFen,
    isViewingHistory,
    gameOverStatus.over,
    pendingBlunderPause,
    liveTurn,
    playerColor,
    gameSessionId,
    records.length,
    cacheStockfishAnalysis,
    refineRecordWithStockfish,
  ]);

  // Computer Opponent turn execution (Stockfish-powered + real-time eval refinement; waits for Blunder Guard)
  useEffect(() => {
    if (gameMode !== 'pvc' || gameOverStatus.over || isViewingHistory || pendingBlunderPause) return;
    const aiColor: Color = playerColor === 'w' ? 'b' : 'w';
    if (liveTurn !== aiColor) return;

    let cancelled = false;
    const sessionSnap = gameSessionId;
    const targetFen = liveFen;
    setIsAiThinking(true);
    setIsEngineEvaluating(true);

    const minDelayMs = difficulty === 'rookie' ? 320 : difficulty === 'intermediate' ? 360 : 400;

    aiTimerRef.current = window.setTimeout(() => {
      void (async () => {
        // 1. Evaluate the position right after the user's move at full Stockfish strength
        if (difficulty !== 'pro') {
          const evalRes = await stockfishEngine.analyzePosition(targetFen, {
            depth: 10,
            movetimeMs: 220,
          });
          if (cancelled || activeSessionRef.current !== sessionSnap) return;
          cacheStockfishAnalysis(evalRes);
          setLiveAnalysis(evalRes);
          setEvalCp(evalRes.evalCp);
          refineRecordWithStockfish(targetFen, evalRes);
        }

        // 2. Choose the Computer's reply calibrated to the selected Difficulty tier
        const aiMove = await stockfishEngine.getComputerMove(targetFen, difficulty, historySan);
        if (cancelled || activeSessionRef.current !== sessionSnap) return;

        setIsAiThinking(false);
        setIsEngineEvaluating(false);
        if (aiMove) {
          if (difficulty === 'pro') {
            const proEval: StockfishAnalysis = {
              fen: targetFen,
              evalCp: aiMove.evalCp,
              bestMoveSan: aiMove.san,
              bestMoveFrom: aiMove.from,
              bestMoveTo: aiMove.to,
              bestMovePromotion: aiMove.promotion,
              pvSan: [aiMove.san],
              depth: 14,
              source: aiMove.source,
              isFinal: true,
            };
            cacheStockfishAnalysis(proEval);
            refineRecordWithStockfish(targetFen, proEval);
          }
          commitMove(aiMove.from, aiMove.to, aiMove.promotion);
        }
      })();
    }, minDelayMs);

    return () => {
      cancelled = true;
      if (aiTimerRef.current) {
        window.clearTimeout(aiTimerRef.current);
        aiTimerRef.current = null;
      }
      setIsAiThinking(false);
    };
  }, [
    gameMode,
    gameOverStatus.over,
    isViewingHistory,
    pendingBlunderPause,
    playerColor,
    liveTurn,
    difficulty,
    liveFen,
    historySan,
    gameSessionId,
    commitMove,
    cacheStockfishAnalysis,
    refineRecordWithStockfish,
  ]);

  // Compute on-demand briefing when Threat Vision or Hints are active
  useEffect(() => {
    if ((showThreatVision || hintLevel > 0) && !gameOverStatus.over && !isViewingHistory) {
      setBriefing(getCoachPositionBriefing(liveFen));
    }
  }, [showThreatVision, hintLevel, liveFen, gameOverStatus.over, isViewingHistory]);

  // Auto-replay progression effect & keyboard arrow navigation
  useEffect(() => {
    if (!isReplaying || records.length === 0) return;

    const timer = window.setTimeout(() => {
      const cur = viewIndex === null ? records.length - 1 : viewIndex;
      const next = cur + 1;
      if (next >= records.length - 1) {
        const finalRec = records[records.length - 1];
        if (finalRec) playSoundForRecord(finalRec);
        setViewIndex(null);
        setIsReplaying(false);
        return;
      }
      const rec = records[next];
      if (rec) playSoundForRecord(rec);
      setViewIndex(next);
    }, 680);

    return () => window.clearTimeout(timer);
  }, [isReplaying, viewIndex, records]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (records.length === 0) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIsReplaying(false);
        setViewIndex((prev) => {
          const cur = prev === null ? records.length - 1 : prev;
          return Math.max(-1, cur - 1);
        });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setIsReplaying(false);
        setViewIndex((prev) => {
          if (prev === null) return null;
          const next = prev + 1;
          return next >= records.length - 1 ? null : next;
        });
      } else if (e.key === 'Home') {
        e.preventDefault();
        setIsReplaying(false);
        setViewIndex(-1);
      } else if (e.key === 'End') {
        e.preventDefault();
        setIsReplaying(false);
        setViewIndex(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [records.length]);

  const handleSelectHistoryMove = useCallback(
    (index: number | null) => {
      setIsReplaying(false);
      setViewIndex(index);
      if (records.length > 0) {
        const target = index === null ? records[records.length - 1] : index >= 0 ? records[index] : null;
        if (target) playSoundForRecord(target);
      }
    },
    [records]
  );

  const handleToggleReplay = useCallback(() => {
    if (records.length === 0) return;
    if (isReplaying) {
      setIsReplaying(false);
      return;
    }
    // If at live end, restart progression from starting position
    if (viewIndex === null || viewIndex >= records.length - 1) {
      setViewIndex(-1);
    }
    setIsReplaying(true);
  }, [isReplaying, records.length, viewIndex]);

  const handleUndo = () => {
    if (records.length === 0 || isAiThinking) return;
    if (aiTimerRef.current) {
      window.clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
    stockfishEngine.stopCurrentSearch();
    const wasPausedOnHumanMove = pendingBlunderPause !== null;
    setIsReplaying(false);
    setResignedBy(null);
    setTimeoutWinner(null);
    setHintLevel(0);
    setBriefing(null);
    setPendingBlunderPause(null);
    setLiveAnalysis(null);

    const stepsToPop = wasPausedOnHumanMove
      ? 1
      : gameMode === 'pvc' && records.length >= 2 && liveTurn === playerColor
      ? 2
      : 1;
    const nextRecords = records.slice(0, Math.max(0, records.length - stepsToPop));
    setRecords(nextRecords);
    setViewIndex(null);
    setEvalCp(nextRecords.length > 0 ? nextRecords[nextRecords.length - 1].evalCp : startEvalCp);
  };

  const handleRequestHint = () => {
    if (gameOverStatus.over || isViewingHistory || isAiThinking) return;
    const nextBriefing = briefing ?? getCoachPositionBriefing(liveFen);
    setBriefing(nextBriefing);
    setHintLevel((prev) => (prev < 3 ? ((prev + 1) as 1 | 2 | 3) : 3));
  };

  const handleExplainPosition = () => {
    if (gameOverStatus.over) return;
    setBriefing(getCoachPositionBriefing(displayedFen));
    if (gameMode === 'pvc') {
      const targetFen = displayedFen;
      const sessionSnap = gameSessionId;
      setIsEngineEvaluating(true);
      void stockfishEngine
        .analyzePosition(targetFen, {
          depth: 15,
          movetimeMs: 850,
          onProgress: (partial) => {
            if (activeSessionRef.current === sessionSnap) {
              setLiveAnalysis(partial);
            }
          },
        })
        .then((res) => {
          if (activeSessionRef.current !== sessionSnap) return;
          cacheStockfishAnalysis(res);
          setLiveAnalysis(res);
          setIsEngineEvaluating(false);
          if (!isViewingHistory && targetFen === liveFen) {
            setEvalCp(res.evalCp);
            refineRecordWithStockfish(targetFen, res);
          }
        });
    }
  };

  const handleCopyPgn = () => {
    const c = new Chess(startFen);
    for (const r of records) c.move(r.move.san);
    navigator.clipboard?.writeText(c.pgn()).catch(() => {});
    setCopiedPgn(true);
    window.setTimeout(() => setCopiedPgn(false), 1800);
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    chessAudio.setEnabled(next);
  };

  // User-focused feedback & Opponent-reply cues (never let bot self-grade overwrite user feedback!)
  const latestRecord = activeViewIdx >= 0 ? records[activeViewIdx] : null;
  const latestUserRecord = useMemo(() => {
    if (gameMode !== 'pvc') return latestRecord;
    for (let i = records.length - 1; i >= 0; i--) {
      if (records[i].move.color === playerColor) return records[i];
    }
    return null;
  }, [gameMode, latestRecord, records, playerColor]);

  const latestOpponentRecord = useMemo(() => {
    if (gameMode !== 'pvc' || records.length === 0) return null;
    const last = records[records.length - 1];
    return last.move.color !== playerColor ? last : null;
  }, [gameMode, records, playerColor]);

  const opponentCue = useMemo<OpponentReplyCue | null>(() => {
    if (!coachEnabled || gameMode !== 'pvc' || isViewingHistory || !latestOpponentRecord) return null;
    return analyzeOpponentReplyForUser(
      latestOpponentRecord.fenAfter,
      latestOpponentRecord.move,
      playerColor
    );
  }, [coachEnabled, gameMode, isViewingHistory, latestOpponentRecord, playerColor]);

  // Inspected feedback: in history or PvP inspect selected ply; during live PvC always critique USER's move
  const activeFeedback = isViewingHistory
    ? latestRecord?.feedback
    : gameMode === 'pvc'
    ? latestUserRecord?.feedback
    : latestRecord?.feedback;

  const boardArrows = useMemo<BoardArrow[]>(() => {
    const list: BoardArrow[] = [];
    if (pendingBlunderPause && !isViewingHistory) {
      list.push(...pendingBlunderPause.motifArrows);
      if (
        pendingBlunderPause.revealAnswer &&
        pendingBlunderPause.bestMoveFrom &&
        pendingBlunderPause.bestMoveTo
      ) {
        list.push({
          from: pendingBlunderPause.bestMoveFrom,
          to: pendingBlunderPause.bestMoveTo,
          color: 'emerald',
          opacity: 0.85,
        });
      }
      return list;
    }

    if (!isViewingHistory) {
      if (
        gameMode === 'pvc' &&
        showEngineBestArrow &&
        activeLiveAnalysis?.bestMoveFrom &&
        activeLiveAnalysis?.bestMoveTo &&
        !gameOverStatus.over
      ) {
        list.push({
          from: activeLiveAnalysis.bestMoveFrom,
          to: activeLiveAnalysis.bestMoveTo,
          color: 'sky',
          opacity: 0.88,
        });
      }
      if (hintLevel >= 3) {
        if (gameMode === 'pvc' && activeLiveAnalysis?.bestMoveFrom && activeLiveAnalysis?.bestMoveTo) {
          list.push({
            from: activeLiveAnalysis.bestMoveFrom,
            to: activeLiveAnalysis.bestMoveTo,
            color: 'emerald',
            opacity: 0.85,
          });
        } else if (briefing?.hintTier3Arrow) {
          list.push(briefing.hintTier3Arrow);
        }
      }
      if (showThreatVision && briefing?.threatMove) {
        list.push({
          from: briefing.threatMove.from,
          to: briefing.threatMove.to,
          color: 'crimson',
          opacity: 0.78,
        });
      }
      if (opponentCue && opponentCue.arrows.length > 0) {
        list.push(...opponentCue.arrows);
      }
    }
    if (coachEnabled && activeFeedback && (!isViewingHistory ? gameMode !== 'pvc' || latestOpponentRecord === null : true)) {
      for (const motif of activeFeedback.motifs) {
        if (motif.arrows) list.push(...motif.arrows);
      }
      if (
        (activeFeedback.quality === 'mistake' || activeFeedback.quality === 'blunder') &&
        activeFeedback.bestMoveFrom &&
        activeFeedback.bestMoveTo
      ) {
        list.push({
          from: activeFeedback.bestMoveFrom,
          to: activeFeedback.bestMoveTo,
          color: 'emerald',
          opacity: 0.75,
        });
      }
    }
    return list;
  }, [
    pendingBlunderPause,
    isViewingHistory,
    gameMode,
    showEngineBestArrow,
    activeLiveAnalysis,
    gameOverStatus.over,
    hintLevel,
    briefing,
    showThreatVision,
    opponentCue,
    coachEnabled,
    activeFeedback,
    latestOpponentRecord,
  ]);

  const boardHighlights = useMemo<SquareHighlight[]>(() => {
    const list: SquareHighlight[] = [];
    if (!isViewingHistory && briefing) {
      for (const sq of briefing.loosePieces) {
        list.push({ square: sq, color: 'crimson' });
      }
    }
    if (!isViewingHistory && opponentCue && opponentCue.highlightSquares.length > 0) {
      const col = opponentCue.severity === 'opportunity' ? 'emerald' : 'crimson';
      for (const sq of opponentCue.highlightSquares) {
        list.push({ square: sq, color: col });
      }
    }
    return list;
  }, [isViewingHistory, briefing, opponentCue]);

  const material = useMemo(() => computeCapturedAndMaterial(displayedFen), [displayedFen]);

  const topColor: Color = orientation === 'w' ? 'b' : 'w';
  const bottomColor: Color = orientation;

  const whiteEval = useMemo(() => evaluateSideMoves(records, 'w'), [records]);
  const blackEval = useMemo(() => evaluateSideMoves(records, 'b'), [records]);
  const displayedEvalText = describeEvalPosition(displayedEvalCp);
  const displayedEvalLabel = formatEvalScore(displayedEvalCp);

  const renderPlayerStrip = (color: Color) => {
    const isComputer = gameMode === 'pvc' && color !== playerColor;
    const isActiveTurn = liveTurn === color && !gameOverStatus.over;
    const captured = color === 'w' ? material.capturedByWhite : material.capturedByBlack;
    const matDiff = color === 'w' ? material.whiteAdvantage : -material.whiteAdvantage;
    const clockVal = color === 'w' ? whiteTime : blackTime;

    const pvpSeatId = color === 'w' ? pvpWhiteProfileId : pvpBlackProfileId;
    const pvpSeatProfile = pvpSeatId !== 'guest' ? profiles.find((p) => p.id === pvpSeatId) : null;
    const displayName = isComputer
      ? `Computer (${DIFFICULTY_INFO[difficulty].label})`
      : gameMode === 'pvc'
      ? activeProfile.name
      : pvpSeatProfile
      ? `${pvpSeatProfile.name} (${color === 'w' ? 'White' : 'Black'})`
      : color === 'w'
      ? 'White Guest'
      : 'Black Guest';

    return (
      <div
        className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl backdrop-blur-md transition-all ${
          isActiveTurn
            ? 'bg-[#12182D]/90 border border-cyan-400/55 shadow-[0_0_20px_rgba(34,211,238,0.2)]'
            : 'bg-[#0F1322]/78 border border-white/10'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 ${
              color === 'w'
                ? 'bg-[#ECFEFF] border-cyan-300/60 text-[#0E1324]'
                : 'bg-[#1B1F38] border-violet-400/35 text-[#F2EFE9]'
            }`}
          >
            <div className="w-6 h-6">
              <ChessPieceSVG type="k" color={color} />
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#F2EFE9] truncate">
                {displayName}
              </span>
              {isComputer ? (
                <span className="font-mono-tabular text-xs text-violet-300">
                  {DIFFICULTY_INFO[difficulty].rating}
                </span>
              ) : gameMode === 'pvc' ? (
                <span className="font-mono-tabular text-xs text-cyan-300">
                  {progressSnap.currentRank.label}
                </span>
              ) : null}
              {isActiveTurn && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 whitespace-nowrap animate-pulse">
                  · {isAiThinking && isComputer ? 'Thinking…' : 'Your move'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 min-h-[18px] mt-0.5">
              {captured.map((p, idx) => (
                <div key={`${p}-${idx}`} className="w-3.5 h-3.5 -ml-0.5 first:ml-0 opacity-90">
                  <ChessPieceSVG type={p} color={color === 'w' ? 'b' : 'w'} />
                </div>
              ))}
              {matDiff > 0 && (
                <span className="font-mono-tabular text-[11px] font-semibold text-emerald-400 ml-1">
                  +{matDiff}
                </span>
              )}
            </div>
          </div>
        </div>

        {timeControl !== 'unlimited' && (
          <div
            className={`px-3 py-1.5 rounded-lg font-mono-tabular text-sm font-semibold border shrink-0 ${
              isActiveTurn
                ? 'bg-cyan-500/15 border-cyan-400/45 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.22)]'
                : 'bg-black/30 border-white/10 text-[#9A9892]'
            }`}
          >
            {formatClock(clockVal)}
          </div>
        )}
      </div>
    );
  };

  const qualityStyle = (q: CoachFeedback['quality']) => {
    switch (q) {
      case 'brilliant':
        return 'text-[#38BDF8]';
      case 'best':
      case 'book':
        return 'text-[#10B981]';
      case 'good':
        return 'text-[#D6D3CB]';
      case 'inaccuracy':
        return 'text-[#E5A93B]';
      case 'mistake':
        return 'text-[#F97316]';
      case 'blunder':
        return 'text-[#EF4444]';
    }
  };

  return (
    <div className="w-full max-w-[1380px] mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-6">
      {/* Mobile-First Match Configuration Toolbar */}
      <div className="pb-3.5 sm:pb-5 mb-3.5 sm:mb-5 border-b border-white/8 space-y-2.5 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        {/* Primary Row (Always visible on mobile & desktop) */}
        <div className="flex items-center justify-between gap-2 sm:flex-wrap sm:justify-start">
          {/* Mode Segmented Control */}
          <div className="flex items-center p-1 bg-[#101526]/90 border border-white/12 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => {
                setGameMode('pvc');
                startFreshGame(undefined, 'pvc', playerColor);
              }}
              className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                gameMode === 'pvc'
                  ? 'bg-gradient-to-r from-[#06B6D4] via-[#8B5CF6] to-[#EC4899] text-white font-semibold shadow-[0_0_14px_rgba(34,211,238,0.4)]'
                  : 'text-[#B2B7CC] hover:text-white'
              }`}
            >
              <span className="sm:hidden">vs Bot</span>
              <span className="hidden sm:inline">Player vs Computer</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setGameMode('pvp');
                startFreshGame(undefined, 'pvp', 'w');
              }}
              className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                gameMode === 'pvp'
                  ? 'bg-gradient-to-r from-[#06B6D4] via-[#8B5CF6] to-[#EC4899] text-white font-semibold shadow-[0_0_14px_rgba(236,72,153,0.4)]'
                  : 'text-[#B2B7CC] hover:text-white'
              }`}
            >
              <span className="sm:hidden">vs Friend</span>
              <span className="hidden sm:inline">Player vs Player</span>
            </button>
          </div>

          {gameMode === 'pvc' && (
            <select
              aria-label="Computer difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-medium bg-[#1A1C21] border border-white/10 rounded-lg text-[#F2EFE9] focus:outline-none focus:border-[#D99B38] cursor-pointer min-w-0"
            >
              {DIFFICULTY_ORDER.map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTY_INFO[d].label} ({DIFFICULTY_INFO[d].rating})
                </option>
              ))}
            </select>
          )}

          {/* Mobile quick toggles: Sound & Match Options */}
          <div className="flex sm:hidden items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowMobileOptions((v) => !v)}
              aria-expanded={showMobileOptions}
              aria-label="Match options"
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                showMobileOptions
                  ? 'bg-[#D99B38]/15 border-[#D99B38]/40 text-[#F4D08A]'
                  : 'bg-[#1A1C21] border-white/10 text-[#CFCBC2]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Options</span>
            </button>
            <button
              type="button"
              onClick={toggleSound}
              aria-label={soundEnabled ? 'Mute chess sounds' : 'Unmute chess sounds'}
              className="p-1.5 rounded-lg bg-[#1A1C21] border border-white/10 text-[#CFCBC2] cursor-pointer"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>

          {/* Desktop-always / Mobile-collapsible Secondary Match Options */}
          <div className={`${showMobileOptions ? 'flex' : 'hidden'} sm:flex flex-wrap items-center gap-2 w-full sm:w-auto pt-1 sm:pt-0`}>
            {gameMode === 'pvc' ? (
              <div className="flex items-center p-1 bg-[#1A1C21] border border-white/8 rounded-lg">
                {(['w', 'b'] as Color[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setPlayerColor(c);
                      startFreshGame(undefined, 'pvc', c);
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                      playerColor === c
                        ? 'bg-white/14 text-[#F2EFE9]'
                        : 'text-[#9A9892] hover:text-[#F2EFE9]'
                    }`}
                  >
                    Play {c === 'w' ? 'White' : 'Black'}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="White player profile"
                  value={pvpWhiteProfileId}
                  onChange={(e) => setPvpWhiteProfileId(e.target.value)}
                  className="px-2.5 py-2 text-xs font-medium bg-[#1A1C21] border border-white/10 rounded-lg text-[#F2EFE9] focus:outline-none focus:border-[#D99B38] cursor-pointer"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      White: {p.name}
                    </option>
                  ))}
                  <option value="guest">White: Guest (Unsaved)</option>
                </select>
                <select
                  aria-label="Black player profile"
                  value={pvpBlackProfileId}
                  onChange={(e) => setPvpBlackProfileId(e.target.value)}
                  className="px-2.5 py-2 text-xs font-medium bg-[#1A1C21] border border-white/10 rounded-lg text-[#F2EFE9] focus:outline-none focus:border-[#D99B38] cursor-pointer"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      Black: {p.name}
                    </option>
                  ))}
                  <option value="guest">Black: Guest (Unsaved)</option>
                </select>
                <button
                  type="button"
                  onClick={() => setAutoFlipPvP((v) => !v)}
                  className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                    autoFlipPvP
                      ? 'bg-[#D99B38]/15 border-[#D99B38]/40 text-[#F4D08A]'
                      : 'bg-[#1A1C21] border-white/10 text-[#A8A59E] hover:text-[#F2EFE9]'
                  }`}
                >
                  Auto-Flip: {autoFlipPvP ? 'On' : 'Off'}
                </button>
              </div>
            )}

            <select
              aria-label="Time control"
              value={timeControl}
              onChange={(e) => {
                const nextTc = e.target.value as TimeControlId;
                setTimeControl(nextTc);
                startFreshGame(undefined, undefined, undefined, nextTc);
              }}
              className="px-3 py-2 text-xs font-medium bg-[#1A1C21] border border-white/10 rounded-lg text-[#F2EFE9] focus:outline-none focus:border-[#D99B38] cursor-pointer"
            >
              {(Object.keys(TIME_CONTROLS) as TimeControlId[]).map((id) => (
                <option key={id} value={id}>
                  Clock: {TIME_CONTROLS[id].label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right Side: Player Profile, Board Finish & Desktop Sound */}
        <div className={`${showMobileOptions ? 'flex' : 'hidden'} sm:flex flex-wrap items-center gap-2`}>
          <PlayerProfileBar compact />

          <PieceStyleSelector />

          <select
            aria-label="Board finish"
            value={boardThemeId}
            onChange={(e) => onChangeBoardTheme(e.target.value as BoardThemeId)}
            className="px-3 py-2 text-xs font-medium bg-[#101526]/90 border border-white/12 rounded-lg text-[#F2EFE9] focus:outline-none focus:border-cyan-400 cursor-pointer"
          >
            {BOARD_THEME_LIST.map((t) => (
              <option key={t.id} value={t.id}>
                Board: {t.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={toggleSound}
            aria-label={soundEnabled ? 'Mute chess sounds' : 'Unmute chess sounds'}
            title={soundEnabled ? 'Sound On' : 'Sound Off'}
            className="hidden sm:inline-flex p-2 rounded-lg bg-[#1A1C21] border border-white/10 text-[#CFCBC2] hover:text-[#F2EFE9] hover:border-white/20 transition-colors cursor-pointer"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main 2-Column Playing Arena */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,640px)_minmax(340px,1fr)] gap-5 lg:gap-7 items-start">
        {/* Left Column: Evaluation Bar + Board + Player Strips */}
        <div className="flex flex-col gap-2.5 sm:gap-3 w-full max-w-[640px] mx-auto lg:mx-0">
          {renderPlayerStrip(topColor)}

          <div className="flex items-stretch gap-1.5 sm:gap-2.5">
            <EvalBar evalCp={displayedEvalCp} orientation={orientation} />
            <div className="flex-1 min-w-0 relative">
              <ChessBoard
                fen={displayedFen}
                orientation={orientation}
                theme={theme}
                interactive={!gameOverStatus.over && !isViewingHistory && !isAiThinking && !pendingBlunderPause}
                allowedColor={gameMode === 'pvc' ? playerColor : 'both'}
                lastMove={
                  latestRecord
                    ? {
                        from: latestRecord.move.from,
                        to: latestRecord.move.to,
                        san: latestRecord.move.san,
                      }
                    : null
                }
                arrows={boardArrows}
                highlights={boardHighlights}
                hintSquare={!isViewingHistory && hintLevel >= 2 ? briefing?.hintTier2Square : null}
                onMove={commitMove}
              />

              {/* Game Over Evaluation Banner */}
              {gameOverStatus.over && (
                <div className="mt-3 p-4 rounded-xl bg-[#1C1F26] border border-[#D99B38]/40 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-[#F2EFE9]">
                      {gameOverStatus.title}
                    </h3>
                    <p className="text-xs text-[#A8A59E] mt-0.5">{gameOverStatus.detail}</p>
                    {lastMatchXp && (
                      <p className="font-mono-tabular text-xs text-[#F4D08A] mt-1.5">
                        Saved to {lastMatchXp.profileName}: {lastMatchXp.accuracy}% Accuracy · +{lastMatchXp.xpEarned} XP
                        {lastMatchXp.secondProfileSummary ? ` | ${lastMatchXp.secondProfileSummary}` : ''}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => startFreshGame()}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#D99B38] text-[#141517] hover:bg-[#E4AA49] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Play Again
                  </button>
                </div>
              )}
            </div>
          </div>

          {renderPlayerStrip(bottomColor)}

          {/* Quick Board Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleUndo}
                disabled={records.length === 0 || isAiThinking}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#1A1C21] border border-white/10 text-[#CFCBC2] hover:text-[#F2EFE9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
                Takeback
              </button>
              <button
                type="button"
                onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#1A1C21] border border-white/10 text-[#CFCBC2] hover:text-[#F2EFE9] transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Flip
              </button>
              <button
                type="button"
                onClick={() => startFreshGame()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#1A1C21] border border-white/10 text-[#CFCBC2] hover:text-[#F2EFE9] transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restart
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopyPgn}
                disabled={records.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#1A1C21] border border-white/10 text-[#CFCBC2] hover:text-[#F2EFE9] disabled:opacity-40 transition-colors cursor-pointer"
              >
                {copiedPgn ? <Check className="w-3.5 h-3.5 text-[#10B981]" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedPgn ? 'Copied PGN' : 'Copy PGN'}
              </button>
              {!gameOverStatus.over && records.length > 0 && (
                <button
                  type="button"
                  onClick={() => setResignedBy(gameMode === 'pvc' ? playerColor : liveTurn)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#1A1C21] border border-white/10 text-[#EF4444]/90 hover:bg-[#EF4444]/10 transition-colors cursor-pointer"
                >
                  <Flag className="w-3.5 h-3.5" />
                  Resign
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Evaluation, Rank Progress, Coach & Move History */}
        <div className="flex flex-col gap-5">
          {/* Live Evaluation & Rookie-to-Pro Progress Card */}
          <section className="rounded-xl bg-[#0F1322]/84 backdrop-blur-md border border-cyan-400/18 shadow-[0_8px_32px_rgba(6,182,212,0.08)] p-5 space-y-4">
            <div className="flex items-baseline justify-between gap-3 pb-3 border-b border-white/10">
              <div>
                <h2 className="font-display text-base font-semibold text-[#F2EFE9]">
                  Position Evaluation &amp; Progress
                </h2>
                <p className="text-xs text-[#9AA2BE] mt-0.5">{displayedEvalText}</p>
              </div>
              <span className="font-mono-tabular text-lg font-semibold text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.45)]">
                {displayedEvalLabel}
              </span>
            </div>

            {/* Real-Time Stockfish Centipawn & Best-Move Readout (PvC) */}
            {gameMode === 'pvc' && (
              <div className="rounded-lg bg-[#0B0F1C]/90 border border-cyan-400/20 px-3.5 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Cpu className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                    <span className="font-semibold text-[#E8ECFA] truncate">
                      {activeLiveAnalysis?.source === 'fallback'
                        ? 'Local Engine'
                        : 'Stockfish 19'}
                    </span>
                    <span className="font-mono-tabular text-[11px] text-[#8E95AE] whitespace-nowrap">
                      {activeLiveAnalysis
                        ? `d${activeLiveAnalysis.depth}`
                        : isEngineEvaluating
                        ? 'analyzing…'
                        : 'ready'}
                    </span>
                    {isEngineEvaluating && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0"
                        aria-hidden="true"
                      />
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono-tabular text-[11px] font-semibold text-cyan-300">
                      {activeLiveAnalysis?.mateIn !== undefined
                        ? activeLiveAnalysis.mateIn === 0
                          ? 'Checkmate'
                          : `Mate in ${Math.abs(activeLiveAnalysis.mateIn)}`
                        : `${displayedEvalCp >= 0 ? '+' : ''}${Math.round(displayedEvalCp)} cp`}
                    </span>
                    {!isViewingHistory && !gameOverStatus.over && (
                      <button
                        type="button"
                        onClick={() => setShowEngineBestArrow((v) => !v)}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                          showEngineBestArrow
                            ? 'bg-sky-500/20 border-sky-400/50 text-sky-200'
                            : 'bg-white/5 border-white/10 text-[#9AA2BE] hover:text-white'
                        }`}
                      >
                        {showEngineBestArrow ? 'Arrow On' : 'Best Arrow'}
                      </button>
                    )}
                  </div>
                </div>

                {activeLiveAnalysis && activeLiveAnalysis.bestMoveSan && (
                  <div className="flex items-baseline justify-between gap-2 text-[11px] pt-0.5">
                    <span className="text-[#9AA2BE] truncate">
                      Best:{' '}
                      <strong className="font-mono-tabular text-emerald-300 font-semibold">
                        {activeLiveAnalysis.bestMoveSan}
                      </strong>
                      {activeLiveAnalysis.pvSan.length > 1 && (
                        <span className="font-mono-tabular text-[#7D85A3] ml-2">
                          Line: {activeLiveAnalysis.pvSan.slice(0, 5).join(' ')}
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Interactive Evaluation Sparkline across plies */}
            {records.length > 0 && (
              <div>
                <svg
                  viewBox="0 0 320 56"
                  className="w-full h-14 rounded-lg bg-[#0A0D18] border border-cyan-400/15 cursor-pointer"
                  aria-label="Game evaluation progression graph"
                >
                  <line x1="0" y1="28" x2="320" y2="28" stroke="rgba(255,255,255,0.14)" strokeDasharray="3 3" />
                  {(() => {
                    const pts = [startEvalCp, ...records.map((r) => r.evalCp)];
                    const mapY = (cp: number) => {
                      const clamped = Math.max(-700, Math.min(700, cp));
                      return 28 - (clamped / 700) * 23;
                    };
                    const coords = pts.map((cp, idx) => {
                      const x = pts.length === 1 ? 160 : 8 + (idx / (pts.length - 1)) * 304;
                      return { x, y: mapY(cp), idx: idx - 1 };
                    });
                    const polyline = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
                    const activePt = coords[activeViewIdx + 1] ?? coords[coords.length - 1];

                    return (
                      <>
                        <polyline
                          fill="none"
                          stroke="#22D3EE"
                          strokeWidth="2"
                          points={polyline}
                        />
                        {coords.map((c) => (
                          <circle
                            key={c.idx}
                            cx={c.x}
                            cy={c.y}
                            r="5"
                            fill="transparent"
                            onClick={() =>
                              handleSelectHistoryMove(c.idx >= records.length - 1 ? null : c.idx)
                            }
                          />
                        ))}
                        {activePt && (
                          <circle
                            cx={activePt.x}
                            cy={activePt.y}
                            r="3.6"
                            fill="#F472B6"
                            stroke="#0A0D18"
                            strokeWidth="1.2"
                          />
                        )}
                      </>
                    );
                  })()}
                </svg>
              </div>
            )}

            {/* White & Black Accuracy Breakdown */}
            <div className="grid grid-cols-2 divide-x divide-white/10 rounded-lg bg-[#0B0F1C] py-2.5 text-xs">
              <div className="px-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[#9AA2BE]">White Accuracy</span>
                  <span className="font-mono-tabular font-semibold text-cyan-200">
                    {whiteEval.accuracy !== null ? `${whiteEval.accuracy}%` : '—'}
                  </span>
                </div>
                <p className="font-mono-tabular text-[11px] text-[#78819E] mt-1">
                  {whiteEval.brilliantOrBest} best · {whiteEval.mistakes + whiteEval.blunders} errors
                </p>
              </div>
              <div className="px-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[#9AA2BE]">Black Accuracy</span>
                  <span className="font-mono-tabular font-semibold text-fuchsia-200">
                    {blackEval.accuracy !== null ? `${blackEval.accuracy}%` : '—'}
                  </span>
                </div>
                <p className="font-mono-tabular text-[11px] text-[#78819E] mt-1">
                  {blackEval.brilliantOrBest} best · {blackEval.mistakes + blackEval.blunders} errors
                </p>
              </div>
            </div>

            {/* Rookie -> Intermediate -> Advanced -> Pro Rank Bar */}
            <div className="pt-3 border-t border-white/10 space-y-2">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-[#D4D8E8]">
                  {activeProfile.name}:{' '}
                  <strong className="text-cyan-300 font-semibold">{progressSnap.currentRank.label}</strong>
                  <span className="font-mono-tabular text-[#8E95AE]">
                    {' '}· {progressSnap.totalXp} XP
                    {progressSnap.nextRank
                      ? ` (${progressSnap.nextRank.minXp - progressSnap.totalXp} to ${progressSnap.nextRank.label})`
                      : ''}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={onOpenProgress}
                  className="text-xs text-fuchsia-300 hover:text-cyan-300 font-medium cursor-pointer whitespace-nowrap transition-colors"
                >
                  Full Ladder
                </button>
              </div>
              <div className="h-2.5 w-full rounded-full bg-[#090C16] border border-white/8 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#22D3EE] via-[#8B5CF6] to-[#EC4899] shadow-[0_0_12px_rgba(34,211,238,0.65)] transition-all duration-500"
                  style={{ width: `${Math.max(4, progressSnap.overallProgressPct)}%` }}
                />
              </div>
              <div className="flex justify-between font-mono-tabular text-[10px] text-[#78819E]">
                {(['rookie', 'intermediate', 'advanced', 'pro'] as const).map((tierId) => (
                  <span
                    key={tierId}
                    className={
                      progressSnap.currentRank.id === tierId
                        ? 'text-cyan-300 font-semibold'
                        : undefined
                    }
                  >
                    {tierId.charAt(0).toUpperCase() + tierId.slice(1)}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* Training Coach Panel — Focused strictly on training the USER */}
          <section className="rounded-xl bg-[#0F1322]/84 backdrop-blur-md border border-violet-400/20 shadow-[0_8px_32px_rgba(139,92,246,0.08)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-white/8">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#F2EFE9]">
                  Training Coach · {activeProfile.name}
                </h2>
                <p className="text-xs text-[#9A9892] mt-0.5">
                  {currentOpening
                    ? `${currentOpening.eco} · ${currentOpening.name}`
                    : 'Trains your calculation, piece safety & tactical vision'}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {gameMode === 'pvc' && (
                  <button
                    type="button"
                    onClick={() => setGuidedTraining((v) => !v)}
                    title="When On, the coach pauses the bot if you make a mistake or blunder so you can rethink and retry."
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                      guidedTraining
                        ? 'bg-[#D99B38]/15 border-[#D99B38]/40 text-[#F4D08A]'
                        : 'bg-white/5 border-white/10 text-[#9A9892]'
                    }`}
                  >
                    Guided Guard: {guidedTraining ? 'On' : 'Off'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const next = !coachEnabled;
                    setCoachEnabled(next);
                    if (!next) setPendingBlunderPause(null);
                  }}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                    coachEnabled
                      ? 'bg-[#10B981]/15 border-[#10B981]/40 text-[#34D399]'
                      : 'bg-white/5 border-white/10 text-[#9A9892]'
                  }`}
                >
                  Coach: {coachEnabled ? 'Active' : 'Paused'}
                </button>
              </div>
            </div>

            {coachEnabled ? (
              <div className="mt-4 space-y-4">
                {/* 1. Interactive Coach Intervention (Blunder Guard before Bot responds) */}
                {pendingBlunderPause && !isViewingHistory ? (
                  <div className="p-4 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/35 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <ShieldAlert className="w-4 h-4 text-[#FCA5A5] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-[#FCA5A5]">
                          {pendingBlunderPause.headline}
                        </p>
                        <p className="text-xs text-[#E5E0D5] leading-relaxed mt-1">
                          {pendingBlunderPause.reasonWithoutAnswer}
                        </p>
                      </div>
                    </div>

                    {pendingBlunderPause.revealAnswer && pendingBlunderPause.bestMoveSan && (
                      <p className="text-xs font-medium text-[#34D399] bg-[#10B981]/10 border border-[#10B981]/25 rounded-lg px-3 py-2">
                        Stronger candidate: Play{' '}
                        <span className="font-mono-tabular font-semibold">
                          {pendingBlunderPause.bestMoveSan}
                        </span>{' '}
                        (shown in green on the board).
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleUndo}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-[#D99B38] text-[#141517] hover:bg-[#E4AA49] transition-colors cursor-pointer"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        Take Back &amp; Try Again
                      </button>

                      {!pendingBlunderPause.revealAnswer && pendingBlunderPause.bestMoveSan && (
                        <button
                          type="button"
                          onClick={() =>
                            setPendingBlunderPause((prev) =>
                              prev ? { ...prev, revealAnswer: true } : null
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#10B981]/15 border border-[#10B981]/35 text-[#34D399] hover:bg-[#10B981]/25 transition-colors cursor-pointer"
                        >
                          <Lightbulb className="w-3.5 h-3.5" />
                          Show Better Move
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setPendingBlunderPause(null)}
                        className="px-3 py-2 text-xs font-medium rounded-lg bg-white/6 border border-white/10 text-[#CFCBC2] hover:text-[#F2EFE9] transition-colors cursor-pointer"
                      >
                        Continue Anyway
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* 2. Opponent Reply Briefing (strictly from the USER's POV) */}
                    {opponentCue && !isViewingHistory && !gameOverStatus.over && (
                      <div
                        className={`p-3.5 rounded-lg border space-y-1 text-xs ${
                          opponentCue.severity === 'alert' || opponentCue.severity === 'warning'
                            ? 'bg-[#EF4444]/10 border-[#EF4444]/30'
                            : opponentCue.severity === 'opportunity'
                            ? 'bg-[#10B981]/10 border-[#10B981]/30'
                            : 'bg-[#14161A] border-white/8'
                        }`}
                      >
                        <p
                          className={`font-semibold ${
                            opponentCue.severity === 'alert' || opponentCue.severity === 'warning'
                              ? 'text-[#FCA5A5]'
                              : opponentCue.severity === 'opportunity'
                              ? 'text-[#34D399]'
                              : 'text-[#F4D08A]'
                          }`}
                        >
                          {opponentCue.headline}
                        </p>
                        <p className="text-[#CFCBC2] leading-relaxed">{opponentCue.guidance}</p>
                      </div>
                    )}

                    {/* 3. User's Move Feedback (never replaced by bot self-grading in PvC) */}
                    {activeFeedback ? (
                      <div className="space-y-2.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="flex items-baseline gap-2">
                            <span className="text-[11px] uppercase tracking-wider text-[#8B8881]">
                              {isViewingHistory
                                ? 'Inspected move'
                                : gameMode === 'pvc'
                                ? 'Your last move'
                                : activeFeedback.moveColor === 'w'
                                ? 'White move'
                                : 'Black move'}
                            </span>
                            <span className="font-mono-tabular text-base font-semibold text-[#F2EFE9]">
                              {activeFeedback.moveColor === 'w' ? '' : '…'}
                              {activeFeedback.moveSan}
                            </span>
                            <span className={`text-sm font-semibold ${qualityStyle(activeFeedback.quality)}`}>
                              {activeFeedback.headline} {activeFeedback.symbol}
                            </span>
                          </div>
                          <span className="font-mono-tabular text-xs text-[#9A9892]">
                            {activeFeedback.evalAfter >= 0 ? '+' : ''}
                            {(activeFeedback.evalAfter / 100).toFixed(1)}
                          </span>
                        </div>

                        <p className="text-sm text-[#CFCBC2] leading-relaxed">
                          {activeFeedback.explanation}
                        </p>

                        {(activeFeedback.quality === 'mistake' || activeFeedback.quality === 'blunder') &&
                          !isViewingHistory &&
                          !isAiThinking && (
                            <button
                              type="button"
                              onClick={handleUndo}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#D99B38]/15 border border-[#D99B38]/40 text-[#F4D08A] hover:bg-[#D99B38]/25 transition-colors cursor-pointer"
                            >
                              <Undo2 className="w-3.5 h-3.5" />
                              Retry Move (Try {activeFeedback.bestMoveSan})
                            </button>
                          )}

                        {activeFeedback.motifs.length > 0 && (
                          <div className="pt-2.5 border-t border-white/8 space-y-2">
                            {activeFeedback.motifs.map((motif, i) => (
                              <div key={i} className="text-xs leading-relaxed">
                                <span className="font-semibold text-[#E5A93B]">{motif.name}</span>
                                <span className="text-[#9A9892]"> — {motif.description}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-[#A8A59E] leading-relaxed">
                          Make your move (click or drag any piece). Your coach tracks only <strong className="text-[#F2EFE9]">your</strong> tactical precision, flags opponent threats against your pieces, and pauses if Guided Guard spots a blunder.
                        </p>

                        {/* Personalized Coach Training Focus for Active Player */}
                        {(() => {
                          const focus = getCoachTrainingFocus(progressSnap);
                          return (
                            <div className="p-3.5 rounded-lg bg-[#14161A] border border-white/8 space-y-1.5">
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#F4D08A]">
                                <Compass className="w-3.5 h-3.5" />
                                Coach Focus for {activeProfile.name}: {focus.headline}
                              </div>
                              <p className="text-xs text-[#9A9892] leading-relaxed">{focus.advice}</p>
                              {(onJumpToChapter || onJumpToFundamentals) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (focus.target === 'fundamentals') onJumpToFundamentals?.();
                                    else if (focus.chapter) onJumpToChapter?.(focus.chapter);
                                  }}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#D99B38] hover:text-[#F4D08A] pt-1 cursor-pointer"
                                >
                                  {focus.actionLabel}
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </>
                )}

                {/* Coach Utility Actions */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/8">
                  <button
                    type="button"
                    onClick={handleRequestHint}
                    disabled={gameOverStatus.over || isViewingHistory || isAiThinking || Boolean(pendingBlunderPause)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#10B981]/14 border border-[#10B981]/35 text-[#34D399] hover:bg-[#10B981]/22 disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                    {hintLevel === 0
                      ? 'Coach Hint'
                      : hintLevel === 1
                      ? 'Highlight Piece'
                      : hintLevel === 2
                      ? 'Show Best Arrow'
                      : 'Best Move Shown'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowThreatVision((v) => !v)}
                    disabled={gameOverStatus.over}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                      showThreatVision
                        ? 'bg-[#EF4444]/15 border-[#EF4444]/40 text-[#FCA5A5]'
                        : 'bg-white/5 border-white/10 text-[#CFCBC2] hover:text-[#F2EFE9]'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Threat Vision: {showThreatVision ? 'On' : 'Off'}
                  </button>

                  <button
                    type="button"
                    onClick={handleExplainPosition}
                    disabled={gameOverStatus.over}
                    className="px-3 py-2 text-xs font-medium rounded-lg bg-white/5 border border-white/10 text-[#CFCBC2] hover:text-[#F2EFE9] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Analyze Position
                  </button>
                </div>

                {/* Hint / Position Briefing Output */}
                {briefing && !pendingBlunderPause && (
                  <div className="p-3.5 rounded-lg bg-[#14161A] border border-white/8 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-[#9A9892]">
                      <span className="font-semibold text-[#F2EFE9]">{briefing.turnLabel}</span>
                      {briefing.threatMove && showThreatVision && (
                        <span className="text-[#FCA5A5] font-mono-tabular">
                          Threat: {briefing.threatMove.san}
                        </span>
                      )}
                    </div>
                    <p className="text-[#CFCBC2] leading-relaxed">{briefing.planSummary}</p>
                    {hintLevel >= 1 && (
                      <p className="text-[#34D399] font-medium pt-1">
                        Hint: {briefing.hintTier1}
                        {hintLevel >= 3 &&
                        (activeLiveAnalysis?.bestMoveSan || briefing.bestMove)
                          ? ` (${activeLiveAnalysis?.bestMoveSan ?? briefing.bestMove?.san})`
                          : ''}
                      </p>
                    )}
                  </div>
                )}

                {currentOpening?.coursePages && (
                  <p className="text-xs text-[#9A9892]">
                    Course connection · {currentOpening.name} appears on {currentOpening.coursePages} of Ten Steps.
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-xs text-[#9A9892]">
                Coach feedback is paused for unassisted match play. Re-enable anytime for move evaluation and hints.
              </p>
            )}
          </section>

          {/* Algebraic Move History Side Panel */}
          <MoveHistoryPanel
            records={records}
            viewIndex={viewIndex}
            isReplaying={isReplaying}
            onSelectMove={handleSelectHistoryMove}
            onToggleReplay={handleToggleReplay}
          />
        </div>
      </div>
    </div>
  );
};
