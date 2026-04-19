export interface EmotionalTrigger {
  topic: string;
  reaction:
    | 'irritated'
    | 'angry'
    | 'excited'
    | 'passionate'
    | 'defensive'
    | 'nostalgic'
    | 'uncomfortable'
    | 'withdrawn'
    | 'amused';
  intensity: 'mild' | 'moderate' | 'strong';
  description: string;
}

export interface Character {
  id: string;
  color: string;
  personality: string;
  speechStyle: string;
  interests: string[];
  quirks: string[];
  emotionalProfile: {
    temperament:
      | 'even-keeled'
      | 'hot-headed'
      | 'sensitive'
      | 'anxious'
      | 'cheerful'
      | 'sardonic'
      | 'oblivious';
    triggers: EmotionalTrigger[];
    recoverySpeed: 'slow' | 'medium' | 'fast';
  };
  voice: {
    ttsProvider?: 'edge-tts' | 'openai';
    edgeTtsVoice: string;
    rate: string;
    pitch: string;
    openaiVoice?: string;
    openaiModel?: string;
    openaiSpeed?: number;
  };
  systemPrompt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Turn {
  id: string;
  segmentId: string;
  conversationId: string;
  sequenceNumber: number;
  characterId: string;
  text: string;
  moodTag: string;
  audioFile?: string;
  audioDurationMs?: number;
  pauseAfterMs: number;
  status: 'draft' | 'edited' | 'approved' | 'rendered';
}

export interface DirectorInput {
  emotionalLandscape: Record<string, string>;
  suggestions: string[];
  topicSeeds: string[];
  targetTurnCount: number;
}

export interface EmotionalSummary {
  emotionalStates: Record<
    string,
    {
      emotion: string;
      intensity: number;
      valence: number;
      note: string;
    }
  >;
  unresolvedThreads: string[];
  topicsCovered: string[];
  suggestedNextDirection: string;
}

export interface Segment {
  id: string;
  conversationId: string;
  sequenceNumber: number;
  turns: Turn[];
  directorInput: DirectorInput;
  emotionalSummary: EmotionalSummary;
  rawResponse: string;
  generationMode: 'live' | 'batch';
  batchId?: string;
  createdAt: string;
  status: 'draft' | 'approved' | 'rendered';
}

export interface MemoryBlock {
  coversSegments: [number, number];
  coversTurns: [number, number];
  summary: string;
  keyTopics: string[];
  emotionalHighlights: string[];
  runningJokes: string[];
  tier: 'recent' | 'mid' | 'old';
  createdAt: string;
}

export interface GenerationSettings {
  model: 'claude-opus-4-6' | 'claude-sonnet-4-6';
  generationMode: 'live' | 'batch';
  turnsPerSegment: number;
  memorySummaryInterval: number;
  topicSeeds: string[];
  pauseRange: {
    minMs: number;
    maxMs: number;
  };
  longPauseChance: number;
}

export type ConversationStatus =
  | 'draft'
  | 'generating'
  | 'generated'
  | 'rendering'
  | 'rendered'
  | 'exported';

export interface Conversation {
  id: string;
  name: string;
  characterIds: string[];
  segments: Segment[];
  memories: MemoryBlock[];
  settings: GenerationSettings;
  createdAt: string;
  updatedAt: string;
  totalTurns: number;
  totalDurationMs?: number;
  status: ConversationStatus;
}

export interface AppSettings {
  anthropicApiKey: string;
  defaultModel: 'claude-opus-4-6' | 'claude-sonnet-4-6';
  defaultGenerationMode: 'live' | 'batch';
  turnsPerSegment: number;
  memorySummaryInterval: number;
  ttsThrottleMs: number;
  defaultPauseRange: {
    minMs: number;
    maxMs: number;
  };
  longPauseChance: number;
  dataDirectory: string;
  exportDirectory: string;
  ffmpegPath: string;
  openaiApiKey: string;
  ttsProvider: 'edge-tts' | 'openai';
  setupComplete: boolean;
}

export interface EdgeTtsVoice {
  name: string;
  gender: string;
  locale: string;
  friendlyName: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  anthropicApiKey: '',
  defaultModel: 'claude-opus-4-6',
  defaultGenerationMode: 'batch',
  turnsPerSegment: 60,
  memorySummaryInterval: 3,
  ttsThrottleMs: 750,
  defaultPauseRange: { minMs: 300, maxMs: 2000 },
  longPauseChance: 0.1,
  dataDirectory: './data',
  exportDirectory: './exports',
  ffmpegPath: 'ffmpeg',
  openaiApiKey: '',
  ttsProvider: 'edge-tts' as const,
  setupComplete: false,
};

export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  model: 'claude-opus-4-6',
  generationMode: 'batch',
  turnsPerSegment: 60,
  memorySummaryInterval: 3,
  topicSeeds: [],
  pauseRange: { minMs: 300, maxMs: 2000 },
  longPauseChance: 0.1,
};
