import { Link } from 'react-router-dom';
import Logo from './Logo';
import { ShieldCheck, ArrowUpRight } from 'lucide-react';

const FOOTER_SECTIONS = [
  {
    title: 'Marketplace',
    links: [
      { label: 'Browse Resources', to: '/s' },
      { label: 'Post a Requirement', to: '/requirements/new' },
      { label: 'Open Requirements', to: '/requirements/board' },
      { label: 'Your Request Cart', to: '/cart' },
    ],
  },
  {
    title: 'For Providers',
    links: [
      { label: 'List a Resource', to: '/listings/new' },
      { label: 'Your Listings', to: '/listings' },
      { label: 'Availability Calendar', to: '/listings' },
      { label: 'Operational Analytics', to: '/analytics' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Account Settings', to: '/account' },
      { label: 'Requests Sent', to: '/bookings/sent' },
      { label: 'Requests Received', to: '/bookings/received' },
      { label: 'All Bookings', to: '/bookings/received' },
    ],
  },
  {
    title: 'Explore',
    links: [
      { label: 'Nearby Map', to: '/nearby' },
      { label: 'How It Works', to: '/how-it-works' },
      { label: 'Browse Resources', to: '/s' },
      { label: 'RFQ Exchange Feed', to: '/requirements/feed' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-line bg-surface-sunk/35">
      <div className="shell pt-16 pb-12">
        {/* ── Main Footer Grid ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-10 lg:gap-8 mb-14">
          
          {/* Brand Block — 2 columns on desktop */}
          <div className="lg:col-span-2 flex flex-col justify-between pr-0 lg:pr-6">
            <div>
              <Link to="/" aria-label="Indulge Home" className="inline-block transition-opacity hover:opacity-85">
                <Logo size={22} className="text-ink" />
              </Link>
              <p className="text-sm muted mt-3.5 leading-relaxed max-w-sm">
                Helping hospitality businesses share unused capacity, source resources faster,
                and improve asset utilization across commercial kitchens, banquets, vehicles, and equipment.
              </p>
            </div>

            {/* Small trust statement */}
            <div className="mt-6 pt-5 border-t border-line/60 flex items-center gap-2 text-xs text-ink-mute">
              <ShieldCheck size={16} className="text-ink-soft shrink-0" />
              <span>Verified hospitality counterparty network</span>
            </div>
          </div>

          {/* 4 Grouped Link Columns */}
          {FOOTER_SECTIONS.map((section) => (
            <div key={section.title} className="flex flex-col">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink mb-4">
                {section.title}
              </h3>
              <ul className="space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="text-sm text-ink-soft hover:text-ink transition-colors duration-150 inline-flex items-center gap-1 group"
                    >
                      <span>{link.label}</span>
                      <ArrowUpRight
                        size={12}
                        className="opacity-0 -translate-x-1 translate-y-1 group-hover:opacity-60 group-hover:translate-x-0 group-hover:translate-y-0 transition-all duration-150"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* ── Subtle Divider ──────────────────────────────────────────────── */}
        <hr className="rule mb-8" />

        {/* ── Bottom Footer Bar ────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-ink-mute">
          <div className="flex items-center gap-2">
            <span>&copy; {new Date().getFullYear()} Indulge</span>
            <span>&middot;</span>
            <span>B2B Hospitality Resource Exchange</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-alt border border-line text-[11px] text-ink-soft">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Demo Platform
            </span>
            <span>Prototype &middot; Payments simulated</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
