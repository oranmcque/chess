import type { Color } from 'chess.js';
import type {
  Difficulty,
  GameEvaluationRecord,
  GameMode,
  MoveRecord,
  PlayerProgressData,
  PlayerRankId,
} from '../types/chess';
import { TACTICS_PUZZLES } from '../data/tacticsCourse';
import { FUNDAMENTAL_LESSONS } from '../data/fundamentals';
import { getActiveProfileId, scopedStorageKey, subscribeProfiles } from './profiles';

export interface RankTierDefinition {
  id: PlayerRankId;
  label: string;
  eloRange: string;
  minXp: number;
  nextXp: number | null;
  targetAccuracy: number;
  summary: string;
  milestoneFocus: string;
}

export const RANK_TIERS: RankTierDefinition[] = [
  {
    id: 'rookie',
    label: 'Rookie',
    eloRange: '600–950',
    minXp: 0,
    nextXp: 800,
    targetAccuracy: 58,
    summary: 'Building board awareness, safe captures, and castling early.',
    milestoneFocus: 'Complete core Fundamentals drills, avoid loose pieces, and score a win vs Rookie.',
  },
  {
    id: 'intermediate',
    label: 'Intermediate',
    eloRange: '950–1350',
    minXp: 800,
    nextXp: 2200,
    targetAccuracy: 72,
    summary: 'Spotting forks, pins, and skewers while maintaining solid development.',
    milestoneFocus: 'Solve Steps 1–4 tactics, keep accuracy above 70%, and defeat Intermediate.',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    eloRange: '1350–1800',
    minXp: 2200,
    nextXp: 4400,
    targetAccuracy: 82,
    summary: 'Calculating multi-move combinations, deflections, and endgame opposition.',
    milestoneFocus: 'Master Steps 5–8 combinations, sustain 80%+ accuracy, and beat Advanced.',
  },
  {
    id: 'pro',
    label: 'Pro',
    eloRange: '1800+',
    minXp: 4400,
    nextXp: null,
    targetAccuracy: 88,
    summary: 'High-accuracy tactical vision across all Ten Steps and master-level precision.',
    milestoneFocus: 'Complete the Ten Steps course and defeat Pro with consistent accuracy.',
  },
];

export const DIFFICULTY_INFO: Record<
  Difficulty,
  { label: string; rating: string; summary: string }
> = {
  rookie: {
    label: 'Rookie',
    rating: '750',
    summary: 'Forgiving tactical vision suited for learning piece safety and checkmates.',
  },
  intermediate: {
    label: 'Intermediate',
    rating: '1200',
    summary: 'Follows classical openings and punishes hanging pieces and basic forks.',
  },
  advanced: {
    label: 'Advanced',
    rating: '1650',
    summary: 'Deep tactical calculation with quiescence search and endgame discipline.',
  },
  pro: {
    label: 'Pro',
    rating: '2100',
    summary: 'Zero move-noise full search for tournament and master preparation.',
  },
};

function defaultProgressData(): PlayerProgressData {
  return {
    gameXp: 0,
    games: [],
    byDifficulty: {
      rookie: { wins: 0, draws: 0, losses: 0, bestAccuracy: null },
      intermediate: { wins: 0, draws: 0, losses: 0, bestAccuracy: null },
      advanced: { wins: 0, draws: 0, losses: 0, bestAccuracy: null },
      pro: { wins: 0, draws: 0, losses: 0, bestAccuracy: null },
    },
  };
}

export function loadProgressData(profileId?: string): PlayerProgressData {
  if (typeof window === 'undefined') return defaultProgressData();
  try {
    const raw = localStorage.getItem(scopedStorageKey('progress', profileId));
    if (!raw) return defaultProgressData();
    const parsed = JSON.parse(raw) as Partial<PlayerProgressData>;
    const base = defaultProgressData();
    return {
      gameXp: typeof parsed.gameXp === 'number' ? parsed.gameXp : 0,
      games: Array.isArray(parsed.games) ? parsed.games : [],
      byDifficulty: {
        rookie: parsed.byDifficulty?.rookie ?? base.byDifficulty.rookie,
        intermediate: parsed.byDifficulty?.intermediate ?? base.byDifficulty.intermediate,
        advanced: parsed.byDifficulty?.advanced ?? base.byDifficulty.advanced,
        pro: parsed.byDifficulty?.pro ?? base.byDifficulty.pro,
      },
    };
  } catch {
    return defaultProgressData();
  }
}

