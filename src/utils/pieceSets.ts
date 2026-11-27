import { useEffect, useState } from 'react';
import type { PieceStyleId } from '../types/chess';

export interface PieceStyleDefinition {
  id: PieceStyleId;
  name: string;
  subtitle: string;
}

export const PIECE_STYLE_LIST: PieceStyleDefinition[] = [
  { id: 'staunty', name: 'Staunty', subtitle: '3D shaded' },
  { id: 'maestro', name: 'Maestro', subtitle: 'Crisp modern' },
  { id: 'california', name: 'California', subtitle: 'Classic tournament' },
  { id: 'alpha', name: 'Alpha', subtitle: 'Bold minimalist' },
];

const STORAGE_KEY = 'ten-steps-piece-style-v1';
const DEFAULT_STYLE: PieceStyleId = 'staunty';

const listeners = new Set<() => void>();

function isValidStyle(val: unknown): val is PieceStyleId {
  return val === 'staunty' || val === 'maestro' || val === 'california' || val === 'alpha';
}

export function getStoredPieceStyle(): PieceStyleId {
  if (typeof window === 'undefined') return DEFAULT_STYLE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isValidStyle(raw) ? raw : DEFAULT_STYLE;
  } catch {
    return DEFAULT_STYLE;
  }
}

export function setStoredPieceStyle(style: PieceStyleId) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, style);
    } catch {
      // ignore storage errors
    }
  }
  listeners.forEach((cb) => cb());
}

export function subscribePieceStyle(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function usePieceStyle(): [PieceStyleId, (next: PieceStyleId) => void] {
  const [style, setStyle] = useState<PieceStyleId>(() => getStoredPieceStyle());

  useEffect(() => {
    const sync = () => setStyle(getStoredPieceStyle());
    sync();
    return subscribePieceStyle(sync);
  }, []);

  return [style, setStoredPieceStyle];
}

export function getLichessPieceUrl(
  style: PieceStyleId,
  color: 'w' | 'b',
  piece: 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
): string {
  return `https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/${style}/${color}${piece.toUpperCase()}.svg`;
}
