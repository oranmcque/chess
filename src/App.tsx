import { useState } from 'react';
import {
  BookOpen,
  Flame,
  GraduationCap,
  Plus,
  Swords,
  Trophy,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { AppSection, BoardThemeId, Difficulty } from './types/chess';
import { PlayArena } from './components/PlayArena';
import { TacticsAcademy } from './components/TacticsAcademy';
import { FundamentalsLab } from './components/FundamentalsLab';
import { ProgressView } from './components/ProgressView';
import { CoursePdfViewer } from './components/CoursePdfViewer';
import { ChessPieceSVG } from './components/ChessPieceSVG';

const NAV_ITEMS: Array<{
  id: AppSection;
  label: string;
  mobileLabel: string;
  icon: typeof Swords;
  accentClass: string;
}> = [
  { id: 'play', label: 'Play', mobileLabel: 'Play', icon: Swords, accentClass: 'text-[#D99B38]' },
  { id: 'course', label: 'Tactics', mobileLabel: 'Tactics', icon: Flame, accentClass: 'text-[#F97316]' },
  { id: 'fundamentals', label: 'Drills', mobileLabel: 'Drills', icon: GraduationCap, accentClass: 'text-[#10B981]' },
  { id: 'progress', label: 'Progress', mobileLabel: 'Rank', icon: Trophy, accentClass: 'text-[#EAB308]' },
  { id: 'pdf', label: 'Course PDF', mobileLabel: 'Book', icon: BookOpen, accentClass: 'text-[#38BDF8]' },
];

export default function App() {
  const [section, setSection] = useState<AppSection>('play');
  const [boardThemeId, setBoardThemeId] = useState<BoardThemeId>('neon');
  const [practiceFen, setPracticeFen] = useState<string | null>(null);
  const [requestedDifficulty, setRequestedDifficulty] = useState<Difficulty | null>(null);
  const [courseChapter, setCourseChapter] = useState<number>(1);
  const [coursePuzzleId, setCoursePuzzleId] = useState<string | undefined>(undefined);
  const [newGameTrigger, setNewGameTrigger] = useState<number>(0);

  const handlePracticeFen = (fen: string) => {
    setPracticeFen(fen);
    setSection('play');
  };

  const handleStartMatchWithDifficulty = (diff: Difficulty) => {
    setRequestedDifficulty(diff);
    setSection('play');
  };

  const handleJumpToChapter = (chapter: number, puzzleId?: string) => {
    setCourseChapter(chapter);
    setCoursePuzzleId(puzzleId);
    setSection('course');
  };

  const handleNewGameCta = () => {
    setSection('play');
    setNewGameTrigger((n) => n + 1);
  };

  return (
    <div className="relative min-h-screen flex flex-col rgb-arena-bg text-[#F2EFE9] overflow-x-clip">
      {/* Slow-moving ambient RGB gradient orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0" aria-hidden="true">
        <div className="rgb-orb-float absolute -top-28 -left-24 w-80 h-80 rounded-full bg-cyan-500/12 blur-[110px]" />
        <div
          className="rgb-orb-float absolute top-1/3 -right-24 w-96 h-96 rounded-full bg-fuchsia-500/12 blur-[120px]"
          style={{ animationDelay: '-7s' }}
        />
        <div
          className="rgb-orb-float absolute -bottom-24 left-1/3 w-96 h-96 rounded-full bg-violet-500/12 blur-[120px]"
          style={{ animationDelay: '-13s' }}
        />
      </div>

      {/* Playful Mobile-First 3-Zone Top Header */}
      <header className="sticky top-0 z-40 bg-[#0B0E1A]/80 backdrop-blur-xl border-b border-cyan-400/20 shadow-[0_4px_28px_rgba(34,211,238,0.12)]">
        <div className="w-full max-w-[1380px] mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3 sm:gap-6">
          {/* Zone 1: Glowing RGB Chess Crest + Brand Wordmark */}
          <button
            type="button"
            onClick={() => setSection('play')}
            className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 cursor-pointer group"
          >
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#22D3EE] via-[#8B5CF6] to-[#EC4899] p-1.5 rgb-pulse-glow flex items-center justify-center transition-transform group-hover:scale-105 group-active:scale-95">
              <ChessPieceSVG type="n" color="w" className="w-full h-full" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-display text-base sm:text-lg font-semibold tracking-tight rgb-gradient-text">
                Ten Steps Chess
              </span>
              <span className="hidden sm:block text-[10px] font-medium text-cyan-200/75 tracking-wide mt-0.5">
                RGB Arena · Tactics · Coach
              </span>
            </span>
          </button>

          {/* Zone 2: Desktop / Tablet Interactive RGB Icon Nav */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-[#101526]/90 border border-white/12 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          >
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs lg:text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active ? 'text-white font-semibold' : 'text-[#B2B7CC] hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="top-nav-active-tab"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      className="absolute inset-0 rounded-lg bg-gradient-to-r from-[#06B6D4] via-[#8B5CF6] to-[#EC4899] shadow-[0_0_18px_rgba(139,92,246,0.55)]"
                    />
                  )}
                  <Icon
                    className={`relative z-10 w-4 h-4 transition-transform ${
                      active ? 'text-white scale-110 drop-shadow-[0_0_6px_rgba(255,255,255,0.65)]' : item.accentClass
                    }`}
                  />
                  <span className="relative z-10">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Pulsing RGB Primary CTA */}
          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={handleNewGameCta}
              className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-[#06B6D4] via-[#8B5CF6] to-[#EC4899] text-white hover:brightness-110 active:scale-95 transition-all whitespace-nowrap shrink-0 rgb-pulse-glow cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>New Match</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Workspace (extra bottom clearance on mobile for thumb dock) */}
      <main className="relative z-10 flex-1 pb-24 md:pb-6">
        {section === 'play' && (
          <PlayArena
            boardThemeId={boardThemeId}
            onChangeBoardTheme={setBoardThemeId}
            initialFen={practiceFen}
            onClearInitialFen={() => setPracticeFen(null)}
            requestedDifficulty={requestedDifficulty}
            onClearRequestedDifficulty={() => setRequestedDifficulty(null)}
            onOpenProgress={() => setSection('progress')}
            onJumpToChapter={(ch) => handleJumpToChapter(ch)}
            onJumpToFundamentals={() => setSection('fundamentals')}
            newGameTrigger={newGameTrigger}
          />
        )}

        {section === 'course' && (
          <TacticsAcademy
            boardThemeId={boardThemeId}
            initialChapter={courseChapter}
            initialPuzzleId={coursePuzzleId}
            onPracticeFen={handlePracticeFen}
          />
        )}

        {section === 'fundamentals' && (
          <FundamentalsLab
            boardThemeId={boardThemeId}
            onPracticeFen={handlePracticeFen}
          />
        )}

        {section === 'progress' && (
          <ProgressView
            onStartMatchWithDifficulty={handleStartMatchWithDifficulty}
            onJumpToChapter={(ch) => handleJumpToChapter(ch)}
            onJumpToFundamentals={() => setSection('fundamentals')}
          />
        )}

        {section === 'pdf' && (
          <CoursePdfViewer onJumpToChapter={handleJumpToChapter} />
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="relative z-10 hidden md:block border-t border-white/10 bg-[#080B14]/60 backdrop-blur-md py-5 mt-8">
        <div className="w-full max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4 text-xs text-[#8D93AA]">
          <p>
            Ten Steps Chess · Featuring Dr. Dave Regis’s{' '}
            <a
              href="https://ik.imagekit.io/pr9qhu2he/TacticsCourse.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-300 hover:text-fuchsia-300 underline underline-offset-2 transition-colors"
            >
              Ten Steps to Learn Chess Tactics and Combinations
            </a>{' '}
            (Exeter Chess Club)
          </p>
          <p>Click or drag pieces to move · Right-click drag to draw glowing tactical arrows</p>
        </div>
      </footer>

      {/* Mobile-First Bottom Tab Navigation Bar (< md) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-[#0B0E1A]/92 backdrop-blur-xl border-t border-cyan-400/20 px-1.5 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(34,211,238,0.16)]"
      >
        <div className="grid grid-cols-5 gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`relative flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl transition-all active:scale-95 cursor-pointer ${
                  active
                    ? 'bg-gradient-to-b from-cyan-500/20 to-fuchsia-500/15 text-white shadow-[0_0_14px_rgba(34,211,238,0.22)]'
                    : 'text-[#8E95AE] hover:text-white'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="mobile-nav-indicator"
                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    className="absolute top-0 inset-x-3 h-[2.5px] rounded-full bg-gradient-to-r from-[#22D3EE] via-[#A855F7] to-[#EC4899] shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                  />
                )}
                <Icon
                  className={`w-5 h-5 ${active ? 'text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.75)]' : item.accentClass} opacity-95`}
                />
                <span className={`text-[11px] leading-tight ${active ? 'font-semibold text-white' : 'font-medium'}`}>
                  {item.mobileLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
