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

  return (
    <div className="space-y-3 min-w-0">
      {/* Header: Clips title + icon actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-white">Clips ({clips.length})</h3>
          <button
            onClick={undo}
            disabled={!canUndo}
            aria-label="Undo"
            title="Undo"
            className="w-9 h-9 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition inline-flex items-center justify-center"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" aria-hidden="true">
              <path d="M9 7L4 12L9 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20 12H5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            aria-label="Redo"
            title="Redo"
            className="w-9 h-9 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition inline-flex items-center justify-center"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" aria-hidden="true">
              <path d="M15 7L20 12L15 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <button
          disabled={selectedClipIds.length === 0}
          onClick={onDeleteSelected}
          aria-label="Delete selected"
          title="Delete selected"
          className="w-9 h-9 rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0 inline-flex items-center justify-center"
        >
          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" aria-hidden="true">
            <path d="M4 7H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M9 7V5C9 4.45 9.45 4 10 4H14C14.55 4 15 4.45 15 5V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M7 7L8 19C8.05 19.55 8.5 20 9.05 20H14.95C15.5 20 15.95 19.55 16 19L17 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 11V16M14 11V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {clips.length === 0 && (
        <p className="text-zinc-500 text-sm">No clips yet.</p>
      )}

      <ul className="space-y-2 min-w-0">
        {clips.map((c, idx) => (
          <li
            key={c.id}
            className={`flex items-center gap-2 py-2 px-2 rounded-lg min-w-0 w-full box-border
              ${selectedClipIds.includes(c.id) ? "ring-2 ring-violet-400 ring-inset" : ""}
              ${!canEditClips ? "opacity-90" : ""}
              transition-opacity
            `}
          >
            <input
              type="checkbox"
              checked={selectedClipIds.includes(c.id)}
              onChange={(e) =>
                onToggleSelect(c.id, e.target.checked)
              }
              className="shrink-0"
            />

            <span className="text-sm opacity-50 shrink-0">#{idx + 1}</span>

            <button
              type="button"
              onClick={() => onPlayClip(c.start, c.end)}
              className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-white shrink-0"
            >
              ▶
            </button>

            <div className="relative group min-w-0 flex-1">
              <input
                type="text"
                value={renameDraft[c.id] ?? c.name}
                onChange={(e) =>
                  canEditClips && onRenameDraftChange(c.id, e.target.value)
                }
                onBlur={() => canEditClips && onCommitRename(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                disabled={!canEditClips}
                title={!canEditClips ? "Rename clips with Pro" : undefined}
                className={`bg-transparent border-b outline-none text-sm min-w-0 w-full max-w-full
                  ${canEditClips
                    ? "border-zinc-600 focus:border-violet-500"
                    : "border-zinc-700 text-zinc-400 cursor-not-allowed"
                  }`}
              />

              {!canEditClips && (
                <div
                  onClick={onUpgradeRequested}
                  className="absolute inset-0 hidden group-hover:flex
                    items-center justify-center bg-black/40 rounded cursor-pointer"
                >
                  <span className="text-sm">🔒</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5 ml-auto items-end text-xs shrink-0">
              <div className="relative group">
                <button
                  type="button"
                  disabled={!canEditClips}
                  onClick={() => canEditClips && onEditIn(c.id)}
                  title={!canEditClips ? "Edit clip in/out with Pro" : undefined}
                  className={`clip-badge-in text-left w-full min-w-[4.5rem] ${
                    editTarget?.clipId === c.id && editTarget.field === "in"
                      ? "!bg-[#10b981] !text-[#0a0a0a] !border-[#10b981] ring-2 ring-[#10b981]/50"
                      : !canEditClips
                        ? "opacity-60 cursor-not-allowed"
                        : ""
                  }`}
                >
                  IN: {formatTime(c.start)}
                </button>
                {!canEditClips && (
                  <div
                    onClick={onUpgradeRequested}
                    className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/40 rounded cursor-pointer"
                  >
                    <span className="text-xs">🔒</span>
                  </div>
                )}
              </div>

              <div className="relative group">
                <button
                  type="button"
                  disabled={!canEditClips}
                  onClick={() => canEditClips && onEditOut(c.id)}
                  title={!canEditClips ? "Edit clip in/out with Pro" : undefined}
                  className={`clip-badge-out text-left w-full min-w-[4.5rem] ${
                    editTarget?.clipId === c.id && editTarget.field === "out"
                      ? "!bg-[#ef4444] !text-white !border-[#ef4444] ring-2 ring-[#ef4444]/50"
                      : !canEditClips
                        ? "opacity-60 cursor-not-allowed"
                        : ""
                  }`}
                >
                  OUT: {formatTime(c.end)}
                </button>
                {!canEditClips && (
                  <div
                    onClick={onUpgradeRequested}
                    className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/40 rounded cursor-pointer"
                  >
                    <span className="text-xs">🔒</span>
                  </div>
                )}
              </div>

              <div className="text-zinc-500 text-[11px]">
                {formatTime(c.end - c.start)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}