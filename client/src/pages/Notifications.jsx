import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Inbox,
  RefreshCw,
  MessageSquare,
  Star,
  Bell,
  Megaphone,
  Layers,
  CheckCircle2,
  Zap,
  Truck,
  Package,
} from 'lucide-react';
import api from '../api/client';
import { useNotifications } from '../hooks/queries';
import { Spinner, EmptyState } from '../components/ui';
import { relative } from '../lib/format';

/* Each notification type gets a distinct accent icon box */
const TYPE_META = {
  booking_request:       { Icon: Inbox,          boxClass: 'icon-box-indigo', dot: 'bg-indigo' },
  booking_status_change: { Icon: RefreshCw,      boxClass: 'icon-box-green',  dot: 'bg-green-accent' },
  negotiation_message:   { Icon: MessageSquare,  boxClass: 'icon-box-teal',   dot: 'bg-teal' },
  review_received:       { Icon: Star,           boxClass: 'icon-box-amber',  dot: 'bg-amber-accent' },
  rfq_match:             { Icon: Megaphone,      boxClass: 'icon-box-purple', dot: 'bg-purple-500' },
  proposal_received:     { Icon: Layers,         boxClass: 'icon-box-indigo', dot: 'bg-indigo' },
  proposal_accepted:     { Icon: CheckCircle2,   boxClass: 'icon-box-green',  dot: 'bg-green-accent' },
  recovery_opportunity:  { Icon: Zap,            boxClass: 'icon-box-amber',  dot: 'bg-amber-500' },
  logistics_update:      { Icon: Truck,          boxClass: 'icon-box-teal',   dot: 'bg-teal' },
  procurement_order:     { Icon: Package,        boxClass: 'icon-box-purple', dot: 'bg-purple-500' },
};

export default function Notifications() {
  const { data, isLoading } = useNotifications();
  const qc = useQueryClient();
  const [filterMode, setFilterMode] = useState('all');

  const allNotifications = data?.notifications || [];
  const unread = data?.unreadCount || 0;

  const notifications =
    filterMode === 'unread' ? allNotifications.filter((n) => !n.isRead) : allNotifications;

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
          <button
            type="button"
            onClick={markAll}
            aria-label="Mark all notifications as read"
            className="link text-sm font-medium"
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-line pb-3">
        <button
          type="button"
          onClick={() => setFilterMode('all')}
          className={`btn-sm text-xs rounded-lg px-3 py-1 font-medium transition-colors ${
            filterMode === 'all'
              ? 'bg-surface-sunk text-ink font-semibold border border-line'
              : 'text-ink-mute hover:text-ink'
          }`}
        >
          All ({allNotifications.length})
        </button>
        <button
          type="button"
          onClick={() => setFilterMode('unread')}
          className={`btn-sm text-xs rounded-lg px-3 py-1 font-medium transition-colors ${
            filterMode === 'unread'
              ? 'bg-surface-sunk text-ink font-semibold border border-line'
              : 'text-ink-mute hover:text-ink'
          }`}
        >
          Unread ({unread})
        </button>
      </div>

      {isLoading ? (
        <Spinner label="Loading notifications" />
      ) : notifications.length === 0 ? (
        <EmptyState
          title={filterMode === 'unread' ? 'No unread notifications' : 'Nothing to catch up on'}
          message={
            filterMode === 'unread'
              ? 'You are all caught up! Switch to All to see past notifications.'
              : 'Request updates, messages, RFQ proposals and review alerts will show up here as they happen.'
          }
        />
      ) : (
        <div className="card overflow-hidden p-0 divide-y divide-line">
          {notifications.map((n) => {
            const meta = TYPE_META[n.type] || { Icon: Bell, boxClass: 'icon-box-muted', dot: 'bg-ink-mute' };
            const IconComponent = meta.Icon || Bell;

            const targetLink = n.relatedBooking
              ? `/bookings/detail/${n.relatedBooking}`
              : n.relatedRequirement
              ? `/requirements/${n.relatedRequirement}`
              : n.relatedLogisticsJob
              ? `/logistics`
              : null;

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
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      markOne(n._id);
                    }}
                    aria-label={`Mark "${n.title}" as read`}
                    className="link text-xs shrink-0 self-start text-ink-mute hover:text-ink px-1.5 py-0.5"
                  >
                    Mark read
                  </button>
                )}
              </div>
            );

            return targetLink ? (
              <Link key={n._id} to={targetLink} className="block hover:no-underline">
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
