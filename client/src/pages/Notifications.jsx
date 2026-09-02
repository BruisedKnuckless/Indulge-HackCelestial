import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useNotifications } from '../hooks/queries';
import { Spinner, EmptyState } from '../components/ui';
import { relative } from '../lib/format';

const TYPE_META = {
  booking_request: { icon: '📥', tone: 'text-link' },
  booking_status_change: { icon: '🔄', tone: 'text-success' },
  negotiation_message: { icon: '💬', tone: 'text-ink' },
  review_received: { icon: '⭐', tone: 'text-star' },
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
    <div className="page-shell py-4 max-w-[860px]">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
        <h1 className="text-page font-normal">
          Notifications
          {unread > 0 && <span className="text-body text-ink-soft ml-2">({unread} unread)</span>}
        </h1>
        {unread > 0 && (
          <button onClick={markAll} className="a-link text-base">
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
        <div className="bg-white border border-bd rounded divide-y divide-bd">
          {notifications.map((n) => {
            const meta = TYPE_META[n.type] || {};
            const body = (
              <div
                className={`flex gap-3 p-4 hover:bg-[#F7FAFA] transition-colors ${
                  n.isRead ? '' : 'bg-[#F0F7FF]'
                }`}
              >
                <span className="text-title shrink-0" aria-hidden>
                  {meta.icon || '🔔'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-base font-bold ${meta.tone || ''}`}>{n.title}</p>
                  <p className="text-base text-ink-soft">{n.message}</p>
                  <p className="text-mini text-ink-mute mt-0.5">{relative(n.createdAt)}</p>
                </div>
                {!n.isRead && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      markOne(n._id);
                    }}
                    className="a-link text-mini shrink-0 self-start"
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
