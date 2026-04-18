import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import type { Conversation } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Check, X } from 'lucide-react';

interface BatchStatus {
  id: string;
  processing_status: string;
  request_counts: {
    processing: number;
    succeeded: number;
    errored: number;
    canceled: number;
    expired: number;
  };
}

interface Props {
  conversationId: string;
  batchId: string;
  onComplete: (conv: Conversation) => void;
  onError: (message: string) => void;
}

export function BatchProgress({ conversationId, batchId, onComplete, onError }: Props) {
  const [status, setStatus] = useState<BatchStatus | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const s = await api.generation.getBatchStatus(batchId);
        setStatus(s);

        if (s.processing_status === 'ended') {
          if (intervalRef.current) clearInterval(intervalRef.current);
          await api.generation.processBatchResults(conversationId, batchId);
          const conv = await api.conversations.get(conversationId);
          onComplete(conv);
        }
      } catch (err) {
        onError(String(err));
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [batchId, conversationId]);

  const total = status
    ? status.request_counts.processing + status.request_counts.succeeded +
      status.request_counts.errored + status.request_counts.canceled + status.request_counts.expired
    : 0;

  return (
    <div className="flex items-center justify-center h-full p-6">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 space-y-4 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-400" />
          <h2 className="text-lg font-semibold">Batch Processing</h2>
          <p className="text-sm text-muted-foreground">
            Batch ID: <code className="text-xs">{batchId.slice(0, 20)}...</code>
          </p>

          {status && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <span className="capitalize">{status.processing_status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Processing:</span>
                <span>{status.request_counts.processing} / {total}</span>
              </div>
              {status.request_counts.succeeded > 0 && (
                <div className="flex justify-between text-green-500">
                  <span>Completed:</span>
                  <span>{status.request_counts.succeeded}</span>
                </div>
              )}
              {status.request_counts.errored > 0 && (
                <div className="flex justify-between text-red-500">
                  <span>Errored:</span>
                  <span>{status.request_counts.errored}</span>
                </div>
              )}

              {total > 0 && (
                <div className="w-full bg-muted rounded-full h-2 mt-2">
                  <div
                    className="bg-green-500 h-2 rounded-full transition-all"
                    style={{ width: `${(status.request_counts.succeeded / total) * 100}%` }}
                  />
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Batches typically complete within a few minutes. 50% cost discount applied.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
