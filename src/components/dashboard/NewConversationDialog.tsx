import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { Character, Conversation } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (conv: Conversation) => void;
}

export function NewConversationDialog({ open, onOpenChange, onCreated }: Props) {
  const [name, setName] = useState('');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [startingTopic, setStartingTopic] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      api.characters.list().then(setCharacters).catch(console.error);
    }
  }, [open]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!name.trim() || selected.size !== 4) return;
    setCreating(true);
    try {
      const topicSeeds = startingTopic.trim()
        ? startingTopic.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      const conv = await api.conversations.create({
        name: name.trim(),
        characterIds: Array.from(selected),
        topicSeeds,
      });
      onCreated(conv);
      onOpenChange(false);
      setName('');
      setSelected(new Set());
      setStartingTopic('');
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="conv-name">Name</Label>
            <Input
              id="conv-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Coffee Shop Talk"
            />
          </div>

          <div>
            <Label htmlFor="conv-topic">Starting Topic (optional)</Label>
            <Input
              id="conv-topic"
              value={startingTopic}
              onChange={(e) => setStartingTopic(e.target.value)}
              placeholder="e.g. childhood hobbies, cooking, travel"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Comma-separated. Guides the opening conversation.
            </p>
          </div>

          <div>
            <Label>Select 4 Characters</Label>
            <p className="text-xs text-muted-foreground mb-2">
              {selected.size}/4 selected
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {characters.map((char) => (
                <label
                  key={char.id}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/50 cursor-pointer"
                >
                  <Checkbox
                    checked={selected.has(char.id)}
                    onCheckedChange={() => toggle(char.id)}
                    disabled={!selected.has(char.id) && selected.size >= 4}
                  />
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: char.color }}
                  />
                  <span className="text-sm">
                    {char.personality.slice(0, 40) || 'Unnamed character'}
                    {char.personality.length > 40 ? '...' : ''}
                  </span>
                </label>
              ))}
              {characters.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No characters yet. Create some first.
                </p>
              )}
            </div>
          </div>

          <Button
            onClick={handleCreate}
            disabled={!name.trim() || selected.size !== 4 || creating}
            className="w-full"
          >
            {creating ? 'Creating...' : 'Create Conversation'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
