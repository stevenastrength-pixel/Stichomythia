import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Check, X, Loader2, ArrowRight, Copy } from 'lucide-react';

type Step = 'api-key' | 'edge-tts' | 'ffmpeg' | 'characters';

const STARTER_CHARACTERS = [
  {
    color: '#E74C3C',
    personality: 'Laid-back, dry humor, plays devil\'s advocate',
    speechStyle: 'Terse, lots of "yeah" and "nah", rarely asks questions',
    interests: ['cooking', 'classic cars', 'philosophy'],
    quirks: ['sighs before speaking', 'plays devil\'s advocate'],
    emotionalProfile: { temperament: 'even-keeled' as const, triggers: [], recoverySpeed: 'fast' as const },
    voice: { edgeTtsVoice: 'en-US-GuyNeural', rate: '+0%', pitch: '+0Hz' },
  },
  {
    color: '#3498DB',
    personality: 'Enthusiastic storyteller, gets excited easily',
    speechStyle: 'Verbose, lots of tangents, uses "oh man" and "wait wait wait"',
    interests: ['travel', 'movies', 'history'],
    quirks: ['interrupts with tangents', 'tells long stories'],
    emotionalProfile: { temperament: 'cheerful' as const, triggers: [], recoverySpeed: 'fast' as const },
    voice: { edgeTtsVoice: 'en-US-JennyNeural', rate: '+5%', pitch: '+0Hz' },
  },
  {
    color: '#2ECC71',
    personality: 'Thoughtful, asks probing questions, slower to speak',
    speechStyle: 'Measured, uses "hmm" and "interesting", often pauses mid-sentence',
    interests: ['science', 'music', 'gardening'],
    quirks: ['asks follow-up questions', 'pauses to think'],
    emotionalProfile: { temperament: 'sensitive' as const, triggers: [], recoverySpeed: 'medium' as const },
    voice: { edgeTtsVoice: 'en-US-AriaNeural', rate: '-5%', pitch: '+0Hz' },
  },
  {
    color: '#F39C12',
    personality: 'Quick-witted, sarcastic, competitive',
    speechStyle: 'Snappy, uses rhetorical questions, dry one-liners',
    interests: ['sports', 'technology', 'stand-up comedy'],
    quirks: ['turns everything into a competition', 'makes sarcastic comments'],
    emotionalProfile: { temperament: 'sardonic' as const, triggers: [], recoverySpeed: 'fast' as const },
    voice: { edgeTtsVoice: 'en-US-DavisNeural', rate: '+0%', pitch: '-5Hz' },
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function CommandBlock({ command, label }: { command: string; label?: string }) {
  return (
    <div className="bg-muted/70 rounded-md p-3 font-mono text-sm">
      {label && <span className="text-xs text-muted-foreground block mb-1">{label}</span>}
      <div className="flex items-center justify-between gap-2">
        <code className="text-foreground break-all">{command}</code>
        <CopyButton text={command} />
      </div>
    </div>
  );
}

export function Setup({ onComplete }: { onComplete?: () => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('api-key');
  const [apiKey, setApiKey] = useState('');
  const [keyStatus, setKeyStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [ttsOk, setTtsOk] = useState<boolean | null>(null);
  const [ffmpegOk, setFfmpegOk] = useState<boolean | null>(null);
  const [creating, setCreating] = useState(false);

  const verifyKey = async () => {
    setKeyStatus('checking');
    try {
      const result = await api.settings.verifyApiKey(apiKey);
      setKeyStatus(result.valid ? 'valid' : 'invalid');
      if (result.valid) {
        await api.settings.update({ anthropicApiKey: apiKey });
      }
    } catch {
      setKeyStatus('invalid');
    }
  };

  const checkTts = async () => {
    setTtsOk(null);
    try {
      const result = await api.settings.verifyEdgeTts();
      setTtsOk(result.installed);
    } catch {
      setTtsOk(false);
    }
  };

  const checkFfmpeg = async () => {
    setFfmpegOk(null);
    try {
      const result = await api.settings.verifyFfmpeg();
      setFfmpegOk(result.installed);
    } catch {
      setFfmpegOk(false);
    }
  };

  const createStarters = async () => {
    setCreating(true);
    for (const data of STARTER_CHARACTERS) {
      await api.characters.create(data);
    }
    await api.settings.update({ setupComplete: true });
    setCreating(false);
    onComplete?.();
    navigate('/characters');
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-6">
      <Card className="w-full max-w-xl">
        <CardContent className="p-8">
          <div className="flex flex-col items-center mb-6">
            <img src="/logo.png" alt="" className="h-20 w-20 mb-3" />
            <img src="/title.png" alt="Stichomythia" className="h-8 mb-2" />
            <p className="text-sm text-muted-foreground">
              Let's get you set up. This takes about 5 minutes.
            </p>
          </div>

          {step === 'api-key' && (
            <div className="space-y-4">
              <h2 className="text-lg font-medium">Step 1 of 4 — Anthropic API Key</h2>
              <p className="text-sm text-muted-foreground">
                Stichomythia uses Claude to generate conversation. You need an Anthropic API key with access to Opus and Haiku.
              </p>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Go to <span className="text-foreground font-medium">console.anthropic.com</span></li>
                <li>Navigate to <span className="text-foreground font-medium">API Keys</span></li>
                <li>Click <span className="text-foreground font-medium">Create Key</span> and copy it</li>
              </ol>
              <div>
                <Label htmlFor="setup-key">API Key</Label>
                <Input
                  id="setup-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  onKeyDown={(e) => e.key === 'Enter' && apiKey && verifyKey()}
                />
              </div>
              <div className="flex gap-2 items-center">
                <Button onClick={verifyKey} disabled={!apiKey || keyStatus === 'checking'}>
                  {keyStatus === 'checking' && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Verify
                </Button>
                {keyStatus === 'valid' && (
                  <Button onClick={() => { setStep('edge-tts'); checkTts(); }}>
                    Next <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                )}
              </div>
              {keyStatus === 'valid' && (
                <p className="text-sm text-green-500 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Key verified — Opus access confirmed
                </p>
              )}
              {keyStatus === 'invalid' && (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <X className="w-3 h-3" /> Invalid key or no API access. Check and try again.
                </p>
              )}
            </div>
          )}

          {step === 'edge-tts' && (
            <div className="space-y-4">
              <h2 className="text-lg font-medium">Step 2 of 4 — Install edge-tts</h2>
              <p className="text-sm text-muted-foreground">
                edge-tts converts generated dialogue into spoken audio using Microsoft's neural voices.
                It requires Python 3.8+ to be installed.
              </p>

              {ttsOk === null ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Checking for edge-tts...
                </p>
              ) : ttsOk ? (
                <>
                  <p className="text-sm text-green-500 flex items-center gap-1">
                    <Check className="w-3 h-3" /> edge-tts is installed and working
                  </p>
                  <Button onClick={() => { setStep('ffmpeg'); checkFfmpeg(); }}>
                    Next <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-red-500 flex items-center gap-1 mb-3">
                    <X className="w-3 h-3" /> edge-tts not found
                  </p>

                  <div className="space-y-3">
                    <p className="text-sm font-medium">How to install:</p>

                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Windows</p>
                      <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                        <li>
                          Open <span className="text-foreground font-medium">Command Prompt</span> or <span className="text-foreground font-medium">PowerShell</span>
                        </li>
                        <li>
                          Make sure Python is installed — run <code className="bg-muted px-1.5 py-0.5 rounded text-xs">python --version</code>
                          <p className="text-xs mt-1 ml-4">If not installed, get it from <span className="text-foreground">python.org/downloads</span> — check "Add to PATH" during install</p>
                        </li>
                        <li>Install edge-tts:</li>
                      </ol>
                      <CommandBlock command="pip install edge-tts" />
                    </div>

                    <div className="space-y-2 pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">macOS</p>
                      <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                        <li>Open <span className="text-foreground font-medium">Terminal</span></li>
                        <li>Python 3 is usually pre-installed. Check with <code className="bg-muted px-1.5 py-0.5 rounded text-xs">python3 --version</code></li>
                        <li>Install edge-tts:</li>
                      </ol>
                      <CommandBlock command="pip3 install edge-tts" />
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground mt-2">
                    After installing, close this terminal and click Retry below.
                  </p>

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" onClick={checkTts}>
                      Retry
                    </Button>
                    <Button variant="ghost" onClick={() => { setStep('ffmpeg'); checkFfmpeg(); }}>
                      Skip for now
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 'ffmpeg' && (
            <div className="space-y-4">
              <h2 className="text-lg font-medium">Step 3 of 4 — Install ffmpeg</h2>
              <p className="text-sm text-muted-foreground">
                ffmpeg is used to combine individual audio clips into a single mix-down MP3.
                It's a widely-used open-source audio/video tool.
              </p>

              {ffmpegOk === null ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Checking for ffmpeg...
                </p>
              ) : ffmpegOk ? (
                <>
                  <p className="text-sm text-green-500 flex items-center gap-1">
                    <Check className="w-3 h-3" /> ffmpeg is installed and working
                  </p>
                  <Button onClick={() => setStep('characters')}>
                    Next <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-red-500 flex items-center gap-1 mb-3">
                    <X className="w-3 h-3" /> ffmpeg not found
                  </p>

                  <div className="space-y-3">
                    <p className="text-sm font-medium">How to install:</p>

                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                        Windows — Option A (recommended)
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Open <span className="text-foreground font-medium">Command Prompt</span> or{' '}
                        <span className="text-foreground font-medium">PowerShell as Administrator</span> and run:
                      </p>
                      <CommandBlock command="winget install ffmpeg" label="Using winget (built into Windows 10/11)" />
                      <p className="text-xs text-muted-foreground">or</p>
                      <CommandBlock command="choco install ffmpeg -y" label="Using Chocolatey (if installed)" />
                    </div>

                    <div className="space-y-2 pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                        Windows — Option B (manual)
                      </p>
                      <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                        <li>Go to <span className="text-foreground font-medium">gyan.dev/ffmpeg/builds</span></li>
                        <li>Download <span className="text-foreground font-medium">ffmpeg-release-essentials.zip</span></li>
                        <li>Extract the zip to <code className="bg-muted px-1.5 py-0.5 rounded text-xs">C:\ffmpeg</code></li>
                        <li>
                          Add to PATH: search "Environment Variables" in Start menu,
                          edit <span className="text-foreground font-medium">Path</span>, add{' '}
                          <code className="bg-muted px-1.5 py-0.5 rounded text-xs">C:\ffmpeg\bin</code>
                        </li>
                        <li>Restart Stichomythia</li>
                      </ol>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">macOS</p>
                      <CommandBlock command="brew install ffmpeg" label="Using Homebrew" />
                      <p className="text-xs text-muted-foreground">
                        Don't have Homebrew? Install it first from <span className="text-foreground">brew.sh</span>
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground mt-2">
                    After installing, you may need to open a new terminal window. Click Retry to check again.
                  </p>

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" onClick={checkFfmpeg}>
                      Retry
                    </Button>
                    <Button variant="ghost" onClick={() => setStep('characters')}>
                      Skip for now
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 'characters' && (
            <div className="space-y-4">
              <h2 className="text-lg font-medium">Step 4 of 4 — Create Characters</h2>
              <p className="text-sm text-muted-foreground">
                We'll create 4 starter characters with distinct personalities and voices.
                You can fully customize them after setup.
              </p>
              <div className="space-y-2">
                {STARTER_CHARACTERS.map((char, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 bg-muted/50 rounded-md">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: char.color }}
                    />
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{char.personality}</span>
                      <p className="text-xs text-muted-foreground truncate">{char.speechStyle}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Button onClick={createStarters} disabled={creating} className="w-full">
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Creating characters...
                  </>
                ) : (
                  'Create Characters & Get Started'
                )}
              </Button>
            </div>
          )}

          <div className="flex gap-1.5 justify-center mt-8">
            {(['api-key', 'edge-tts', 'ffmpeg', 'characters'] as Step[]).map((s) => (
              <div
                key={s}
                className={`w-2 h-2 rounded-full transition-colors ${
                  s === step ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
