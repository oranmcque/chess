import React from 'react';
import { evalToWhitePercentage, formatEvalScore } from '../engine/chessAI';

interface EvalBarProps {
  evalCp: number;
  orientation: 'w' | 'b';
}

export const EvalBar: React.FC<EvalBarProps> = ({ evalCp, orientation }) => {
  const whitePct = evalToWhitePercentage(evalCp);
  const label = formatEvalScore(evalCp);
  const whiteAhead = evalCp >= 0;

  // If orientation is 'w', White is on the bottom; if 'b', White is on the top
  const topIsWhite = orientation === 'b';
  const topHeight = topIsWhite ? whitePct : 100 - whitePct;

  return (
    <div
      className="relative w-5 sm:w-8 h-full rounded-md overflow-hidden bg-[#101424] border border-cyan-400/25 shadow-[0_0_16px_rgba(34,211,238,0.16)] flex flex-col select-none shrink-0"
      aria-label={`Position evaluation ${label}`}
      title={`Engine evaluation: ${label}`}
    >
      {/* Top portion */}
      <div
        className={`w-full transition-all duration-300 ease-out ${
          topIsWhite ? 'bg-gradient-to-b from-[#ECFEFF] to-[#BAE6FD]' : 'bg-gradient-to-b from-[#171C33] to-[#262042]'
        }`}
        style={{ height: `${topHeight}%` }}
      />
      {/* Bottom portion */}
      <div
        className={`w-full flex-1 transition-all duration-300 ease-out ${
          topIsWhite ? 'bg-gradient-to-b from-[#171C33] to-[#262042]' : 'bg-gradient-to-b from-[#BAE6FD] to-[#ECFEFF]'
        }`}
      />

      {/* Glowing Midpoint tick */}
      <div className="absolute inset-x-0 top-1/2 h-[1.5px] bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.85)] pointer-events-none" />

      {/* Crisp numerical score readout */}
      <span
        className={`absolute inset-x-0 text-center font-mono-tabular text-[9px] sm:text-[10px] font-semibold tracking-tight px-0.5 pointer-events-none ${
          whiteAhead
            ? topIsWhite
              ? 'top-1.5 text-[#0C1222]'
              : 'bottom-1.5 text-[#0C1222]'
            : topIsWhite
            ? 'bottom-1.5 text-cyan-200'
            : 'top-1.5 text-cyan-200'
        }`}
      >
        {label}
      </span>
    </div>
  );
};
