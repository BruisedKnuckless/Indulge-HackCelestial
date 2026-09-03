import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart, useNotifications } from '../../hooks/queries';
import { CATEGORIES } from '../../lib/constants';
import Logo from './Logo';
import { shortName } from '../../lib/businessName';

/* Amazon's header icons, redrawn as inline SVG so nothing external is needed. */
const PinIcon = (p) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" {...p}>
    <path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z" />
  </svg>
);

const SearchIcon = (p) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="#131921" {...p}>
    <path d="M15.5 14h-.8l-.3-.3A6.5 6.5 0 105.5 16a6.5 6.5 0 004.2-1.6l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0A4.5 4.5 0 1114 9.5 4.5 4.5 0 019.5 14z" />
  </svg>
);

const CartIcon = (p) => (
  <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" {...p}>
    <path d="M7 18a2 2 0 102 2 2 2 0 00-2-2zm10 0a2 2 0 102 2 2 2 0 00-2-2zM7.2 14.6l.9-1.6h7.4a2 2 0 001.8-1.1l3-5.4-1.7-1-3 5.5H8.5L4.3 2H1v2h2l3.6 7.6-1.4 2.4A2 2 0 007 17h12v-2H7.4a.25.25 0 01-.2-.4z" />
  </svg>
);

const BellIcon = (p) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" {...p}>
    <path d="M12 22a2 2 0 002-2h-4a2 2 0 002 2zm6-6v-5a6 6 0 00-5-5.9V4a1 1 0 00-2 0v1.1A6 6 0 006 11v5l-2 2v1h16v-1z" />
  </svg>
);

const MenuIcon = (p) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" {...p}>
    <path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" />
  </svg>
);

