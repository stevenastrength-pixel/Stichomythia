import { useState } from 'react';
import type { DirectorInput } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Trash2, Plus } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  directorInput: DirectorInput;
  onSave: (input: DirectorInput) => void;
}

export function EditDirectionModal({ open, onOpenChange, directorInput, onSave }: Props) {
  const [landscape, setLandscape] = useState<Record<string, string>>({ ...directorInput.emotionalLandscape });
  const [suggestions, setSuggestions] = useState<string[]>([...directorInput.suggestions]);
  const [topicSeeds, setTopicSeeds] = useState<string[]>([...directorInput.topicSeeds]);
  const [turnCount, setTurnCount] = useState(directorInput.targetTurnCount);

  const handleSave = () => {
    onSave({
      emotionalLandscape: landscape,
      suggestions: suggestions.filter(s => s.trim()),
      topicSeeds: topicSeeds.filter(s => s.trim()),
      targetTurnCount: turnCount,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Direction</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">Emotional Landscape</Label>
            {Object.entries(landscape).map(([label, desc]) => (
              <div key={label} className="flex gap-2 mb-2">
                <span className="text-sm text-muted-foreground w-20 shrink-0 pt-2">{label}:</span>
                <Input
                  value={desc}
                  onChange={(e) => setLandscape(prev => ({ ...prev, [label]: e.target.value }))}
                  className="text-sm"
                />
              </div>
            ))}
          </div>

          <div>
            <Label className="mb-2 block">Suggestions</Label>
            {suggestions.map((s, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <Input
                  value={s}
                  onChange={(e) => {
                    const next = [...suggestions];
                    next[i] = e.target.value;
                    setSuggestions(next);
                  }}
                  className="text-sm"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setSuggestions(suggestions.filter((_, j) => j !== i))}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSuggestions([...suggestions, ''])}
            >
              <Plus className="w-3 h-3 mr-1" /> Add
            </Button>
          </div>

          <div>
            <Label className="mb-2 block">Topic Seeds</Label>
            <div className="flex flex-wrap gap-2">
              {topicSeeds.map((s, i) => (
                <div key={i} className="flex gap-1">
                  <Input
                    value={s}
                    onChange={(e) => {
                      const next = [...topicSeeds];
                      next[i] = e.target.value;
                      setTopicSeeds(next);
                    }}
                    className="text-sm w-32"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setTopicSeeds(topicSeeds.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setTopicSeeds([...topicSeeds, ''])}
              >
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Target Turn Count</Label>
            <Input
              type="number"
              min={10}
              max={120}
              value={turnCount}
              onChange={(e) => setTurnCount(parseInt(e.target.value) || 60)}
              className="w-24"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save & Regenerate</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
