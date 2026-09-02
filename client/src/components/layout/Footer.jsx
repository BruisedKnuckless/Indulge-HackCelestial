import { Link } from 'react-router-dom';
import Logo from './Logo';

const COLUMNS = [
  {
    title: 'Get to Know Us',
    links: [
      ['/', 'About Indulge'],
      ['/', 'How the exchange works'],
      ['/', 'Careers'],
      ['/', 'Press releases'],
    ],
  },
  {
    title: 'List With Us',
    links: [
      ['/listings/new', 'List a resource'],
      ['/listings', 'Manage your listings'],
      ['/analytics', 'Utilization analytics'],
      ['/bookings/received', 'Incoming requests'],
    ],
  },
  {
    title: 'Book With Us',
    links: [
      ['/s', 'Browse all resources'],
      ['/requirements/new', 'Post a requirement'],
      ['/bookings/sent', 'Track your requests'],
      ['/cart', 'Your request cart'],
    ],
  },
  {
    title: 'Let Us Help You',
    links: [
      ['/account', 'Your account'],
      ['/account/profile', 'Business profile'],
      ['/', 'Cancellation policy'],
      ['/', 'Help & support'],
    ],
  },
];

export default function Footer() {
  return (
    <footer className="mt-10">
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="w-full bg-back-to-top hover:bg-back-to-top-hover text-white
                   text-base h-[50px] transition-colors"
      >
        Back to top
      </button>

      <div className="bg-navy text-white">
        <div className="max-w-[1000px] mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-lead font-bold mb-2">{col.title}</h3>
              <ul className="space-y-2">
                {col.links.map(([to, label]) => (
                  <li key={label}>
                    <Link to={to} className="text-body text-[#DDD] hover:underline">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-[#3A4553]">
          <div className="max-w-page mx-auto py-7 flex justify-center">
            <Logo width={110} />
          </div>
        </div>
      </div>

      <div className="bg-navy-dark text-[#DDD] py-7 px-4">
        <div className="max-w-[1000px] mx-auto text-center">
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-micro mb-3">
            <span>Conditions of Use</span>
            <span>Privacy Notice</span>
            <span>Interest-Based Ads</span>
          </div>
          <p className="text-micro">
            © {new Date().getFullYear()} Indulge — B2B Hospitality Resource Exchange. A hackathon
            prototype; not affiliated with any existing marketplace.
          </p>
        </div>
      </div>
    </footer>
  );
}
