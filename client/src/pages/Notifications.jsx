import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Inbox, RefreshCw, MessageSquare, Star, Bell } from 'lucide-react';
import api from '../api/client';
import { useNotifications } from '../hooks/queries';
import { Spinner, EmptyState } from '../components/ui';
import { relative } from '../lib/format';

const TYPE_META = {
  booking_request: { Icon: Inbox, tone: 'text-ink' },
  booking_status_change: { Icon: RefreshCw, tone: 'text-success' },
  negotiation_message: { Icon: MessageSquare, tone: 'text-ink' },
  review_received: { Icon: Star, tone: 'text-amber-500' },
};

export default function Notifications() {
  const { data, isLoading } = useNotifications();
  const qc = useQueryClient();

  const notifications = data?.notifications || [];
  const unread = data?.unreadCount || 0;

  const markAll = async () => {
    await api.patch('/notifications/read-all');
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markOne = async (id) => {
    await api.patch(`/notifications/${id}/read`);
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <div className="shell pt-12 pb-20 max-w-prose">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
        <h1 className="h-page">
          Notifications
          {unread > 0 && <span className="text-base text-ink-soft ml-2">({unread} unread)</span>}
        </h1>
        {unread > 0 && (
          <button onClick={markAll} className="link text-base">
            Mark all as read
          </button>
        )}
      </div>

      {isLoading ? (
        <Spinner label="Loading notifications" />
      ) : notifications.length === 0 ? (
        <EmptyState
          title="Nothing to catch up on"
          message="Request updates, messages and reviews will show up here as they happen."
        />
      ) : (
        <div className="bg-surface-alt border border-line rounded divide-y divide-line">
          {notifications.map((n) => {
            const meta = TYPE_META[n.type] || { Icon: Bell, tone: 'text-ink-soft' };
            const IconComponent = meta.Icon || Bell;
            const body = (
              <div
                className={`flex items-start gap-3.5 p-4 hover:bg-surface-sunk transition-colors ${
                  n.isRead ? '' : 'bg-surface-sunk/60'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-surface-sunk border border-line flex items-center justify-center text-ink-soft shrink-0">
                  <IconComponent size={16} className={meta.tone || 'text-ink-soft'} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-base font-semibold ${meta.tone || ''}`}>{n.title}</p>
                  <p className="text-base text-ink-soft">{n.message}</p>
                  <p className="text-xs text-ink-mute mt-0.5">{relative(n.createdAt)}</p>
                </div>
                {!n.isRead && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      markOne(n._id);
                    }}
                    className="link text-xs shrink-0 self-start"
                  >
                    Mark read
                  </button>
                )}
              </div>
            );

            return n.relatedBooking ? (
              <Link key={n._id} to={`/bookings/detail/${n.relatedBooking}`} className="block">
                {body}
              </Link>
            ) : (
              <div key={n._id}>{body}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
