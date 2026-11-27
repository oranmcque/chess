import { Chess, type PieceSymbol, type Square } from 'chess.js';
import type { Difficulty } from '../types/chess';
import { computeBestMove, evaluatePositionFast } from './chessAI';

const MATE_SCORE = 100000;

export type EngineSource = 'stockfish' | 'fallback';

export interface StockfishAnalysis {
  fen: string;
  /** Centipawn score normalized from White's perspective (+ = White better, - = Black better) */
  evalCp: number;
  /** Signed mate distance from White's perspective (+N = White mates in N, -N = Black mates in N) */
  mateIn?: number;
  bestMoveUci?: string;
  bestMoveSan?: string;
  bestMoveFrom?: Square;
  bestMoveTo?: Square;
  bestMovePromotion?: PieceSymbol;
  /** Principal variation in algebraic SAN (up to 6 plies) */
  pvSan: string[];
  depth: number;
  nodes?: number;
  nps?: number;
  source: EngineSource;
  isFinal: boolean;
}

export interface AnalyzeOptions {
  depth?: number;
  movetimeMs?: number;
  skillLevel?: number;
  onProgress?: (analysis: StockfishAnalysis) => void;
}

const WORKER_URL = '/stockfish/stockfish-19-lite-single.js';

const DIFFICULTY_STOCKFISH_CONFIG: Record<
  Difficulty,
  { skillLevel: number; depth: number; movetimeMs: number }
> = {
  rookie: { skillLevel: 0, depth: 3, movetimeMs: 110 },
  intermediate: { skillLevel: 6, depth: 6, movetimeMs: 220 },
  advanced: { skillLevel: 13, depth: 10, movetimeMs: 380 },
  pro: { skillLevel: 20, depth: 14, movetimeMs: 650 },
};

function parseUciMove(
  chess: Chess,
  uci: string
): {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
  san: string;
} | null {
  if (!uci || uci.length < 4 || uci === '(none)') return null;
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const promoChar = uci.length >= 5 ? (uci[4] as PieceSymbol) : undefined;
  try {
    const copy = new Chess(chess.fen());
    const move = copy.move({ from, to, promotion: promoChar });
    if (!move) return null;
    return {
      from: move.from,
      to: move.to,
      promotion: move.promotion,
      san: move.san,
    };
  } catch {
    return null;
  }
}

function uciPvToSan(fen: string, uciTokens: string[], maxPlies = 6): string[] {
  const sanList: string[] = [];
  try {
    const scratch = new Chess(fen);
    for (let i = 0; i < Math.min(uciTokens.length, maxPlies); i++) {
      const token = uciTokens[i];
      if (!token || token.length < 4) break;
      const from = token.slice(0, 2) as Square;
      const to = token.slice(2, 4) as Square;
      const promotion = token.length >= 5 ? (token[4] as PieceSymbol) : undefined;
      const mv = scratch.move({ from, to, promotion });
      if (!mv) break;
      sanList.push(mv.san);
    }
  } catch {
    // Ignore malformed PV tokens
  }
  return sanList;
}

function getTerminalAnalysis(fen: string, source: EngineSource): StockfishAnalysis | null {
  try {
    const chess = new Chess(fen);
    if (chess.isCheckmate()) {
      const whiteWinner = chess.turn() === 'b';
      return {
        fen,
        evalCp: whiteWinner ? MATE_SCORE : -MATE_SCORE,
        mateIn: 0,
        pvSan: [],
        depth: 0,
        source,
        isFinal: true,
      };
    }
    if (chess.isDraw()) {
      return {
        fen,
        evalCp: 0,
        pvSan: [],
        depth: 0,
        source,
        isFinal: true,
      };
    }
  } catch {
    // Invalid FEN handled by caller
  }
  return null;
}

class StockfishEngineManager {
  private worker: Worker | null = null;
  private initPromise: Promise<boolean> | null = null;
  private workerFailed = false;
  private isReady = false;
  private currentSkillLevel = 20;

  // Serialized command queue so UCI searches never overlap
  private jobChain: Promise<void> = Promise.resolve();
  private latestAnalyzeSeq = 0;

