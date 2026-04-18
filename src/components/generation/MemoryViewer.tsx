import type { MemoryBlock } from '@/types';
import { Badge } from '@/components/ui/badge';

interface Props {
  memories: MemoryBlock[];
}

const TIER_COLORS = {
  recent: 'bg-green-500/10 text-green-500 border-green-500/30',
  mid: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
  old: 'bg-muted text-muted-foreground border-muted',
};

export function MemoryViewer({ memories }: Props) {
  if (memories.length === 0) {
    return (
      <div>
        <h4 className="text-sm font-medium mb-2">Memory</h4>
        <p className="text-xs text-muted-foreground">
          No memories yet. Summaries are created automatically every few segments.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-sm font-medium mb-2">Memory ({memories.length} blocks)</h4>
      <div className="space-y-3">
        {memories.map((mem, i) => (
          <div key={i} className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`text-[10px] ${TIER_COLORS[mem.tier]}`}>
                {mem.tier}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                Seg {mem.coversSegments[0] + 1}-{mem.coversSegments[1] + 1}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {mem.summary}
            </p>
            {mem.keyTopics.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {mem.keyTopics.map((topic, j) => (
                  <Badge key={j} variant="outline" className="text-[10px]">
                    {topic}
                  </Badge>
                ))}
              </div>
            )}
            {mem.runningJokes.length > 0 && (
              <div className="text-[10px] text-muted-foreground">
                Running jokes: {mem.runningJokes.join(', ')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
