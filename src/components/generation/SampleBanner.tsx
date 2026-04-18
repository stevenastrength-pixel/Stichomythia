import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import type { Conversation } from '@/types';
import { Button } from '@/components/ui/button';
import { Check, ArrowRight, RotateCcw } from 'lucide-react';

interface Props {
  conversation: Conversation;
  onConversationUpdate: (conv: Conversation) => void;
  onDismiss: () => void;
}

export function SampleBanner({ conversation, onConversationUpdate, onDismiss }: Props) {
  const navigate = useNavigate();

  const handleDiscard = async () => {
    for (const segment of [...conversation.segments].reverse()) {
      await api.generation.deleteSegmentsFrom(conversation.id, segment.id);
    }
    const updated = await api.conversations.get(conversation.id);
    onConversationUpdate(updated);
    navigate('/characters');
  };

  return (
    <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Check className="w-4 h-4 text-green-500" />
        <span className="text-sm font-medium">Sample ready</span>
        <span className="text-sm text-muted-foreground">
          — {conversation.totalTurns} turns generated
        </span>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onDismiss}>
          <ArrowRight className="w-3 h-3 mr-1" />
          Keep & Continue Generating
        </Button>
        <Button size="sm" variant="outline" onClick={handleDiscard}>
          <RotateCcw className="w-3 h-3 mr-1" />
          Discard & Tweak Characters
        </Button>
      </div>
    </div>
  );
}
