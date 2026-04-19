import { Link, useLocation } from 'react-router-dom';
import { ApiStatus } from './ApiStatus';
import { MessageSquare, Users, Settings } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: MessageSquare },
  { to: '/characters', label: 'Characters', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function NavBar() {
  const location = useLocation();

  return (
    <header className="border-b border-gold/10 bg-card/80 backdrop-blur-sm app-drag-region">
      <div className="flex items-center justify-between px-6 h-20">
        <div className="flex items-center gap-8 no-drag">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img src="/logo.png" alt="" className="h-14 w-auto" />
            <img src="/title.png" alt="Stichomythia" className="h-8" />
          </Link>
          <nav className="flex items-center gap-1">
            {navItems.map(({ to, label, icon: Icon }) => {
              const active =
                to === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all duration-200 ${
                    active
                      ? 'bg-gold-muted text-gold glow-gold-text'
                      : 'text-muted-foreground hover:text-gold-light hover:bg-gold-muted/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="no-drag">
          <ApiStatus />
        </div>
      </div>
    </header>
  );
}
