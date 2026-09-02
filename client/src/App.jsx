import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';
import useNotificationSocket from './hooks/useNotificationSocket';

import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import { Spinner } from './components/ui';

import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Search from './pages/Search';
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

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Loading your account" />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

/** Standard chrome: header, page body on the gray ground, footer. */
function Shell({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-ground">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

export default function App() {
  useNotificationSocket();

  return (
    <>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            borderRadius: '8px',
            border: '1px solid #D5D9D9',
            fontSize: '14px',
            color: '#0F1111',
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
                <Route path="/" element={<Home />} />
                <Route path="/s" element={<Search />} />
                <Route path="/r/:id" element={<ResourceDetail />} />
                <Route path="/provider/:id" element={<ProviderProfile />} />

                <Route
                  path="/cart"
                  element={
                    <RequireAuth>
                      <Cart />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/checkout"
                  element={
                    <RequireAuth>
                      <Checkout />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/bookings/sent"
                  element={
                    <RequireAuth>
                      <Bookings direction="sent" />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/bookings/received"
                  element={
                    <RequireAuth>
                      <Bookings direction="received" />
                    </RequireAuth>
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
                  path="/listings"
                  element={
                    <RequireAuth>
                      <Listings />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/listings/new"
                  element={
                    <RequireAuth>
                      <ListingForm />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/listings/:id/edit"
                  element={
                    <RequireAuth>
                      <ListingForm />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/analytics"
                  element={
                    <RequireAuth>
                      <Analytics />
                    </RequireAuth>
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
                  path="/requirements/new"
                  element={
                    <RequireAuth>
                      <PostRequirement />
                    </RequireAuth>
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
