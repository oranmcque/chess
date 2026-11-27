import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { motion, AnimatePresence } from 'motion/react';
import type { BoardArrow, BoardTheme, SquareHighlight } from '../types/chess';
import { ChessPieceSVG } from './ChessPieceSVG';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

interface ChessBoardProps {
  fen: string;
  orientation?: Color;
  theme: BoardTheme;
  interactive?: boolean;
  allowedColor?: Color | 'both';
  lastMove?: { from: Square; to: Square; san?: string } | null;
  arrows?: BoardArrow[];
  highlights?: SquareHighlight[];
  hintSquare?: Square | null;
  showCoordinates?: boolean;
  onMove: (from: Square, to: Square, promotion?: PieceSymbol) => boolean;
}

const ARROW_COLORS: Record<BoardArrow['color'], string> = {
  emerald: '#10B981',
  amber: '#E5A93B',
  crimson: '#EF4444',
  sky: '#38BDF8',
};

const HIGHLIGHT_STYLES: Record<SquareHighlight['color'], string> = {
  emerald: 'inset 0 0 0 3px rgba(16, 185, 129, 0.85)',
  amber: 'inset 0 0 0 3px rgba(229, 169, 59, 0.9)',
  crimson: 'inset 0 0 0 3px rgba(239, 68, 68, 0.85)',
  sky: 'inset 0 0 0 3px rgba(56, 189, 248, 0.85)',
};

function squareToGrid(sq: Square, orientation: Color): { col: number; row: number } {
  const f = FILES.indexOf(sq[0] as (typeof FILES)[number]);
  const r = RANKS.indexOf(sq[1] as (typeof RANKS)[number]);
  return orientation === 'w' ? { col: f, row: r } : { col: 7 - f, row: 7 - r };
}

function gridToSquare(col: number, row: number, orientation: Color): Square | null {
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  const f = orientation === 'w' ? col : 7 - col;
  const r = orientation === 'w' ? row : 7 - row;
  return `${FILES[f]}${RANKS[r]}` as Square;
}

