import { Link } from 'react-router-dom';
import { useSearch } from '../hooks/queries';
import { useAuth } from '../context/AuthContext';
import ScrollSequence from '../components/ScrollSequence';
import { ResourceTile } from '../components/ResourceCard';
import { Spinner } from '../components/ui';
import { CATEGORIES } from '../lib/constants';
import { shortName } from '../lib/businessName';

/** A titled block with a lot of air around it and one optional link out. */
function Row({ title, note, to, linkLabel = 'See all', children }) {
  return (
    <section className="section">
      <div className="flex items-end justify-between gap-6 mb-8">
        <div>
          <h2 className="h-section">{title}</h2>
          {note && <p className="text-sm muted mt-1">{note}</p>}
        </div>
        {to && (
          <Link to={to} className="text-sm link shrink-0">
            {linkLabel}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export default function Home() {
  const { user } = useAuth();

  const { data: nearby, isLoading } = useSearch({ limit: 24, radiusKm: 60 });
  const { data: banquet } = useSearch({ category: 'banquet_space', limit: 4, radiusKm: 60 });

  const all = nearby?.results || [];
  const best = [...all].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

  return (
    <>
      <ScrollSequence />

      <div className="shell">
        {/* Statement of what this is, given the intro is wordless. */}
        <section className="pt-20 pb-4 max-w-prose">
          <h1 className="h-page">
            {user ? `Welcome back, ${shortName(user.businessName)}.` : 'Rent what you need. Earn from what you don’t.'}
          </h1>
          <p className="text-lg muted mt-5">
            Halls, kitchens, vehicles, furniture and crew — available from hospitality businesses
            near you, for the hours you actually need them.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <Link to="/s" className="btn-primary">
              Browse resources
            </Link>
            <Link to={user ? '/listings/new' : '/register'} className="btn-secondary">
              {user ? 'List a resource' : 'Create an account'}
            </Link>
          </div>
        </section>

        <hr className="rule mt-16" />

        {isLoading && <Spinner label="Finding resources near you" />}

        {best.length > 0 && (
          <Row
            title="Best matches for you"
            note="Ranked by price, distance, availability and fit."
            to="/s"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-10">
              {best.slice(0, 4).map((r) => (
                <ResourceTile key={r._id} resource={r} />
              ))}
            </div>
          </Row>
        )}

        {banquet?.results?.length > 0 && (
          <>
            <hr className="rule" />
            <Row title="Spaces" to="/s?category=banquet_space" linkLabel="All spaces">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-10">
                {banquet.results.slice(0, 4).map((r) => (
                  <ResourceTile key={r._id} resource={r} />
                ))}
              </div>
            </Row>
          </>
        )}

        <hr className="rule" />

        <Row title="Browse by category">
          <div className="flex flex-wrap gap-3">
            {CATEGORIES.map((c) => (
              <Link
                key={c.value}
                to={`/s?category=${c.value}`}
                className="btn-secondary"
              >
                {c.label}
              </Link>
            ))}
          </div>
        </Row>

        <hr className="rule" />

        {/* The reverse side of the marketplace, given one clear moment. */}
        <section className="section">
          <div className="max-w-prose">
            <h2 className="h-section">Can’t find it?</h2>
            <p className="text-base muted mt-3">
              Describe what you need and we run it through the same ranking that powers search —
              300 chairs this Saturday, a hall for 200 under ₹50,000, kitchen hours overnight.
            </p>
            <Link to="/requirements/new" className="btn-secondary mt-6">
              Post a requirement
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
