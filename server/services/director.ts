interface EmotionalSummary {
  emotionalStates: Record<string, {
    emotion: string;
    intensity: number;
    valence: number;
    note: string;
  }>;
  unresolvedThreads: string[];
  topicsCovered: string[];
  suggestedNextDirection: string;
}

interface DirectorInput {
  emotionalLandscape: Record<string, string>;
  suggestions: string[];
  topicSeeds: string[];
  targetTurnCount: number;
}

export function buildFirstSegmentDirection(
  topicSeeds: string[],
  targetTurnCount: number,
): DirectorInput {
  const suggestions: string[] = [];

  if (topicSeeds.length > 0) {
    suggestions.push(`Start the conversation around ${topicSeeds[0]} — someone brings it up naturally`);
    if (topicSeeds.length > 1) {
      suggestions.push(`The conversation could also touch on ${topicSeeds.slice(1).join(', ')}`);
    }
  } else {
    suggestions.push('Start with casual small talk — someone brings up something on their mind');
  }

  return {
    emotionalLandscape: {
      'Person A': 'relaxed, settling in',
      'Person B': 'upbeat, ready to chat',
      'Person C': 'calm, listening',
      'Person D': 'alert, in a good mood',
    },
    suggestions,
    topicSeeds,
    targetTurnCount,
  };
}

export function buildNextSegmentDirection(
  previousSummary: EmotionalSummary,
  topicSeeds: string[],
  coveredTopics: string[],
  targetTurnCount: number,
): DirectorInput {
  const emotionalLandscape: Record<string, string> = {};
  for (const [label, state] of Object.entries(previousSummary.emotionalStates)) {
    const intensityWord =
      state.intensity > 0.7 ? 'very' :
      state.intensity > 0.4 ? 'somewhat' :
      'mildly';
    const note = state.note ? ` — ${state.note}` : '';
    emotionalLandscape[label] = `${intensityWord} ${state.emotion}${note}`;
  }

  const suggestions: string[] = [];

  if (previousSummary.suggestedNextDirection) {
    suggestions.push(previousSummary.suggestedNextDirection);
  }

  if (previousSummary.unresolvedThreads.length > 0) {
    const thread = previousSummary.unresolvedThreads[
      Math.floor(Math.random() * previousSummary.unresolvedThreads.length)
    ];
    suggestions.push(`The unresolved thread about "${thread}" could resurface`);
  }

  const unusedSeeds = topicSeeds.filter(s => !coveredTopics.includes(s));
  const seedsToUse = unusedSeeds.length > 0 ? unusedSeeds : topicSeeds;

  return {
    emotionalLandscape,
    suggestions,
    topicSeeds: seedsToUse,
    targetTurnCount,
  };
}
