import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Inbox, RefreshCw, MessageSquare, Star, Bell } from 'lucide-react';
import api from '../api/client';
import { useNotifications } from '../hooks/queries';
import { Spinner, EmptyState } from '../components/ui';
import { relative } from '../lib/format';

/* Each notification type gets a distinct accent icon box */
const TYPE_META = {
  booking_request:      { Icon: Inbox,        boxClass: 'icon-box-indigo',  dot: 'bg-indigo' },
  booking_status_change:{ Icon: RefreshCw,     boxClass: 'icon-box-green',   dot: 'bg-green-accent' },
  negotiation_message:  { Icon: MessageSquare, boxClass: 'icon-box-teal',    dot: 'bg-teal' },
  review_received:      { Icon: Star,          boxClass: 'icon-box-amber',   dot: 'bg-amber-accent' },
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
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-6">
        <div>
          <h1 className="h-page">
            Notifications
            {unread > 0 && (
              <span className="ml-2 inline-flex items-center h-6 px-2 rounded-full text-xs font-semibold bg-red-accent/12 text-red-accent border border-red-accent/25">
                {unread} unread
              </span>
            )}
          </h1>
        </div>
        {unread > 0 && (
          <button onClick={markAll} className="link text-sm">
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
        <div className="card overflow-hidden p-0 divide-y divide-line">
          {notifications.map((n) => {
            const meta = TYPE_META[n.type] || { Icon: Bell, boxClass: 'icon-box-muted', dot: 'bg-ink-mute' };
            const IconComponent = meta.Icon || Bell;
            const body = (
              <div
                className={`flex items-start gap-3.5 p-4 transition-colors duration-150
                  hover:bg-surface-sunk/50
                  ${n.isRead ? '' : 'bg-indigo/5 dark:bg-indigo/10'}`}
              >
                {/* Accent icon container */}
                <div className={`icon-box w-9 h-9 rounded-xl shrink-0 ${meta.boxClass}`}>
                  <IconComponent size={15} strokeWidth={1.8} />
                </div>

                <div className="flex-1 min-w-0">
                  {/* Unread dot + title */}
                  <div className="flex items-center gap-2">
                    {!n.isRead && (
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
                    )}
                    <p className="text-sm font-semibold leading-snug">{n.title}</p>
                  </div>
                  <p className="text-sm text-ink-soft mt-0.5">{n.message}</p>
                  <p className="text-xs text-ink-mute mt-1">{relative(n.createdAt)}</p>
                </div>

                {!n.isRead && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      markOne(n._id);
                    }}
                    className="link text-xs shrink-0 self-start text-ink-mute hover:text-ink"
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
