import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowLeft, Sun, Moon } from 'lucide-react';
import useTheme from '../../hooks/useTheme';

export default function InspectorHeader() {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 bg-surface-alt border-b border-line shadow-xs">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-15">
          {/* Brand & Representative Info */}
          <div className="flex items-center gap-3">
            <Link
              to="/inspector"
              className="flex items-center gap-2.5 group"
            >
              <div className="w-8 h-8 rounded-lg bg-indigo-600 dark:bg-indigo-500 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                <ShieldCheck size={18} strokeWidth={2.5} />
              </div>
              <div className="leading-tight">
                <span className="font-display font-black tracking-wide text-ink text-sm sm:text-base block">
                  INDULGE INSPECTOR
                </span>
                <span className="text-[11px] text-ink-soft block font-medium">
                  Rahul Sharma · <span className="text-indigo-600 dark:text-indigo-400 font-semibold">Senior Field Inspector</span>
                </span>
              </div>
            </Link>
          </div>

          {/* Right utility controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live Sync Status */}
            <div className="hidden xs:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Live Sync</span>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg text-ink-soft hover:text-ink hover:bg-surface-sunk transition-colors"
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Return to Marketplace */}
            <Link
              to="/listings"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg text-ink-soft hover:text-ink hover:bg-surface-sunk border border-line transition-all"
            >
              <ArrowLeft size={13} />
              <span className="hidden sm:inline">Exit</span>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