export const ChessBoard: React.FC<ChessBoardProps> = ({
  fen,
  orientation = 'w',
  theme,
  interactive = true,
  allowedColor = 'both',
  lastMove = null,
  arrows = [],
  highlights = [],
  hintSquare = null,
  showCoordinates = true,
  onMove,
}) => {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square; color: Color } | null>(null);
  const [userArrows, setUserArrows] = useState<BoardArrow[]>([]);
  const [rightDragFrom, setRightDragFrom] = useState<Square | null>(null);

  // Smooth pointer drag-and-drop state
  const [dragging, setDragging] = useState<{
    from: Square;
    type: PieceSymbol;
    color: Color;
    x: number;
    y: number;
    hoverSquare: Square | null;
  } | null>(null);

  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);

  // Clear transient UI states when FEN changes
  useEffect(() => {
    setSelectedSquare(null);
    setPendingPromotion(null);
    setUserArrows([]);
    setDragging(null);
  }, [fen]);

  const turn = chess.turn();
  const canInteract = interactive && (allowedColor === 'both' || allowedColor === turn);

  const legalMovesFromSelected = useMemo<Move[]>(() => {
    if (!selectedSquare || !canInteract) return [];
    return chess.moves({ square: selectedSquare, verbose: true });
  }, [chess, selectedSquare, canInteract]);

  const legalTargets = useMemo(() => {
    const map = new Map<Square, Move[]>();
    for (const m of legalMovesFromSelected) {
      const existing = map.get(m.to) || [];
      existing.push(m);
      map.set(m.to, existing);
    }
    return map;
  }, [legalMovesFromSelected]);

  // Locate checked King square
  const checkedKingSquare = useMemo<Square | null>(() => {
    if (!chess.inCheck()) return null;
    const b = chess.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = b[r][c];
        if (p && p.type === 'k' && p.color === turn) {
          return `${FILES[c]}${RANKS[r]}` as Square;
        }
      }
    }
    return null;
  }, [chess, turn]);

  // Detect castling rook motion so both King and Rook glide smoothly
  const castlingRookMove = useMemo<{ from: Square; to: Square } | null>(() => {
    if (!lastMove?.san) return null;
    if (lastMove.san === 'O-O' || lastMove.san === 'O-O+' || lastMove.san === 'O-O#') {
      return lastMove.to === 'g1' ? { from: 'h1', to: 'f1' } : { from: 'h8', to: 'f8' };
    }
    if (lastMove.san === 'O-O-O' || lastMove.san === 'O-O-O+' || lastMove.san === 'O-O-O#') {
      return lastMove.to === 'c1' ? { from: 'a1', to: 'd1' } : { from: 'a8', to: 'd8' };
    }
    return null;
  }, [lastMove]);

  const tryExecuteMove = (from: Square, to: Square) => {
    const moves = chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (moves.length === 0) return false;

    const isPromotion = moves.some((m) => m.promotion);
    if (isPromotion) {
      const piece = chess.get(from);
      if (piece) {
        setPendingPromotion({ from, to, color: piece.color });
        setSelectedSquare(null);
        return true;
      }
    }
    const ok = onMove(from, to);
    setSelectedSquare(null);
    return ok;
  };

  const pointerMetaRef = useRef<{
    from: Square;
    type: PieceSymbol;
    color: Color;
    startX: number;
    startY: number;
    wasSelected: boolean;
    didDrag: boolean;
  } | null>(null);

  const handleSquareKeyboard = (sq: Square) => {
    setUserArrows([]);
    if (!canInteract) return;
    if (selectedSquare && legalTargets.has(sq)) {
      tryExecuteMove(selectedSquare, sq);
      return;
    }
    const piece = chess.get(sq);
    if (piece && piece.color === turn) {
      setSelectedSquare((prev) => (prev === sq ? null : sq));
    } else {
      setSelectedSquare(null);
    }
  };

  const getSquareFromPointer = (clientX: number, clientY: number): Square | null => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;
    const col = Math.floor((relX / rect.width) * 8);
    const row = Math.floor((relY / rect.height) * 8);
    return gridToSquare(col, row, orientation);
  };

  const handlePointerDown = (e: React.PointerEvent, sq: Square) => {
    // Right-click starts custom analysis arrow
    if (e.button === 2) {
      setRightDragFrom(sq);
      return;
    }
    if (e.button !== 0) return;

    setUserArrows([]);
    if (!canInteract) return;

    // If tapping a legal destination for the currently selected piece, move immediately
    if (selectedSquare && legalTargets.has(sq)) {
      tryExecuteMove(selectedSquare, sq);
      return;
    }

    const piece = chess.get(sq);
    if (piece && piece.color === turn) {
      const wasSelected = selectedSquare === sq;
      setSelectedSquare(sq);
      pointerMetaRef.current = {
        from: sq,
        type: piece.type,
        color: piece.color,
        startX: e.clientX,
        startY: e.clientY,
        wasSelected,
        didDrag: false,
      };
    } else {
      setSelectedSquare(null);
      pointerMetaRef.current = null;
    }
  };

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const meta = pointerMetaRef.current;
      if (!meta) return;
      const dist = Math.hypot(e.clientX - meta.startX, e.clientY - meta.startY);
      if (!meta.didDrag && dist < 5) return;

      meta.didDrag = true;
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return;
      const hoverSquare = getSquareFromPointer(e.clientX, e.clientY);
      setDragging({
        from: meta.from,
        type: meta.type,
        color: meta.color,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        hoverSquare,
      });
    };

    const handleUp = (e: PointerEvent) => {
      const meta = pointerMetaRef.current;
      if (!meta) return;
      pointerMetaRef.current = null;

      if (meta.didDrag) {
        const target = getSquareFromPointer(e.clientX, e.clientY);
        if (target && target !== meta.from) {
          tryExecuteMove(meta.from, target);
        }
        setDragging(null);
      } else if (meta.wasSelected) {
        // Simple click on an already-selected piece toggles it off
        setSelectedSquare(null);
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  });

  const handlePointerUpRight = (e: React.PointerEvent, sq: Square) => {
    if (e.button === 2 && rightDragFrom) {
      if (rightDragFrom !== sq) {
        setUserArrows((prev) => {
          const exists = prev.some((a) => a.from === rightDragFrom && a.to === sq);
          if (exists) return prev.filter((a) => !(a.from === rightDragFrom && a.to === sq));
          return [...prev, { from: rightDragFrom, to: sq, color: 'amber', opacity: 0.85 }];
        });
      }
      setRightDragFrom(null);
    }
  };

  const allArrows = useMemo(() => [...arrows, ...userArrows], [arrows, userArrows]);

  const highlightMap = useMemo(() => {
    const map = new Map<Square, SquareHighlight['color']>();
    for (const h of highlights) map.set(h.square, h.color);
    if (hintSquare) map.set(hintSquare, 'emerald');
    return map;
  }, [highlights, hintSquare]);

  const squares = useMemo(() => {
    const arr: Array<{ sq: Square; row: number; col: number; isLight: boolean }> = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const sq = gridToSquare(col, row, orientation)!;
        const isLight = (row + col) % 2 === 0;
        arr.push({ sq, row, col, isLight });
      }
    }
    return arr;
  }, [orientation]);

  return (
    <div
      className="relative w-full aspect-square rounded-xl p-2 sm:p-2.5 rgb-board-halo select-none"
      style={{
        backgroundColor: theme.frameBg,
        border: `1.5px solid ${theme.frameBorder}`,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 8x8 Interactive Board Surface */}
      <div
        ref={boardRef}
        className="relative w-full h-full rounded-[6px] overflow-hidden grid grid-cols-8 grid-rows-8 touch-none"
      >
        {squares.map(({ sq, row, col, isLight }) => {
          const piece = chess.get(sq);
          const isSelected = selectedSquare === sq;
          const isLegalTarget = legalTargets.has(sq);
          const isLastMove = lastMove?.from === sq || lastMove?.to === sq;
          const isChecked = checkedKingSquare === sq;
          const customHighlight = highlightMap.get(sq);
          const isDragHover = dragging?.hoverSquare === sq && dragging.from !== sq && legalTargets.has(sq);
          const isBeingDragged = dragging?.from === sq;

          let bg = isLight ? theme.light : theme.dark;
          if (isLastMove) {
            bg = isLight ? theme.lastMoveLight : theme.lastMoveDark;
          }

          // Calculate smooth glide origin delta for newly arrived piece
          let glideInitial: { x: string; y: string } | false = false;
          if (piece && lastMove?.to === sq) {
            const fromGrid = squareToGrid(lastMove.from, orientation);
            const toGrid = squareToGrid(lastMove.to, orientation);
            glideInitial = {
              x: `${(fromGrid.col - toGrid.col) * 100}%`,
              y: `${(fromGrid.row - toGrid.row) * 100}%`,
            };
          } else if (piece && castlingRookMove?.to === sq) {
            const fromGrid = squareToGrid(castlingRookMove.from, orientation);
            const toGrid = squareToGrid(castlingRookMove.to, orientation);
            glideInitial = {
              x: `${(fromGrid.col - toGrid.col) * 100}%`,
              y: `${(fromGrid.row - toGrid.row) * 100}%`,
            };
          }

          return (
            <div
              key={sq}
              role="button"
              tabIndex={canInteract ? 0 : -1}
              aria-label={`Square ${sq}${piece ? `, ${piece.color === 'w' ? 'White' : 'Black'} ${piece.type}` : ''}`}
              onPointerDown={(e) => handlePointerDown(e, sq)}
              onPointerUp={(e) => handlePointerUpRight(e, sq)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSquareKeyboard(sq);
                }
              }}
              className="relative flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:z-20"
              style={{
                backgroundColor: bg,
                boxShadow: customHighlight
                  ? HIGHLIGHT_STYLES[customHighlight]
                  : isSelected
                  ? 'inset 0 0 0 3px rgba(34, 211, 238, 0.95), inset 0 0 18px rgba(168, 85, 247, 0.45)'
                  : isDragHover
                  ? 'inset 0 0 0 3px rgba(52, 211, 153, 0.95), inset 0 0 16px rgba(34, 211, 238, 0.45)'
                  : undefined,
                cursor:
                  canInteract && ((piece && piece.color === turn) || isLegalTarget)
                    ? 'pointer'
                    : 'default',
              }}
            >
              {/* Subtle Neon Glowing Ring on Last Move Source & Target Squares */}
              {isLastMove && (
                <span
                  aria-hidden="true"
                  className={`absolute inset-[2px] rounded-[3px] pointer-events-none z-[5] ${
                    lastMove?.to === sq
                      ? 'border-2 border-cyan-300/90 shadow-[inset_0_0_14px_rgba(34,211,238,0.55),0_0_8px_rgba(56,189,248,0.35)]'
                      : 'border-[1.5px] border-cyan-400/65 shadow-[inset_0_0_10px_rgba(34,211,238,0.35)]'
                  }`}
                />
              )}

              {/* King in Check pulsing neon alarm glow */}
              {isChecked && (
                <div
                  className="absolute inset-0 pointer-events-none animate-pulse"
                  style={{
                    background:
                      'radial-gradient(circle at center, rgba(244,63,94,0.9) 0%, rgba(236,72,153,0.52) 55%, rgba(236,72,153,0) 82%)',
                  }}
                />
              )}

              {/* Subtle Rank & File Coordinates */}
              {showCoordinates && col === 0 && (
                <span
                  className="absolute top-0.5 left-1 text-[10px] font-mono-tabular font-semibold leading-none pointer-events-none"
                  style={{ color: isLight ? theme.lightCoord : theme.darkCoord }}
                >
                  {sq[1]}
                </span>
              )}
              {showCoordinates && row === 7 && (
                <span
                  className="absolute bottom-0.5 right-1 text-[10px] font-mono-tabular font-semibold leading-none pointer-events-none"
                  style={{ color: isLight ? theme.lightCoord : theme.darkCoord }}
                >
                  {sq[0]}
                </span>
              )}

              {/* Glowing RGB Legal Move Indicator */}
              {isLegalTarget && !piece && (
                <span className="w-[30%] h-[30%] rounded-full bg-cyan-400/75 shadow-[0_0_10px_rgba(34,211,238,0.9)] pointer-events-none z-10" />
              )}
              {isLegalTarget && piece && (
                <span className="absolute inset-[5%] rounded-full border-[3.5px] border-fuchsia-400/85 shadow-[0_0_12px_rgba(232,121,249,0.85)] pointer-events-none z-10" />
              )}

              {/* Chess Piece with smooth spring glide and scale-105 selection lift */}
              {piece && (
                <motion.div
                  key={`${sq}-${piece.color}-${piece.type}-${lastMove?.to === sq ? fen : 'static'}`}
                  initial={glideInitial}
                  animate={{ x: 0, y: 0 }}
                  transition={{ type: 'spring', stiffness: 460, damping: 34, mass: 0.65 }}
                  className={`w-full h-full z-10 flex items-center justify-center transition-transform duration-150 ${
                    isBeingDragged
                      ? 'opacity-25 scale-95'
                      : isSelected
                      ? 'opacity-100 scale-105'
                      : 'opacity-100'
                  }`}
                >
                  <ChessPieceSVG type={piece.type} color={piece.color} className="w-[88%] h-[88%]" />
                </motion.div>
              )}
            </div>
          );
        })}

        {/* Floating Dragged Piece with scale-105 lift */}
        {dragging && (
          <div
            className="absolute pointer-events-none z-40 flex items-center justify-center"
            style={{
              width: '12.5%',
              height: '12.5%',
              left: dragging.x,
              top: dragging.y,
              transform: 'translate(-50%, -50%) scale(1.05)',
            }}
          >
            <ChessPieceSVG type={dragging.type} color={dragging.color} className="w-[88%] h-[88%]" />
          </div>
        )}

        {/* SVG Tactical Arrow Overlay (Coach suggestions, tactical motifs, user arrows) */}
        {allArrows.length > 0 && (
          <svg
            viewBox="0 0 800 800"
            className="absolute inset-0 w-full h-full pointer-events-none z-30"
          >
            <defs>
              {(['emerald', 'amber', 'crimson', 'sky'] as const).map((c) => (
                <marker
                  key={c}
                  id={`arrow-head-${c}`}
                  markerWidth="4.2"
                  markerHeight="4.2"
                  refX="2.5"
                  refY="2.1"
                  orient="auto"
                >
                  <polygon points="0 0, 4.2 2.1, 0 4.2" fill={ARROW_COLORS[c]} />
                </marker>
              ))}
            </defs>
            {allArrows.map((arrow, idx) => {
              const fromG = squareToGrid(arrow.from, orientation);
              const toG = squareToGrid(arrow.to, orientation);
              const x1 = fromG.col * 100 + 50;
              const y1 = fromG.row * 100 + 50;
              const x2 = toG.col * 100 + 50;
              const y2 = toG.row * 100 + 50;

              // Shorten tip slightly so arrowhead sits cleanly in square center
              const dx = x2 - x1;
              const dy = y2 - y1;
              const len = Math.hypot(dx, dy) || 1;
              const shrink = 22;
              const endX = x2 - (dx / len) * shrink;
              const endY = y2 - (dy / len) * shrink;

              return (
                <g key={`${arrow.from}-${arrow.to}-${idx}`} opacity={arrow.opacity ?? 0.86}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={endX}
                    y2={endY}
                    stroke={ARROW_COLORS[arrow.color]}
                    strokeWidth="13"
                    strokeLinecap="round"
                    markerEnd={`url(#arrow-head-${arrow.color})`}
                  />
                </g>
              );
            })}
          </svg>
        )}

        {/* Interactive Pawn Promotion Picker Overlay */}
        <AnimatePresence>
          {pendingPromotion && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              className="absolute inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4"
              onClick={() => setPendingPromotion(null)}
            >
              <motion.div
                initial={{ scale: 0.94, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.94, opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-[#1B1D22] border border-white/15 rounded-xl p-4 shadow-2xl max-w-xs w-full"
              >
                <p className="text-sm font-medium text-[#F2EFE9] text-center mb-3">
                  Choose Promotion Piece
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {(['q', 'r', 'b', 'n'] as PieceSymbol[]).map((promo) => (
                    <button
                      key={promo}
                      type="button"
                      onClick={() => {
                        onMove(pendingPromotion.from, pendingPromotion.to, promo);
                        setPendingPromotion(null);
                      }}
                      className="flex flex-col items-center gap-1 p-2 rounded-lg bg-white/5 hover:bg-[#D99B38]/20 border border-white/10 hover:border-[#D99B38]/60 transition-colors cursor-pointer"
                    >
                      <div className="w-11 h-11">
                        <ChessPieceSVG type={promo} color={pendingPromotion.color} />
                      </div>
                      <span className="text-[11px] font-medium text-[#CFCBC2]">
                        {promo === 'q' ? 'Queen' : promo === 'r' ? 'Rook' : promo === 'b' ? 'Bishop' : 'Knight'}
                      </span>
                    </button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