/** Amazon's two-line header block: small gray label above a bold value. */
function NavBlock({ to, top, bottom, onClick, className = '', children }) {
  const inner = (
    <div className={`nav-hover px-2 py-1.5 leading-none ${className}`}>
      {children || (
        <>
          <div className="text-micro text-[#CCC]">{top}</div>
          <div className="text-base font-bold text-white">{bottom}</div>
        </>
      )}
    </div>
  );
  if (onClick) return <button onClick={onClick} className="text-left">{inner}</button>;
  return <Link to={to}>{inner}</Link>;
}

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { data: cart } = useCart();
  const { data: notifs } = useNotifications();

  const [q, setQ] = useState(searchParams.get('q') || '');
  const [category, setCategory] = useState(searchParams.get('category') || 'all');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close the account menu on any outside click.
  useEffect(() => {
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const submitSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (category !== 'all') params.set('category', category);
    navigate(`/s?${params.toString()}`);
  };

  const cartCount = cart?.count ?? 0;
  const unread = notifs?.unreadCount ?? 0;
  const city = user?.location?.city;
  const pincode = user?.location?.pincode;

  return (
    <header className="sticky top-0 z-40">
      {/* ---------------------------------------------------- primary bar */}
      <div className="bg-squid text-white">
        <div className="max-w-page mx-auto flex items-center gap-1 px-2 h-[60px]">
          <Link to="/" className="nav-hover px-2 py-2 shrink-0" aria-label="Indulge home">
            <Logo width={104} />
          </Link>

          <NavBlock to={user ? '/account/address' : '/login'} className="hidden md:block shrink-0">
            <div className="flex items-end gap-1">
              <PinIcon className="mb-[2px] text-white" />
              <div className="leading-none">
                <div className="text-micro text-[#CCC]">
                  {user ? 'Serving from' : 'Set your'}
                </div>
                <div className="text-base font-bold text-white whitespace-nowrap">
                  {city ? `${city} ${pincode || ''}`.trim() : 'business location'}
                </div>
              </div>
            </div>
          </NavBlock>

          {/* Search: category select + input + submit, as one rounded unit. */}
          <form onSubmit={submitSearch} className="flex-1 flex h-10 min-w-0 mx-1 group">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Category"
              className="h-10 bg-[#E6E6E6] hover:bg-[#CDD4D5] text-ink text-mini
                         rounded-l-[4px] border-0 px-2 pr-6 cursor-pointer outline-none
                         appearance-none shrink-0 max-w-[80px] md:max-w-[150px]
                         bg-[url(&quot;data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23555' stroke-width='1.5' fill='none'/%3E%3C/svg%3E&quot;)]
                         bg-[right_6px_center] bg-no-repeat"
            >
              <option value="all">All</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>

            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search banquet halls, AV kits, kitchen capacity…"
              aria-label="Search resources"
              className="flex-1 min-w-0 h-10 px-3 text-[15px] text-ink outline-none border-0"
            />

            <button
              type="submit"
              aria-label="Search"
              className="w-[45px] h-10 bg-search hover:bg-search-hover rounded-r-[4px]
                         flex items-center justify-center shrink-0"
            >
              <SearchIcon />
            </button>
          </form>

          <NavBlock to="#" className="hidden lg:block shrink-0">
            <div className="flex items-center gap-1 pt-2">
              <span className="text-lg leading-none">🇮🇳</span>
              <span className="text-base font-bold">EN</span>
            </div>
          </NavBlock>

          {/* Account block with hover/click dropdown. */}
          <div className="relative shrink-0" ref={menuRef}>
            <button onClick={() => setMenuOpen((v) => !v)} className="text-left">
              <div className="nav-hover px-2 py-1.5 leading-none">
                <div className="text-micro text-[#CCC] whitespace-nowrap">
                  Hello, {user ? shortName(user.businessName) : 'sign in'}
                </div>
                <div className="text-base font-bold whitespace-nowrap">
                  Account &amp; Listings ▾
                </div>
              </div>
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-[280px] bg-white text-ink
                           rounded shadow-pop py-3 z-50"
                onClick={() => setMenuOpen(false)}
              >
                {!user ? (
                  <div className="px-4">
                    <Link to="/login" className="btn-yellow w-full mb-2">
                      Sign in
                    </Link>
                    <p className="text-mini text-center">
                      New customer?{' '}
                      <Link to="/register" className="a-link">
                        Start here.
                      </Link>
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="px-4 pb-2 mb-2 border-b border-bd">
                      <p className="text-base font-bold">{user.businessName}</p>
                      <p className="text-mini text-ink-soft">{user.email}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 px-4 text-base">
                      <div>
                        <p className="font-bold mb-1">Your Account</p>
                        {[
                          ['/account', 'Account'],
                          ['/bookings/sent', 'Your Requests'],
                          ['/analytics', 'Analytics'],
                          ['/account/profile', 'Business Profile'],
                        ].map(([to, label]) => (
                          <Link key={to} to={to} className="block py-0.5 a-link-plain text-mini">
                            {label}
                          </Link>
                        ))}
                      </div>
                      <div>
                        <p className="font-bold mb-1">Your Listings</p>
                        {[
                          ['/listings', 'Manage Listings'],
                          ['/listings/new', 'Add a Resource'],
                          ['/bookings/received', 'Incoming Requests'],
                          ['/notifications', 'Notifications'],
                        ].map(([to, label]) => (
                          <Link key={to} to={to} className="block py-0.5 a-link-plain text-mini">
                            {label}
                          </Link>
                        ))}
                      </div>
                    </div>
                    <div className="border-t border-bd mt-2 pt-2 px-4">
                      <button
                        onClick={() => {
                          logout();
                          navigate('/');
                        }}
                        className="text-mini a-link-plain"
                      >
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <NavBlock
            to="/bookings/sent"
            top="Returns"
            bottom="& Requests"
            className="hidden md:block shrink-0"
          />

          <Link to="/notifications" className="relative shrink-0 hidden sm:block">
            <div className="nav-hover px-2 py-2.5">
              <BellIcon />
              {unread > 0 && (
                <span
                  className="absolute top-0 right-0 bg-deal text-white text-[10px]
                             font-bold rounded-full min-w-[16px] h-4 px-1
                             flex items-center justify-center"
                >
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </div>
          </Link>

          <Link to="/cart" className="shrink-0">
            <div className="nav-hover px-2 py-1 flex items-end gap-0.5">
              <div className="relative">
                <CartIcon />
                <span
                  className="absolute -top-1 left-1/2 -translate-x-1/2 text-cart-badge
                             text-body font-bold leading-none"
                >
                  {cartCount}
                </span>
              </div>
              <span className="text-base font-bold mb-1 hidden sm:inline">Cart</span>
            </div>
          </Link>
        </div>
      </div>

      {/* ------------------------------------------------------ secondary bar */}
      <nav className="bg-navy text-white text-body">
        <div className="max-w-page mx-auto flex items-center gap-0.5 px-2 h-[39px] overflow-x-auto no-scrollbar">
          <Link to="/s" className="nav-hover px-2 py-1 flex items-center gap-1.5 font-bold shrink-0">
            <MenuIcon />
            All
          </Link>

          {[
            ['/s?sort=match', 'Today’s Availability'],
            ['/s?sort=distance', 'Near Me'],
            ['/requirements/feed', 'Supplier RFQ Feed'],
            ['/requirements/mine', 'My RFQs'],
            ['/requirements/new', 'Post a Requirement'],
            ...CATEGORIES.slice(0, 4).map((c) => [`/s?category=${c.value}`, c.label]),
            ['/listings', 'Indulge Business'],
            ['/account', 'Customer Service'],
          ].map(([to, label]) => (
            <Link key={label} to={to} className="nav-hover px-2 py-1 whitespace-nowrap shrink-0">
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
