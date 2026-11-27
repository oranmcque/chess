import type { FundamentalLesson } from '../types/chess';

export const FUNDAMENTAL_LESSONS: FundamentalLesson[] = [
  // ===================== BASICS =====================
  {
    id: 'basic-check-escape',
    category: 'basics',
    title: 'Escaping Check: Capture, Block, or Move',
    subtitle: 'Core Survival Rule',
    summary:
      'Whenever your King is attacked ("in check"), you must resolve the threat immediately. There are only three legal ways to escape check: Capture the attacking piece, Block its path, or Move the King to a safe square.',
    rules: [
      'A King can never move onto an attacked square or stay in check.',
      'Check from a Knight cannot be blocked — you must capture the Knight or move the King.',
      'In a Double Check (two pieces giving check at once), ONLY moving the King works.',
    ],
    fen: '4r1k1/5ppp/8/8/8/8/3B1PPP/4K3 w - - 0 1',
    solutionMoves: ['Be3'],
    solverColor: 'w',
    coachTip:
      'Your King on e1 is checked by Black’s Rook on e8. Moving the King loses castling safety — instead, interpose your Bishop on e3 to block the check!',
    arrows: [{ from: 'e8', to: 'e1', color: 'crimson' }],
  },
  {
    id: 'basic-checkmate-vs-stalemate',
    category: 'basics',
    title: 'Checkmate vs. Stalemate',
    subtitle: 'Winning Without Accidentally Drawing',
    summary:
      'Checkmate ends the game as a win: the enemy King is in check with zero legal moves. Stalemate is an immediate DRAW: the opponent is NOT in check, yet has zero legal moves.',
    rules: [
      'When ahead a Queen in the endgame, always make sure your opponent’s King either gets checked OR still has a legal square.',
      'In this position, playing Qf7 would be a tragic Stalemate! Find the clean Checkmate in 1 instead.',
    ],
    fen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1',
    solutionMoves: ['Qg7#'],
    solverColor: 'w',
    coachTip:
      'Your King on g6 guards g7 and h7. Place the Queen right next to the Black King where your King protects her!',
  },
  {
    id: 'basic-piece-values',
    category: 'basics',
    title: 'Piece Values & Winning Material',
    subtitle: 'Pawn 1 · Knight 3 · Bishop 3 · Rook 5 · Queen 9',
    summary:
      'Evaluating trades quickly is the bedrock of chess. Winning a Rook (5) for a Bishop or Knight (3) is called "winning the exchange" (+2 points).',
    rules: [
      'Pawn = 1, Knight = 3, Bishop = 3, Rook = 5, Queen = 9, King = priceless.',
      'Two Bishops working together ("the Bishop Pair") are often worth an extra half-pawn in open positions.',
      'Here you can capture either a defended pawn or win a clean Rook for your Bishop — choose the profitable capture!',
    ],
    fen: 'r3k2r/ppp2ppp/2n5/3p4/3P4/5B2/PPP2PPP/R3K2R w KQkq - 0 1',
    solutionMoves: ['Bxd5'],
    solverColor: 'w',
    coachTip:
      'Wait — check the board carefully! Is a8 open or blocked? The d5 pawn is completely undefended while targeting c6 next. Grab the free central pawn with Bxd5!',
  },

  // ===================== SPECIAL MOVES =====================
  {
    id: 'special-castle-kingside',
    category: 'special-moves',
    title: 'Kingside Castling (O-O)',
    subtitle: 'King Safety & Rook Activation in One Move',
    summary:
      'Castling is the only move in chess that moves two pieces at once: the King slides two squares toward the Rook, and the Rook leaps over to stand beside the King.',
    rules: [
      'Neither the King nor the chosen Rook may have moved earlier in the game.',
      'All squares between the King and Rook must be empty.',
      'The King cannot currently be in check, pass through an attacked square, or land on an attacked square.',
    ],
    fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4',
    solutionMoves: ['O-O'],
    solverColor: 'w',
    coachTip:
      'Move your White King two squares to the right — from e1 to g1 — to execute Kingside Castling (O-O)!',
    arrows: [{ from: 'e1', to: 'g1', color: 'emerald' }],
  },
  {
    id: 'special-castle-queenside',
    category: 'special-moves',
    title: 'Queenside Castling (O-O-O)',
    subtitle: 'Long Castling & Central Rook Power',
    summary:
      'Castling Queenside moves the King from e1 to c1 while immediately placing the a1 Rook on the central d1 file — often setting up powerful discovered attacks along the d-file.',
    rules: [
      'Just like Kingside castling, the King moves exactly two squares (e1 → c1), while the Rook jumps three squares (a1 → d1).',
      'Even if the b1 square is attacked, Queenside castling IS still legal as long as e1, d1, and c1 are safe!',
    ],
    fen: 'r3kbnr/ppp2ppp/2nq4/3pp3/3P4/2N1BN2/PPPQPPPP/R3K2R w KQkq - 0 7',
    solutionMoves: ['O-O-O'],
    solverColor: 'w',
    coachTip:
      'Slide your King two squares to the left (e1 to c1) to castle Queenside and align your Rook with Black’s Queen!',
    arrows: [{ from: 'e1', to: 'c1', color: 'emerald' }],
  },
  {
    id: 'special-en-passant',
    category: 'special-moves',
    title: 'En Passant ("In Passing")',
    subtitle: 'The Most Surprising Legal Pawn Capture',
    summary:
      'When an enemy pawn advances TWO squares from its starting rank and lands directly beside your pawn on the 5th rank (4th for Black), you may capture it diagonally as if it had only moved one square.',
    rules: [
      'En Passant MUST be played on the very next turn immediately after the 2-square advance — otherwise the right expires forever!',
      'Watch Black push the d-pawn two squares (d7 → d5), then capture it en passant by moving your e5 pawn diagonally to d6!',
    ],
    fen: 'rnbqkbnr/pppppppp/8/4P3/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2',
    introMove: 'd5',
    solutionMoves: ['exd6'],
    solverColor: 'w',
    coachTip:
      'Black just rushed d7–d5 past your e5 pawn! Capture en passant immediately by moving your e5 pawn diagonally onto the empty d6 square.',
    arrows: [{ from: 'e5', to: 'd6', color: 'emerald' }],
  },
  {
    id: 'special-promotion-under',
    category: 'special-moves',
    title: 'Pawn Promotion & Knight Underpromotion',
    subtitle: 'Choosing the Smartest Piece on the 8th Rank',
    summary:
      'When a pawn reaches the opponent’s back rank, it immediately promotes into a Queen, Rook, Bishop, or Knight. Usually Queen is best — but sometimes underpromoting to a Knight wins instantly with a royal fork!',
    rules: [
      'You can promote to a Queen even if you already have one on the board.',
      'Here Black threatens ...Ra1#, so a quiet Queen promotion is too slow. Underpromote to a KNIGHT on e8 to fork Black’s King and Queen with check!',
    ],
    fen: '8/2q1P1k1/8/8/8/8/r4PPP/6K1 w - - 0 1',
    solutionMoves: ['e8=N+'],
    solverColor: 'w',
    coachTip:
      'Push your e7 pawn to e8 and select the KNIGHT in the promotion picker — e8=N+ checks Black’s King on g7 AND forks the Queen on c7!',
    arrows: [{ from: 'e7', to: 'e8', color: 'emerald' }],
  },

  // ===================== ADVANCED TACTICAL TECHNIQUES =====================
  {
    id: 'adv-double-check',
    category: 'tactics',
    title: 'Double Check (Unstoppable Force)',
    subtitle: 'When Two Pieces Check the King Simultaneously',
    summary:
      'A double check occurs when a piece moves to deliver check while simultaneously uncovering a check from a Rook, Bishop, or Queen behind it. The opponent cannot block or capture both pieces — only a King move is legal!',
    rules: [
      'Double checks frequently allow fearless Queen sacrifices right beforehand (as in Reti–Tartakower, Chapter 8.4).',
      'Move your Knight so that BOTH your Knight and your Rook on e1 check Black’s King simultaneously — winning the d8 Rook!',
    ],
    fen: '3rk3/5ppp/4N3/8/8/8/5PPP/4R1K1 w - - 0 1',
    solutionMoves: ['Nc7+'],
    solverColor: 'w',
    coachTip:
      'Leap your e6 Knight to c7 — delivering a double check from both the Knight and your e1 Rook while attacking the d8 Rook!',
    arrows: [{ from: 'e6', to: 'c7', color: 'emerald' }, { from: 'e1', to: 'e8', color: 'amber' }],
  },
  {
    id: 'adv-smothered-philidor',
    category: 'tactics',
    title: "Philidor's Legacy (Classic Smothered Mate)",
    subtitle: 'Queen Sacrifice Into a Corner Knight Mate',
    summary:
      'One of chess’s crown jewels: sacrifice your Queen right next to the enemy King so the opponent’s own Rook must capture it and seal the King inside a coffin — then the Knight delivers checkmate!',
    rules: [
      'Look for a cornered King trapped behind its own pawns with your Knight eyeing f7.',
      'Step 1: Sacrifice your Queen on g8 with check. Step 2: Once the Rook captures, leap your Knight to f7#!',
    ],
    fen: 'r5rk/6pp/7N/8/8/8/Q5PP/6K1 w - - 0 1',
    solutionMoves: ['Qg8+', 'Rxg8', 'Nf7#'],
    solverColor: 'w',
    coachTip:
      'Give check with your Queen right in the corner on g8 — Black’s King cannot take because your Knight guards g8, so the Rook must take and smother the King!',
  },

  // ===================== ENDGAME & STRATEGY =====================
  {
    id: 'end-opposition',
    category: 'endgame-strategy',
    title: 'King Opposition in Pawn Endgames',
    subtitle: 'Shoulder-to-Shoulder King Mastery',
    summary:
      'In King and Pawn endgames, the King transforms into a powerful fighting piece. Taking "the Opposition" means placing your King directly two squares in front of the enemy King on the same file, forcing the enemy King to give way!',
    rules: [
      'Always lead with your King IN FRONT of your passed pawn whenever possible.',
      'Step your King straight forward to e6, seizing the key squares so your pawn can march cleanly to promotion!',
    ],
    fen: '4k3/8/8/4KP2/8/8/8/8 w - - 0 1',
    solutionMoves: ['Ke6'],
    solverColor: 'w',
    coachTip:
      'Do NOT push f6 yet! Step your King ahead of your pawn onto e6 — seizing direct opposition and guaranteeing a winning promotion.',
    arrows: [{ from: 'e5', to: 'e6', color: 'emerald' }],
  },
  {
    id: 'end-rook-seventh',
    category: 'endgame-strategy',
    title: 'Pigs on the 7th Rank',
    subtitle: 'Doubled Rooks Dominating the Enemy Camp',
    summary:
      'Placing a Rook on the 7th rank (2nd rank for Black) attacks unmoved enemy pawns sideways and cuts off the enemy King on the back rank. Two connected Rooks on the 7th rank ("Pigs on the 7th") are almost unstoppable!',
    rules: [
      'Control open files first, then penetrate to the 7th rank.',
      'Bring your second Rook to join its partner on the 7th rank to deliver a clean ladder checkmate!',
    ],
    fen: '6k1/2R4p/8/8/8/8/5PPP/3R2K1 w - - 0 1',
    solutionMoves: ['Rd8#'],
    solverColor: 'w',
    coachTip:
      'Your c7 Rook already seals off the entire 7th rank so Black’s King cannot escape upward. Swing the d1 Rook to the back rank for checkmate!',
  },
];
