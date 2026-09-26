import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useAdminHealth, useAdminLive } from '../../hooks/queries';
import useTheme from '../../hooks/useTheme';
import { relative } from '../../lib/format';
import Logo from '../layout/Logo';
import { Icon, SunIcon, MoonIcon, PATHS, ICON_BTN } from '../layout/Header';

/**
 * Navigation bar for the platform console.
 *
 * Same look as the marketplace header — same bar, icon buttons, dropdowns and
 * theme switch — but driven by the admin session. There is no cart, search or
 * business account menu: an admin is not a business. The bell shows platform
 * alerts (failing integrity checks, recent activity) since admins receive no
 * business notifications.
 */

const DROPDOWN = [
  'absolute right-0 top-full mt-2 w-80 py-2 z-50',
  'bg-surface-alt border border-line rounded-xl',
  'shadow-[0_8px_28px_rgba(0,0,0,0.13)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)]',
].join(' ');

const MENU_ITEM = 'block px-4 py-2 text-sm text-ink hover:bg-surface-sunk transition-colors duration-150';

const ACCOUNT_LINKS = [
  { to: '/admin', label: 'Console overview' },
  { to: '/admin?tab=health', label: 'Integrity health' },
  { to: '/admin?tab=businesses', label: 'Businesses' },
  { to: '/admin?tab=broadcast', label: 'Broadcast' },
];

const ROLE_LABEL = { super_admin: 'Super admin', admin: 'Admin' };

function HomeLink() {
  const { pathname, search } = useLocation();
  const active = pathname === '/admin' && !search;

  return (
    <Link
      to="/admin"
      onClick={() => active && window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })}
      className={[
        'relative px-3.5 py-1.5 text-sm rounded-full',
        'transition-all duration-200 ease-out whitespace-nowrap',
        active
          ? 'font-semibold text-zinc-950 dark:text-white bg-[rgba(99,102,241,0.16)] dark:bg-[rgba(99,102,241,0.22)] shadow-xs'
          : 'font-medium text-zinc-900/80 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-[rgba(99,102,241,0.10)] dark:hover:bg-[rgba(99,102,241,0.16)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo/40',
      ].join(' ')}
    >
      Home
      {active && (
        <span aria-hidden className="absolute bottom-0.5 left-3 right-3 h-[2px] rounded-full bg-indigo shadow-xs" />
      )}
    </Link>
  );
}

export default function AdminHeader() {
  const { admin, logout } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { dark, toggle: toggleTheme } = useTheme();

  // Shares cache with the Health and Live tabs, so the bell costs no extra audit.
  const { data: health } = useAdminHealth();
  const { data: live } = useAdminLive(90);

  const [menuOpen, setMenuOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const menuRef = useRef(null);
  const alertsRef = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (alertsRef.current && !alertsRef.current.contains(e.target)) setAlertsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Navigation clears all overlays.
  useEffect(() => {
    setMenuOpen(false);
    setAlertsOpen(false);
  }, [location.pathname, location.search]);

  const failing = (health?.checks || []).filter((c) => c.count > 0);
  const recent = (live?.feed || []).slice(0, 5);
  const alertCount = failing.length;

  const signOut = () => {
    logout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-40 bg-nav/95 backdrop-blur-md border-b border-black/10 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)] transition-all duration-200">
      <div className="shell">
        <div className="h-16 flex items-center gap-2">
          <Link
            to="/admin"
            aria-label="Indulge platform console"
            className="inline-flex items-center shrink-0 mr-2 h-9 transition-transform duration-200 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo/40 rounded-md"
          >
            <Logo size={21} className="transition-opacity hover:opacity-90" />
          </Link>
          <span className="badge-indigo mr-2">Admin</span>

          <nav className="hidden lg:flex items-center gap-0.5" aria-label="Admin navigation">
            <HomeLink />
          </nav>

          <div className="flex-1" />

          {/* Platform alerts */}
          <div className="relative" ref={alertsRef}>
            <button
              type="button"
              onClick={() => setAlertsOpen((v) => !v)}
              className={`relative ${ICON_BTN}`}
              aria-label={`Platform alerts${alertCount ? `, ${alertCount} need attention` : ''}`}
              aria-expanded={alertsOpen}
            >
              <Icon d={PATHS.bell} />
              {alertCount > 0 && (
                <span
                  className="absolute top-1 right-1 min-w-[15px] h-[15px] px-1 rounded-full
                             bg-red-accent text-white
                             text-[10px] leading-[15px] text-center font-semibold"
                >
                  {alertCount > 9 ? '9+' : alertCount}
                </span>
              )}
            </button>

            {alertsOpen && (
              <div className={DROPDOWN}>
                <p className="px-4 pt-1 pb-2 text-xs font-medium text-ink-mute">Needs attention</p>
                {failing.length ? (
                  failing.map((c) => (
                    <Link key={c.id} to="/admin?tab=health" className={MENU_ITEM}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate">{c.label}</span>
                        <span
                          className={`text-[11px] font-semibold shrink-0 ${
                            c.severity === 'critical' ? 'text-red-accent' : 'text-ink-mute'
                          }`}
                        >
                          {c.count}
                        </span>
                      </span>
                    </Link>
                  ))
                ) : (
                  <p className="px-4 py-2 text-sm muted">Every integrity check passes.</p>
                )}

                <hr className="rule my-1" />
                <p className="px-4 pt-1 pb-2 text-xs font-medium text-ink-mute">Recent activity</p>
                {recent.length ? (
                  recent.map((item) => (
                    <Link key={`${item.kind}-${item.id}`} to="/admin?tab=live" className={MENU_ITEM}>
                      <span className="block truncate">{item.title}</span>
                      <span className="block text-[11px] text-ink-mute truncate">
                        {item.detail} · {relative(item.at)}
                      </span>
                    </Link>
                  ))
                ) : (
                  <p className="px-4 py-2 text-sm muted">No activity yet.</p>
                )}

                <hr className="rule my-1" />
                <Link to="/admin?tab=live" className={`${MENU_ITEM} font-medium`}>
                  View all activity
                </Link>
              </div>
            )}
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className={ICON_BTN}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>

          {/* Admin profile menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className={[
                'flex items-center gap-2 h-9 px-3 rounded-full',
                'font-medium text-sm text-zinc-900/90 dark:text-zinc-200',
                'hover:text-zinc-950 dark:hover:text-white hover:bg-[rgba(99,102,241,0.10)] dark:hover:bg-[rgba(99,102,241,0.16)] hover:scale-[1.04] active:scale-95',
                'transition-all duration-200 ease-out cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo/40',
              ].join(' ')}
              aria-label="Admin account menu"
              aria-expanded={menuOpen}
            >
              <Icon d={PATHS.user} />
              <span className="hidden lg:inline text-sm">{admin?.name}</span>
            </button>

            {menuOpen && (
              <div className={DROPDOWN.replace('w-80', 'w-64')}>
                <div className="px-4 py-2 border-b border-line mb-1">
                  <p className="text-sm font-medium truncate">{admin?.name}</p>
                  <p className="text-xs muted truncate">{admin?.email}</p>
                  <span className="badge-indigo mt-1.5">{ROLE_LABEL[admin?.role] || 'Admin'}</span>
                </div>

                {ACCOUNT_LINKS.map((l) => (
                  <Link key={l.to} to={l.to} className={MENU_ITEM}>
                    {l.label}
                  </Link>
                ))}

                <hr className="rule my-1" />

                <button
                  onClick={signOut}
                  className="w-full text-left px-4 py-2 text-sm text-ink-soft hover:bg-surface-sunk transition-colors duration-150"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
