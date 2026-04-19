import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '@/lib/api';
import type { Conversation as ConversationType, Character } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  MessageSquare,
  Volume2,
  Speaker,
  Download,
} from 'lucide-react';
import { GenerateTab } from '@/components/generation/GenerateTab';
import { EmptyState } from '@/components/generation/EmptyState';
import { AudioTab } from '@/components/audio/AudioTab';
import { ExportTab } from '@/components/export/ExportTab';
import { SpeakersTab } from '@/components/speakers/SpeakersTab';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type Tab = 'generate' | 'audio' | 'speakers' | 'export';

const sidebarItems: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: 'generate', label: 'Generate', icon: MessageSquare },
  { id: 'audio', label: 'Audio', icon: Volume2 },
  { id: 'speakers', label: 'Speakers', icon: Speaker },
  { id: 'export', label: 'Export', icon: Download },
];

export function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const [conversation, setConversation] = useState<ConversationType | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [tab, setTab] = useState<Tab>('generate');
  const [showSampleBanner, setShowSampleBanner] = useState(false);
  const wasEmpty = useRef(true);

  const handleConversationUpdate = (conv: ConversationType) => {
    if (wasEmpty.current && conv.segments.length > 0) {
      setShowSampleBanner(true);
      wasEmpty.current = false;
    }
    setConversation(conv);
  };

  useEffect(() => {
    if (!id) return;
    api.conversations.get(id).then((conv) => {
      wasEmpty.current = conv.segments.length === 0;
      setConversation(conv);
    }).catch(console.error);
    api.characters.list().then(setCharacters).catch(console.error);
  }, [id]);

  if (!conversation) {
    return <div className="p-6 text-muted-foreground">Loading...</div>;
  }

  const convCharacters = characters.filter(c => conversation.characterIds.includes(c.id));
  const hasSegments = conversation.segments.length > 0;

  return (
    <div className="flex h-[calc(100vh-5rem)]">
      {hasSegments && (
        <aside className="w-14 border-r border-gold/10 bg-card/50 flex flex-col items-center py-4 gap-1 shrink-0">
          {sidebarItems.map(({ id: itemId, label, icon: Icon }) => (
            <Tooltip key={itemId} delayDuration={300}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setTab(itemId)}
                  className={`flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 cursor-pointer ${
                    tab === itemId ? 'sidebar-item-active' : 'sidebar-item-inactive'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-card border-gold/20">
                {label}
              </TooltipContent>
            </Tooltip>
          ))}

          <div className="mt-auto flex flex-col items-center gap-3 pb-2">
            <div className="flex flex-col items-center gap-1">
              {convCharacters.map(c => (
                <div
                  key={c.id}
                  className="w-2.5 h-2.5 rounded-full ring-1 ring-white/10"
                  style={{ backgroundColor: c.color }}
                />
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {conversation.totalTurns}
            </span>
          </div>
        </aside>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-gold/10 px-5 py-2.5 flex items-center gap-3 shrink-0 gradient-dark-gold">
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-gold-light">
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Link>
          </Button>
          <div className="h-4 w-px bg-gold/15" />
          <h1 className="text-base font-heading tracking-wider text-foreground">
            {conversation.name}
          </h1>
          <Badge variant="secondary" className="text-[10px] border-gold/15 bg-gold-muted text-gold-dim dark:text-gold-light">
            {conversation.status}
          </Badge>
        </div>

        <div className="flex-1 overflow-hidden">
          {!hasSegments ? (
            <EmptyState
              conversation={conversation}
              characters={convCharacters}
              onConversationUpdate={handleConversationUpdate}
            />
          ) : tab === 'generate' ? (
            <GenerateTab
              conversation={conversation}
              characters={convCharacters}
              onConversationUpdate={handleConversationUpdate}
              showSampleBanner={showSampleBanner}
              onSampleBannerDismiss={() => setShowSampleBanner(false)}
            />
          ) : tab === 'audio' ? (
            <AudioTab
              conversation={conversation}
              characters={convCharacters}
              onConversationUpdate={handleConversationUpdate}
            />
          ) : tab === 'speakers' ? (
            <SpeakersTab
              conversation={conversation}
              characters={convCharacters}
              onConversationUpdate={handleConversationUpdate}
            />
          ) : (
            <ExportTab
              conversation={conversation}
              characters={convCharacters}
            />
          )}
        </div>
      </div>
    </div>
  );
}
