import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { NavBar } from '@/components/layout/NavBar';
import { Dashboard } from '@/pages/Dashboard';
import { Characters } from '@/pages/Characters';
import { SettingsPage } from '@/pages/Settings';
import { Setup } from '@/pages/Setup';
import { ConversationPage } from '@/pages/Conversation';
import { api } from '@/lib/api';

function AppRoutes() {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  useEffect(() => {
    api.characters.list()
      .then((chars) => setNeedsSetup(chars.length === 0))
      .catch(() => setNeedsSetup(true));
  }, []);

  if (needsSetup === null) {
    return (
      <div className="dark min-h-screen bg-background text-foreground flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="dark min-h-screen bg-background text-foreground flex flex-col">
      <NavBar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={needsSetup ? <Navigate to="/setup" replace /> : <Dashboard />} />
          <Route path="/conversation/:id" element={<ConversationPage />} />
          <Route path="/characters" element={<Characters />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/setup" element={<Setup onComplete={() => setNeedsSetup(false)} />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <TooltipProvider>
        <AppRoutes />
      </TooltipProvider>
    </BrowserRouter>
  );
}
