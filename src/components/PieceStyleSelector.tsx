import React from 'react';
import type { PieceStyleId } from '../types/chess';
import { PIECE_STYLE_LIST, usePieceStyle } from '../utils/pieceSets';

interface PieceStyleSelectorProps {
  compact?: boolean;
}

export const PieceStyleSelector: React.FC<PieceStyleSelectorProps> = ({ compact = false }) => {
  const [pieceStyle, setPieceStyle] = usePieceStyle();

  return (
    <select
      aria-label="Chess piece style"
      value={pieceStyle}
      onChange={(e) => setPieceStyle(e.target.value as PieceStyleId)}
      title="Switch chess piece SVG style"
      className={`${
        compact ? 'px-2.5 py-1.5' : 'px-3 py-2'
      } text-xs font-medium bg-[#101526]/90 border border-white/12 rounded-lg text-[#F2EFE9] focus:outline-none focus:border-cyan-400 cursor-pointer`}
    >
      {PIECE_STYLE_LIST.map((s) => (
        <option key={s.id} value={s.id}>
          Pieces: {s.name} ({s.subtitle})
        </option>
      ))}
    </select>
  );
};
