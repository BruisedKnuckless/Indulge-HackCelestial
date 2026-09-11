import { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useCart, useNotifications } from "../../hooks/queries";
import useTheme from "../../hooks/useTheme";
import { shortName } from "../../lib/businessName";
import { useHomeAnimation } from "../../hooks/useHomeAnimation";
import Logo from "./Logo";

/* ── Icons ──────────────────────────────────────────────────────────────── */

/** Single-stroke line icon at a consistent weight — keeps the bar calm. */
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

/** Sun icon (two-path: circle + rays). */
const SunIcon = ({ size = 17 }) => (
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
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

/** Moon icon. */
const MoonIcon = ({ size = 17 }) => (
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
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
  </svg>
);

const PATHS = {
  search:
    "M11 19a8 8 0 100-16 8 8 0 000 16zm10 2l-4.35-4.35",
  cart:
    "M4 5h2l2.4 10.2A2 2 0 0010.35 17h7.3a2 2 0 001.95-1.55L21 9H6.5M10 21a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z",
  bell:
    "M18 16v-5a6 6 0 10-12 0v5l-1.5 2h15zM10 21h4",
  user:
    "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6L6 18",
};

/* ── Navigation definition ───────────────────────────────────────────────── */

/**
 * Six links a business uses daily. The seeker-facing requirement board and the
 * provider-facing analytics are both included so the nav works equally for
 * both sides of the marketplace.
 */
const NAV = [
  { to: '/home', label: 'Home' },
  { to: '/s', label: 'Browse' },
  { to: '/nearby', label: 'Nearby' },
  { to: '/requirements', label: 'Requirements' },
  { to: '/requirements/feed', label: 'RFQ Feed' },
  { to: '/listings', label: 'Your Listings' },
  { to: '/bookings/received', label: 'Requests' },
  { to: '/analytics', label: 'Analytics' },
];

const ACCOUNT_LINKS = [
  { to: '/account', label: 'Account' },
  { to: '/nearby', label: 'Nearby Map' },
  { to: '/bookings/sent', label: 'Requests you sent' },
  { to: '/bookings/received', label: 'Requests received' },
  { to: '/requirements', label: 'My Requirements' },
  { to: '/requirements/feed', label: 'Supplier RFQ feed' },
  { to: '/requirements/new', label: 'Post a requirement' },
  { to: '/listings', label: 'Your listings' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/notifications', label: 'Notifications' },
  { to: '/how-it-works', label: 'How Indulge works' },
];

/* ── NavLink — knows its own active state ────────────────────────────────── */

/**
 * Determines whether the current pathname belongs to this link's section.
 * Bookings are treated as one section regardless of sent / received direction.
 */
function resolveActive(to, pathname) {
  if (to === "/home") return pathname === "/home";
  if (to === "/") return pathname === "/";
  if (to === "/s") return pathname === "/s";
  if (to === "/bookings/received") return pathname.startsWith("/bookings");
  if (to === "/requirements") return pathname.startsWith("/requirements") && !pathname.startsWith("/requirements/feed");
  if (to === "/requirements/feed") return pathname.startsWith("/requirements/feed");
  return pathname === to || pathname.startsWith(to + "/");
}

function NavLink({ to, label }) {
  const { pathname } = useLocation();
  const active = resolveActive(to, pathname);

  return (
    <Link
      to={to}
      onClick={() => {
        if (to === pathname) {
          window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
        }
      }}
      className={[
        "relative px-3.5 py-1.5 text-sm rounded-full",
        "transition-all duration-200 ease-out whitespace-nowrap",
        active
          ? "font-semibold text-zinc-950 dark:text-white bg-[rgba(99,102,241,0.16)] dark:bg-[rgba(99,102,241,0.22)] shadow-xs"
          : "font-medium text-zinc-900/80 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-[rgba(99,102,241,0.10)] dark:hover:bg-[rgba(99,102,241,0.16)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo/40",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label}
      {/* Indigo accent indicator for active link */}
      {active && (
        <span
          aria-hidden
          className="absolute bottom-0.5 left-3 right-3 h-[2px] rounded-full bg-indigo shadow-xs"
        />
      )}
    </Link>
  );
}

/* ── Shared icon-button class ────────────────────────────────────────────── */

const ICON_BTN =
  "grid place-items-center w-9 h-9 rounded-full " +
  "text-zinc-900/85 dark:text-zinc-200 " +
  "hover:text-indigo dark:hover:text-indigo " +
  "hover:bg-[rgba(99,102,241,0.10)] dark:hover:bg-[rgba(99,102,241,0.16)] " +
  "hover:scale-[1.04] active:scale-95 " +
  "transition-all duration-200 ease-out cursor-pointer " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo/40";

/* ── Header ──────────────────────────────────────────────────────────────── */

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname, search } = location;
  const { dark, toggle: toggleTheme } = useTheme();
  const { enabled: animationEnabled, toggle: toggleAnimation } = useHomeAnimation();

  const { data: cart } = useCart();
  const { data: notifs } = useNotifications();

  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [q, setQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const menuRef = useRef(null);

  // Close the account drop-down when clicking outside it.
  useEffect(() => {
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Navigation clears all overlays.
  useEffect(() => {
    setMenuOpen(false);
    setMobileOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  const submitSearch = (e) => {
    e.preventDefault();
    navigate(q.trim() ? `/s?q=${encodeURIComponent(q.trim())}` : "/s");
  };

  const cartCount = cart?.count ?? 0;
  const unread = notifs?.unreadCount ?? 0;

  return (
    <header className="sticky top-0 z-40 bg-nav/95 backdrop-blur-md border-b border-black/10 dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)] transition-all duration-200">
      <div className="shell">
        <div className="h-16 flex items-center gap-2">

          <Link
            to="/"
            aria-label="Indulge Home"
            title="Indulge — Experience & Landing"
            onClick={() => {
              if (pathname === "/") {
                window.scrollTo({ top: 0, left: 0, behavior: "instant" });
              }
            }}
            className="inline-flex items-center shrink-0 mr-4 h-9 transition-transform duration-200 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo/40 rounded-md"
          >
            <Logo size={21} className="transition-opacity hover:opacity-90" />
          </Link>

          {/* ── Primary nav — hidden below lg ─────────────────────── */}
          <nav
            className="hidden lg:flex items-center gap-0.5"
            aria-label="Main navigation"
          >
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} label={n.label} />
            ))}
          </nav>

          {/* Spacer pushes everything right */}
          <div className="flex-1" />

          {/* ── Right cluster ─────────────────────────────────────── */}

          {/* Search — collapses to an icon to keep the bar uncluttered. */}
          {searchOpen ? (
            <form onSubmit={submitSearch} className="hidden sm:block">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onBlur={() => !q && setSearchOpen(false)}
                placeholder="Search resources"
                aria-label="Search resources"
                className={[
                  "h-9 w-56 px-3 text-sm rounded-lg",
                  "bg-white/95 dark:bg-zinc-800/90 text-zinc-950 dark:text-zinc-100",
                  "border border-black/15 dark:border-white/15",
                  "outline-none",
                  "placeholder:text-zinc-500 dark:placeholder:text-zinc-400",
                  "focus:bg-white dark:focus:bg-zinc-800 focus:border-indigo focus:ring-1 focus:ring-indigo/40",
                  "transition-all duration-200",
                ].join(" ")}
              />
            </form>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className={`hidden sm:grid ${ICON_BTN}`}
              aria-label="Search"
            >
              <Icon d={PATHS.search} />
            </button>
          )}

          {/* Notifications — only when signed in. */}
          {user && (
            <Link
              to="/notifications"
              className={`relative ${ICON_BTN}`}
              aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
            >
              <Icon d={PATHS.bell} />
              {unread > 0 && (
                <span
                  className="absolute top-1 right-1 min-w-[15px] h-[15px] px-1 rounded-full
                             bg-red-accent text-white
                             text-[10px] leading-[15px] text-center font-semibold"
                >
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          )}

          {/* Cart */}
          <Link
            to="/cart"
            className={`relative ${ICON_BTN}`}
            aria-label={`Cart${cartCount ? `, ${cartCount} items` : ""}`}
          >
            <Icon d={PATHS.cart} />
            {cartCount > 0 && (
              <span
                className="absolute top-1 right-1 min-w-[15px] h-[15px] px-1 rounded-full
                           bg-indigo text-white
                           text-[10px] leading-[15px] text-center font-semibold"
              >
                {cartCount}
              </span>
            )}
          </Link>

          {/* Theme toggle — sun in dark mode (click for light), moon in light mode. */}
          <button
            onClick={toggleTheme}
            className={ICON_BTN}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>

          {/* Account menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className={[
                "flex items-center gap-2 h-9 px-3 rounded-full",
                "font-medium text-sm text-zinc-900/90 dark:text-zinc-200",
                "hover:text-zinc-950 dark:hover:text-white hover:bg-[rgba(99,102,241,0.10)] dark:hover:bg-[rgba(99,102,241,0.16)] hover:scale-[1.04] active:scale-95",
                "transition-all duration-200 ease-out cursor-pointer",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo/40",
              ].join(" ")}
              aria-label="Account menu"
              aria-expanded={menuOpen}
            >
              <Icon d={PATHS.user} />
              <span className="hidden lg:inline text-sm">
                {user ? shortName(user.businessName) : "Sign in"}
              </span>
            </button>

            {menuOpen && (
              <div
                className={[
                  "absolute right-0 top-full mt-2 w-64 py-2 z-50",
                  "bg-surface-alt",
                  "border border-line",
                  "rounded-xl shadow-[0_8px_28px_rgba(0,0,0,0.13)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)]",
                ].join(" ")}
              >
                {user ? (
                  <>
                    <div className="px-4 py-2 border-b border-line mb-1">
                      <p className="text-sm font-medium truncate">
                        {user.businessName}
                      </p>
                      <p className="text-xs muted truncate">{user.email}</p>
                    </div>

                    {/* Homepage Animation toggle directly below profile name/account info */}
                    <div className="px-4 py-2 border-b border-line mb-1 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-ink">Homepage Animation</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-ink-mute uppercase">
                          {animationEnabled ? "ON" : "OFF"}
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={animationEnabled}
                          aria-label={`Homepage Animation ${animationEnabled ? "ON" : "OFF"}`}
                          onClick={toggleAnimation}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${
                            animationEnabled ? "bg-ink" : "bg-surface-sunk border border-line"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full shadow-xs transition-transform duration-200 ${
                              animationEnabled
                                ? "translate-x-4 bg-ink-invert"
                                : "translate-x-0.5 bg-ink/40"
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {ACCOUNT_LINKS.map((l) => (
                      <Link
                        key={l.to}
                        to={l.to}
                        className="block px-4 py-2 text-sm text-ink
                                   hover:bg-surface-sunk
                                   transition-colors duration-150"
                      >
                        {l.label}
                      </Link>
                    ))}

                    <hr className="rule my-1" />

                    <button
                      onClick={() => {
                        logout();
                        navigate("/");
                      }}
                      className="w-full text-left px-4 py-2 text-sm
                                 text-ink-soft
                                 hover:bg-surface-sunk
                                 transition-colors duration-150"
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <div className="px-4 py-2 space-y-2">
                      <Link to="/login" className="btn-primary w-full text-center">
                        Sign in
                      </Link>
                      <Link to="/register" className="btn-secondary w-full text-center">
                        Create account
                      </Link>
                    </div>

                    <div className="px-4 py-2 border-t border-line mt-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-ink">Homepage Animation</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-ink-mute uppercase">
                          {animationEnabled ? "ON" : "OFF"}
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={animationEnabled}
                          aria-label={`Homepage Animation ${animationEnabled ? "ON" : "OFF"}`}
                          onClick={toggleAnimation}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${
                            animationEnabled ? "bg-ink" : "bg-surface-sunk border border-line"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full shadow-xs transition-transform duration-200 ${
                              animationEnabled
                                ? "translate-x-4 bg-ink-invert"
                                : "translate-x-0.5 bg-ink/40"
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Mobile hamburger (hidden on lg+) ──────────────────── */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className={`lg:hidden ${ICON_BTN}`}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            <Icon d={mobileOpen ? PATHS.close : PATHS.menu} size={20} />
          </button>
        </div>
      </div>

      {/* ── Mobile nav panel ────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-black/10 dark:border-white/10 bg-nav/95">
          <nav
            className="shell py-3 flex flex-col gap-1"
            aria-label="Mobile navigation"
          >
            {NAV.map((n) => {
              const active = resolveActive(n.to, pathname);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  onClick={() => {
                    setMobileOpen(false);
                    if (n.to === pathname) {
                      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
                    }
                  }}
                  className={[
                    "py-2 px-3 text-sm rounded-lg",
                    "transition-all duration-200 ease-out",
                    active
                      ? "font-semibold text-zinc-950 dark:text-white bg-[rgba(99,102,241,0.16)] dark:bg-[rgba(99,102,241,0.22)] shadow-xs"
                      : "font-medium text-zinc-900/80 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-[rgba(99,102,241,0.10)] dark:hover:bg-[rgba(99,102,241,0.16)]",
                  ].join(" ")}
                >
                  {n.label}
                </Link>
              );
            })}

            <Link
              to="/how-it-works"
              onClick={() => setMobileOpen(false)}
              className={[
                "py-2 px-3 text-sm rounded-lg",
                "transition-all duration-200 ease-out",
                pathname === "/how-it-works"
                  ? "font-semibold text-zinc-950 dark:text-white bg-[rgba(99,102,241,0.16)] dark:bg-[rgba(99,102,241,0.22)] shadow-xs"
                  : "font-medium text-zinc-900/80 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-[rgba(99,102,241,0.10)] dark:hover:bg-[rgba(99,102,241,0.16)]",
              ].join(" ")}
            >
              How it works
            </Link>

            {!user && (
              <div className="mt-3 pt-3 border-t border-black/10 dark:border-black/20 flex gap-2">
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="btn-primary flex-1 justify-center"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileOpen(false)}
                  className="btn-secondary flex-1 justify-center"
                >
                  Register
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
