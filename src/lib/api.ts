import type {
  Character,
  Conversation,
  AppSettings,
  EdgeTtsVoice,
  Turn,
  DirectorInput,
  MemoryBlock,
  SpeakerConfig,
  MixerState,
} from '@/types';

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json();
}

export const api = {
  characters: {
    list: () => request<Character[]>('/characters'),
    get: (id: string) => request<Character>(`/characters/${id}`),
    create: (data: Partial<Character>) =>
      request<Character>('/characters', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Character>) =>
      request<Character>(`/characters/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/characters/${id}`, { method: 'DELETE' }),
  },

  conversations: {
    list: () => request<Conversation[]>('/conversations'),
    get: (id: string) => request<Conversation>(`/conversations/${id}`),
    create: (data: { name: string; characterIds: string[]; topicSeeds?: string[] }) =>
      request<Conversation>('/conversations', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Conversation>) =>
      request<Conversation>(`/conversations/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/conversations/${id}`, { method: 'DELETE' }),
  },

  settings: {
    get: () => request<AppSettings>('/settings'),
    update: (data: Partial<AppSettings>) =>
      request<AppSettings>('/settings', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    verifyApiKey: (apiKey: string) =>
      request<{ valid: boolean; error?: string }>('/settings/verify-api-key', {
        method: 'POST',
        body: JSON.stringify({ apiKey }),
      }),
    verifyEdgeTts: () =>
      request<{ installed: boolean; error?: string }>('/settings/verify-edge-tts', {
        method: 'POST',
      }),
    verifyOpenaiKey: (apiKey: string) =>
      request<{ valid: boolean; error?: string }>('/settings/verify-openai-key', {
        method: 'POST',
        body: JSON.stringify({ apiKey }),
      }),
    verifyFfmpeg: () =>
      request<{ installed: boolean; version?: string; error?: string }>(
        '/settings/verify-ffmpeg',
        { method: 'POST' }
      ),
  },

  tts: {
    voices: () => request<EdgeTtsVoice[]>('/tts/voices'),
    preview: async (text: string, voice: string, rate?: string, pitch?: string, provider?: string, openaiVoice?: string, openaiModel?: string, openaiSpeed?: number) => {
      const res = await fetch(`${BASE}/tts/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, rate, pitch, provider, openaiVoice, openaiModel, openaiSpeed }),
      });
      if (!res.ok) throw new Error(`TTS preview failed: ${res.status}`);
      return res.blob();
    },
    rerenderTurn: (conversationId: string, turnId: string) =>
      request<{ turnId: string; audioFile: string; durationMs: number; success: boolean }>(
        '/tts/rerender-turn',
        {
          method: 'POST',
          body: JSON.stringify({ conversationId, turnId }),
        },
      ),
  },

  generation: {
    generate: (conversationId: string, segmentCount = 1) => {
      return new EventSource(
        `${BASE}/generation/generate?conversationId=${conversationId}&segmentCount=${segmentCount}`,
      );
    },
    generateStream: async (conversationId: string, segmentCount: number, handlers: {
      onChunk?: (text: string, segmentIndex: number) => void;
      onSegmentStart?: (segmentIndex: number, segmentNumber: number) => void;
      onSegmentComplete?: (data: unknown) => void;
      onComplete?: (data: unknown) => void;
      onError?: (message: string) => void;
    }) => {
      const res = await fetch(`${BASE}/generation/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, segmentCount }),
      });

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              switch (currentEvent) {
                case 'chunk': handlers.onChunk?.(data.text, data.segmentIndex); break;
                case 'segment_start': handlers.onSegmentStart?.(data.segmentIndex, data.segmentNumber); break;
                case 'segment_complete': handlers.onSegmentComplete?.(data); break;
                case 'complete': handlers.onComplete?.(data); break;
                case 'error': handlers.onError?.(data.message); break;
              }
            } catch (e) {
              console.warn('SSE parse error, skipping line:', e);
            }
          }
        }
      }
    },
    approveSegment: (conversationId: string, segmentId: string) =>
      request<{ success: boolean }>(`/generation/approve-segment/${conversationId}/${segmentId}`, { method: 'POST' }),
    approveAll: (conversationId: string) =>
      request<{ success: boolean }>(`/generation/approve-all/${conversationId}`, { method: 'POST' }),
    editTurn: (conversationId: string, turnId: string, text: string) =>
      request<Turn>(`/generation/turn/${conversationId}/${turnId}`, {
        method: 'PUT',
        body: JSON.stringify({ text }),
      }),
    deleteTurn: (conversationId: string, turnId: string) =>
      request<{ success: boolean }>(`/generation/turn/${conversationId}/${turnId}`, { method: 'DELETE' }),
    deleteSegmentsFrom: (conversationId: string, segmentId: string) =>
      request<{ success: boolean }>(`/generation/segments-from/${conversationId}/${segmentId}`, { method: 'DELETE' }),
    submitBatch: (conversationId: string, segmentCount: number) =>
      request<{ batchId: string; requestCount: number; status: string }>('/generation/batch', {
        method: 'POST',
        body: JSON.stringify({ conversationId, segmentCount }),
      }),
    getBatchStatus: (batchId: string) =>
      request<{
        id: string;
        processing_status: string;
        request_counts: {
          processing: number;
          succeeded: number;
          errored: number;
          canceled: number;
          expired: number;
        };
      }>(`/generation/batch-status/${batchId}`),
    processBatchResults: (conversationId: string, batchId: string) =>
      request<{ segmentsAdded: number; totalSegments: number; totalTurns: number }>(
        `/generation/batch-results/${conversationId}/${batchId}`,
        { method: 'POST' },
      ),
    rerollWithDirection: async (
      conversationId: string,
      segmentId: string,
      directorInput: DirectorInput,
      handlers: {
        onChunk?: (text: string, segmentIndex: number) => void;
        onSegmentComplete?: (data: unknown) => void;
        onComplete?: (data: unknown) => void;
        onError?: (message: string) => void;
      },
    ) => {
      const res = await fetch(`${BASE}/generation/reroll-with-direction/${conversationId}/${segmentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directorInput }),
      });
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              switch (currentEvent) {
                case 'chunk': handlers.onChunk?.(data.text, data.segmentIndex); break;
                case 'segment_complete': handlers.onSegmentComplete?.(data); break;
                case 'complete': handlers.onComplete?.(data); break;
                case 'error': handlers.onError?.(data.message); break;
              }
            } catch (e) {
              console.warn('SSE parse error, skipping line:', e);
            }
          }
        }
      }
    },
    recalculatePauses: (conversationId: string) =>
      request<{ success: boolean; totalTurns: number; totalDurationMs: number }>(
        `/generation/recalculate-pauses/${conversationId}`,
        { method: 'POST' },
      ),
    getMemories: (conversationId: string) =>
      request<MemoryBlock[]>(`/generation/memories/${conversationId}`),
    triggerMemory: (conversationId: string) =>
      request<{ success: boolean; memoryCount?: number; memories?: MemoryBlock[] }>(
        `/generation/trigger-memory/${conversationId}`,
        { method: 'POST' },
      ),
  },

  speakers: {
    get: () => request<SpeakerConfig>('/speakers'),
    update: (config: SpeakerConfig) =>
      request<SpeakerConfig>('/speakers', {
        method: 'PUT',
        body: JSON.stringify(config),
      }),
  },

  mixer: {
    get: () => request<MixerState>('/mixer'),
    save: (state: MixerState) =>
      request<MixerState>('/mixer', {
        method: 'PUT',
        body: JSON.stringify(state),
      }),
  },
};
