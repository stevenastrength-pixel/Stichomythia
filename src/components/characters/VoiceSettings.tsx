import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import type { EdgeTtsVoice } from '@/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Play, Loader2 } from 'lucide-react';

interface VoiceConfig {
  ttsProvider?: 'edge-tts' | 'openai';
  edgeTtsVoice: string;
  rate: string;
  pitch: string;
  openaiVoice?: string;
  openaiModel?: string;
}

interface Props {
  voice: VoiceConfig;
  onChange: (voice: VoiceConfig) => void;
}

const OPENAI_VOICES = [
  { id: 'alloy', label: 'Alloy — neutral, balanced' },
  { id: 'ash', label: 'Ash — warm, conversational' },
  { id: 'ballad', label: 'Ballad — expressive, storytelling' },
  { id: 'coral', label: 'Coral — warm, inviting' },
  { id: 'echo', label: 'Echo — clear, smooth' },
  { id: 'fable', label: 'Fable — expressive, animated' },
  { id: 'onyx', label: 'Onyx — deep, authoritative' },
  { id: 'nova', label: 'Nova — warm, friendly' },
  { id: 'sage', label: 'Sage — calm, measured' },
  { id: 'shimmer', label: 'Shimmer — bright, optimistic' },
];

const OPENAI_MODELS = [
  { id: 'tts-1', label: 'TTS-1 — fast, lower quality' },
  { id: 'tts-1-hd', label: 'TTS-1-HD — slower, higher quality' },
  { id: 'gpt-4o-mini-tts', label: 'GPT-4o Mini TTS — best quality' },
];

function rateToNumber(rate: string): number {
  return parseInt(rate.replace('%', '').replace('+', ''), 10) || 0;
}

function pitchToNumber(pitch: string): number {
  return parseInt(pitch.replace('Hz', '').replace('+', ''), 10) || 0;
}

export function VoiceSettings({ voice, onChange }: Props) {
  const [voices, setVoices] = useState<EdgeTtsVoice[]>([]);
  const [previewText, setPreviewText] = useState("Hello, how's it going?");
  const [previewing, setPreviewing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const provider = voice.ttsProvider ?? 'edge-tts';

  useEffect(() => {
    api.tts
      .voices()
      .then((v) => {
        v.sort((a, b) => {
          const aML = a.name.includes('Multilingual') ? 0 : 1;
          const bML = b.name.includes('Multilingual') ? 0 : 1;
          if (aML !== bML) return aML - bML;
          return a.name.localeCompare(b.name);
        });
        setVoices(v);
      })
      .catch(() => {});
  }, []);

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const blob = await api.tts.preview(
        previewText,
        voice.edgeTtsVoice,
        voice.rate,
        voice.pitch,
        provider,
        voice.openaiVoice,
        voice.openaiModel,
      );
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (err) {
      console.error('Preview failed:', err);
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>TTS Provider</Label>
        <Select
          value={provider}
          onValueChange={(val) => onChange({ ...voice, ttsProvider: val as 'edge-tts' | 'openai' })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="edge-tts">edge-tts (Free)</SelectItem>
            <SelectItem value="openai">OpenAI (Paid)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {provider === 'edge-tts' && (
        <>
          <div>
            <Label>Voice</Label>
            <Select
              value={voice.edgeTtsVoice}
              onValueChange={(val) => onChange({ ...voice, edgeTtsVoice: val })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a voice" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {voices.map((v) => (
                  <SelectItem key={v.name} value={v.name}>
                    {v.name.includes('Multilingual') ? '\u2605 ' : ''}{v.friendlyName || v.name} ({v.gender})
                  </SelectItem>
                ))}
                {voices.length === 0 && (
                  <SelectItem value={voice.edgeTtsVoice} disabled>
                    Loading voices...
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Rate</Label>
              <span className="text-xs text-muted-foreground">
                {rateToNumber(voice.rate) >= 0 ? '+' : ''}
                {rateToNumber(voice.rate)}%
              </span>
            </div>
            <Slider
              value={[rateToNumber(voice.rate)]}
              min={-50}
              max={50}
              step={5}
              onValueChange={([val]) => {
                const prefix = val >= 0 ? '+' : '';
                onChange({ ...voice, rate: `${prefix}${val}%` });
              }}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Pitch</Label>
              <span className="text-xs text-muted-foreground">
                {pitchToNumber(voice.pitch) >= 0 ? '+' : ''}
                {pitchToNumber(voice.pitch)}Hz
              </span>
            </div>
            <Slider
              value={[pitchToNumber(voice.pitch)]}
              min={-50}
              max={50}
              step={5}
              onValueChange={([val]) => {
                const prefix = val >= 0 ? '+' : '';
                onChange({ ...voice, pitch: `${prefix}${val}Hz` });
              }}
            />
          </div>
        </>
      )}

      {provider === 'openai' && (
        <>
          <div>
            <Label>OpenAI Voice</Label>
            <Select
              value={voice.openaiVoice ?? 'alloy'}
              onValueChange={(val) => onChange({ ...voice, openaiVoice: val })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPENAI_VOICES.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>OpenAI Model</Label>
            <Select
              value={voice.openaiModel ?? 'tts-1'}
              onValueChange={(val) => onChange({ ...voice, openaiModel: val })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPENAI_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      <div>
        <Label>Preview</Label>
        <div className="flex gap-2 mt-1">
          <Input
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
            placeholder="Type a test sentence..."
            className="flex-1"
          />
          <Button
            onClick={handlePreview}
            disabled={previewing || !previewText.trim()}
            size="icon"
          >
            {previewing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
