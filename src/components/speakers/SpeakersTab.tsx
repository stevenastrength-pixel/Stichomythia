import { useState, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import { api } from '@/lib/api';
import { playTestTone } from '@/lib/audio-utils';
import { useAudioDevices } from '@/hooks/useAudioDevices';
import { SpeakerCard } from './SpeakerCard';
import type { Conversation, Character, Speaker } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Bluetooth, RefreshCw, Plus, Volume2, Loader2 } from 'lucide-react';

interface Props {
  conversation: Conversation;
  characters: Character[];
  onConversationUpdate: (conv: Conversation) => void;
}

export function SpeakersTab({ conversation, characters, onConversationUpdate }: Props) {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [speakerMap, setSpeakerMap] = useState<Record<string, string>>(conversation.speakerMap ?? {});
  const [newLabels, setNewLabels] = useState<Record<string, string>>({});
  const [testingAll, setTestingAll] = useState(false);
  const { devices, refresh, loading } = useAudioDevices();

  useEffect(() => {
    api.speakers.get().then(config => setSpeakers(config.speakers));
  }, []);

  const connectedDeviceIds = new Set(devices.map(d => d.deviceId));

  const unregisteredDevices = devices.filter(d =>
    d.deviceId !== 'default' &&
    d.deviceId !== 'communications' &&
    !speakers.some(s => s.deviceId === d.deviceId)
  );

  const deviceCounts = new Map<string, number>();
  const deviceIndices = new Map<string, number>();
  for (const d of unregisteredDevices) {
    deviceCounts.set(d.label, (deviceCounts.get(d.label) ?? 0) + 1);
  }

  const saveSpeakers = async (updated: Speaker[]) => {
    setSpeakers(updated);
    await api.speakers.update({ speakers: updated, updatedAt: new Date().toISOString() });
  };

  const handleAddSpeaker = async (device: MediaDeviceInfo) => {
    const label = newLabels[device.deviceId] || device.label || `Speaker ${speakers.length + 1}`;
    const speaker: Speaker = {
      id: uuid(),
      deviceId: device.deviceId,
      label,
      deviceLabel: device.label,
    };
    await saveSpeakers([...speakers, speaker]);
    setNewLabels(prev => { const n = { ...prev }; delete n[device.deviceId]; return n; });
  };

  const handleUpdateLabel = async (speakerId: string, label: string) => {
    const updated = speakers.map(s => s.id === speakerId ? { ...s, label } : s);
    await saveSpeakers(updated);
  };

  const handleRemoveSpeaker = async (speakerId: string) => {
    await saveSpeakers(speakers.filter(s => s.id !== speakerId));
    const newMap = { ...speakerMap };
    for (const [charId, sid] of Object.entries(newMap)) {
      if (sid === speakerId) delete newMap[charId];
    }
    setSpeakerMap(newMap);
    await api.conversations.update(conversation.id, { speakerMap: newMap });
  };

  const handleMapCharacter = async (characterId: string, speakerId: string) => {
    const newMap = { ...speakerMap, [characterId]: speakerId };
    setSpeakerMap(newMap);
    const updated = await api.conversations.update(conversation.id, { speakerMap: newMap });
    onConversationUpdate(updated);
  };

  const handleTestAll = async () => {
    setTestingAll(true);
    for (let i = 0; i < conversation.characterIds.length; i++) {
      const charId = conversation.characterIds[i];
      const speakerId = speakerMap[charId];
      const speaker = speakers.find(s => s.id === speakerId);
      if (speaker && connectedDeviceIds.has(speaker.deviceId)) {
        await playTestTone(speaker.deviceId, i);
        await new Promise(r => setTimeout(r, 300));
      }
    }
    setTestingAll(false);
  };

  const allMapped = conversation.characterIds.every(id => speakerMap[id]);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6 overflow-y-auto h-full">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Registered Speakers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {speakers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No speakers set up yet. Pair your Bluetooth speakers below.</p>
          ) : (
            speakers.map((speaker, i) => (
              <SpeakerCard
                key={speaker.id}
                speaker={speaker}
                index={i}
                connected={connectedDeviceIds.has(speaker.deviceId)}
                onTest={() => playTestTone(speaker.deviceId, i)}
                onUpdateLabel={(label) => handleUpdateLabel(speaker.id, label)}
                onRemove={() => handleRemoveSpeaker(speaker.id)}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add Speaker</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => window.open('ms-settings:bluetooth')}
            >
              <Bluetooth className="w-4 h-4 mr-2" />
              Open Bluetooth Settings
            </Button>
            <Button variant="outline" onClick={refresh} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Refresh Devices
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Pair your speaker in Windows Bluetooth settings, then click Refresh to see it here.
          </p>

          {unregisteredDevices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {loading ? 'Scanning...' : 'No new audio devices found. Pair a Bluetooth speaker and click Refresh.'}
            </p>
          ) : (
            <div className="space-y-2">
              {unregisteredDevices.map(device => {
                const count = deviceCounts.get(device.label) ?? 1;
                const idx = deviceIndices.get(device.label) ?? 0;
                deviceIndices.set(device.label, idx + 1);
                const displayName = count > 1
                  ? `${device.label} (${idx + 1} of ${count})`
                  : device.label;

                return (
                  <div key={device.deviceId} className="flex items-center gap-3 p-3 rounded-lg border">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{displayName || 'Unknown Device'}</p>
                    </div>
                    <Input
                      placeholder="Label (e.g. Kitchen)"
                      value={newLabels[device.deviceId] ?? ''}
                      onChange={(e) => setNewLabels(prev => ({ ...prev, [device.deviceId]: e.target.value }))}
                      className="w-40"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        try { await playTestTone(device.deviceId, speakers.length); } catch {}
                      }}
                    >
                      <Volume2 className="w-4 h-4 mr-1" />
                      Test
                    </Button>
                    <Button size="sm" onClick={() => handleAddSpeaker(device)}>
                      <Plus className="w-4 h-4 mr-1" />
                      Add
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Character Mapping</CardTitle>
            {allMapped && (
              <Button variant="outline" size="sm" onClick={handleTestAll} disabled={testingAll}>
                {testingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Volume2 className="w-4 h-4 mr-2" />}
                Test All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {characters.length === 0 ? (
            <p className="text-sm text-muted-foreground">No characters in this conversation.</p>
          ) : (
            characters.map(char => (
              <div key={char.id} className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: char.color }}
                />
                <span className="text-sm w-32 truncate">
                  {char.personality?.split(',')[0] ?? 'Character'}
                </span>
                <Select
                  value={speakerMap[char.id] ?? ''}
                  onValueChange={(v) => handleMapCharacter(char.id, v)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select speaker..." />
                  </SelectTrigger>
                  <SelectContent>
                    {speakers.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                        {!connectedDeviceIds.has(s.deviceId) && ' (disconnected)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))
          )}
          {speakers.length === 0 && characters.length > 0 && (
            <p className="text-xs text-muted-foreground">Add speakers above before mapping characters.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
