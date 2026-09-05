import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart, useNotifications } from '../../hooks/queries';
import { shortName } from '../../lib/businessName';
import Logo from './Logo';

/* Line icons at a single stroke weight, so the chrome stays quiet. */
const Icon = ({ d, size = 18 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d={d} />
  </svg>
);

const PATHS = {
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zm10 2l-4.35-4.35',
  cart: 'M4 5h2l2.4 10.2A2 2 0 0010.35 17h7.3a2 2 0 001.95-1.55L21 9H6.5M10 21a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z',
  bell: 'M18 16v-5a6 6 0 10-12 0v5l-1.5 2h15zM10 21h4',
  user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
};

/* Only the routes a business actually uses day to day. Everything else lives
   behind the account menu rather than competing for space up here. */
const NAV = [
  { to: '/s', label: 'Browse' },
  { to: '/requirements/board', label: 'Requirements' },
  { to: '/requirements/feed', label: 'RFQ Feed' },
  { to: '/listings', label: 'Your listings' },
  { to: '/bookings/received', label: 'Requests' },
];

const ACCOUNT_LINKS = [
  { to: '/account', label: 'Account' },
  { to: '/bookings/sent', label: 'Requests you sent' },
  { to: '/bookings/received', label: 'Requests received' },
  { to: '/requirements/mine', label: 'My RFQs' },
  { to: '/requirements', label: 'Your requirements' },
  { to: '/requirements/feed', label: 'Supplier RFQ feed' },
  { to: '/requirements/new', label: 'Post a requirement' },
  { to: '/listings', label: 'Your listings' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/notifications', label: 'Notifications' },
];

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const { data: cart } = useCart();
  const { data: notifs } = useNotifications();

  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Any navigation closes whatever was open, so panels never linger.
  useEffect(() => {
    setMenuOpen(false);
    setMobileOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  const submitSearch = (e) => {
    e.preventDefault();
    navigate(q.trim() ? `/s?q=${encodeURIComponent(q.trim())}` : '/s');
  };

  const cartCount = cart?.count ?? 0;
  const unread = notifs?.unreadCount ?? 0;

  return (
    <header className="sticky top-0 z-40 bg-nav">
      <div className="shell">
        <div className="h-16 flex items-center gap-6">
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden -ml-2 p-2 text-ink"
            aria-label="Menu"
          >
            <Icon d={mobileOpen ? PATHS.close : PATHS.menu} size={20} />
          </button>

          {/* Primary nav sits left; the wordmark anchors the right. */}
          <nav className="hidden md:flex items-center gap-7 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`transition-colors ${
                  pathname === n.to ? 'text-ink font-medium' : 'text-ink/70 hover:text-ink'
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex-1" />

          {/* Search collapses to an icon until asked for, keeping the bar calm. */}
          {searchOpen ? (
            <form onSubmit={submitSearch} className="hidden sm:block">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onBlur={() => !q && setSearchOpen(false)}
                placeholder="Search resources"
                aria-label="Search resources"
                className="h-9 w-64 px-3 text-sm bg-surface/90 rounded border border-transparent outline-none placeholder:text-ink-mute focus:border-ink"
              />
            </form>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="hidden sm:grid place-items-center w-9 h-9 rounded text-ink hover:bg-white/25 transition-colors"
              aria-label="Search"
            >
              <Icon d={PATHS.search} />
            </button>
          )}

          {user && (
            <Link
              to="/notifications"
              className="relative grid place-items-center w-9 h-9 rounded text-ink hover:bg-white/25 transition-colors"
              aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
            >
              <Icon d={PATHS.bell} />
              {unread > 0 && (
                <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-ink text-ink-invert text-[10px] leading-[15px] text-center font-medium">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
          )}

          <Link
            to="/cart"
            className="relative grid place-items-center w-9 h-9 rounded text-ink hover:bg-white/25 transition-colors"
            aria-label={`Cart${cartCount ? `, ${cartCount} items` : ''}`}
          >
            <Icon d={PATHS.cart} />
            {cartCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-ink text-ink-invert text-[10px] leading-[15px] text-center font-medium">
                {cartCount}
              </span>
            )}
          </Link>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 h-9 px-2 rounded text-ink hover:bg-white/25 transition-colors"
            >
              <Icon d={PATHS.user} />
              <span className="hidden lg:inline text-sm">
                {user ? shortName(user.businessName) : 'Sign in'}
              </span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-60 bg-surface border border-line rounded shadow-lg py-2 z-50">
                {user ? (
                  <>
                    <div className="px-4 py-2 border-b border-line mb-1">
                      <p className="text-sm font-medium truncate">{user.businessName}</p>
                      <p className="text-xs muted truncate">{user.email}</p>
                    </div>
                    {ACCOUNT_LINKS.map((l) => (
                      <Link
                        key={l.to}
                        to={l.to}
                        className="block px-4 py-2 text-sm hover:bg-surface-sunk transition-colors"
                      >
                        {l.label}
                      </Link>
                    ))}
                    <hr className="rule my-1" />
                    <button
                      onClick={() => {
                        logout();
                        navigate('/');
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-ink-soft hover:bg-surface-sunk transition-colors"
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <div className="px-4 py-2 space-y-2">
                    <Link to="/login" className="btn-primary w-full">
                      Sign in
                    </Link>
                    <Link to="/register" className="btn-secondary w-full">
                      Create account
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* The wordmark, as requested, anchors the top right. */}
          <Link to="/" className="ml-1 sm:ml-3 text-ink shrink-0" aria-label="Indulge home">
            <Logo size={22} />
          </Link>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-black/10">
          <nav className="shell py-3 flex flex-col">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="py-2.5 text-sm text-ink">
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
