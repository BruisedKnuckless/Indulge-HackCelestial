import { Link } from 'react-router-dom';
import Logo from './Logo';

const GROUPS = [
  {
    title: 'Marketplace',
    links: [
      ['Browse resources', '/s'],
      ['Post a requirement', '/requirements/new'],
      ['Open requirements', '/requirements/board'],
      ['Your request cart', '/cart'],
    ],
  },
  {
    title: 'For providers',
    links: [
      ['List a resource', '/listings/new'],
      ['Your listings', '/listings'],
      ['Analytics', '/analytics'],
    ],
  },
  {
    title: 'Account',
    links: [
      ['Your account', '/account'],
      ['Requests sent', '/bookings/sent'],
      ['Requests received', '/bookings/received'],
    ],
  },
];

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="shell py-14">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          <div>
            <Logo size={20} className="text-ink" />
            <p className="text-sm muted mt-3 max-w-[220px]">
              A resource exchange for hospitality businesses.
            </p>
          </div>

          {GROUPS.map((g) => (
            <div key={g.title}>
              <h3 className="text-sm font-medium mb-3">{g.title}</h3>
              <ul className="space-y-2">
                {g.links.map(([label, to]) => (
                  <li key={to}>
                    <Link to={to} className="text-sm link-quiet">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <hr className="rule my-10" />

        <p className="text-xs text-ink-mute">
          © {new Date().getFullYear()} Indulge — B2B hospitality resource exchange. A prototype;
          payments are simulated.
        </p>
      </div>
    </footer>
  );
}
