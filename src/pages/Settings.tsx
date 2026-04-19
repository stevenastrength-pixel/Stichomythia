import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { AppSettings } from '@/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, X, Loader2 } from 'lucide-react';

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [keyStatus, setKeyStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [openaiKey, setOpenaiKey] = useState('');
  const [openaiKeyStatus, setOpenaiKeyStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [ttsStatus, setTtsStatus] = useState<{ checked: boolean; installed: boolean; error?: string }>({ checked: false, installed: false });
  const [ffmpegStatus, setFfmpegStatus] = useState<{ checked: boolean; installed: boolean; version?: string; error?: string }>({ checked: false, installed: false });

  useEffect(() => {
    api.settings.get().then(setSettings).catch(console.error);
  }, []);

  const verifyKey = async () => {
    setKeyStatus('checking');
    const result = await api.settings.verifyApiKey(apiKey);
    setKeyStatus(result.valid ? 'valid' : 'invalid');
    if (result.valid) {
      await api.settings.update({ anthropicApiKey: apiKey });
    }
  };

  const verifyOpenaiKey = async () => {
    setOpenaiKeyStatus('checking');
    const result = await api.settings.verifyOpenaiKey(openaiKey);
    setOpenaiKeyStatus(result.valid ? 'valid' : 'invalid');
    if (result.valid) {
      await api.settings.update({ openaiApiKey: openaiKey });
    }
  };

  const checkTts = async () => {
    const result = await api.settings.verifyEdgeTts();
    setTtsStatus({ checked: true, ...result });
  };

  const checkFfmpeg = async () => {
    const result = await api.settings.verifyFfmpeg();
    setFfmpegStatus({ checked: true, ...result });
  };

  useEffect(() => {
    checkTts();
    checkFfmpeg();
  }, []);

  if (!settings) {
    return <div className="p-6 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">API Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="api-key">API Key</Label>
            <div className="flex gap-2">
              <Input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={settings.anthropicApiKey ? 'Key is set (enter new to change)' : 'sk-ant-...'}
              />
              <Button onClick={verifyKey} disabled={!apiKey || keyStatus === 'checking'}>
                {keyStatus === 'checking' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Verify'
                )}
              </Button>
            </div>
            {keyStatus === 'valid' && (
              <p className="text-sm text-green-500 mt-1 flex items-center gap-1">
                <Check className="w-3 h-3" /> Key verified
              </p>
            )}
            {keyStatus === 'invalid' && (
              <p className="text-sm text-red-500 mt-1 flex items-center gap-1">
                <X className="w-3 h-3" /> Invalid key
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">TTS Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Default TTS Provider</Label>
            <Select
              value={settings.ttsProvider ?? 'edge-tts'}
              onValueChange={async (val) => {
                const updated = await api.settings.update({ ttsProvider: val as 'edge-tts' | 'openai' });
                setSettings(updated);
              }}
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
          <div>
            <Label htmlFor="openai-key">OpenAI API Key</Label>
            <div className="flex gap-2">
              <Input
                id="openai-key"
                type="password"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder={settings.openaiApiKey ? 'Key is set (enter new to change)' : 'sk-...'}
              />
              <Button onClick={verifyOpenaiKey} disabled={!openaiKey || openaiKeyStatus === 'checking'}>
                {openaiKeyStatus === 'checking' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Verify'
                )}
              </Button>
            </div>
            {openaiKeyStatus === 'valid' && (
              <p className="text-sm text-green-500 mt-1 flex items-center gap-1">
                <Check className="w-3 h-3" /> Key verified
              </p>
            )}
            {openaiKeyStatus === 'invalid' && (
              <p className="text-sm text-red-500 mt-1 flex items-center gap-1">
                <X className="w-3 h-3" /> Invalid key
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Available OpenAI voices: alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Dependencies</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">edge-tts</span>
            {ttsStatus.checked ? (
              ttsStatus.installed ? (
                <Badge variant="secondary" className="bg-green-500/10 text-green-500">Installed</Badge>
              ) : (
                <Badge variant="destructive">Not found</Badge>
              )
            ) : (
              <Badge variant="secondary">Checking...</Badge>
            )}
          </div>
          {ttsStatus.checked && !ttsStatus.installed && (
            <p className="text-xs text-muted-foreground">{ttsStatus.error}</p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm">ffmpeg</span>
            {ffmpegStatus.checked ? (
              ffmpegStatus.installed ? (
                <Badge variant="secondary" className="bg-green-500/10 text-green-500">Installed</Badge>
              ) : (
                <Badge variant="destructive">Not found</Badge>
              )
            ) : (
              <Badge variant="secondary">Checking...</Badge>
            )}
          </div>
          {ffmpegStatus.checked && !ffmpegStatus.installed && (
            <p className="text-xs text-muted-foreground">{ffmpegStatus.error}</p>
          )}
        </CardContent>
      </Card>
      <div className="flex items-center gap-3 mt-8 pt-6 border-t border-border">
        <img src="/mg-logo.png" alt="" className="h-10 w-10 rounded" />
        <div className="text-xs text-muted-foreground">
          <p className="font-heading uppercase tracking-wider text-foreground/70">Malevolent Gods Software</p>
          <p>Stichomythia v{__APP_VERSION__}</p>
        </div>
      </div>
    </div>
  );
}
