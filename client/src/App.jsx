import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';
import { useAdminAuth } from './context/AdminAuthContext';
import useNotificationSocket from './hooks/useNotificationSocket';

import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import AdminHeader from './components/admin/AdminHeader';
import ScrollToTop from './components/ScrollToTop';
import ErrorBoundary from './components/common/ErrorBoundary';
import { Spinner } from './components/ui';

// Core lightweight routes loaded eagerly
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Search from './pages/Search';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Bookings from './pages/Bookings';
import BookingDetail from './pages/BookingDetail';
import Listings from './pages/Listings';
import Account from './pages/Account';
import Profile from './pages/Profile';
import Notifications from './pages/Notifications';
import RequirementsFeed from './pages/RequirementsFeed';
import MyRFQs from './pages/MyRFQs';
import RequirementBoard from './pages/RequirementBoard';
import Payment from './pages/Payment';
import HowItWorks from './pages/HowItWorks';
import AdminLogin from './pages/AdminLogin';

// Route-based code-splitting for heavy or specialized sub-systems
const Admin = lazy(() => import('./pages/Admin'));
const Nearby = lazy(() => import('./pages/Nearby'));
const Analytics = lazy(() => import('./pages/Analytics'));
const LogisticsDashboard = lazy(() => import('./pages/LogisticsDashboard'));
const ResourceDetail = lazy(() => import('./pages/ResourceDetail'));
const ProviderProfile = lazy(() => import('./pages/ProviderProfile'));
const ListingForm = lazy(() => import('./pages/ListingForm'));
const PostRequirement = lazy(() => import('./pages/PostRequirement'));
const RequirementDetail = lazy(() => import('./pages/RequirementDetail'));
const ProcurementOrderDetail = lazy(() => import('./pages/ProcurementOrderDetail'));
const InspectorDashboard = lazy(() => import('./pages/InspectorDashboard'));
const InspectionDetail = lazy(() => import('./pages/InspectionDetail'));

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Loading your account" />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

/**
 * Public or visitor marketplace routes that logistics partners must not access.
 * If an authenticated logistics partner tries to access these, they are redirected to /logistics.
 */
function RequireBusiness({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Loading your account" />;
  if (user?.userType === 'logistics_partner') {
    return <Navigate to="/logistics" replace />;
  }
  return children;
}

/**
 * Commercial marketplace routes that strictly require a Business (seeker/provider) account.
 */
function RequireBusinessAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Loading your account" />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (user.userType === 'logistics_partner') {
    return <Navigate to="/logistics" replace />;
  }
  return children;
}

/**
 * Dedicated route guard for logistics partners.
 */
function RequireLogisticsPartner({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Loading your account" />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (user.userType !== 'logistics_partner') {
    return <Navigate to="/" replace />;
  }
  return children;
}

/**
 * Admin routes require the separate admin session (AdminAuthContext). A
 * business or logistics session grants nothing here — without an admin
 * sign-in every /admin path goes to /admin/login. The server enforces the same
 * rule: /api/admin only accepts admin tokens.
 */
function RequireAdminAuth({ children }) {
  const { admin, loading } = useAdminAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Loading your account" />;
  if (!admin) return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />;
  return children;
}

/**
 * Chrome for the admin console. The marketplace header belongs to business
 * sessions, so the console gets its own bar (same look) driven by the admin
 * session: home, platform alerts, theme switch and the admin's profile menu.
 */
function AdminShell({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <AdminHeader />
      <main className="flex-1">
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="min-h-[50vh] flex items-center justify-center py-16">
                <Spinner label="Loading view" />
              </div>
            }
          >
            {children}
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}

