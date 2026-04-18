import Anthropic from '@anthropic-ai/sdk';
import { readJson, getSettingsPath } from '../utils/files.js';

async function getApiKey(): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const settings = await readJson<{ anthropicApiKey?: string }>(getSettingsPath());
  if (settings?.anthropicApiKey) return settings.anthropicApiKey;
  throw new Error('No Anthropic API key configured');
}

let clientInstance: Anthropic | null = null;
let lastKey = '';

async function getClient(): Promise<Anthropic> {
  const key = await getApiKey();
  if (!clientInstance || key !== lastKey) {
    clientInstance = new Anthropic({ apiKey: key });
    lastKey = key;
  }
  return clientInstance;
}

export interface BatchRequest {
  custom_id: string;
  params: {
    model: string;
    max_tokens: number;
    system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  };
}

export interface BatchStatus {
  id: string;
  processing_status: string;
  request_counts: {
    processing: number;
    succeeded: number;
    errored: number;
    canceled: number;
    expired: number;
  };
  created_at: string;
  ended_at?: string;
}

export interface BatchResult {
  custom_id: string;
  result: {
    type: string;
    message?: {
      content: Array<{ type: string; text?: string }>;
    };
    error?: { message: string };
  };
}

export async function createBatch(requests: BatchRequest[]): Promise<BatchStatus> {
  const client = await getClient();
  const batch = await client.messages.batches.create({
    requests: requests.map(r => ({
      custom_id: r.custom_id,
      params: r.params,
    })),
  });
  return {
    id: batch.id,
    processing_status: batch.processing_status,
    request_counts: batch.request_counts,
    created_at: batch.created_at,
    ended_at: batch.ended_at ?? undefined,
  };
}

export async function getBatchStatus(batchId: string): Promise<BatchStatus> {
  const client = await getClient();
  const batch = await client.messages.batches.retrieve(batchId);
  return {
    id: batch.id,
    processing_status: batch.processing_status,
    request_counts: batch.request_counts,
    created_at: batch.created_at,
    ended_at: batch.ended_at ?? undefined,
  };
}

export async function getBatchResults(batchId: string): Promise<BatchResult[]> {
  const client = await getClient();
  const results: BatchResult[] = [];
  for await (const result of client.messages.batches.results(batchId)) {
    const msg = result.result.type === 'succeeded' && 'message' in result.result
      ? result.result.message
      : undefined;
    results.push({
      custom_id: result.custom_id,
      result: {
        type: result.result.type,
        message: msg ? {
          content: msg.content.map(c => ({
            type: c.type,
            text: c.type === 'text' ? c.text : undefined,
          })),
        } : undefined,
        error: result.result.type === 'errored' && 'error' in result.result
          ? { message: String(result.result.error) }
          : undefined,
      },
    });
  }
  return results;
}
