import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { APP_FULL_NAME } from '@vcc/shared';

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/play', label: 'Play' },
  { to: '/cards', label: 'Cards' },
  { to: '/leaderboard', label: 'Leaderboard' },
];

export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 bg-vcc-bg/80 backdrop-blur-lg border-b border-vcc-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-vcc-gold to-amber-600 flex items-center justify-center font-display font-bold text-vcc-bg text-sm group-hover:animate-pulse-glow">
                VCC
              </div>
              <span className="font-display font-bold text-lg hidden sm:block">{APP_FULL_NAME}</span>
            </Link>

            <nav className="flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname === link.to
                      ? 'bg-vcc-gold/10 text-vcc-gold'
                      : 'text-vcc-muted hover:text-vcc-text hover:bg-vcc-surface'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-3">
              {user ? (
                <>
                  <Link to="/profile" className="text-sm text-vcc-muted hover:text-vcc-gold transition-colors">
                    {user.displayName}
                    <span className="ml-2 text-vcc-gold">{user.rating}</span>
                  </Link>
                  <button onClick={logout} className="btn-secondary text-sm py-2 px-4">
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className="btn-secondary text-sm py-2 px-4">Login</Link>
                  <Link to="/register" className="btn-primary text-sm py-2 px-4">Sign Up</Link>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-vcc-border py-6 text-center text-vcc-muted text-sm">
        VCC — Virtual Card Combat &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
