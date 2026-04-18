import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '@/lib/api';
import type { Conversation as ConversationType, Character } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import { GenerateTab } from '@/components/generation/GenerateTab';
import { EmptyState } from '@/components/generation/EmptyState';

type Tab = 'generate' | 'audio' | 'export';

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
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="border-b px-6 py-3 flex items-center gap-4 shrink-0">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Dashboard
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">{conversation.name}</h1>
        <div className="flex items-center gap-1.5">
          {convCharacters.map(c => (
            <div
              key={c.id}
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: c.color }}
            />
          ))}
        </div>
        <span className="text-sm text-muted-foreground">
          {conversation.totalTurns} turns
        </span>
        <Badge variant="secondary">{conversation.status}</Badge>

        {hasSegments && (
          <div className="ml-auto flex gap-1">
            {(['generate', 'audio', 'export'] as Tab[]).map(t => (
              <Button
                key={t}
                variant={tab === t ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setTab(t)}
                className="capitalize"
              >
                {t}
              </Button>
            ))}
          </div>
        )}
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
          <div className="p-6 text-muted-foreground">Audio tab coming in Phase 4</div>
        ) : (
          <div className="p-6 text-muted-foreground">Export tab coming in Phase 5</div>
        )}
      </div>
    </div>
  );
}
