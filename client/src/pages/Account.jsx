import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAnalytics } from '../hooks/queries';
import { Stars } from '../components/ui';

/* Simple line-art icons in the muted style an account hub uses. */
const icons = {
  listings: 'M4 6h16M4 12h16M4 18h10',
  requests: 'M6 4h9l5 5v11H6zM15 4v5h5',
  security: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
  address: 'M12 2C8.7 2 6 4.7 6 8c0 4.5 6 12 6 12s6-7.5 6-12c0-3.3-2.7-6-6-6zm0 8.5A2.5 2.5 0 1112 5.5a2.5 2.5 0 010 5z',
  reviews: 'M12 2l2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.1-5.9 3.1 1.2-6.5L2.5 8.9 9.1 8z',
  analytics: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  cart: 'M6 6h15l-1.5 9h-12zM6 6L5 2H2M9 20a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z',
  notifications: 'M18 16v-5a6 6 0 10-12 0v5l-2 2h16zM10 21h4',
};

function Tile({ to, icon, title, description }) {
  return (
    <Link
      to={to}
      className="border border-line rounded p-4 flex gap-4 hover:bg-surface-sunk transition-colors"
    >
      <svg
        viewBox="0 0 24 24"
        width="46"
        height="46"
        fill="none"
        stroke="#565959"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 mt-0.5"
      >
        <path d={icons[icon]} />
      </svg>
      <div className="min-w-0">
        <h2 className="text-lg leading-snug">{title}</h2>
        <p className="text-base text-ink-soft">{description}</p>
      </div>
    </Link>
  );
}

export default function Account() {
  const { user } = useAuth();
  const { data: summary } = useAnalytics('summary');

  return (
    <div className="shell pt-12 pb-20">
      <h1 className="h-page mb-8">Your Account</h1>

      <div className="border border-line rounded p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="h-card">{user.businessName}</p>
          <p className="text-base text-ink-soft">
            {user.email}
            {user.location?.city ? ` · ${user.location.city}` : ''}
          </p>
          {user.ratingCount > 0 && (
            <Stars rating={user.ratingAvg} count={user.ratingCount} className="mt-1" />
          )}
        </div>
        <div className="flex gap-6 text-center">
          <div>
            <p className="h-section">{summary?.activeListings ?? 0}</p>
            <p className="text-xs text-ink-soft">Listings</p>
          </div>
          <div>
            <p className="h-section">{summary?.pendingRequests ?? 0}</p>
            <p className="text-xs text-ink-soft">To review</p>
          </div>
          <div>
            <p className="h-section">{summary?.activeRequests ?? 0}</p>
            <p className="text-xs text-ink-soft">Your requests</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Tile
          to="/listings"
          icon="listings"
          title="Your Listings"
          description="Manage the resources you offer to other businesses"
        />
        <Tile
          to="/bookings/received"
          icon="requests"
          title="Incoming Requests"
          description="Accept, decline or negotiate requests you have received"
        />
        <Tile
          to="/bookings/sent"
          icon="cart"
          title="Your Requests"
          description="Track everything you have asked other businesses for"
        />
        <Tile
          to="/account/profile"
          icon="address"
          title="Business Profile & Location"
          description="Address and operating area used for distance ranking"
        />
        <Tile
          to="/analytics"
          icon="analytics"
          title="Utilisation Analytics"
          description="See how hard your listed capacity is working"
        />
        <Tile
          to="/notifications"
          icon="notifications"
          title="Notifications"
          description="Request updates, messages and review alerts"
        />
        <Tile
          to={`/provider/${user._id}`}
          icon="reviews"
          title="Your Public Profile"
          description="See your listings and reviews as other businesses do"
        />
        <Tile
          to="/requirements"
          icon="security"
          title="Your Requirements"
          description="What you have asked the market for, and the offers received"
        />
        <Tile
          to="/requirements/board"
          icon="requests"
          title="Open Requirements"
          description="What other businesses need — offer your spare capacity"
        />
      </div>
    </div>
  );
}
