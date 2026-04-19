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
    <header className="border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="flex items-center justify-between px-6 h-14">
        <div className="flex items-center gap-8">
          <Link to="/" className="font-heading text-lg font-semibold tracking-widest uppercase text-neon-cyan hover:text-signal-magenta transition-colors">
            Stichomythia
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
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <ApiStatus />
      </div>
    </header>
  );
}
