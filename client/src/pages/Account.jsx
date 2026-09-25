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
  truck: 'M1 3h15v13H1zM16 8h4l3 3v5h-7V8zM5.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5zm13 0a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zm7.4 1.3l1.8 1.4-2 3.5-2.2-.9c-.6.5-1.3.9-2 1.2l-.3 2.4h-4l-.3-2.4c-.7-.3-1.4-.7-2-1.2l-2.2.9-2-3.5 1.8-1.4c-.1-.4-.1-.8-.1-1.3s0-.9.1-1.3l-1.8-1.4 2-3.5 2.2.9c.6-.5 1.3-.9 2-1.2l.3-2.4h4l.3 2.4c.7.3 1.4.7 2 1.2l2.2-.9 2 3.5-1.8 1.4c.1.4.1.8.1 1.3s0 .9-.1 1.3z',
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
  const isPartner = user?.userType === 'logistics_partner';
  const { data: summary } = useAnalytics('summary', undefined, { enabled: !isPartner });

  return (
    <div className="shell pt-12 pb-20">
      {isPartner ? (
        <div className="mb-8">
          <h1 className="h-page mb-1">{user?.businessName || 'Logistics Partner'}</h1>
          <div className="flex items-center gap-3 text-sm text-ink-soft flex-wrap">
            <span className="font-semibold text-brand-orange">Indulge Logistics Partner</span>
            <span>•</span>
            <span>
              Hub: <strong className="text-ink-base">{user?.location?.city || user?.logisticsProfile?.serviceArea?.[0] || 'Primary Hub'}</strong>
            </span>
            {user?.logisticsProfile?.serviceArea?.length > 1 && (
              <span>({user.logisticsProfile.serviceArea.join(', ')})</span>
            )}
            <span>•</span>
            <span className="flex items-center gap-1.5">
              Operating Status:
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                (user?.logisticsProfile?.operatingStatus || 'available') === 'available'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : (user?.logisticsProfile?.operatingStatus) === 'busy'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/30'
              }`}>
                {(user?.logisticsProfile?.operatingStatus || 'available').toUpperCase()}
              </span>
            </span>
          </div>
        </div>
      ) : (
        <h1 className="h-page mb-8">Your Account</h1>
      )}

      <div className="border border-line rounded p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="h-card">{user.businessName}</p>
            {isPartner && (
              <span className="badge badge-indigo text-[10px] font-bold uppercase tracking-wider">
                Logistics Partner
              </span>
            )}
          </div>
          <p className="text-base text-ink-soft">
            {user.email}
            {user.location?.city ? ` · Hub: ${user.location.city}` : ''}
          </p>
          {user.ratingCount > 0 && (
            <Stars rating={user.ratingAvg} count={user.ratingCount} className="mt-1" />
          )}
        </div>

        {isPartner ? (
          <div className="flex gap-6 text-center">
            <div>
              <p className="h-section text-green-accent">{user.logisticsProfile?.completedJobs ?? 0}</p>
              <p className="text-xs text-ink-soft">Delivered</p>
            </div>
            <div>
              <p className="h-section capitalize">{user.logisticsProfile?.operatingStatus || 'Active'}</p>
              <p className="text-xs text-ink-soft">Fleet status</p>
            </div>
            <div>
              <p className="h-section">{user.logisticsProfile?.serviceArea?.length || 1}</p>
              <p className="text-xs text-ink-soft">Hub zones</p>
            </div>
          </div>
        ) : (
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
        )}
      </div>

      {isPartner ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Tile
            to="/logistics"
            icon="truck"
            title="Logistics Dispatch Center"
            description="Manage active deliveries, pickup assignments, and return transit"
          />
          <Tile
            to="/logistics"
            icon="settings"
            title="Fleet & Vehicle Details"
            description="View vehicle model, capacity specs and active dispatch readiness"
          />
          <Tile
            to="/notifications"
            icon="notifications"
            title="Dispatch Notifications"
            description="Alerts for new transport assignments, handovers and return requests"
          />
          <Tile
            to="/account/profile"
            icon="address"
            title="Partner Profile & Contact"
            description="Operational hub, service regions and dispatch contact details"
          />
          <Tile
            to="/account/profile"
            icon="security"
            title="Account Security & Access"
            description="Manage your account password, email and dispatch credentials"
          />
          <Tile
            to="/how-it-works"
            icon="reviews"
            title="How Indulge Logistics Works"
            description="Logistics protocols, proof-of-delivery handovers and return standards"
          />
        </div>
      ) : (
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
            to="/requirements/mine"
            icon="cart"
            title="My RFQs & Quotations"
            description="Track broadcasted requirements and review supplier bids"
          />
          <Tile
            to="/requirements/feed"
            icon="requests"
            title="Supplier RFQ Feed"
            description="Find open requirements nearby and submit bids"
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
          <Tile
            to="/requirements/new"
            icon="cart"
            title="Post a Requirement"
            description="Broadcast what you need to nearby hospitality providers"
          />
        </div>
      )}
    </div>
  );
}
