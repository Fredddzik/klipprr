"use client";

interface Clip {
  id: string;
  start: number;
  end: number;
  name: string;
}

interface EditTarget {
  clipId: string;
  field: "in" | "out";
}

interface ClipsPanelProps {
  clips: Clip[];
  selectedClipIds: string[];
  renameDraft: Record<string, string>;
  editTarget: EditTarget | null;
  canEditClips: boolean;
  onUpgradeRequested: () => void;

  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  onToggleSelect: (id: string, checked: boolean) => void;
  onPlayClip: (start: number, end: number) => void;

  onRenameDraftChange: (id: string, value: string) => void;
  onCommitRename: (id: string) => void;

  onEditIn: (id: string) => void;
  onEditOut: (id: string) => void;

  onDeleteSelected: () => void;

  formatTime: (t: number) => string;
}

export default function ClipsPanel({
  clips,
  selectedClipIds,
  renameDraft,
  editTarget,
  canEditClips,
  onUpgradeRequested,
  undo,
  redo,
  canUndo,
  canRedo,
  onToggleSelect,
  onPlayClip,
  onRenameDraftChange,
  onCommitRename,
  onEditIn,
  onEditOut,
  onDeleteSelected,
  formatTime,
}: ClipsPanelProps) {

  const lockIcon = (
    <svg className="w-3 h-3 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
  );
  const headerButton =
    "w-7 h-7 rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors inline-flex items-center justify-center";

  return (
    <div className="space-y-3 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <h3 className="text-sm font-medium text-zinc-100">
          Clips <span className="ml-1 font-mono text-xs tabular-nums text-zinc-500">{clips.length}</span>
        </h3>
        <div className="flex items-center gap-0.5">
          <button onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (⌘Z)" className={headerButton}>
            <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5" aria-hidden="true">
              <path d="M9 7L4 12L9 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20 12H5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <button onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (⇧⌘Z)" className={headerButton}>
            <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5" aria-hidden="true">
              <path d="M15 7L20 12L15 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          {/* Destructive, so it stays quiet until you point at it. */}
          <button
            disabled={selectedClipIds.length === 0}
            onClick={onDeleteSelected}
            aria-label="Delete selected"
            title="Delete selected"
            className="w-7 h-7 rounded text-zinc-400 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-zinc-400 transition-colors inline-flex items-center justify-center"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5" aria-hidden="true">
              <path d="M4 7H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M9 7V5C9 4.45 9.45 4 10 4H14C14.55 4 15 4.45 15 5V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M7 7L8 19C8.05 19.55 8.5 20 9.05 20H14.95C15.5 20 15.95 19.55 16 19L17 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 11V16M14 11V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {clips.length === 0 && (
        <p className="text-zinc-500 text-xs leading-relaxed">
          No clips yet. Press <kbd className="font-mono text-zinc-300">I</kbd> where a moment starts and{" "}
          <kbd className="font-mono text-zinc-300">O</kbd> where it ends.
        </p>
      )}

      <ul className="space-y-1 min-w-0">
        {clips.map((c, idx) => {
          const selected = selectedClipIds.includes(c.id);
          const editingIn = editTarget?.clipId === c.id && editTarget.field === "in";
          const editingOut = editTarget?.clipId === c.id && editTarget.field === "out";
          return (
            <li
              key={c.id}
              className={`flex items-center gap-2 py-1.5 px-2 rounded-md border min-w-0 w-full box-border transition-colors
                ${selected ? "border-yellow-400/40 bg-blue-500/10" : "border-transparent hover:bg-zinc-800/60"}
              `}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={(e) => onToggleSelect(c.id, e.target.checked)}
                aria-label={`Select ${c.name}`}
                className="shrink-0 accent-violet-500"
              />

              <span className={`font-mono text-[11px] tabular-nums shrink-0 ${selected ? "text-yellow-400" : "text-zinc-500"}`}>
                {String(idx + 1).padStart(2, "0")}
              </span>

              <button
                type="button"
                onClick={() => onPlayClip(c.start, c.end)}
                aria-label={`Play ${c.name}`}
                title="Play this clip"
                className="w-6 h-6 rounded text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 shrink-0 transition-colors inline-flex items-center justify-center"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3" aria-hidden="true">
                  <path d="M7 4.5v15a1 1 0 001.5.86l12.5-7.5a1 1 0 000-1.72L8.5 3.64A1 1 0 007 4.5z" />
                </svg>
              </button>

              <div className="min-w-0 flex-1">
                <div className="relative group min-w-0">
                  <input
                    type="text"
                    value={renameDraft[c.id] ?? c.name}
                    onChange={(e) => canEditClips && onRenameDraftChange(c.id, e.target.value)}
                    onBlur={() => canEditClips && onCommitRename(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    disabled={!canEditClips}
                    title={!canEditClips ? "Rename clips with Pro" : undefined}
                    className={`bg-transparent border-b outline-none text-[13px] leading-5 min-w-0 w-full max-w-full transition-colors
                      ${canEditClips
                        ? "border-transparent hover:border-zinc-700 focus:border-violet-500 text-zinc-100"
                        : "border-transparent text-zinc-400 cursor-not-allowed"
                      }`}
                  />
                  {!canEditClips && (
                    <div
                      onClick={onUpgradeRequested}
                      className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/50 rounded cursor-pointer"
                    >
                      {lockIcon}
                    </div>
                  )}
                </div>

                {/* In and out: click a time to move that point to the playhead. */}
                <div className="relative group flex items-center gap-1.5 font-mono text-[11px] tabular-nums">
                  <button
                    type="button"
                    disabled={!canEditClips}
                    onClick={() => canEditClips && onEditIn(c.id)}
                    title={!canEditClips ? "Edit clip in/out with Pro" : "Move the In point"}
                    className={`inline-flex items-center gap-1 rounded px-0.5 transition-colors ${
                      editingIn ? "text-emerald-400 bg-emerald-500/15" : "text-zinc-400 hover:text-emerald-400"
                    } ${!canEditClips ? "cursor-not-allowed" : ""}`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                    {formatTime(c.start)}
                  </button>
                  <span className="text-zinc-600" aria-hidden="true">→</span>
                  <button
                    type="button"
                    disabled={!canEditClips}
                    onClick={() => canEditClips && onEditOut(c.id)}
                    title={!canEditClips ? "Edit clip in/out with Pro" : "Move the Out point"}
                    className={`inline-flex items-center gap-1 rounded px-0.5 transition-colors ${
                      editingOut ? "text-red-400 bg-red-500/15" : "text-zinc-400 hover:text-red-400"
                    } ${!canEditClips ? "cursor-not-allowed" : ""}`}
                  >
                    {formatTime(c.end)}
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" aria-hidden="true" />
                  </button>
                  {!canEditClips && (
                    <div
                      onClick={onUpgradeRequested}
                      className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/50 rounded cursor-pointer"
                    >
                      {lockIcon}
                    </div>
                  )}
                </div>
              </div>

              <span className="font-mono text-xs tabular-nums text-zinc-400 shrink-0" title="Clip length">
                {formatTime(c.end - c.start)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
