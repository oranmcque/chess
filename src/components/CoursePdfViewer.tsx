import React, { useMemo, useState } from 'react';
import { BookOpen, ExternalLink, ArrowRight } from 'lucide-react';
import { COURSE_CHAPTERS, TACTICS_PUZZLES } from '../data/tacticsCourse';
import { OPENING_BOOK } from '../data/openings';

interface CoursePdfViewerProps {
  onJumpToChapter: (chapter: number, puzzleId?: string) => void;
}

const PDF_PATH = 'https://ik.imagekit.io/pr9qhu2he/TacticsCourse.pdf';

const CHAPTER_START_PAGES: Record<number, number> = {
  1: 8,
  2: 10,
  3: 13,
  4: 23,
  5: 35,
  6: 40,
  7: 49,
  8: 51,
  9: 72,
  10: 74,
};

export const CoursePdfViewer: React.FC<CoursePdfViewerProps> = ({ onJumpToChapter }) => {
  const [pdfPage, setPdfPage] = useState<number>(1);
  const [ecoSearch, setEcoSearch] = useState<string>('');

  const filteredOpenings = useMemo(() => {
    const q = ecoSearch.trim().toLowerCase();
    if (!q) return OPENING_BOOK.filter((o) => o.coursePages);
    return OPENING_BOOK.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.eco.toLowerCase().includes(q) ||
        o.moves.join(' ').toLowerCase().includes(q)
    );
  }, [ecoSearch]);

  const findPuzzleForEco = (eco: string) => {
    return TACTICS_PUZZLES.find((p) => p.eco === eco);
  };

  return (
    <div className="w-full max-w-[1380px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4 sm:pb-5 border-b border-white/8">
        <div>
          <p className="text-xs text-[#D99B38] font-medium mb-1">
            Complete Course Reference · 84 Pages
          </p>
          <h1 className="font-display text-xl sm:text-3xl font-semibold text-[#F2EFE9] tracking-tight">
            Ten Steps Course Book &amp; ECO Opening Index
          </h1>
        </div>
        <a
          href={PDF_PATH}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#D99B38] text-[#141517] hover:bg-[#E4AA49] transition-colors whitespace-nowrap"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open Full PDF
        </a>
      </div>

      {/* Mobile Quick Chapter Strip */}
      <div className="lg:hidden space-y-2">
        <p className="text-xs font-medium text-[#9A9892]">Jump to Chapter Page</p>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {COURSE_CHAPTERS.map((ch) => {
            const startPage = CHAPTER_START_PAGES[ch.number];
            const active = pdfPage === startPage;
            return (
              <button
                key={ch.number}
                type="button"
                onClick={() => setPdfPage(startPage)}
                className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#D99B38] border-[#D99B38] text-[#141517] font-semibold'
                    : 'bg-[#1A1C21] border-white/10 text-[#CFCBC2]'
                }`}
              >
                {ch.number}. {ch.title} (p.{startPage})
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Split: Chapter Page Jumps + Live PDF Embed */}
      <div className="grid grid-cols-1 lg:grid-cols-[310px_1fr] gap-6 items-start">
        <aside className="hidden lg:block rounded-xl bg-[#1A1C21] border border-white/8 p-4 space-y-3">
          <div className="pb-2.5 border-b border-white/8">
            <h2 className="font-display text-base font-semibold text-[#F2EFE9]">
              Contents &amp; Quick Jumps
            </h2>
            <p className="text-xs text-[#9A9892] mt-0.5">
              Jump directly to any chapter in the book or play it interactively
            </p>
          </div>

          <div className="space-y-1 max-h-[580px] overflow-y-auto pr-1">
            {[
              { label: 'Cover & Introduction', page: 4 },
              { label: 'How to Read & Write Notation', page: 6 },
            ].map((item) => (
              <button
                key={item.page}
                type="button"
                onClick={() => setPdfPage(item.page)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                  pdfPage === item.page
                    ? 'bg-white/10 text-[#F4D08A] font-semibold'
                    : 'text-[#CFCBC2] hover:bg-white/5'
                }`}
              >
                <span className="truncate">{item.label}</span>
                <span className="font-mono-tabular text-[#8B8881] shrink-0">p.{item.page}</span>
              </button>
            ))}

            {COURSE_CHAPTERS.map((ch) => {
              const startPage = CHAPTER_START_PAGES[ch.number];
              return (
                <div
                  key={ch.number}
                  className={`rounded-lg p-2.5 border transition-colors ${
                    pdfPage === startPage
                      ? 'bg-white/8 border-[#D99B38]/40'
                      : 'border-transparent hover:bg-white/4'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setPdfPage(startPage)}
                      className="text-left flex-1 min-w-0 cursor-pointer"
                    >
                      <p className="text-xs font-semibold text-[#F2EFE9] truncate">
                        {ch.number}. {ch.title}
                      </p>
                      <p className="text-[11px] text-[#8B8881] font-mono-tabular mt-0.5">
                        {ch.pageRange}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => onJumpToChapter(ch.number)}
                      title={`Practice Chapter ${ch.number} interactively`}
                      className="px-2 py-1 text-[11px] font-medium rounded bg-[#D99B38]/14 text-[#F4D08A] hover:bg-[#D99B38]/25 transition-colors whitespace-nowrap cursor-pointer shrink-0"
                    >
                      Practice
                    </button>
                  </div>
                </div>
              );
            })}

            {[
              { label: 'Test Yourself! Diagrams', page: 78 },
              { label: 'Opening Index (ECO)', page: 80 },
              { label: 'Official Answer Key', page: 81 },
            ].map((item) => (
              <button
                key={item.page}
                type="button"
                onClick={() => setPdfPage(item.page)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                  pdfPage === item.page
                    ? 'bg-white/10 text-[#F4D08A] font-semibold'
                    : 'text-[#CFCBC2] hover:bg-white/5'
                }`}
              >
                <span className="truncate">{item.label}</span>
                <span className="font-mono-tabular text-[#8B8881] shrink-0">p.{item.page}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Embedded PDF Document */}
        <div className="rounded-xl bg-[#1A1C21] border border-white/8 overflow-hidden flex flex-col">
          <div className="px-3 sm:px-4 py-3 border-b border-white/8 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-[#CFCBC2]">
              <BookOpen className="w-4 h-4 text-[#D99B38]" />
              <span>TacticsCourse.pdf</span>
              <span className="text-[#7D7B76]">·</span>
              <span className="font-mono-tabular text-[#9A9892]">Page {pdfPage}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 text-xs rounded bg-white/6 hover:bg-white/12 text-[#E6E2D9] cursor-pointer"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPdfPage((p) => Math.min(84, p + 1))}
                className="px-2.5 py-1 text-xs rounded bg-white/6 hover:bg-white/12 text-[#E6E2D9] cursor-pointer"
              >
                Next
              </button>
              <a
                href={`${PDF_PATH}#page=${pdfPage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 text-xs rounded bg-[#D99B38]/16 text-[#F4D08A] hover:bg-[#D99B38]/25 inline-flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                Open p.{pdfPage}
              </a>
            </div>
          </div>

          <iframe
            key={pdfPage}
            src={`${PDF_PATH}#page=${pdfPage}`}
            title="Ten Steps to Learn Chess Tactics and Combinations PDF"
            className="w-full h-[460px] sm:h-[580px] lg:h-[660px] bg-[#141517]"
          />
        </div>
      </div>

      {/* Interactive ECO Opening Index (From Page 80 of the PDF) */}
      <section className="rounded-xl bg-[#1A1C21] border border-white/8 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-white/8">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#F2EFE9]">
              Opening Index by ECO Code
            </h2>
            <p className="text-xs text-[#9A9892] mt-0.5">
              Explore the Double King Pawn openings featured across Dr. Regis’s course and launch directly into their tactical games
            </p>
          </div>
          <input
            type="search"
            value={ecoSearch}
            onChange={(e) => setEcoSearch(e.target.value)}
            placeholder="Filter by ECO (C57, C45) or opening…"
            className="px-3 py-2 text-xs rounded-lg bg-[#121316] border border-white/10 text-[#F2EFE9] placeholder:text-[#7D7B76] focus:outline-none focus:border-[#D99B38] w-full sm:w-64"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredOpenings.map((op) => {
            const linkedPuzzle = findPuzzleForEco(op.eco);
            return (
              <div
                key={`${op.eco}-${op.name}`}
                className="p-4 rounded-lg bg-[#14161A] border border-white/8 flex flex-col justify-between gap-3"
              >
                <div>
                  <p className="text-xs text-[#9A9892] font-mono-tabular">
                    {op.eco}
                    {op.coursePages ? ` · ${op.coursePages}` : ''}
                  </p>
                  <h3 className="text-sm font-semibold text-[#F2EFE9] mt-1">{op.name}</h3>
                  <p className="font-mono-tabular text-[11px] text-[#F4D08A] mt-1.5">
                    {op.moves
                      .map((m, idx) => (idx % 2 === 0 ? `${Math.floor(idx / 2) + 1}.${m}` : m))
                      .join(' ')}
                  </p>
                  <p className="text-xs text-[#A8A59E] mt-2 leading-relaxed">{op.description}</p>
                </div>

                {linkedPuzzle && (
                  <button
                    type="button"
                    onClick={() => onJumpToChapter(linkedPuzzle.chapter, linkedPuzzle.id)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#34D399] hover:text-[#6EE7B7] transition-colors cursor-pointer self-start"
                  >
                    Practice {linkedPuzzle.title}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
