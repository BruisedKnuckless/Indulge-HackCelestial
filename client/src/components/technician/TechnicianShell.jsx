import { Link, NavLink, useNavigate } from 'react-router-dom';
import { ClipboardCheck, LogOut, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import useTheme from '../../hooks/useTheme';
import ErrorBoundary from '../common/ErrorBoundary';

/**
 * Chrome for the technician workspace: who is signed in, the two places a
 * technician goes (today's queue, completed work), theme and sign-out. No
 * marketplace navigation — technicians have no marketplace access.
 */
export default function TechnicianShell({ children }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const name = user?.inspectorProfile?.displayName || user?.businessName;

  const signOut = () => {
    logout();
    navigate('/technician/login', { replace: true });
  };

  const tab = ({ isActive }) =>
    `px-3 py-2 rounded text-sm font-medium ${isActive ? 'bg-surface-sunk text-ink' : 'text-ink-soft hover:text-ink'}`;

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <header className="sticky top-0 z-40 bg-surface-alt border-b border-line">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/technician" className="flex items-center gap-2 min-w-0">
            <span className="icon-box icon-box-indigo w-8 h-8 shrink-0">
              <ClipboardCheck size={17} />
            </span>
            <span className="leading-tight min-w-0">
              <span className="text-sm font-semibold text-ink block">Indulge Inspect</span>
              <span className="text-xs text-ink-soft block truncate">
                {name}
                {user?.inspectorProfile?.title ? ` · ${user.inspectorProfile.title}` : ''}
              </span>
            </span>
          </Link>
          <nav className="ml-auto hidden sm:flex items-center gap-1">
            <NavLink to="/technician" end className={tab}>
              Queue
            </NavLink>
            <NavLink to="/technician/inspections" className={tab}>
              All inspections
            </NavLink>
          </nav>
          <button onClick={toggleTheme} className="btn-ghost p-2 ml-auto sm:ml-0" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button onClick={signOut} className="btn-ghost p-2" aria-label="Sign out" title="Sign out">
            <LogOut size={16} />
          </button>
        </div>
        <nav className="sm:hidden border-t border-line flex">
          <NavLink to="/technician" end className={({ isActive }) => `flex-1 text-center py-2.5 text-sm ${isActive ? 'text-ink font-semibold' : 'text-ink-soft'}`}>
            Queue
          </NavLink>
          <NavLink to="/technician/inspections" className={({ isActive }) => `flex-1 text-center py-2.5 text-sm ${isActive ? 'text-ink font-semibold' : 'text-ink-soft'}`}>
            All inspections
          </NavLink>
        </nav>
      </header>
      <main className="flex-1">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  );
}
