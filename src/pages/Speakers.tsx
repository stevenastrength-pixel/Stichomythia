import { useState, useEffect } from 'react';
import { v4 as uuid } from 'uuid';
import { api } from '@/lib/api';
import { playTestTone } from '@/lib/audio-utils';
import { useAudioDevices } from '@/hooks/useAudioDevices';
import { useAudioEngine } from '@/contexts/AudioEngineContext';
import { SpeakerCard } from '@/components/speakers/SpeakerCard';
import type { Speaker } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bluetooth, RefreshCw, Plus, Loader2, Speaker as SpeakerIcon } from 'lucide-react';

export function Speakers() {
  const { refreshSpeakers } = useAudioEngine();
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [newLabels, setNewLabels] = useState<Record<string, string>>({});
  const { devices, refresh, loading } = useAudioDevices();

  useEffect(() => {
    api.speakers.get().then(config => {
      const seen = new Set<string>();
      const deduped = config.speakers.filter(s => {
        if (seen.has(s.deviceLabel)) return false;
        seen.add(s.deviceLabel);
        return true;
      });
      if (deduped.length < config.speakers.length) {
        saveSpeakers(deduped);
      }
      setSpeakers(deduped);
    });
  }, []);

  const isRegistered = (d: MediaDeviceInfo) =>
    speakers.some(s => s.deviceId === d.deviceId || s.deviceLabel === d.label);

  const getConnectedDeviceId = (speaker: Speaker) => {
    const exact = devices.find(d => d.deviceId === speaker.deviceId);
    if (exact) return exact.deviceId;
    const byLabel = devices.find(d => d.label === speaker.deviceLabel);
    return byLabel?.deviceId ?? null;
  };

  useEffect(() => {
    if (devices.length === 0 || speakers.length === 0) return;
    let changed = false;
    const updated = speakers.map(s => {
      const match = devices.find(d => d.label === s.deviceLabel && d.deviceId !== s.deviceId);
      if (match) {
        changed = true;
        return { ...s, deviceId: match.deviceId };
      }
      return s;
    });
    if (changed) saveSpeakers(updated);
  }, [devices]);

  const unregisteredDevices = devices.filter(d =>
    d.deviceId !== 'default' &&
    d.deviceId !== 'communications' &&
    !isRegistered(d)
  );

  const deviceCounts = new Map<string, number>();
  const deviceIndices = new Map<string, number>();
  for (const d of unregisteredDevices) {
    deviceCounts.set(d.label, (deviceCounts.get(d.label) ?? 0) + 1);
  }

  const saveSpeakers = async (updated: Speaker[]) => {
    setSpeakers(updated);
    await api.speakers.update({ speakers: updated, updatedAt: new Date().toISOString() });
    await refreshSpeakers();
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
    await saveSpeakers(speakers.map(s => s.id === speakerId ? { ...s, label } : s));
  };

  const handleRemoveSpeaker = async (speakerId: string) => {
    await saveSpeakers(speakers.filter(s => s.id !== speakerId));
  };

  const connectedCount = speakers.filter(s => getConnectedDeviceId(s) !== null).length;

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gold/10 px-5 py-3 gradient-dark-gold">
        <div className="flex items-center gap-3">
          <SpeakerIcon className="w-5 h-5 text-gold" />
          <h1 className="text-base font-heading tracking-wider">Speaker Setup</h1>
          <span className="text-xs text-muted-foreground">
            {speakers.length > 0
              ? `${connectedCount}/${speakers.length} speakers connected`
              : 'Register your Bluetooth speakers'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full space-y-4">
        <div>
          <h2 className="text-sm font-heading text-gold-light tracking-wider mb-3">Registered Speakers</h2>
          {speakers.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-gold/15 rounded-lg">
              <SpeakerIcon className="w-8 h-8 text-gold/20 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No speakers registered yet</p>
              <p className="text-xs text-muted-foreground mt-1">Pair your Bluetooth speakers below to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {speakers.map((speaker, i) => (
                <SpeakerCard
                  key={speaker.id}
                  speaker={speaker}
                  index={i}
                  connected={getConnectedDeviceId(speaker) !== null}
                  onTest={() => playTestTone(getConnectedDeviceId(speaker) ?? speaker.deviceId, i)}
                  onUpdateLabel={(label) => handleUpdateLabel(speaker.id, label)}
                  onRemove={() => handleRemoveSpeaker(speaker.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-gold/10 pt-6">
          <h2 className="text-sm font-heading text-gold-light tracking-wider mb-3">Add Speaker</h2>
          <div className="flex gap-2 mb-3">
            <Button variant="outline" onClick={() => window.open('ms-settings:bluetooth')} className="border-gold/20 hover:bg-gold-muted">
              <Bluetooth className="w-4 h-4 mr-2" />
              Open Bluetooth Settings
            </Button>
            <Button variant="outline" onClick={refresh} disabled={loading} className="border-gold/20 hover:bg-gold-muted">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Refresh Devices
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mb-4">
            Pair your speaker in Windows Bluetooth settings, then click Refresh to see it here.
          </p>

          {unregisteredDevices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {loading ? 'Scanning for devices...' : 'No new audio devices found.'}
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
                  <div key={device.deviceId} className="flex items-center gap-3 p-3 rounded-lg border border-gold/10 bg-card/50">
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
                      variant="outline"
                      className="border-gold/20"
                      onClick={async () => {
                        try { await playTestTone(device.deviceId, speakers.length); } catch {}
                      }}
                    >
                      Test
                    </Button>
                    <Button size="sm" onClick={() => handleAddSpeaker(device)} className="gradient-gold text-black font-semibold">
                      <Plus className="w-4 h-4 mr-1" />
                      Add
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