/** Standard chrome: grey header, white page, quiet footer. */
function Shell({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <Header />
      <main className="flex-1">
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="min-h-[50vh] flex items-center justify-center py-16">
                <Spinner label="Loading view" />
              </div>
            }
          >
            {children}
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  useNotificationSocket();

  return (
    <>
      <ScrollToTop />
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            borderRadius: '6px',
            /* CSS custom properties are resolved by the browser even inside
               JS style objects, so these automatically flip on theme change. */
            border: '1px solid rgb(var(--color-line))',
            boxShadow: 'none',
            fontSize: '14px',
            color: 'rgb(var(--color-ink))',
            backgroundColor: 'rgb(var(--color-surface-alt))',
          },
        }}
      />

      <Routes>
        {/* Auth pages render without the marketplace chrome. */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Platform admin — its own sign-in, session and chrome. */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin/*"
          element={
            <RequireAdminAuth>
              <AdminShell>
                <Routes>
                  <Route index element={<Admin />} />
                  <Route path="*" element={<Navigate to="/admin" replace />} />
                </Routes>
              </AdminShell>
            </RequireAdminAuth>
          }
        />

        {/* Field Inspector — dedicated inspection operations interface */}
        <Route
          path="/inspector"
          element={
            <Suspense
              fallback={
                <div className="min-h-screen flex items-center justify-center bg-surface">
                  <Spinner label="Loading Inspector..." />
                </div>
              }
            >
              <InspectorDashboard />
            </Suspense>
          }
        />
        <Route
          path="/inspector/:id"
          element={
            <Suspense
              fallback={
                <div className="min-h-screen flex items-center justify-center bg-surface">
                  <Spinner label="Loading Inspection..." />
                </div>
              }
            >
              <InspectionDetail />
            </Suspense>
          }
        />

        <Route
          path="*"
          element={
            <Shell>
              <Routes>
                <Route path="/" element={<RequireBusiness><Home /></RequireBusiness>} />
                <Route path="/home" element={<RequireBusiness><Home /></RequireBusiness>} />
                <Route path="/s" element={<RequireBusiness><Search /></RequireBusiness>} />
                <Route path="/nearby" element={<RequireBusiness><Nearby /></RequireBusiness>} />
                <Route path="/r/:id" element={<RequireBusiness><ResourceDetail /></RequireBusiness>} />
                <Route path="/provider/:id" element={<RequireBusiness><ProviderProfile /></RequireBusiness>} />
                <Route path="/how-it-works" element={<HowItWorks />} />

                <Route
                  path="/cart"
                  element={
                    <RequireBusinessAuth>
                      <Cart />
                    </RequireBusinessAuth>
                  }
                />
                <Route
                  path="/checkout"
                  element={
                    <RequireBusinessAuth>
                      <Checkout />
                    </RequireBusinessAuth>
                  }
                />
                <Route
                  path="/bookings/sent"
                  element={
                    <RequireBusinessAuth>
                      <Bookings direction="sent" />
                    </RequireBusinessAuth>
                  }
                />
                <Route
                  path="/bookings/received"
                  element={
                    <RequireBusinessAuth>
                      <Bookings direction="received" />
                    </RequireBusinessAuth>
                  }
                />
                <Route
                  path="/bookings/detail/:id"
                  element={
                    <RequireAuth>
                      <BookingDetail />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/payment/:bookingId"
                  element={
                    <RequireBusinessAuth>
                      <Payment />
                    </RequireBusinessAuth>
                  }
                />
                <Route
                  path="/procurement-orders/:id"
                  element={
                    <RequireBusinessAuth>
                      <ProcurementOrderDetail />
                    </RequireBusinessAuth>
                  }
                />
                <Route
                  path="/listings"
                  element={
                    <RequireBusinessAuth>
                      <Listings />
                    </RequireBusinessAuth>
                  }
                />
                <Route
                  path="/listings/new"
                  element={
                    <RequireBusinessAuth>
                      <ListingForm />
                    </RequireBusinessAuth>
                  }
                />
                <Route
                  path="/listings/:id/edit"
                  element={
                    <RequireBusinessAuth>
                      <ListingForm />
                    </RequireBusinessAuth>
                  }
                />
                <Route
                  path="/analytics"
                  element={
                    <RequireBusinessAuth>
                      <Analytics />
                    </RequireBusinessAuth>
                  }
                />
                <Route
                  path="/logistics"
                  element={
                    <RequireLogisticsPartner>
                      <LogisticsDashboard view="dashboard" />
                    </RequireLogisticsPartner>
                  }
                />
                <Route
                  path="/logistics/jobs"
                  element={
                    <RequireLogisticsPartner>
                      <LogisticsDashboard view="jobs" />
                    </RequireLogisticsPartner>
                  }
                />
                <Route
                  path="/logistics/schedule"
                  element={
                    <RequireLogisticsPartner>
                      <LogisticsDashboard view="schedule" />
                    </RequireLogisticsPartner>
                  }
                />
                <Route
                  path="/account"
                  element={
                    <RequireAuth>
                      <Account />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/account/profile"
                  element={
                    <RequireAuth>
                      <Profile />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/account/address"
                  element={
                    <RequireAuth>
                      <Profile />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/notifications"
                  element={
                    <RequireAuth>
                      <Notifications />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/requirements"
                  element={
                    <RequireBusinessAuth>
                      <MyRFQs />
                    </RequireBusinessAuth>
                  }
                />
                <Route
                  path="/requirements/new"
                  element={
                    <RequireBusinessAuth>
                      <PostRequirement />
                    </RequireBusinessAuth>
                  }
                />
                <Route
                  path="/requirements/:id/edit"
                  element={
                    <RequireBusinessAuth>
                      <PostRequirement />
                    </RequireBusinessAuth>
                  }
                />
                <Route
                  path="/requirements/board"
                  element={
                    <RequireBusinessAuth>
                      <RequirementBoard />
                    </RequireBusinessAuth>
                  }
                />
                <Route
                  path="/requirements/feed"
                  element={
                    <RequireBusinessAuth>
                      <RequirementsFeed />
                    </RequireBusinessAuth>
                  }
                />
                <Route
                  path="/requirements/mine"
                  element={
                    <RequireBusinessAuth>
                      <MyRFQs />
                    </RequireBusinessAuth>
                  }
                />
                <Route
                  path="/requirements/:id"
                  element={
                    <RequireBusinessAuth>
                      <RequirementDetail />
                    </RequireBusinessAuth>
                  }
                />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Shell>
          }
        />
      </Routes>
    </>
  );
}
