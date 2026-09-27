import { Link } from 'react-router-dom';
import { Sparkles, ArrowLeft, ShieldCheck, Activity } from 'lucide-react';
import DigitalTwinPanel from '../components/digital-twin/DigitalTwinPanel';

export default function DigitalTwin() {
  return (
    <div className="shell pt-8 pb-20">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-xs text-ink-mute">
          <Link to="/" className="hover:text-ink transition-colors">
            Home
          </Link>
          <span>/</span>
          <Link to="/analytics" className="hover:text-ink transition-colors">
            Operations & Analytics
          </Link>
          <span>/</span>
          <span className="text-ink font-semibold">Digital Twin</span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/analytics"
            className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
          >
            <Activity size={14} />
            <span>Business Analytics</span>
          </Link>
        </div>
      </div>

      {/* Page Title & Intro */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-indigo-600 text-white shadow-md">
            <Sparkles size={24} />
          </div>
          <div>
            <h1 className="h-page text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              Indulge Digital Twin
            </h1>
            <p className="text-sm text-ink-soft mt-0.5">
              Live Weather Simulation & Operational Impact Engine — Stage 2
            </p>
          </div>
        </div>
      </div>

      {/* Main Interactive Panel */}
      <DigitalTwinPanel initialCity="Thane" />
    </div>
  );
}
