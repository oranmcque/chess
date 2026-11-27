import type { Color, PieceSymbol, Square } from 'chess.js';

export type GameMode = 'pvc' | 'pvp';

export type Difficulty = 'rookie' | 'intermediate' | 'advanced' | 'pro';

export type PlayerRankId = 'rookie' | 'intermediate' | 'advanced' | 'pro';

export type BoardThemeId = 'neon' | 'prism' | 'walnut' | 'tournament' | 'slate' | 'maple';

export type PieceStyleId = 'staunty' | 'maestro' | 'california' | 'alpha';

export type TimeControlId = 'unlimited' | 'rapid10' | 'blitz5' | 'blitz3';

export type AppSection = 'play' | 'course' | 'fundamentals' | 'progress' | 'pdf';

export interface BoardTheme {
  id: BoardThemeId;
  name: string;
  light: string;
  dark: string;
  lightCoord: string;
  darkCoord: string;
  lastMoveLight: string;
  lastMoveDark: string;
  frameBg: string;
  frameBorder: string;
}

export interface BoardArrow {
  from: Square;
  to: Square;
  color: 'emerald' | 'amber' | 'crimson' | 'sky';
  opacity?: number;
}

export interface SquareHighlight {
  square: Square;
  color: 'emerald' | 'amber' | 'crimson' | 'sky';
}

export type MoveQuality =
  | 'brilliant'
  | 'best'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'book';

export interface TacticalMotif {
  name: string;
  description: string;
  squares: Square[];
  arrows?: BoardArrow[];
  chapterRef?: number;
}

export interface CoachFeedback {
  moveSan: string;
  moveColor: Color;
  quality: MoveQuality;
  symbol: string;
  headline: string;
  explanation: string;
  evalBefore: number;
  evalAfter: number;
  cpLoss?: number;
  bestMoveSan?: string;
  bestMoveFrom?: Square;
  bestMoveTo?: Square;
  motifs: TacticalMotif[];
  openingName?: string;
  eco?: string;
}

export interface TacticsPuzzle {
  id: string;
  chapter: number;
  subchapter: string;
  title: string;
  players?: string;
  event?: string;
  eco?: string;
  pageNumber: number;
  /** Either start from standard position with setupMoves OR start directly from fen */
  setupMoves?: string[];
  fen?: string;
  /** Solution sequence in SAN, alternating solver & opponent replies */
  solutionMoves: string[];
  /** Side that the player solves as ('w' or 'b') */
  solverColor: Color;
  /** Coach prose from Dr. Dave Regis's course */
  prompt: string;
  explanation: string;
  hintText: string;
  themes: string[];
  /** Optional key arrows shown when explanation or hint is displayed */
  visualArrows?: BoardArrow[];
}

export interface FundamentalLesson {
  id: string;
  category: 'basics' | 'special-moves' | 'tactics' | 'endgame-strategy';
  title: string;
  subtitle: string;
  summary: string;
  rules: string[];
  fen: string;
  /** Optional automatic opening move played by opponent before user acts (e.g., En Passant 2-square pawn push!) */
  introMove?: string;
  /** Expected user move(s) in SAN to complete the interactive drill */
  solutionMoves: string[];
  solverColor: Color;
  coachTip: string;
  arrows?: BoardArrow[];
  highlightSquares?: SquareHighlight[];
}

export interface PieceCounts {
  w: Record<PieceSymbol, number>;
  b: Record<PieceSymbol, number>;
}

export interface MoveRecord {
  move: {
    san: string;
    from: Square;
    to: Square;
    color: Color;
    piece: PieceSymbol;
    captured?: PieceSymbol;
    promotion?: PieceSymbol;
    flags: string;
  };
  fenBefore: string;
  fenAfter: string;
  evalCp: number;
  cpLoss?: number;
  feedback?: CoachFeedback;
}

export interface GameEvaluationRecord {
  id: string;
  dateIso: string;
  mode: GameMode;
  difficulty: Difficulty;
  playerColor: Color;
  result: 'win' | 'draw' | 'loss';
  reason: string;
  movesCount: number;
  playerAccuracy: number;
  avgCpLoss: number;
  bestCount: number;
  mistakeCount: number;
  blunderCount: number;
  openingName?: string;
  xpEarned: number;
}

export interface DifficultyStats {
  wins: number;
  draws: number;
  losses: number;
  bestAccuracy: number | null;
}

export interface PlayerProgressData {
  gameXp: number;
  games: GameEvaluationRecord[];
  byDifficulty: Record<Difficulty, DifficultyStats>;
}

