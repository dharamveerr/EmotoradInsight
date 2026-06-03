"use client";

/**
 * Small "Reset" control shown next to a filter section.
 * Only rendered when `show` is true (i.e. the filter differs from its default),
 * so it appears exactly when there is something to reset.
 */
export default function ResetButton({
  onClick,
  show = true,
  className = "",
}: {
  onClick: () => void;
  show?: boolean;
  className?: string;
}) {
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      title="Reset filter"
      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white transition-all shrink-0 ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
        <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.36 2.64L3 8" />
        <path d="M3 3v5h5" />
      </svg>
      Reset
    </button>
  );
}
