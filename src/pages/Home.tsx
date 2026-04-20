import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAudioEngine } from '@/contexts/AudioEngineContext';
import { Card, CardContent } from '@/components/ui/card';
import {
  MessageSquare,
  Music,
  Monitor,
  Speaker,
  Volume2,
  Users,
  Settings,
} from 'lucide-react';
import { MalevolentGodLogo } from '@/components/icons/MalevolentGodLogo';

interface QuickLink {
  to: string;
  label: string;
  description: string;
  icon: typeof MessageSquare;
}

const features: QuickLink[] = [
  {
    to: '/conversations',
    label: 'Conversations',
    description: 'Generate AI dialogues with multiple characters and render to multi-speaker audio',
    icon: MessageSquare,
  },
  {
    to: '/stems',
    label: 'Stem Player',
    description: 'Load up to 4 audio stems and play them in sync across your speakers',
    icon: Music,
  },
  {
    to: '/system',
    label: 'System Audio',
    description: 'Capture audio from any application and route it through your speaker array',
    icon: Monitor,
  },
  {
    to: '/speakers',
    label: 'Speaker Setup',
    description: 'Register, test, and manage your Bluetooth speakers',
    icon: Speaker,
  },
];

const secondaryLinks: QuickLink[] = [
  {
    to: '/characters',
    label: 'Characters',
    description: 'Manage AI conversation personas',
    icon: Users,
  },
  {
    to: '/settings',
    label: 'Settings',
    description: 'API keys, TTS provider, system config',
    icon: Settings,
  },
];

export function Home() {
  const navigate = useNavigate();
  const { speakers, connectionStatus } = useAudioEngine();
  const [convCount, setConvCount] = useState(0);

  useEffect(() => {
    api.conversations.list().then(c => setConvCount(c.length)).catch(() => {});
  }, []);

  const connectedCount = [...connectionStatus.values()].filter(Boolean).length;

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-hidden">
      <div className="flex items-center gap-4 mb-6">
        <img src="/logo.png" alt="Stichomythia" className="w-16 h-16" />
        <div>
          <img src="/title.png" alt="Stichomythia" className="h-8 mb-1" />
          <p className="text-xs text-muted-foreground max-w-xs">
            Multi-speaker Bluetooth audio platform — AI conversations, stem playback, and system audio routing.
          </p>
        </div>
      </div>

      {speakers.length > 0 && (
        <div className="flex items-center gap-3 mb-5 py-2 px-4 rounded-lg border border-gold/10 bg-card/50">
          <Volume2 className="w-3.5 h-3.5 text-gold" />
          <div className="flex items-center gap-1.5">
            {speakers.map(s => (
              <div
                key={s.id}
                className={`w-2 h-2 rounded-full ${
                  connectionStatus.get(s.id) ? 'bg-green-500 connection-dot-connected' : 'bg-red-500'
                }`}
                title={s.label}
              />
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground">
            {connectedCount}/{speakers.length} connected
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 max-w-2xl w-full mb-4">
        {features.map(({ to, label, description, icon: Icon }) => (
          <Card
            key={to}
            className="cursor-pointer transition-all duration-300 hover:border-gold/30 hover:glow-gold border-gold/8"
            onClick={() => navigate(to)}
          >
            <CardContent className="p-4 flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-gold-muted flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-heading text-xs tracking-wide mb-0.5">{label}</h3>
                <p className="text-[10px] text-muted-foreground leading-tight">{description}</p>
                {to === '/conversations' && convCount > 0 && (
                  <span className="text-[10px] text-gold-dim mt-0.5 inline-block">
                    {convCount} dialogue{convCount !== 1 ? 's' : ''}
                  </span>
                )}
                {to === '/speakers' && speakers.length === 0 && (
                  <span className="text-[10px] text-gold mt-0.5 inline-block">
                    No speakers — set up now
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 max-w-2xl w-full">
        {secondaryLinks.map(({ to, label, icon: Icon }) => (
          <button
            key={to}
            onClick={() => navigate(to)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gold/8 hover:border-gold/20 hover:bg-card/80 transition-all text-left"
          >
            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{label}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 mt-6 opacity-30">
        <MalevolentGodLogo className="w-5 h-5 text-gold" />
        <span className="text-[10px] font-heading uppercase tracking-widest text-muted-foreground">Malevolent Gods Software</span>
      </div>
    </div>
  );
}
