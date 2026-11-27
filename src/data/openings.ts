export interface OpeningEntry {
  eco: string;
  name: string;
  moves: string[];
  description: string;
  coursePages?: string;
}

/**
 * Curated Opening Book & ECO Index matching Dr. Dave Regis's
 * "Ten Steps to Learn Chess Tactics and Combinations" (Page 80 Opening Index)
 * plus standard classical openings.
 */
export const OPENING_BOOK: OpeningEntry[] = [
  {
    eco: 'C57',
    name: "Two Knights' Defence — Fried Liver / Ng5 Attack",
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5'],
    description: 'Sharp tactical attack targeting f7; featured heavily throughout Ten Steps.',
    coursePages: 'Pages 12, 15, 17, 42, 45, 51–58',
  },
  {
    eco: 'C58',
    name: "Two Knights' Defence — Polerio Defence",
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Na5'],
    description: 'Black sacrifices a pawn to seize active piece play and counterattack.',
    coursePages: 'Pages 11, 72',
  },
  {
    eco: 'C55',
    name: "Two Knights' Defence",
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'],
    description: 'A classic double king-pawn battleground rich in forks, pins, and sacrifices.',
    coursePages: 'Pages 11–14, 21, 31, 34–35, 45–55',
  },
  {
    eco: 'C56',
    name: "Two Knights' Defence — Scotch Gambit Line",
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'd4', 'exd4', 'O-O'],
    description: 'Open central files create rapid tactical discoveries and pins.',
    coursePages: 'Pages 18, 27',
  },
  {
    eco: 'C51',
    name: "Evans' Gambit",
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4'],
    description: 'White offers the b-pawn to gain rapid central control and open attacking lines.',
    coursePages: 'Page 48',
  },
  {
    eco: 'C50',
    name: 'Italian Game (Giuoco Piano)',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'],
    description: 'Classical development aiming directly at the vulnerable f7 square.',
    coursePages: 'Page 65',
  },
  {
    eco: 'C45',
    name: 'Scotch Game',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4'],
    description: 'Immediate central tension opening lines for tactical skewers, discoveries, and nets.',
    coursePages: 'Pages 17, 19–20, 24, 26, 28, 35, 39–40, 46, 59, 61, 70, 72–73, 77',
  },
  {
    eco: 'C44',
    name: 'Scotch Gambit / Ponziani',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Bc4'],
    description: 'Rapid piece development over material — punishes greedy pawn grabbing.',
    coursePages: 'Pages 16, 22, 24–26, 29–30, 44, 46, 51, 54, 56, 69',
  },
  {
    eco: 'C44',
    name: 'Ponziani Opening',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'c3'],
    description: 'Prepares d4 with a pawn while setting subtle queen-side pin traps.',
    coursePages: 'Pages 16, 24',
  },
  {
    eco: 'C47',
    name: 'Scotch Four Knights',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6', 'd4'],
    description: 'Symmetrical development that erupts quickly when either side slips tactically.',
    coursePages: 'Pages 18, 29, 33, 49, 50',
  },
  {
    eco: 'C48',
    name: "Four Knights' Game (Spanish)",
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6', 'Bb5'],
    description: 'Solid piece development with dangerous pins on the e-file and c6 knight.',
    coursePages: 'Pages 16, 21, 40',
  },
  {
    eco: 'C46',
    name: "Three Knights' / Four Knights' Game",
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3'],
    description: 'Classical development focused on central control.',
    coursePages: 'Pages 33, 36, 44, 58, 60',
  },
  {
    eco: 'C41',
    name: "Philidor's Defence",
    moves: ['e4', 'e5', 'Nf3', 'd6'],
    description: 'Solid pawn chain defending e5, though slightly cramped — home of Legall\'s Mate.',
    coursePages: 'Pages 10–11, 14, 18, 20, 22–23, 25, 33, 39–41, 59–60, 62, 64',
  },
  {
    eco: 'C42',
    name: "Petroff's Defence (Russian Game)",
    moves: ['e4', 'e5', 'Nf3', 'Nf6'],
    description: 'Counter-attacking defence against e4 with sharp discovered checks on the e-file.',
    coursePages: 'Pages 13–14, 24–26, 36–37, 42, 58–59, 61–62, 71, 73',
  },
  {
    eco: 'C43',
    name: "Petroff's Defence — Steinitz Variation",
    moves: ['e4', 'e5', 'Nf3', 'Nf6', 'd4'],
    description: 'Aggressive central thrust fighting immediately for initiative.',
    coursePages: 'Pages 17, 38, 49, 71',
  },
  {
    eco: 'C40',
    name: "Damiano's Defence",
    moves: ['e4', 'e5', 'Nf3', 'f6'],
    description: 'Weakens the e8–h5 diagonal severely — punished by 3.Nxe5!.',
    coursePages: 'Pages 30, 53',
  },
  {
    eco: 'C40',
    name: 'Latvian Gambit',
    moves: ['e4', 'e5', 'Nf3', 'f5'],
    description: 'Wild, double-edged gambit creating violent tactical skirmishes.',
    coursePages: 'Pages 10, 15–16, 19, 23, 32, 36, 38, 42–43, 47, 55, 63',
  },
  {
    eco: 'C40',
    name: 'Elephant Gambit',
    moves: ['e4', 'e5', 'Nf3', 'd5'],
    description: 'Black counter-strikes in the center immediately, leading to sharp tactics.',
    coursePages: 'Pages 41, 45, 53',
  },
  {
    eco: 'C68',
    name: 'Ruy Lopez — Exchange Variation',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6'],
    description: 'Trades bishop for knight to damage Black\'s pawn structure; watch for h-file attacks.',
    coursePages: 'Pages 44, 65–69',
  },
  {
    eco: 'C65',
    name: 'Ruy Lopez — Berlin Defence',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'],
    description: 'Sturdy defence featuring undermining tricks and Mortimer\'s Trap.',
    coursePages: 'Pages 29, 43, 48, 61',
  },
  {
    eco: 'C63',
    name: 'Ruy Lopez — Schliemann Gambit',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'f5'],
    description: 'Fiery counter-gambit against the Spanish Opening.',
    coursePages: 'Pages 30, 39',
  },
  {
    eco: 'C60',
    name: 'Ruy Lopez (Spanish Game)',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
    description: 'One of chess\'s greatest classical openings, pressuring the defender of e5.',
    coursePages: 'Pages 21, 37, 73',
  },
  {
    eco: 'C24',
    name: "Bishop's Opening",
    moves: ['e4', 'e5', 'Bc4', 'Nf6'],
    description: 'Flexible development avoiding early theory while eyeing f7.',
    coursePages: 'Page 34',
  },
  {
    eco: 'C30',
    name: "King's Gambit",
    moves: ['e4', 'e5', 'f4'],
    description: 'Romantic sacrifice of the f-pawn to open the f-file and dominate the center.',
    coursePages: 'Page 32',
  },
  {
    eco: 'C17',
    name: 'French Defence — Winawer',
    moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4'],
    description: 'Counterattacking defence fighting over the d4/e5 pawn chain.',
    coursePages: 'Page 22',
  },
  {
    eco: 'B15',
    name: 'Caro-Kann Defence',
    moves: ['e4', 'c6', 'd4', 'd5', 'Nc3'],
    description: 'Solid defence featured in Reti–Tartakower (1910), the famous double-check mate.',
    coursePages: 'Page 64',
  },
  {
    eco: 'B20',
    name: 'Sicilian Defence',
    moves: ['e4', 'c5'],
    description: 'Asymmetrical fight for the initiative from move one.',
  },
  {
    eco: 'D06',
    name: "Queen's Gambit",
    moves: ['d4', 'd5', 'c4'],
    description: 'Classical struggle for central space on the d4/e4 squares.',
  },
  {
    eco: 'C40',
    name: "King's Knight Opening",
    moves: ['e4', 'e5', 'Nf3'],
    description: 'The great main highway of chess — develops a piece while attacking e5.',
  },
  {
    eco: 'C20',
    name: "King's Pawn Game",
    moves: ['e4', 'e5'],
    description: 'Open, principled central battle — the foundation of tactical chess.',
  },
];

export function detectOpening(historySan: string[]): OpeningEntry | null {
  if (historySan.length === 0) return null;
  let bestMatch: OpeningEntry | null = null;
  for (const entry of OPENING_BOOK) {
    if (entry.moves.length <= historySan.length) {
      let matches = true;
      for (let i = 0; i < entry.moves.length; i++) {
        if (historySan[i] !== entry.moves[i]) {
          matches = false;
          break;
        }
      }
      if (matches && (!bestMatch || entry.moves.length > bestMatch.moves.length)) {
        bestMatch = entry;
      }
    }
  }
  return bestMatch;
}
