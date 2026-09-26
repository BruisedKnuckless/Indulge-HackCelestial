import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useInspectionReport } from '../../hooks/queries';
import { useAuth } from '../../context/AuthContext';
import { Spinner, EmptyState } from '../../components/ui';
import InspectionReportView from '../../components/inspection/InspectionReportView';

/**
 * One report page for everyone allowed to read it: the technician who did it
 * (/technician/inspections/:id/report), the listing owner and the booking
 * parties (/inspections/:id). The server decides who may see it.
 */
export default function InspectionReport() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, isLoading, error } = useInspectionReport(id);
  const isTech = user?.userType === 'inspector';
  const back = isTech ? '/technician' : '/listings';

  if (isLoading) return <Spinner label="Loading report" />;
  if (error || !data) {
    return <EmptyState title="Report not available" message="It may not exist, or you are not a party to it." action={<Link to={back} className="btn-primary">Back</Link>} />;
  }

  return (
    <div className={`${isTech ? 'max-w-3xl px-4' : 'shell'} mx-auto py-6`}>
      <Link to={back} className="link-quiet text-sm inline-flex items-center gap-1 mb-4">
        <ArrowLeft size={14} /> {isTech ? 'Queue' : 'My listings'}
      </Link>
      <div className={isTech ? '' : 'max-w-3xl'}>
        <InspectionReportView report={data} />
      </div>
    </div>
  );
}
