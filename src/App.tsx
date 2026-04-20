import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AudioEngineProvider } from '@/contexts/AudioEngineContext';
import { NavBar } from '@/components/layout/NavBar';
import { SpeakerHub } from '@/components/mixer/SpeakerHub';
import { Home } from '@/pages/Home';
import { Dashboard } from '@/pages/Dashboard';
import { Characters } from '@/pages/Characters';
import { SettingsPage } from '@/pages/Settings';
import { Setup } from '@/pages/Setup';
import { ConversationPage } from '@/pages/Conversation';
import { StemPlayer } from '@/pages/StemPlayer';
import { SystemAudio } from '@/pages/SystemAudio';
import { Speakers } from '@/pages/Speakers';
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
    <div className="dark h-screen bg-background text-foreground flex flex-col overflow-hidden">
      <AudioEngineProvider>
        <NavBar />
        <main className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={needsSetup ? <Navigate to="/setup" replace /> : <Home />} />
            <Route path="/conversations" element={<Dashboard />} />
            <Route path="/conversation/:id" element={<ConversationPage />} />
            <Route path="/stems" element={<StemPlayer />} />
            <Route path="/system" element={<SystemAudio />} />
            <Route path="/speakers" element={<Speakers />} />
            <Route path="/characters" element={<Characters />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/setup" element={<Setup onComplete={() => setNeedsSetup(false)} />} />
          </Routes>
        </main>
        <SpeakerHub />
      </AudioEngineProvider>
    </div>
  );
}

function SplashScreen({ onDone }: { onDone: () => void }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 2000);
    const doneTimer = setTimeout(onDone, 2800);
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer); };
  }, [onDone]);

  return (
    <div
      className={`fixed inset-0 z-50 bg-black flex items-center justify-center transition-opacity duration-700 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <img src="/mgsoft.png" alt="Malevolent Gods Software" className="max-w-lg w-full px-8" />
    </div>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <BrowserRouter>
      <TooltipProvider>
        {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
        <AppRoutes />
      </TooltipProvider>
    </BrowserRouter>
  );
}
