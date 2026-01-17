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
    <div className="bg-gray-900 p-4 rounded border border-gray-700">
      {/* Undo / Redo */}
      <div className="flex gap-2 mb-2">
        <button
          onClick={undo}
          disabled={!canUndo}
          className="px-3 py-1 text-xs rounded bg-gray-700 disabled:opacity-40"
        >
          Undo
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          className="px-3 py-1 text-xs rounded bg-gray-700 disabled:opacity-40"
        >
          Redo
        </button>
      </div>

      <h3 className="text-lg font-semibold mb-3">Clips</h3>

      {clips.length === 0 && (
        <p className="text-gray-500 text-sm">No clips yet.</p>
      )}

      <ul className="space-y-2">
        {clips.map((c, idx) => (
          <li
            key={c.id}
            className={`flex items-center gap-2 transition-opacity
  ${selectedClipIds.includes(c.id) ? "ring-2 ring-yellow-400" : ""}
  ${!canEditClips ? "opacity-90" : ""}
`}
          >
            <input
              type="checkbox"
              checked={selectedClipIds.includes(c.id)}
              onChange={(e) =>
                onToggleSelect(c.id, e.target.checked)
              }
            />

            <span className="text-sm opacity-50">#{idx + 1}</span>

            <button
              onClick={() => onPlayClip(c.start, c.end)}
              className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600"
            >
              ▶
            </button>

            <div className="relative group">
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
                className={`bg-transparent border-b outline-none text-sm w-40
                  ${canEditClips
                    ? "border-gray-600 focus:border-yellow-400"
                    : "border-gray-700 text-gray-400 cursor-not-allowed"
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

            <div className="flex flex-col gap-1 ml-auto text-xs w-24">
              <div className="relative group">
                <button
                  disabled={!canEditClips}
                  onClick={() => canEditClips && onEditIn(c.id)}
                  title={!canEditClips ? "Edit clip in/out with Pro" : undefined}
                  className={`px-2 py-0.5 rounded text-left w-full
                    ${editTarget?.clipId === c.id && editTarget.field === "in"
                      ? "bg-green-600 ring-2 ring-green-300"
                      : canEditClips
                        ? "bg-green-700/40 hover:bg-green-700"
                        : "bg-green-900/40 text-gray-400 cursor-not-allowed"
                    }`}
                >
                  IN: {formatTime(c.start)}
                </button>

                {!canEditClips && (
                  <div
                    onClick={onUpgradeRequested}
                    className="absolute inset-0 hidden group-hover:flex
                      items-center justify-center bg-black/40 rounded cursor-pointer"
                  >
                    <span className="text-xs">🔒</span>
                  </div>
                )}
              </div>

              <div className="relative group">
                <button
                  disabled={!canEditClips}
                  onClick={() => canEditClips && onEditOut(c.id)}
                  title={!canEditClips ? "Edit clip in/out with Pro" : undefined}
                  className={`px-2 py-0.5 rounded text-left w-full
                    ${editTarget?.clipId === c.id && editTarget.field === "out"
                      ? "bg-red-600 ring-2 ring-red-300"
                      : canEditClips
                        ? "bg-red-700/40 hover:bg-red-700"
                        : "bg-red-900/40 text-gray-400 cursor-not-allowed"
                    }`}
                >
                  OUT: {formatTime(c.end)}
                </button>

                {!canEditClips && (
                  <div
                    onClick={onUpgradeRequested}
                    className="absolute inset-0 hidden group-hover:flex
                      items-center justify-center bg-black/40 rounded cursor-pointer"
                  >
                    <span className="text-xs">🔒</span>
                  </div>
                )}
              </div>

              <div className="text-center underline opacity-60">
                {formatTime(c.end - c.start)}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <button
        disabled={selectedClipIds.length === 0}
        onClick={onDeleteSelected}
        className="mt-3 px-3 py-1 text-xs rounded bg-red-600 hover:bg-red-700 disabled:opacity-40"
      >
        Delete selected
      </button>
    </div>
  );
}