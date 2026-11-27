import React, { useEffect, useState } from 'react';
import { UserPlus, Users, Check, X } from 'lucide-react';
import {
  createProfile,
  getActiveProfile,
  getProfiles,
  setActiveProfile,
  subscribeProfiles,
  type PlayerProfile,
} from '../utils/profiles';
import { getProgressSnapshot, subscribeProgress } from '../utils/progression';

interface PlayerProfileBarProps {
  compact?: boolean;
}

export const PlayerProfileBar: React.FC<PlayerProfileBarProps> = ({ compact = false }) => {
  const [profiles, setProfiles] = useState<PlayerProfile[]>(() => getProfiles());
  const [activeId, setActiveId] = useState<string>(() => getActiveProfile().id);
  const [adding, setAdding] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [, setTick] = useState<number>(0);

  useEffect(() => {
    const sync = () => {
      setProfiles(getProfiles());
      setActiveId(getActiveProfile().id);
      setTick((t) => t + 1);
    };
    sync();
    const unsubP = subscribeProfiles(sync);
    const unsubProg = subscribeProgress(sync);
    return () => {
      unsubP();
      unsubProg();
    };
  }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    createProfile(trimmed);
    setNewName('');
    setAdding(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-1.5 text-xs text-[#9A9892]">
        <Users className="w-3.5 h-3.5 text-[#D99B38]" />
        {!compact && <span>Player:</span>}
      </div>

      <select
        aria-label="Active player profile"
        value={activeId}
        onChange={(e) => setActiveProfile(e.target.value)}
        className="px-2.5 py-1.5 text-xs font-medium bg-[#1A1C21] border border-white/10 rounded-lg text-[#F2EFE9] focus:outline-none focus:border-[#D99B38] cursor-pointer max-w-[190px]"
      >
        {profiles.map((p) => {
          const snap = getProgressSnapshot(p.id);
          return (
            <option key={p.id} value={p.id}>
              {p.name} · {snap.currentRank.label} ({snap.totalXp} XP)
            </option>
          );
        })}
      </select>

      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          title="Add a new player profile"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-[#1A1C21] border border-white/10 text-[#CFCBC2] hover:text-[#F2EFE9] hover:border-white/20 transition-colors cursor-pointer whitespace-nowrap"
        >
          <UserPlus className="w-3.5 h-3.5 text-[#D99B38]" />
          New Player
        </button>
      ) : (
        <form onSubmit={handleCreate} className="inline-flex items-center gap-1.5">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Player name…"
            autoFocus
            maxLength={28}
            className="w-32 px-2.5 py-1 text-xs bg-[#14161A] border border-[#D99B38]/55 rounded-lg text-[#F2EFE9] placeholder:text-[#7D7B76] focus:outline-none"
          />
          <button
            type="submit"
            aria-label="Create player profile"
            className="p-1.5 rounded-lg bg-[#D99B38] text-[#141517] hover:bg-[#E4AA49] cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label="Cancel new player"
            onClick={() => {
              setAdding(false);
              setNewName('');
            }}
            className="p-1.5 rounded-lg bg-[#1A1C21] border border-white/10 text-[#9A9892] hover:text-[#F2EFE9] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </form>
      )}
    </div>
  );
};