export function loadSolvedPuzzleIds(profileId?: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(scopedStorageKey('puzzles', profileId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSolvedPuzzleId(puzzleId: string, profileId?: string): string[] {
  const pid = profileId ?? getActiveProfileId();
  const current = loadSolvedPuzzleIds(pid);
  if (current.includes(puzzleId)) return current;
  const next = [...current, puzzleId];
  try {
    localStorage.setItem(scopedStorageKey('puzzles', pid), JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
  notifyProgressChanged();
  return next;
}

export function loadCompletedFundamentalIds(profileId?: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(scopedStorageKey('fundamentals', profileId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCompletedFundamentalId(lessonId: string, profileId?: string): string[] {
  const pid = profileId ?? getActiveProfileId();
  const current = loadCompletedFundamentalIds(pid);
  if (current.includes(lessonId)) return current;
  const next = [...current, lessonId];
  try {
    localStorage.setItem(scopedStorageKey('fundamentals', pid), JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
  notifyProgressChanged();
  return next;
}

export function loadDailyXpCounts(profileId?: string): { dailyCount: number; bonusCount: number } {
  if (typeof window === 'undefined') return { dailyCount: 0, bonusCount: 0 };
  try {
    const raw = localStorage.getItem(scopedStorageKey('daily', profileId));
    if (!raw) return { dailyCount: 0, bonusCount: 0 };
    const parsed = JSON.parse(raw) as { completedDates?: unknown; bonusSolvedIds?: unknown };
    return {
      dailyCount: Array.isArray(parsed.completedDates) ? parsed.completedDates.length : 0,
      bonusCount: Array.isArray(parsed.bonusSolvedIds) ? parsed.bonusSolvedIds.length : 0,
    };
  } catch {
    return { dailyCount: 0, bonusCount: 0 };
  }
}

const progressListeners = new Set<() => void>();

export function notifyProgressChanged() {
  progressListeners.forEach((cb) => cb());
}

export function subscribeProgress(cb: () => void): () => void {
  progressListeners.add(cb);
  const unsubProfiles = subscribeProfiles(cb);
  return () => {
    progressListeners.delete(cb);
    unsubProfiles();
  };
}

/**
 * Converts centipawn loss on a single move into a 0–100% accuracy score.
 */
export function moveAccuracyFromCpLoss(cpLoss: number): number {
  const safe = Math.max(0, Math.min(800, cpLoss));
  const raw = 103.1668 * Math.exp(-0.004 * safe) - 3.1669;
  return Math.max(0, Math.min(100, raw));
}

export interface SideEvaluationSummary {
  movesCount: number;
  accuracy: number | null;
  avgCpLoss: number;
  brilliantOrBest: number;
  good: number;
  inaccuracies: number;
  mistakes: number;
  blunders: number;
}

export function evaluateSideMoves(records: MoveRecord[], color: Color): SideEvaluationSummary {
  const sideRecords = records.filter((r) => r.move.color === color);
  if (sideRecords.length === 0) {
    return {
      movesCount: 0,
      accuracy: null,
      avgCpLoss: 0,
      brilliantOrBest: 0,
      good: 0,
      inaccuracies: 0,
      mistakes: 0,
      blunders: 0,
    };
  }

  let totalAcc = 0;
  let totalCpLoss = 0;
  let brilliantOrBest = 0;
  let good = 0;
  let inaccuracies = 0;
  let mistakes = 0;
  let blunders = 0;

  for (const rec of sideRecords) {
    const cpLoss =
      rec.cpLoss ??
      rec.feedback?.cpLoss ??
      (rec.feedback
        ? Math.max(
            0,
            (rec.feedback.evalBefore - rec.feedback.evalAfter) * (color === 'w' ? 1 : -1)
          )
        : 0);

    totalCpLoss += cpLoss;
    totalAcc += moveAccuracyFromCpLoss(cpLoss);

    const q = rec.feedback?.quality;
    if (q === 'brilliant' || q === 'best' || q === 'book') brilliantOrBest++;
    else if (q === 'inaccuracy') inaccuracies++;
    else if (q === 'mistake') mistakes++;
    else if (q === 'blunder') blunders++;
    else good++;
  }

  return {
    movesCount: sideRecords.length,
    accuracy: Math.round(totalAcc / sideRecords.length),
    avgCpLoss: Math.round(totalCpLoss / sideRecords.length),
    brilliantOrBest,
    good,
    inaccuracies,
    mistakes,
    blunders,
  };
}

export function describeEvalPosition(evalCp: number): string {
  if (Math.abs(evalCp) >= 98000) {
    return evalCp > 0 ? 'White has forced mate' : 'Black has forced mate';
  }
  const abs = Math.abs(evalCp);
  if (abs < 35) return 'Equal position';
  const side = evalCp > 0 ? 'White' : 'Black';
  if (abs < 110) return `Slight ${side} edge`;
  if (abs < 260) return `Clear ${side} advantage`;
  if (abs < 500) return `Strong ${side} advantage`;
  return `Winning ${side} advantage`;
}

export interface ComputedProgressSnapshot {
  profileId: string;
  totalXp: number;
  puzzleXp: number;
  dailyXp: number;
  fundamentalXp: number;
  gameXp: number;
  currentRank: RankTierDefinition;
  nextRank: RankTierDefinition | null;
  xpIntoRank: number;
  xpSpanForNext: number;
  rankProgressPct: number;
  overallProgressPct: number;
  solvedPuzzlesCount: number;
  totalPuzzlesCount: number;
  completedFundamentalsCount: number;
  totalFundamentalsCount: number;
  averageAccuracy: number | null;
  estimatedRating: number;
  totalGames: number;
  totalWins: number;
  data: PlayerProgressData;
}

export function getProgressSnapshot(profileId?: string): ComputedProgressSnapshot {
  const pid = profileId ?? getActiveProfileId();
  const data = loadProgressData(pid);
  const solvedIds = loadSolvedPuzzleIds(pid);
  const fundamentalIds = loadCompletedFundamentalIds(pid);
  const dailyCounts = loadDailyXpCounts(pid);

  const puzzleXp = solvedIds.length * 45;
  const dailyXp = dailyCounts.dailyCount * 85 + dailyCounts.bonusCount * 45;
  const fundamentalXp = fundamentalIds.length * 60;
  const gameXp = data.gameXp;
  const totalXp = puzzleXp + dailyXp + fundamentalXp + gameXp;

  let currentRank = RANK_TIERS[0];
  for (const tier of RANK_TIERS) {
    if (totalXp >= tier.minXp) {
      currentRank = tier;
    }
  }
  const idx = RANK_TIERS.findIndex((t) => t.id === currentRank.id);
  const nextRank = idx < RANK_TIERS.length - 1 ? RANK_TIERS[idx + 1] : null;

  const xpIntoRank = totalXp - currentRank.minXp;
  const xpSpanForNext = nextRank ? nextRank.minXp - currentRank.minXp : 1;
  const rankProgressPct = nextRank
    ? Math.min(100, Math.max(0, Math.round((xpIntoRank / xpSpanForNext) * 100)))
    : 100;

  const maxTierXp = RANK_TIERS[RANK_TIERS.length - 1].minXp;
  const overallProgressPct = Math.min(100, Math.round((totalXp / maxTierXp) * 100));

  const averageAccuracy =
    data.games.length > 0
      ? Math.round(
          data.games.reduce((acc, g) => acc + g.playerAccuracy, 0) / data.games.length
        )
      : null;

  const totalWins = data.games.filter((g) => g.result === 'win').length;

  const tierBaseRating =
    currentRank.id === 'rookie'
      ? 650 + Math.round((rankProgressPct / 100) * 300)
      : currentRank.id === 'intermediate'
      ? 950 + Math.round((rankProgressPct / 100) * 400)
      : currentRank.id === 'advanced'
      ? 1350 + Math.round((rankProgressPct / 100) * 450)
      : 1800 + Math.min(400, Math.round((totalXp - 4400) / 10));

  const accAdjust =
    averageAccuracy !== null ? Math.round((averageAccuracy - 68) * 2.2) : 0;
  const estimatedRating = Math.max(600, Math.min(2300, tierBaseRating + accAdjust));

  return {
    profileId: pid,
    totalXp,
    puzzleXp,
    dailyXp,
    fundamentalXp,
    gameXp,
    currentRank,
    nextRank,
    xpIntoRank,
    xpSpanForNext,
    rankProgressPct,
    overallProgressPct,
    solvedPuzzlesCount: solvedIds.length,
    totalPuzzlesCount: TACTICS_PUZZLES.length,
    completedFundamentalsCount: fundamentalIds.length,
    totalFundamentalsCount: FUNDAMENTAL_LESSONS.length,
    averageAccuracy,
    estimatedRating,
    totalGames: data.games.length,
    totalWins,
    data,
  };
}

export interface CoachTrainingFocus {
  headline: string;
  advice: string;
  actionLabel: string;
  target: 'fundamentals' | 'course' | 'play';
  chapter?: number;
}

export function getCoachTrainingFocus(snapshot: ComputedProgressSnapshot): CoachTrainingFocus {
  const recentGames = snapshot.data.games.slice(0, 5);
  const recentBlunders = recentGames.reduce((sum, g) => sum + g.blunderCount, 0);

  if (snapshot.completedFundamentalsCount < 4) {
    return {
      headline: 'Master Piece Safety & Special Moves',
      advice:
        'Complete the interactive Fundamentals drills (Castling, En Passant, Promotion, and Piece Safety) so you stop dropping material early.',
      actionLabel: 'Open Fundamentals Drills',
      target: 'fundamentals',
    };
  }

  if (recentGames.length > 0 && recentBlunders >= 3) {
    return {
      headline: 'Eliminate Loose Pieces (LDPO)',
      advice:
        'Your recent matches show tactical blunders on undefended pieces. Train Step 2 (Loose & Outnumbered Pieces) to spot hanging targets before moving.',
      actionLabel: 'Train Step 2: Loose Pieces',
      target: 'course',
      chapter: 2,
    };
  }

  if (snapshot.solvedPuzzlesCount < 10) {
    return {
      headline: 'Sharpen Double Attacks & Pins',
      advice:
        'Practicing Forks, Pins, and Skewers in Step 3 builds the pattern recognition needed to jump from Rookie to Intermediate.',
      actionLabel: 'Train Step 3: Forks & Pins',
      target: 'course',
      chapter: 3,
    };
  }

  if (snapshot.currentRank.id === 'intermediate') {
    return {
      headline: 'Build Multi-Move Calculation',
      advice:
        'Advance through Deflection, Decoy, and Discovered Attacks (Steps 4–6), then test your accuracy against the Intermediate or Advanced bot.',
      actionLabel: 'Train Step 5: Deflection',
      target: 'course',
      chapter: 5,
    };
  }

  return {
    headline: 'High-Precision Combination Mastery',
    advice:
      'Challenge Step 9–10 master studies and aim for 85%+ accuracy against the Advanced and Pro engines.',
    actionLabel: 'Train Step 9: Combinations',
    target: 'course',
    chapter: 9,
  };
}

export function recordCompletedGame(params: {
  id: string;
  mode: GameMode;
  difficulty: Difficulty;
  playerColor: Color;
  result: 'win' | 'draw' | 'loss';
  reason: string;
  records: MoveRecord[];
  openingName?: string;
  profileId?: string;
}): GameEvaluationRecord | null {
  const { id, mode, difficulty, playerColor, result, reason, records, openingName, profileId } =
    params;

  const pid = profileId ?? getActiveProfileId();
  const evalSummary = evaluateSideMoves(records, playerColor);

  // Require at least 3 moves by this player to evaluate
  if (evalSummary.movesCount < 3) return null;

  const data = loadProgressData(pid);
  if (data.games.some((g) => g.id === id)) return null;

  const accuracy = evalSummary.accuracy ?? 65;

  let xpEarned = 0;
  if (mode === 'pvp') {
    xpEarned = result === 'win' ? 130 : result === 'draw' ? 85 : 50;
  } else {
    const winBase: Record<Difficulty, number> = {
      rookie: 150,
      intermediate: 240,
      advanced: 360,
      pro: 520,
    };
    const drawBase: Record<Difficulty, number> = {
      rookie: 70,
      intermediate: 110,
      advanced: 170,
      pro: 250,
    };
    if (result === 'win') xpEarned = winBase[difficulty];
    else if (result === 'draw') xpEarned = drawBase[difficulty];
    else xpEarned = 45;
  }

  if (accuracy >= 92) xpEarned += 110;
  else if (accuracy >= 84) xpEarned += 70;
  else if (accuracy >= 74) xpEarned += 35;

  const record: GameEvaluationRecord = {
    id,
    dateIso: new Date().toISOString(),
    mode,
    difficulty,
    playerColor,
    result,
    reason,
    movesCount: evalSummary.movesCount,
    playerAccuracy: accuracy,
    avgCpLoss: evalSummary.avgCpLoss,
    bestCount: evalSummary.brilliantOrBest,
    mistakeCount: evalSummary.mistakes,
    blunderCount: evalSummary.blunders,
    openingName,
    xpEarned,
  };

  data.gameXp += xpEarned;
  data.games = [record, ...data.games].slice(0, 30);

  if (mode === 'pvc') {
    const diffStat = data.byDifficulty[difficulty];
    if (result === 'win') diffStat.wins += 1;
    else if (result === 'draw') diffStat.draws += 1;
    else diffStat.losses += 1;
    diffStat.bestAccuracy =
      diffStat.bestAccuracy === null ? accuracy : Math.max(diffStat.bestAccuracy, accuracy);
  }

  try {
    localStorage.setItem(scopedStorageKey('progress', pid), JSON.stringify(data));
  } catch {
    // ignore storage quota errors
  }

  notifyProgressChanged();
  return record;
}

export function resetPlayerProgress(profileId?: string) {
  if (typeof window === 'undefined') return;
  const pid = profileId ?? getActiveProfileId();
  try {
    localStorage.removeItem(scopedStorageKey('progress', pid));
    localStorage.removeItem(scopedStorageKey('puzzles', pid));
    localStorage.removeItem(scopedStorageKey('fundamentals', pid));
    localStorage.removeItem(scopedStorageKey('daily', pid));
  } catch {
    // ignore
  }
  notifyProgressChanged();
}
