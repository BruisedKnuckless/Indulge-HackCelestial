import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import DigitalTwinPanel from '../components/digital-twin/DigitalTwinPanel';

export default function DigitalTwin() {
  return <main className="shell pt-7 pb-16">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6 text-sm text-ink-soft"><nav aria-label="Breadcrumb"><Link to="/">Home</Link><span className="mx-3">/</span><span className="text-ink">Digital Twin</span></nav><Link to="/analytics" className="inline-flex items-center gap-1.5">Business analytics <ArrowUpRight size={15}/></Link></div>
    <header className="mb-7"><p className="text-xs font-semibold tracking-widest uppercase text-indigo-600 dark:text-indigo-400 mb-2">Digital Twin · Operations planning</p><h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-ink">Plan ahead of the weather.</h1><p className="text-sm text-ink-soft mt-3 max-w-2xl leading-relaxed">Assess weather disruption across your resources, bookings and deliveries. Compare scenarios and identify what needs attention before you act.</p></header>
    <DigitalTwinPanel initialCity="Thane"/>
  </main>;
}
