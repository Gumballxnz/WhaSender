import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';
import Layout from './components/Layout';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Invite from './pages/Invite';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import Dispatch from './pages/Dispatch';
import Settings from './pages/Settings';
import Files from './pages/Files';
import Generator from './pages/Generator';
import Validator from './pages/Validator';
import Team from './pages/Team';
import Profile from './pages/Profile';

function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/invite" element={<Invite />} />
        <Route path="/invite/:code" element={<Invite />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="validator" element={<Validator />} />
          <Route path="files" element={<Files />} />
          <Route path="generator" element={<Generator />} />
          <Route path="dispatch" element={<Dispatch />} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="team" element={<Team />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
