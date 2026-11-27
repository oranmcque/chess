import React, { useEffect, useMemo, useRef } from 'react';
import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from 'lucide-react';
import type { CoachFeedback, MoveRecord } from '../types/chess';

interface MoveHistoryPanelProps {
  records: MoveRecord[];
  /** null = live latest move; -1 = initial position before move 1; 0..n-1 = specific move index */
  viewIndex: number | null;
  isReplaying: boolean;
  onSelectMove: (index: number | null) => void;
  onToggleReplay: () => void;
}

function qualityColorClass(q: CoachFeedback['quality']): string {
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
}

export const MoveHistoryPanel: React.FC<MoveHistoryPanelProps> = ({
  records,
  viewIndex,
  isReplaying,
  onSelectMove,
  onToggleReplay,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

  // Effective ply index currently shown (-1 = start position, 0..n-1 = after move idx)
  const effectiveIdx = viewIndex === null ? records.length - 1 : viewIndex;
  const isViewingHistory = viewIndex !== null && viewIndex < records.length - 1;

  // Pair moves into rows of White + Black
  const movePairs = useMemo(() => {
    const pairs: Array<{
      moveNum: number;
      white?: { rec: MoveRecord; idx: number };
      black?: { rec: MoveRecord; idx: number };
    }> = [];
    records.forEach((rec, idx) => {
      if (rec.move.color === 'w') {
        pairs.push({ moveNum: pairs.length + 1, white: { rec, idx } });
      } else {
        if (pairs.length === 0 || pairs[pairs.length - 1].black) {
          pairs.push({ moveNum: pairs.length + 1, black: { rec, idx } });
        } else {
          pairs[pairs.length - 1].black = { rec, idx };
        }
      }
    });
    return pairs;
  }, [records]);

  // Keep the highlighted move visible inside the move-history box ONLY (never scroll the page/screen)
  useEffect(() => {
    const container = scrollContainerRef.current;
    const item = activeItemRef.current;
    if (!container || !item) return;

    const cRect = container.getBoundingClientRect();
    const iRect = item.getBoundingClientRect();
    if (iRect.top < cRect.top) {
      container.scrollTop += iRect.top - cRect.top;
    } else if (iRect.bottom > cRect.bottom) {
      container.scrollTop += iRect.bottom - cRect.bottom;
    }
  }, [effectiveIdx, records.length]);

  const handleStepBack = () => {
    if (records.length === 0) return;
    if (effectiveIdx <= -1) return;
    onSelectMove(effectiveIdx - 1);
  };

  const handleStepForward = () => {
    if (records.length === 0 || !isViewingHistory) return;
    const next = effectiveIdx + 1;
    onSelectMove(next >= records.length - 1 ? null : next);
  };

  const currentPlyLabel =
    records.length === 0
      ? 'Starting position'
      : effectiveIdx === -1
      ? 'Start · Before move 1'
      : `Move ${Math.floor(effectiveIdx / 2) + 1}${records[effectiveIdx]?.move.color === 'w' ? '.' : '…'} ${records[effectiveIdx]?.move.san}`;

  return (
    <section
      aria-label="Algebraic move history"
      className="rounded-xl bg-[#0F1322]/84 backdrop-blur-md border border-fuchsia-400/18 shadow-[0_8px_32px_rgba(236,72,153,0.08)] p-5 flex flex-col"
    >
      {/* Panel Header & Step Controls */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/8">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold text-[#F2EFE9]">
            Move History
          </h2>
          <p className="text-xs text-[#9A9892] font-mono-tabular truncate mt-0.5">
            {records.length} {records.length === 1 ? 'ply' : 'plies'}
            {records.length > 0 ? ` · ${currentPlyLabel}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            aria-label="Jump to starting position"
            title="Start position (Home)"
            onClick={() => onSelectMove(-1)}
            disabled={records.length === 0 || effectiveIdx === -1}
            className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-[#CFCBC2] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronFirst className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Previous move"
            title="Previous move (Left Arrow)"
            onClick={handleStepBack}
            disabled={records.length === 0 || effectiveIdx <= -1}
            className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-[#CFCBC2] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label={isReplaying ? 'Pause replay' : 'Auto-replay game progression'}
            title={isReplaying ? 'Pause replay' : 'Replay moves'}
            onClick={onToggleReplay}
            disabled={records.length === 0}
            className={`p-1.5 rounded transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
              isReplaying
                ? 'bg-[#D99B38] text-[#141517]'
                : 'bg-white/5 hover:bg-white/10 text-[#F4D08A]'
            }`}
          >
            {isReplaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            type="button"
            aria-label="Next move"
            title="Next move (Right Arrow)"
            onClick={handleStepForward}
            disabled={!isViewingHistory}
            className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-[#CFCBC2] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Jump to latest live move"
            title="Latest move (End)"
            onClick={() => onSelectMove(null)}
            disabled={!isViewingHistory}
            className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-[#CFCBC2] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronLast className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* History Inspection Banner */}
      {isViewingHistory && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-[#D99B38]/12 border border-[#D99B38]/35 flex items-center justify-between gap-2 text-xs">
          <span className="text-[#F4D08A]">
            Viewing history ({effectiveIdx === -1 ? 'Start' : `Ply ${effectiveIdx + 1}/${records.length}`})
          </span>
          <button
            type="button"
            onClick={() => onSelectMove(null)}
            className="font-semibold text-[#F2EFE9] hover:text-[#F4D08A] underline underline-offset-2 cursor-pointer whitespace-nowrap"
          >
            Return to Live
          </button>
        </div>
      )}

      {/* Algebraic Move List — fixed 2-line window showing 2 moves with internal scroll */}
      <div
        ref={scrollContainerRef}
        className="mt-3 h-[70px] overflow-y-auto overscroll-contain pr-1 relative"
      >
        {movePairs.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-xs text-[#7D7B76] text-center">
              No moves yet. Play a move to record notation.
            </p>
          </div>
        ) : (
          <div className="space-y-0.5 font-mono-tabular text-xs">
            {movePairs.map((pair) => (
              <div
                key={pair.moveNum}
                className="grid grid-cols-[36px_1fr_1fr] items-center gap-1 py-0.5"
              >
                <span className="text-[#7D7B76] text-right pr-2 select-none">
                  {pair.moveNum}.
                </span>

                {pair.white ? (
                  <button
                    ref={effectiveIdx === pair.white.idx ? activeItemRef : null}
                    type="button"
                    onClick={() =>
                      onSelectMove(
                        pair.white!.idx === records.length - 1 ? null : pair.white!.idx
                      )
                    }
                    className={`text-left px-2.5 py-1.5 rounded transition-colors cursor-pointer flex items-center justify-between ${
                      effectiveIdx === pair.white.idx
                        ? 'bg-[#D99B38]/22 text-[#F4D08A] font-semibold ring-1 ring-[#D99B38]/40'
                        : 'hover:bg-white/6 text-[#E6E2D9]'
                    }`}
                  >
                    <span>{pair.white.rec.move.san}</span>
                    {pair.white.rec.feedback?.symbol &&
                      pair.white.rec.feedback.symbol !== 'Book' && (
                        <span
                          className={`text-[11px] ${qualityColorClass(
                            pair.white.rec.feedback.quality
                          )}`}
                        >
                          {pair.white.rec.feedback.symbol}
                        </span>
                      )}
                  </button>
                ) : (
                  <span className="px-2.5 py-1.5 text-[#66645F] select-none">…</span>
                )}

                {pair.black ? (
                  <button
                    ref={effectiveIdx === pair.black.idx ? activeItemRef : null}
                    type="button"
                    onClick={() =>
                      onSelectMove(
                        pair.black!.idx === records.length - 1 ? null : pair.black!.idx
                      )
                    }
                    className={`text-left px-2.5 py-1.5 rounded transition-colors cursor-pointer flex items-center justify-between ${
                      effectiveIdx === pair.black.idx
                        ? 'bg-[#D99B38]/22 text-[#F4D08A] font-semibold ring-1 ring-[#D99B38]/40'
                        : 'hover:bg-white/6 text-[#E6E2D9]'
                    }`}
                  >
                    <span>{pair.black.rec.move.san}</span>
                    {pair.black.rec.feedback?.symbol &&
                      pair.black.rec.feedback.symbol !== 'Book' && (
                        <span
                          className={`text-[11px] ${qualityColorClass(
                            pair.black.rec.feedback.quality
                          )}`}
                        >
                          {pair.black.rec.feedback.symbol}
                        </span>
                      )}
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {records.length > 0 && (
        <p className="mt-3 pt-2.5 border-t border-white/8 text-[11px] text-[#7D7B76]">
          Click any move or use Left / Right arrow keys to step through the game.
        </p>
      )}
    </section>
  );
};
