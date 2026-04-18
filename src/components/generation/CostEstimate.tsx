interface Props {
  model: string;
  mode: string;
  segmentCount: number;
  turnsPerSegment: number;
  existingSegments: number;
}

const PRICING = {
  'claude-opus-4-6': {
    inputPer1M: 15,
    outputPer1M: 75,
    cacheReadPer1M: 1.875,
  },
  'claude-sonnet-4-6': {
    inputPer1M: 3,
    outputPer1M: 15,
    cacheReadPer1M: 0.375,
  },
};

export function CostEstimate({ model, mode, segmentCount, turnsPerSegment, existingSegments }: Props) {
  const pricing = PRICING[model as keyof typeof PRICING] ?? PRICING['claude-opus-4-6'];
  const batchMultiplier = mode === 'batch' ? 0.5 : 1;

  const cachedInputPerSeg = 5000;
  const freshInputPerSeg = 3000;
  const outputPerSeg = turnsPerSegment * 100;

  const cachedCost = (segmentCount * cachedInputPerSeg / 1_000_000) * pricing.cacheReadPer1M * batchMultiplier;
  const freshCost = (segmentCount * freshInputPerSeg / 1_000_000) * pricing.inputPer1M * batchMultiplier;
  const outputCost = (segmentCount * outputPerSeg / 1_000_000) * pricing.outputPer1M * batchMultiplier;
  const haikuCost = segmentCount * 0.0004;

  const total = cachedCost + freshCost + outputCost + haikuCost;

  const estimatedTurns = segmentCount * turnsPerSegment;
  const estimatedMinutes = Math.round(estimatedTurns * 5 / 60);

  return (
    <div className="text-xs text-muted-foreground bg-muted/30 rounded px-3 py-2 space-y-0.5">
      <div className="flex justify-between">
        <span>Est. cost:</span>
        <span className="font-medium text-foreground">~${total.toFixed(2)}</span>
      </div>
      <div className="flex justify-between">
        <span>Est. turns:</span>
        <span>~{estimatedTurns}</span>
      </div>
      <div className="flex justify-between">
        <span>Est. audio:</span>
        <span>~{estimatedMinutes}min</span>
      </div>
      {mode === 'batch' && (
        <div className="text-green-500/80">50% batch discount applied</div>
      )}
    </div>
  );
}
