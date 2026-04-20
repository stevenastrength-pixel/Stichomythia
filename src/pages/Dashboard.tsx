import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import type { Conversation } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Trash2 } from 'lucide-react';
import { NewConversationDialog } from '@/components/dashboard/NewConversationDialog';

export function Dashboard() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.conversations.list().then(setConversations).catch(console.error);
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 shrink-0">
        <div>
          <h1 className="text-lg font-heading tracking-wider text-foreground">
            Your Conversations
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {conversations.length} dialogue{conversations.length !== 1 ? 's' : ''} in progress
          </p>
        </div>
        <Button
          onClick={() => setShowNew(true)}
          className="gradient-gold text-black font-semibold glow-gold hover:glow-gold-strong transition-all duration-300"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Conversation
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-w-6xl">
        {conversations.map((conv) => (
          <Card
            key={conv.id}
            className="cursor-pointer transition-all duration-300 hover:border-gold/30 hover:glow-gold group border-gold/8"
            onClick={() => navigate(`/conversation/${conv.id}`)}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <h3 className="font-heading text-sm tracking-wide mb-2">{conv.name}</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity -mt-1 -mr-2 h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(conv);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                <span>{conv.totalTurns} turns</span>
                {conv.totalDurationMs && (
                  <>
                    <span className="text-gold/30">&middot;</span>
                    <span>
                      {Math.round(conv.totalDurationMs / 60000)}m audio
                    </span>
                  </>
                )}
              </div>
              <Badge variant="secondary" className="border-gold/15 bg-gold-muted text-gold-light text-[10px]">
                {conv.status}
              </Badge>
            </CardContent>
          </Card>
        ))}

        <Card
          className="cursor-pointer border-dashed border-gold/15 hover:border-gold/30 hover:glow-gold transition-all duration-300"
          onClick={() => setShowNew(true)}
        >
          <CardContent className="p-5 flex items-center justify-center min-h-[120px]">
            <div className="text-center text-muted-foreground">
              <Plus className="w-8 h-8 mx-auto mb-2 text-gold/40" />
              <span className="text-sm">Create New</span>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>

      <NewConversationDialog
        open={showNew}
        onOpenChange={setShowNew}
        onCreated={(conv) => {
          setConversations((prev) => [conv, ...prev]);
          navigate(`/conversation/${conv.id}`);
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="border-gold/15">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{deleteTarget?.name}&rdquo; and all its segments, audio, and export data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteTarget) return;
                setDeleting(true);
                try {
                  await api.conversations.delete(deleteTarget.id);
                  setConversations(prev => prev.filter(c => c.id !== deleteTarget.id));
                } catch (err) {
                  console.error('Failed to delete:', err);
                }
                setDeleting(false);
                setDeleteTarget(null);
              }}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
