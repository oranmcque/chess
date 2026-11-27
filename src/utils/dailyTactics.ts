import { Chess, type PieceSymbol, type Square } from 'chess.js';
import {
  DAILY_PUZZLE_POOL,
  type DailyDifficulty,
  type DailyTacticPuzzle,
} from '../data/dailyTactics';
import { TACTICS_PUZZLES } from '../data/tacticsCourse';
import { getActiveProfileId, scopedStorageKey } from './profiles';
import { notifyProgressChanged } from './progression';

const DAILY_CACHE_KEY = 'ten-steps-daily-cache-v1';

export interface DailyProgressState {
  completedDates: string[];
  bonusSolvedIds: string[];
}

export function getLocalDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatReadableDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function hashDateKey(dateKey: string): number {
  let h = 2166136261;
  for (let i = 0; i < dateKey.length; i++) {
    h ^= dateKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function formatLichessTheme(raw: string): string {
  const map: Record<string, string> = {
    mateIn1: 'Mate in 1',
    mateIn2: 'Mate in 2',
    mateIn3: 'Mate in 3',
    mateIn4: 'Mate in 4',
    discoveredAttack: 'Discovered Attack',
    doubleCheck: 'Double Check',
    backRankMate: 'Back-Rank Mate',
    smotheredMate: 'Smothered Mate',
    arabianMate: 'Arabian Mate',
    bodenMate: 'Boden’s Mate',
    anastasiaMate: 'Anastasia’s Mate',
    queensideAttack: 'Queenside Attack',
    kingsideAttack: 'Kingside Attack',
    crushing: 'Decisive Advantage',
    advantage: 'Winning Tactic',
    endgame: 'Endgame Tactic',
    middlegame: 'Middlegame Tactic',
    opening: 'Opening Trap',
    short: 'Sharp Combination',
    long: 'Deep Calculation',
    veryLong: 'Master Calculation',
    xRayAttack: 'X-Ray Attack',
    exposedKing: 'Exposed King',
    hangingPiece: 'Loose Piece (LDPO)',
    trappedPiece: 'Trapped Piece',
    quietMove: 'Quiet Move',
    zugzwang: 'Zugzwang',
  };
  if (map[raw]) return map[raw];
  return raw
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function uciToMoveObj(uci: string): {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
} | null {
  if (!uci || uci.length < 4) return null;
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const promo = uci.length >= 5 ? (uci[4] as PieceSymbol) : undefined;
  return { from, to, promotion: promo };
}

interface LichessDailyResponse {
  game?: {
    pgn?: string;
    players?: Array<{ name?: string; rating?: number; color?: string }>;
  };
  puzzle?: {
    id?: string;
    rating?: number;
    solution?: string[];
    themes?: string[];
    initialPly?: number;
  };
}

function parseLichessDaily(data: LichessDailyResponse, dateKey: string): DailyTacticPuzzle | null {
  const pgnText = data.game?.pgn;
  const uciSolution = data.puzzle?.solution;
  if (!pgnText || !Array.isArray(uciSolution) || uciSolution.length === 0) {
    return null;
  }

  const tokens = pgnText.trim().split(/\s+/);
  const initialPly = typeof data.puzzle?.initialPly === 'number' ? data.puzzle.initialPly : tokens.length - 1;
  const firstUci = uciToMoveObj(uciSolution[0]);
  if (!firstUci) return null;

  // Test initialPly + 1 then initialPly to locate exact diagram FEN
  const candidates = [initialPly + 1, initialPly, tokens.length];
  let matchedChess: Chess | null = null;
  let lastSetupMove: { from: Square; to: Square; san?: string } | null = null;

  for (const plyCount of candidates) {
    if (plyCount < 0 || plyCount > tokens.length) continue;
    const c = new Chess();
    let ok = true;
    let prev: { from: Square; to: Square; san?: string } | null = null;
    for (let i = 0; i < plyCount; i++) {
      try {
        const m = c.move(tokens[i]);
        if (!m) {
          ok = false;
          break;
        }
        prev = { from: m.from, to: m.to, san: m.san };
      } catch {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    const probe = new Chess(c.fen());
    try {
      const m = probe.move(firstUci);
      if (m) {
        matchedChess = c;
        lastSetupMove = prev;
        break;
      }
    } catch {
      // continue trying next candidate
    }
  }

  if (!matchedChess) return null;

  const fen = matchedChess.fen();
  const solverColor = matchedChess.turn();
  const verify = new Chess(fen);
  const solutionSan: string[] = [];
  let firstMoveFrom: Square | null = null;
  let firstMoveTo: Square | null = null;

  for (let i = 0; i < uciSolution.length; i++) {
    const obj = uciToMoveObj(uciSolution[i]);
    if (!obj) return null;
    try {
      const m = verify.move(obj);
      if (!m) return null;
      if (i === 0) {
        firstMoveFrom = m.from;
        firstMoveTo = m.to;
      }
      solutionSan.push(m.san);
    } catch {
      return null;
    }
  }

  if (solutionSan.length === 0) return null;

  const rating = typeof data.puzzle?.rating === 'number' ? data.puzzle.rating : 1650;
  const difficulty: DailyDifficulty =
    rating < 1500 ? 'intermediate' : rating < 1850 ? 'advanced' : 'pro';

  const rawThemes = Array.isArray(data.puzzle?.themes) ? data.puzzle.themes : ['tactics'];
  const themes = rawThemes.slice(0, 3).map(formatLichessTheme);
  const players = data.game?.players?.map((p) => p.name).filter(Boolean).join(' vs ');

  const solverMovesCount = Math.ceil(solutionSan.length / 2);

  return {
    id: `lichess-${dateKey}-${data.puzzle?.id ?? 'daily'}`,
    title: `Daily Live Challenge · ${themes[0] ?? 'Tactical Combination'}`,
    difficulty,
    rating,
    source: 'lichess',
    dateKey,
    players: players || undefined,
    fen,
    setupLastMove: lastSetupMove,
    solutionMoves: solutionSan,
    solverColor,
    themes,
    prompt: `${solverColor === 'w' ? 'White' : 'Black'} to move. Find the strongest ${solverMovesCount}-move tactical sequence (${themes.join(', ')}).`,
    hintText: `Look carefully for forcing checks, captures, and ${themes[0]?.toLowerCase() ?? 'tactical'} motifs starting from ${firstMoveFrom ?? 'your active pieces'}.`,
    explanation: `Solution: ${solutionSan.join(' ')}. (${themes.join(' · ')}, rated ${rating}).`,
    visualArrows:
      firstMoveFrom && firstMoveTo
        ? [{ from: firstMoveFrom, to: firstMoveTo, color: 'emerald' }]
        : undefined,
  };
}

export function getCuratedDailyPuzzle(dateKey = getLocalDateKey()): DailyTacticPuzzle {
  const idx = hashDateKey(dateKey) % DAILY_PUZZLE_POOL.length;
  const base = DAILY_PUZZLE_POOL[idx];
  return {
    ...base,
    dateKey,
  };
}

export async function fetchDailyTactic(forceRefresh = false): Promise<DailyTacticPuzzle> {
  const dateKey = getLocalDateKey();

  if (!forceRefresh && typeof window !== 'undefined') {
    try {
      const cachedRaw = localStorage.getItem(DAILY_CACHE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as DailyTacticPuzzle;
        if (cached && cached.dateKey === dateKey && cached.fen && Array.isArray(cached.solutionMoves)) {
          return cached;
        }
      }
    } catch {
      // ignore invalid cache
    }
  }

  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3500);
    const res = await fetch('https://lichess.org/api/puzzle/daily', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    window.clearTimeout(timer);

    if (res.ok) {
      const json = (await res.json()) as LichessDailyResponse;
      const parsed = parseLichessDaily(json, dateKey);
      if (parsed) {
        try {
          localStorage.setItem(DAILY_CACHE_KEY, JSON.stringify(parsed));
        } catch {
          // ignore
        }
        return parsed;
      }
    }
  } catch {
    // Offline, blocked, or timeout -> deterministic date-seeded curated puzzle
  }

  const fallback = getCuratedDailyPuzzle(dateKey);
  try {
    localStorage.setItem(DAILY_CACHE_KEY, JSON.stringify(fallback));
  } catch {
    // ignore
  }
  return fallback;
}

/**
 * Generates/draws an additional challenging tactical puzzle on demand across Intermediate, Advanced, or Pro tiers.
 */
export function generateChallengingPuzzle(
  difficulty: DailyDifficulty | 'any',
  excludeId?: string
): DailyTacticPuzzle {
  // Combine our dedicated challenging daily pool + Test Yourself / Chapter 8-10 diagrams from Dr. Regis
  const courseHardPool: DailyTacticPuzzle[] = TACTICS_PUZZLES.filter(
    (p) => p.chapter >= 6 && p.solutionMoves.length >= 2
  ).map((p) => {
    const c = p.fen ? new Chess(p.fen) : new Chess();
    let last: { from: Square; to: Square; san?: string } | null = null;
    if (p.setupMoves) {
      for (const san of p.setupMoves) {
        const m = c.move(san);
        if (m) last = { from: m.from, to: m.to, san: m.san };
      }
    }
    const diff: DailyDifficulty =
      p.chapter >= 9 ? 'pro' : p.chapter >= 7 ? 'advanced' : 'intermediate';
    return {
      id: `bonus-${p.id}`,
      title: p.title,
      difficulty: diff,
      rating: diff === 'pro' ? 1900 : diff === 'advanced' ? 1680 : 1420,
      source: 'curated',
      players: p.players,
      fen: c.fen(),
      setupLastMove: last,
      solutionMoves: p.solutionMoves,
      solverColor: p.solverColor,
      themes: p.themes,
      prompt: p.prompt,
      hintText: p.hintText,
      explanation: p.explanation,
      visualArrows: p.visualArrows,
    };
  });

  const combined = [...DAILY_PUZZLE_POOL, ...courseHardPool];
  const progress = loadDailyProgress();

  const matchingDiff =
    difficulty === 'any' ? combined : combined.filter((p) => p.difficulty === difficulty);
  const pool = matchingDiff.length > 0 ? matchingDiff : combined;

  const unsolved = pool.filter(
    (p) => p.id !== excludeId && !progress.bonusSolvedIds.includes(p.id)
  );
  const candidates = unsolved.length > 0 ? unsolved : pool.filter((p) => p.id !== excludeId);
  const finalPool = candidates.length > 0 ? candidates : pool;

  const pick = finalPool[Math.floor(Math.random() * finalPool.length)];
  return { ...pick };
}

export function loadDailyProgress(profileId?: string): DailyProgressState {
  if (typeof window === 'undefined') {
    return { completedDates: [], bonusSolvedIds: [] };
  }
  try {
    const raw = localStorage.getItem(scopedStorageKey('daily', profileId));
    if (!raw) return { completedDates: [], bonusSolvedIds: [] };
    const parsed = JSON.parse(raw) as Partial<DailyProgressState>;
    return {
      completedDates: Array.isArray(parsed.completedDates) ? parsed.completedDates : [],
      bonusSolvedIds: Array.isArray(parsed.bonusSolvedIds) ? parsed.bonusSolvedIds : [],
    };
  } catch {
    return { completedDates: [], bonusSolvedIds: [] };
  }
}

export function markDailyPuzzleSolved(
  puzzle: DailyTacticPuzzle,
  isDailyChallenge: boolean,
  profileId?: string
): DailyProgressState {
  const pid = profileId ?? getActiveProfileId();
  const state = loadDailyProgress(pid);
  let changed = false;

  if (isDailyChallenge && puzzle.dateKey) {
    if (!state.completedDates.includes(puzzle.dateKey)) {
      state.completedDates = [...state.completedDates, puzzle.dateKey].sort();
      changed = true;
    }
  } else {
    if (!state.bonusSolvedIds.includes(puzzle.id)) {
      state.bonusSolvedIds = [...state.bonusSolvedIds, puzzle.id];
      changed = true;
    }
  }

  if (changed && typeof window !== 'undefined') {
    try {
      localStorage.setItem(scopedStorageKey('daily', pid), JSON.stringify(state));
    } catch {
      // ignore
    }
    notifyProgressChanged();
  }

  return state;
}

export function computeDailyStreak(completedDates: string[]): number {
  if (completedDates.length === 0) return 0;
  const set = new Set(completedDates);
  const today = new Date();
  const todayKey = getLocalDateKey(today);

  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!set.has(todayKey)) {
    // If today not yet solved, check consecutive streak ending yesterday
    cursor.setDate(cursor.getDate() - 1);
    if (!set.has(getLocalDateKey(cursor))) return 0;
  }

  let streak = 0;
  while (set.has(getLocalDateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
