import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';
import useNotificationSocket from './hooks/useNotificationSocket';

import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import ScrollToTop from './components/ScrollToTop';
import ErrorBoundary from './components/common/ErrorBoundary';
import { Spinner } from './components/ui';

import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Search from './pages/Search';
import Nearby from './pages/Nearby';
import ResourceDetail from './pages/ResourceDetail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Bookings from './pages/Bookings';
import BookingDetail from './pages/BookingDetail';
import Listings from './pages/Listings';
import ListingForm from './pages/ListingForm';
import Analytics from './pages/Analytics';
import Account from './pages/Account';
import Profile from './pages/Profile';
import Notifications from './pages/Notifications';
import ProviderProfile from './pages/ProviderProfile';
import PostRequirement from './pages/PostRequirement';
import RequirementsFeed from './pages/RequirementsFeed';
import MyRFQs from './pages/MyRFQs';
import MyRequirements from './pages/MyRequirements';
import RequirementBoard from './pages/RequirementBoard';
import RequirementDetail from './pages/RequirementDetail';
import Payment from './pages/Payment';
import HowItWorks from './pages/HowItWorks';
import Admin from './pages/Admin';
import AdminLocked from './components/admin/AdminLocked';
import LogisticsDashboard from './pages/LogisticsDashboard';
import ProcurementOrderDetail from './pages/ProcurementOrderDetail';
import AIAssistantButton from './components/ai/AIAssistantButton';
import AIAssistantPage from './pages/AIAssistantPage';

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
  if (user.userType !== 'logistics_partner' && !user.isPlatformAdmin) {
    return <Navigate to="/" replace />;
  }
  return children;
}

/**
 * The admin console is gated on the server too — /api/admin answers 404 to a
 * non-admin, so a forced route would render an empty shell rather than leak
 * anything. This guard exists to keep it out of the way, not to secure it.
 */
function RequireAdmin({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Loading your account" />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  // Explain rather than silently bounce to the homepage: a console locked by
  // unset configuration is indistinguishable from one locked by design, and
  // that ambiguity is what makes a deployment hard to debug.
  if (!user.isPlatformAdmin) return <AdminLocked />;
  return children;
}

/** Standard chrome: grey header, white page, quiet footer. */
function Shell({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <Header />
      <main className="flex-1">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
      <Footer />
      {/* Floating AI assistant — only shows for authenticated business users */}
      <AIAssistantButton />
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
                  path="/assistant"
                  element={
                    <RequireBusinessAuth>
                      <AIAssistantPage />
                    </RequireBusinessAuth>
                  }
                />

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
                  path="/admin"
                  element={
                    <RequireAdmin>
                      <Admin />
                    </RequireAdmin>
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