  // Active UCI message listeners
  private lineListeners = new Set<(line: string) => void>();
  private activeSearchCancel: (() => void) | null = null;

  private ensureWorker(): Promise<boolean> {
    if (this.workerFailed) return Promise.resolve(false);
    if (this.isReady && this.worker) return Promise.resolve(true);
    if (this.initPromise) return this.initPromise;

    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      this.workerFailed = true;
      return Promise.resolve(false);
    }

    this.initPromise = new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        if (!ok) {
          this.workerFailed = true;
          this.isReady = false;
          try {
            this.worker?.terminate();
          } catch {
            // ignore
          }
          this.worker = null;
        }
        resolve(ok);
      };

      const timeoutId = window.setTimeout(() => {
        finish(false);
      }, 7000);

      try {
        const worker = new Worker(WORKER_URL);
        this.worker = worker;

        let uciAcked = false;

        const onInitLine = (line: string) => {
          if (line === 'uciok' && !uciAcked) {
            uciAcked = true;
            worker.postMessage('setoption name Hash value 24');
            worker.postMessage('setoption name Skill Level value 20');
            worker.postMessage('isready');
          } else if (line === 'readyok') {
            this.lineListeners.delete(onInitLine);
            this.isReady = true;
            finish(true);
          }
        };

        this.lineListeners.add(onInitLine);

        worker.onmessage = (event: MessageEvent) => {
          const raw = typeof event.data === 'string' ? event.data : String(event.data ?? '');
          const lines = raw.split(/\r?\n/);
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            for (const listener of Array.from(this.lineListeners)) {
              listener(trimmed);
            }
          }
        };

        worker.onerror = () => {
          this.lineListeners.delete(onInitLine);
          finish(false);
        };

        worker.postMessage('uci');
      } catch {
        finish(false);
      }
    });

    return this.initPromise;
  }

  private fallbackAnalysis(fen: string): StockfishAnalysis {
    const terminal = getTerminalAnalysis(fen, 'fallback');
    if (terminal) return terminal;

    const res = evaluatePositionFast(fen, 2);
    return {
      fen,
      evalCp: res.evalCp,
      bestMoveSan: res.move?.san,
      bestMoveFrom: res.move?.from,
      bestMoveTo: res.move?.to,
      bestMovePromotion: res.move?.promotion,
      bestMoveUci: res.move ? `${res.move.from}${res.move.to}${res.move.promotion ?? ''}` : undefined,
      pvSan: res.move ? [res.move.san] : [],
      depth: 2,
      source: 'fallback',
      isFinal: true,
    };
  }

  private runUciSearch(
    fen: string,
    opts: Required<Pick<AnalyzeOptions, 'depth' | 'movetimeMs' | 'skillLevel'>>,
    isSuperseded: () => boolean,
    onProgress?: (analysis: StockfishAnalysis) => void
  ): Promise<StockfishAnalysis | null> {
    return new Promise((resolve) => {
      if (!this.worker || !this.isReady || isSuperseded()) {
        resolve(null);
        return;
      }

      const chess = new Chess(fen);
      const turn = chess.turn();
      const whiteSign = turn === 'w' ? 1 : -1;

      let latestEvalCp = 0;
      let latestMateIn: number | undefined;
      let latestDepth = 0;
      let latestNodes: number | undefined;
      let latestNps: number | undefined;
      let latestPvSan: string[] = [];
      let latestBestUci: string | undefined;
      let settled = false;
      let lastProgressTs = 0;

      const cleanup = () => {
        this.lineListeners.delete(onLine);
        if (this.activeSearchCancel === cancelSearch) {
          this.activeSearchCancel = null;
        }
        window.clearTimeout(safetyTimer);
      };

      const finishWithResult = (bestMoveUci?: string) => {
        if (settled) return;
        settled = true;
        cleanup();

        const chosenUci = bestMoveUci && bestMoveUci !== '(none)' ? bestMoveUci : latestBestUci;
        const parsedMove = chosenUci ? parseUciMove(chess, chosenUci) : null;

        resolve({
          fen,
          evalCp: latestEvalCp,
          mateIn: latestMateIn,
          bestMoveUci: chosenUci,
          bestMoveSan: parsedMove?.san ?? latestPvSan[0],
          bestMoveFrom: parsedMove?.from,
          bestMoveTo: parsedMove?.to,
          bestMovePromotion: parsedMove?.promotion,
          pvSan:
            latestPvSan.length > 0
              ? latestPvSan
              : parsedMove
              ? [parsedMove.san]
              : [],
          depth: latestDepth,
          nodes: latestNodes,
          nps: latestNps,
          source: 'stockfish',
          isFinal: true,
        });
      };

      const cancelSearch = () => {
        if (settled) return;
        try {
          this.worker?.postMessage('stop');
        } catch {
          // ignore
        }
      };

      this.activeSearchCancel = cancelSearch;

      const safetyTimer = window.setTimeout(() => {
        cancelSearch();
        if (!settled) {
          finishWithResult(latestBestUci);
        }
      }, Math.max(opts.movetimeMs + 1800, 3500));

      const onLine = (line: string) => {
        if (line.startsWith('info ')) {
          if (isSuperseded()) {
            cancelSearch();
            return;
          }

          const depthMatch = line.match(/\bdepth (\d+)/);
          const scoreMatch = line.match(/\bscore (cp|mate) (-?\d+)/);
          const isBound = /\b(upperbound|lowerbound)\b/.test(line);

          if (!depthMatch || !scoreMatch) return;
          if (isBound && latestDepth > 0) return;

          const depth = Number.parseInt(depthMatch[1], 10);
          const scoreType = scoreMatch[1];
          const rawScore = Number.parseInt(scoreMatch[2], 10);

          let evalCp = latestEvalCp;
          let mateIn: number | undefined;
          if (scoreType === 'cp') {
            evalCp = rawScore * whiteSign;
            mateIn = undefined;
          } else {
            const absMate = Math.max(1, Math.abs(rawScore));
            const signedMate = rawScore * whiteSign;
            mateIn = signedMate;
            evalCp = (signedMate >= 0 ? 1 : -1) * (MATE_SCORE - absMate * 100);
          }

          const nodesMatch = line.match(/\bnodes (\d+)/);
          const npsMatch = line.match(/\bnps (\d+)/);
          const pvMatch = line.match(/\bpv (.+)$/);

          latestDepth = depth;
          latestEvalCp = evalCp;
          latestMateIn = mateIn;
          if (nodesMatch) latestNodes = Number.parseInt(nodesMatch[1], 10);
          if (npsMatch) latestNps = Number.parseInt(npsMatch[1], 10);

          if (pvMatch) {
            const tokens = pvMatch[1].trim().split(/\s+/);
            if (tokens.length > 0) {
              latestBestUci = tokens[0];
              latestPvSan = uciPvToSan(fen, tokens, 6);
            }
          }

          if (onProgress && depth >= 2) {
            const now = performance.now();
            if (now - lastProgressTs >= 55 || depth >= opts.depth) {
              lastProgressTs = now;
              const parsed = latestBestUci ? parseUciMove(chess, latestBestUci) : null;
              onProgress({
                fen,
                evalCp: latestEvalCp,
                mateIn: latestMateIn,
                bestMoveUci: latestBestUci,
                bestMoveSan: parsed?.san ?? latestPvSan[0],
                bestMoveFrom: parsed?.from,
                bestMoveTo: parsed?.to,
                bestMovePromotion: parsed?.promotion,
                pvSan: latestPvSan,
                depth: latestDepth,
                nodes: latestNodes,
                nps: latestNps,
                source: 'stockfish',
                isFinal: false,
              });
            }
          }
          return;
        }

        if (line.startsWith('bestmove ')) {
          const match = line.match(/^bestmove (\S+)/);
          finishWithResult(match?.[1]);
        }
      };

      this.lineListeners.add(onLine);

      try {
        if (this.currentSkillLevel !== opts.skillLevel) {
          this.currentSkillLevel = opts.skillLevel;
          this.worker.postMessage(`setoption name Skill Level value ${opts.skillLevel}`);
        }
        this.worker.postMessage(`position fen ${fen}`);
        this.worker.postMessage(`go depth ${opts.depth} movetime ${opts.movetimeMs}`);
      } catch {
        cleanup();
        resolve(null);
      }
    });
  }

  /**
   * Real-time full-strength Stockfish analysis of a position.
   * Automatically stops any superseded analysis request so rapid clicks stay snappy.
   */
  public analyzePosition(fen: string, options: AnalyzeOptions = {}): Promise<StockfishAnalysis> {
    const terminal = getTerminalAnalysis(fen, this.workerFailed ? 'fallback' : 'stockfish');
    if (terminal) {
      options.onProgress?.(terminal);
      return Promise.resolve(terminal);
    }

    const seq = ++this.latestAnalyzeSeq;
    const isSuperseded = () => seq !== this.latestAnalyzeSeq;

    // Immediately stop any active background search so queued call proceeds ASAP
    this.activeSearchCancel?.();

    const depth = options.depth ?? 13;
    const movetimeMs = options.movetimeMs ?? 550;
    const skillLevel = options.skillLevel ?? 20;

    const run = async (): Promise<StockfishAnalysis> => {
      if (isSuperseded()) {
        return this.fallbackAnalysis(fen);
      }

      const ready = await this.ensureWorker();
      if (!ready || isSuperseded()) {
        return this.fallbackAnalysis(fen);
      }

      const sfResult = await this.runUciSearch(
        fen,
        { depth, movetimeMs, skillLevel },
        isSuperseded,
        options.onProgress
      );

      if (sfResult && !isSuperseded()) {
        return sfResult;
      }

      // If superseded mid-search, still return deterministic fallback or partial cleanly
      return sfResult ?? this.fallbackAnalysis(fen);
    };

    const queued = this.jobChain.then(run, run);
    this.jobChain = queued.then(
      () => undefined,
      () => undefined
    );
    return queued;
  }

  /**
   * Computes the AI opponent's move using Stockfish calibrated to the chosen Difficulty tier,
   * falling back seamlessly to chessAI minimax if the worker is unavailable.
   */
  public getComputerMove(
    fen: string,
    difficulty: Difficulty,
    historySan: string[] = []
  ): Promise<{
    from: Square;
    to: Square;
    promotion?: PieceSymbol;
    san: string;
    evalCp: number;
    source: EngineSource;
  } | null> {
    const cfg = DIFFICULTY_STOCKFISH_CONFIG[difficulty];

    // Cancel any ongoing background analysis immediately so the AI move takes priority
    this.activeSearchCancel?.();

    const run = async () => {
      const chess = new Chess(fen);
      if (chess.isGameOver()) return null;

      // For Rookie, allow natural early opening variety via local book on first 2 plies,
      // or let Stockfish calibrated skill handle the position directly.
      const ready = await this.ensureWorker();
      if (ready) {
        const sfResult = await this.runUciSearch(
          fen,
          cfg,
          () => false,
          undefined
        );
        if (sfResult?.bestMoveFrom && sfResult?.bestMoveTo && sfResult?.bestMoveSan) {
          return {
            from: sfResult.bestMoveFrom,
            to: sfResult.bestMoveTo,
            promotion: sfResult.bestMovePromotion,
            san: sfResult.bestMoveSan,
            evalCp: sfResult.evalCp,
            source: 'stockfish' as const,
          };
        }
      }

      // Automatic fallback to synchronous minimax engine
      const local = computeBestMove(fen, difficulty, historySan);
      if (!local.move) return null;
      return {
        from: local.move.from,
        to: local.move.to,
        promotion: local.move.promotion,
        san: local.move.san,
        evalCp: local.evalCp,
        source: 'fallback' as const,
      };
    };

    const queued = this.jobChain.then(run, run);
    this.jobChain = queued.then(
      () => undefined,
      () => undefined
    );
    return queued;
  }

  /**
   * Stops any in-flight Stockfish search without terminating the worker.
   */
  public stopCurrentSearch(): void {
    this.latestAnalyzeSeq++;
    this.activeSearchCancel?.();
  }

  /**
   * Warm up the Stockfish worker in the background so first move analysis is instant.
   */
  public warmup(): void {
    void this.ensureWorker();
  }
}

export const stockfishEngine = new StockfishEngineManager();
