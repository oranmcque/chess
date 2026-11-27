import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, Pencil, RotateCcw, Swords, Trash2, UserPlus, X } from 'lucide-react';
import type { Difficulty } from '../types/chess';
import { COURSE_CHAPTERS, TACTICS_PUZZLES } from '../data/tacticsCourse';
import {
  createProfile,
  deleteProfile,
  getActiveProfile,
  getProfiles,
  renameProfile,
  setActiveProfile,
  type PlayerProfile,
} from '../utils/profiles';
import {
  DIFFICULTY_INFO,
  RANK_TIERS,
  getCoachTrainingFocus,
  getProgressSnapshot,
  loadSolvedPuzzleIds,
  resetPlayerProgress,
  subscribeProgress,
  type ComputedProgressSnapshot,
} from '../utils/progression';

interface ProgressViewProps {
  onStartMatchWithDifficulty: (difficulty: Difficulty) => void;
  onJumpToChapter: (chapter: number) => void;
  onJumpToFundamentals: () => void;
}

const DIFFICULTY_ORDER: Difficulty[] = ['rookie', 'intermediate', 'advanced', 'pro'];

export const ProgressView: React.FC<ProgressViewProps> = ({
  onStartMatchWithDifficulty,
  onJumpToChapter,
  onJumpToFundamentals,
}) => {
  const [profiles, setProfiles] = useState<PlayerProfile[]>(() => getProfiles());
  const [activeProfile, setActiveProfileState] = useState<PlayerProfile>(() => getActiveProfile());
  const [snapshot, setSnapshot] = useState<ComputedProgressSnapshot>(() => getProgressSnapshot());
  const [solvedIds, setSolvedIds] = useState<string[]>(() => loadSolvedPuzzleIds());
  const [confirmReset, setConfirmReset] = useState<boolean>(false);

  // Profile management inputs
  const [newPlayerName, setNewPlayerName] = useState<string>('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState<string>('');

  useEffect(() => {
    const sync = () => {
      const current = getActiveProfile();
      setProfiles(getProfiles());
      setActiveProfileState(current);
      setSnapshot(getProgressSnapshot(current.id));
      setSolvedIds(loadSolvedPuzzleIds(current.id));
    };
    sync();
    return subscribeProgress(sync);
  }, []);

  const handleReset = () => {
    resetPlayerProgress(activeProfile.id);
    setConfirmReset(false);
  };

  const handleCreateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;
    createProfile(newPlayerName.trim());
    setNewPlayerName('');
  };

  const handleSaveRename = (id: string) => {
    if (renameText.trim()) {
      renameProfile(id, renameText.trim());
    }
    setRenamingId(null);
    setRenameText('');
  };

  const trainingFocus = getCoachTrainingFocus(snapshot);

  return (
    <div className="w-full max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-5 border-b border-white/8">
        <div>
          <p className="text-xs text-[#D99B38] font-medium mb-1">
            Saved Per-Player Profile · Skill Evaluation &amp; Progression Ladder
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#F2EFE9] tracking-tight">
            {activeProfile.name} — Rookie to Pro Progress
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#1A1C21] border border-white/10 text-[#9A9892] hover:text-[#F2EFE9] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset {activeProfile.name}’s Stats
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#FCA5A5]">Clear {activeProfile.name}’s stats?</span>
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#EF4444] text-white hover:bg-[#DC2626] transition-colors cursor-pointer"
              >
                Confirm Reset
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#1A1C21] border border-white/10 text-[#CFCBC2] hover:text-[#F2EFE9] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Saved Player Profiles Management Strip */}
      <section className="rounded-xl bg-[#1A1C21] border border-white/8 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-white/8">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#F2EFE9]">
              Player Profiles
            </h2>
            <p className="text-xs text-[#9A9892] mt-0.5">
              Each player keeps their own saved rank, match accuracy, Ten Steps puzzles, Daily Tactics streak, and Fundamentals progress.
            </p>
          </div>

          <form onSubmit={handleCreateProfile} className="flex items-center gap-2">
            <input
              type="text"
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              placeholder="New player name…"
              maxLength={28}
              className="w-44 px-3 py-2 text-xs bg-[#14161A] border border-white/10 rounded-lg text-[#F2EFE9] placeholder:text-[#7D7B76] focus:outline-none focus:border-[#D99B38]"
            />
            <button
              type="submit"
              disabled={!newPlayerName.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-[#D99B38] text-[#141517] hover:bg-[#E4AA49] disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Add Player
            </button>
          </form>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {profiles.map((prof) => {
            const profSnap = getProgressSnapshot(prof.id);
            const isActive = prof.id === activeProfile.id;
            const isRenaming = renamingId === prof.id;

            return (
              <div
                key={prof.id}
                className={`rounded-lg p-3.5 border transition-colors ${
                  isActive
                    ? 'bg-[#21242B] border-[#D99B38]/55'
                    : 'bg-[#14161A] border-white/8'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  {isRenaming ? (
                    <div className="flex items-center gap-1.5 flex-1">
                      <input
                        type="text"
                        value={renameText}
                        onChange={(e) => setRenameText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename(prof.id);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        autoFocus
                        maxLength={28}
                        className="flex-1 min-w-0 px-2 py-1 text-xs bg-[#121316] border border-[#D99B38] rounded text-[#F2EFE9] focus:outline-none"
                      />
                      <button
                        type="button"
                        aria-label="Save name"
                        onClick={() => handleSaveRename(prof.id)}
                        className="p-1 rounded bg-[#D99B38] text-[#141517] cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        aria-label="Cancel rename"
                        onClick={() => setRenamingId(null)}
                        className="p-1 rounded bg-white/5 text-[#9A9892] cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveProfile(prof.id)}
                      className="text-left flex-1 min-w-0 cursor-pointer"
                    >
                      <p className="text-sm font-semibold text-[#F2EFE9] truncate">
                        {prof.name}{' '}
                        {isActive && (
                          <span className="text-[11px] font-medium text-[#F4D08A]">· Active</span>
                        )}
                      </p>
                      <p className="font-mono-tabular text-xs text-[#9A9892] mt-0.5">
                        {profSnap.currentRank.label} · {profSnap.totalXp} XP ·{' '}
                        {profSnap.averageAccuracy !== null ? `${profSnap.averageAccuracy}% acc` : 'No games'}
                      </p>
                    </button>
                  )}

                  {!isRenaming && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        aria-label={`Rename ${prof.name}`}
                        onClick={() => {
                          setRenamingId(prof.id);
                          setRenameText(prof.name);
                        }}
                        className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-[#9A9892] hover:text-[#F2EFE9] cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      {profiles.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Delete ${prof.name}`}
                          onClick={() => deleteProfile(prof.id)}
                          className="p-1.5 rounded bg-white/5 hover:bg-[#EF4444]/15 text-[#9A9892] hover:text-[#FCA5A5] cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {!isActive && !isRenaming && (
                  <button
                    type="button"
                    onClick={() => setActiveProfile(prof.id)}
                    className="mt-2.5 text-xs font-medium text-[#D99B38] hover:text-[#F4D08A] cursor-pointer"
                  >
                    Switch to {prof.name}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Personalized Coach Training Recommendation */}
      <section className="rounded-xl bg-[#1A1C21] border border-white/8 p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs text-[#34D399] font-medium">
            Training Coach Focus for {activeProfile.name}
          </p>
          <h2 className="font-display text-lg font-semibold text-[#F2EFE9] mt-0.5">
            {trainingFocus.headline}
          </h2>
          <p className="text-xs text-[#CFCBC2] leading-relaxed mt-1">
            {trainingFocus.advice}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (trainingFocus.target === 'fundamentals') onJumpToFundamentals();
            else if (trainingFocus.target === 'course') onJumpToChapter(trainingFocus.chapter ?? 1);
            else onStartMatchWithDifficulty('rookie');
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#10B981]/18 border border-[#10B981]/45 text-[#34D399] hover:bg-[#10B981]/28 transition-colors whitespace-nowrap cursor-pointer"
        >
          {trainingFocus.actionLabel}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </section>

      {/* 4-Column KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl bg-[#1A1C21] border border-white/8 p-5">
          <p className="text-xs text-[#9A9892]">Current Rank</p>
          <p className="font-display text-2xl font-semibold text-[#F4D08A] mt-1">
            {snapshot.currentRank.label}
          </p>
          <p className="font-mono-tabular text-xs text-[#CFCBC2] mt-2">
            Est. {snapshot.estimatedRating} Elo · {snapshot.totalXp} XP
          </p>
        </div>

        <div className="rounded-xl bg-[#1A1C21] border border-white/8 p-5">
          <p className="text-xs text-[#9A9892]">Average Game Accuracy</p>
          <p className="font-display font-mono-tabular text-2xl font-semibold text-[#F2EFE9] mt-1">
            {snapshot.averageAccuracy !== null ? `${snapshot.averageAccuracy}%` : '—'}
          </p>
          <p className="font-mono-tabular text-xs text-[#A8A59E] mt-2">
            {snapshot.totalGames} {snapshot.totalGames === 1 ? 'game' : 'games'} evaluated ·{' '}
            {snapshot.totalWins} {snapshot.totalWins === 1 ? 'win' : 'wins'}
          </p>
        </div>

        <div className="rounded-xl bg-[#1A1C21] border border-white/8 p-5">
          <p className="text-xs text-[#9A9892]">Ten Steps Tactics</p>
          <p className="font-display font-mono-tabular text-2xl font-semibold text-[#F2EFE9] mt-1">
            {snapshot.solvedPuzzlesCount} / {snapshot.totalPuzzlesCount}
          </p>
          <p className="font-mono-tabular text-xs text-[#10B981] mt-2">
            +{snapshot.puzzleXp + snapshot.dailyXp} XP (Course + Daily)
          </p>
        </div>

        <div className="rounded-xl bg-[#1A1C21] border border-white/8 p-5">
          <p className="text-xs text-[#9A9892]">Fundamentals Mastery</p>
          <p className="font-display font-mono-tabular text-2xl font-semibold text-[#F2EFE9] mt-1">
            {snapshot.completedFundamentalsCount} / {snapshot.totalFundamentalsCount}
          </p>
          <button
            type="button"
            onClick={onJumpToFundamentals}
            className="text-xs text-[#D99B38] hover:text-[#F4D08A] mt-2 inline-flex items-center gap-1 cursor-pointer"
          >
            Continue Fundamentals
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Rookie -> Intermediate -> Advanced -> Pro Rank Ladder */}
      <section className="rounded-xl bg-[#1A1C21] border border-white/8 p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#F2EFE9]">
              Progression Path: Rookie to Pro
            </h2>
            <p className="text-xs text-[#9A9892] mt-0.5">
              Earn XP by playing evaluated matches (with high move accuracy), solving Ten Steps &amp; Daily Tactics puzzles, and completing Fundamentals drills.
            </p>
          </div>
          <p className="font-mono-tabular text-xs text-[#CFCBC2]">
            {snapshot.nextRank
              ? `${snapshot.nextRank.minXp - snapshot.totalXp} XP to ${snapshot.nextRank.label}`
              : 'Top rank Pro reached'}
          </p>
        </div>

        <div className="space-y-2">
          <div className="h-2.5 w-full rounded-full bg-[#121316] border border-white/8 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#D99B38] to-[#10B981] transition-all duration-500"
              style={{ width: `${Math.max(4, snapshot.overallProgressPct)}%` }}
            />
          </div>
          <div className="flex justify-between font-mono-tabular text-[11px] text-[#8B8881]">
            {RANK_TIERS.map((tier) => (
              <span
                key={tier.id}
                className={
                  tier.id === snapshot.currentRank.id ? 'text-[#F4D08A] font-semibold' : ''
                }
              >
                {tier.label} ({tier.minXp} XP)
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
          {RANK_TIERS.map((tier, index) => {
            const unlocked = snapshot.totalXp >= tier.minXp;
            const isCurrent = snapshot.currentRank.id === tier.id;
            const statusText = isCurrent
              ? 'Current Rank'
              : unlocked
              ? 'Completed'
              : `Unlocks at ${tier.minXp} XP`;

            return (
              <div
                key={tier.id}
                className={`rounded-lg p-4 border transition-colors ${
                  isCurrent
                    ? 'bg-[#21242B] border-[#D99B38]/55'
                    : unlocked
                    ? 'bg-[#17191E] border-[#10B981]/30'
                    : 'bg-[#14161A] border-white/8'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-[#F2EFE9]">
                    0{index + 1}. {tier.label}
                  </span>
                  <span className="font-mono-tabular text-[11px] text-[#9A9892]">
                    {tier.eloRange}
                  </span>
                </div>
                <p
                  className={`text-[11px] font-medium mt-1 ${
                    isCurrent
                      ? 'text-[#F4D08A]'
                      : unlocked
                      ? 'text-[#34D399]'
                      : 'text-[#7D7B76]'
                  }`}
                >
                  {statusText} · Target {tier.targetAccuracy}%+ acc
                </p>
                <p className="text-xs text-[#A8A59E] leading-relaxed mt-2.5">
                  {tier.summary}
                </p>
                <p className="text-[11px] text-[#8B8881] leading-relaxed mt-2 pt-2 border-t border-white/8">
                  {tier.milestoneFocus}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bot Difficulty Ladder & Chapter Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-xl bg-[#1A1C21] border border-white/8 p-5 space-y-4">
          <div className="pb-3 border-b border-white/8">
            <h2 className="font-display text-lg font-semibold text-[#F2EFE9]">
              Engine Ladder Evaluation
            </h2>
            <p className="text-xs text-[#9A9892] mt-0.5">
              Test {activeProfile.name}’s skills from Rookie up to Pro. Matches of 3+ moves are graded for accuracy and XP.
            </p>
          </div>

          <div className="divide-y divide-white/8">
            {DIFFICULTY_ORDER.map((diff) => {
              const info = DIFFICULTY_INFO[diff];
              const stat = snapshot.data.byDifficulty[diff];
              const totalPlayed = stat.wins + stat.draws + stat.losses;

              return (
                <div key={diff} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-[#F2EFE9]">{info.label}</span>
                      <span className="font-mono-tabular text-xs text-[#9A9892]">
                        {info.rating} Elo
                      </span>
                    </div>
                    <p className="text-xs text-[#8B8881] mt-0.5">{info.summary}</p>
                    <p className="font-mono-tabular text-[11px] text-[#CFCBC2] mt-1.5">
                      {totalPlayed > 0
                        ? `Record: ${stat.wins}W – ${stat.draws}D – ${stat.losses}L${
                            stat.bestAccuracy !== null ? ` · Peak Accuracy ${stat.bestAccuracy}%` : ''
                          }`
                        : 'No completed matches yet'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onStartMatchWithDifficulty(diff)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-white/6 border border-white/12 text-[#F2EFE9] hover:border-[#D99B38]/55 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Swords className="w-3.5 h-3.5 text-[#D99B38]" />
                    Play {info.label}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl bg-[#1A1C21] border border-white/8 p-5 space-y-4">
          <div className="pb-3 border-b border-white/8 flex items-baseline justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#F2EFE9]">
                Ten Steps Course Completion
              </h2>
              <p className="text-xs text-[#9A9892] mt-0.5">
                Progress across Dr. Dave Regis’s 10 chapters
              </p>
            </div>
            <span className="font-mono-tabular text-xs text-[#F4D08A]">
              {snapshot.solvedPuzzlesCount}/{snapshot.totalPuzzlesCount} solved
            </span>
          </div>

          <div className="space-y-2.5">
            {COURSE_CHAPTERS.map((ch) => {
              const chPuzzles = TACTICS_PUZZLES.filter((p) => p.chapter === ch.number);
              const chSolved = chPuzzles.filter((p) => solvedIds.includes(p.id)).length;
              const pct = chPuzzles.length > 0 ? Math.round((chSolved / chPuzzles.length) * 100) : 0;

              return (
                <button
                  key={ch.number}
                  type="button"
                  onClick={() => onJumpToChapter(ch.number)}
                  className="w-full text-left group cursor-pointer"
                >
                  <div className="flex items-baseline justify-between gap-2 text-xs mb-1">
                    <span className="text-[#CFCBC2] group-hover:text-[#F4D08A] transition-colors truncate">
                      Step {ch.number}. {ch.title}
                    </span>
                    <span className="font-mono-tabular text-[11px] text-[#9A9892] shrink-0">
                      {chSolved}/{chPuzzles.length}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[#121316] overflow-hidden">
                    <div
                      className="h-full bg-[#10B981] transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Evaluated Game History Table */}
      <section className="rounded-xl bg-[#1A1C21] border border-white/8 p-5 space-y-4">
        <div className="pb-3 border-b border-white/8">
          <h2 className="font-display text-lg font-semibold text-[#F2EFE9]">
            Recent Evaluated Games ({activeProfile.name})
          </h2>
          <p className="text-xs text-[#9A9892] mt-0.5">
            Accuracy is calculated from centipawn loss across every move {activeProfile.name} played.
          </p>
        </div>

        {snapshot.data.games.length === 0 ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-[#A8A59E]">
              Complete a game of 3 or more moves in Play mode to record {activeProfile.name}’s first performance evaluation.
            </p>
            <button
              type="button"
              onClick={() => onStartMatchWithDifficulty('rookie')}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#D99B38] text-[#141517] hover:bg-[#E4AA49] transition-colors cursor-pointer"
            >
              Start a Rookie Match
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/8 text-[#8B8881]">
                  <th className="py-2 pr-4 font-medium">Opponent / Mode</th>
                  <th className="py-2 pr-4 font-medium">Opening</th>
                  <th className="py-2 pr-4 font-medium">Result</th>
                  <th className="py-2 pr-4 font-medium text-right">Moves</th>
                  <th className="py-2 pr-4 font-medium text-right">Accuracy</th>
                  <th className="py-2 pr-4 font-medium text-right">Mistakes / Blunders</th>
                  <th className="py-2 font-medium text-right">XP Earned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/6">
                {snapshot.data.games.map((g) => (
                  <tr key={g.id} className="text-[#D6D3CB]">
                    <td className="py-2.5 pr-4 whitespace-nowrap">
                      {g.mode === 'pvc'
                        ? `vs ${DIFFICULTY_INFO[g.difficulty].label} (${g.playerColor === 'w' ? 'White' : 'Black'})`
                        : `Player vs Player (${g.playerColor === 'w' ? 'White' : 'Black'})`}
                    </td>
                    <td className="py-2.5 pr-4 text-[#A8A59E] max-w-[240px] truncate">
                      {g.openingName || 'Standard Game'}
                    </td>
                    <td
                      className={`py-2.5 pr-4 font-medium whitespace-nowrap ${
                        g.result === 'win'
                          ? 'text-[#34D399]'
                          : g.result === 'draw'
                          ? 'text-[#E5A93B]'
                          : 'text-[#FCA5A5]'
                      }`}
                    >
                      {g.result === 'win' ? 'Win' : g.result === 'draw' ? 'Draw' : 'Loss'} · {g.reason}
                    </td>
                    <td className="py-2.5 pr-4 font-mono-tabular text-right">{g.movesCount}</td>
                    <td className="py-2.5 pr-4 font-mono-tabular text-right font-semibold text-[#F2EFE9]">
                      {g.playerAccuracy}%
                    </td>
                    <td className="py-2.5 pr-4 font-mono-tabular text-right text-[#A8A59E]">
                      {g.mistakeCount} / {g.blunderCount}
                    </td>
                    <td className="py-2.5 font-mono-tabular text-right text-[#F4D08A] font-semibold">
                      +{g.xpEarned} XP
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
