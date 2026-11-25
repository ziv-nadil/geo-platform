import 'server-only';
import { allowlistedFetch } from '../../engines/http';

/** Pluggable TTS. Both providers return 24 kHz mono 16-bit PCM wrapped as WAV, so duration is exact and lines concatenate. */
export interface TtsProvider { id: string; configured(): string[]; synth(text: string): Promise<{ wav: Buffer } | { error: string }> }

const SR = 24_000;

export function wavFromPcm(pcm: Buffer, sampleRate = SR): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Locate the data chunk of a WAV and return its PCM and sample rate (mono 16-bit assumed). */
export function pcmOfWav(wav: Buffer): { pcm: Buffer; sampleRate: number } | null {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') return null;
  let sampleRate = SR, o = 12;
  while (o + 8 <= wav.length) {
    const id = wav.toString('ascii', o, o + 4);
    let size = wav.readUInt32LE(o + 4);
    if (id === 'fmt ') sampleRate = wav.readUInt32LE(o + 12);
    if (id === 'data') { if (size === 0 || o + 8 + size > wav.length) size = wav.length - o - 8; return { pcm: wav.subarray(o + 8, o + 8 + size), sampleRate }; }
    o += 8 + size + (size % 2);
  }
  return null;
}

export const wavSeconds = (wav: Buffer): number => { const p = pcmOfWav(wav); return p ? p.pcm.length / 2 / p.sampleRate : 0; };

/** Join lines with a short pause after each. Returns the WAV and each line's duration including its pause. */
export function concatLines(wavs: Buffer[], pauseSec = 0.35): { wav: Buffer; durations: number[] } | null {
  const parts: Buffer[] = [], durations: number[] = [];
  const silence = Buffer.alloc(Math.round(SR * pauseSec) * 2);
  for (const w of wavs) {
    const p = pcmOfWav(w);
    if (!p || p.sampleRate !== SR) return null;
    parts.push(p.pcm, silence);
    durations.push((p.pcm.length + silence.length) / 2 / SR);
  }
  return { wav: wavFromPcm(Buffer.concat(parts)), durations };
}

const INSTRUCTIONS = 'Speak as a calm, friendly industry presenter. Natural pace, clear diction, warm but not salesy. Do not read punctuation aloud.';

export const openaiTts: TtsProvider = {
  id: 'openai',
  configured: () => (process.env.OPENAI_API_KEY?.trim() ? [] : ['OPENAI_API_KEY']),
  async synth(text) {
    try {
      const model = process.env.YOUTUBE_TTS_MODEL?.trim() || 'gpt-4o-mini-tts';
      const body: Record<string, unknown> = { model, voice: process.env.YOUTUBE_TTS_VOICE?.trim() || 'alloy', input: text.slice(0, 4000), response_format: 'wav' };
      if (model.startsWith('gpt-4o')) body.instructions = INSTRUCTIONS;
      const res = await allowlistedFetch('openai', { timeoutMs: 90_000 })('https://api.openai.com/v1/audio/speech', {
        method: 'POST', headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) return { error: `OpenAI TTS returned HTTP ${res.status}` };
      return { wav: Buffer.from(await res.arrayBuffer()) };
    } catch (e) { return { error: e instanceof Error ? e.message.slice(0, 120) : 'OpenAI TTS failed' }; }
  },
};

export const elevenLabsTts: TtsProvider = {
  id: 'elevenlabs',
  configured: () => [process.env.ELEVENLABS_API_KEY?.trim() ? '' : 'ELEVENLABS_API_KEY', process.env.ELEVENLABS_VOICE_ID?.trim() ? '' : 'ELEVENLABS_VOICE_ID'].filter(Boolean),
  async synth(text) {
    try {
      const voice = encodeURIComponent(process.env.ELEVENLABS_VOICE_ID ?? '');
      const res = await allowlistedFetch('elevenlabs', { timeoutMs: 90_000 })(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=pcm_24000`, {
        method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '', 'content-type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 4000), model_id: process.env.YOUTUBE_TTS_MODEL?.trim() || 'eleven_multilingual_v2' }),
      });
      if (!res.ok) return { error: `ElevenLabs returned HTTP ${res.status}` };
      return { wav: wavFromPcm(Buffer.from(await res.arrayBuffer())) };
    } catch (e) { return { error: e instanceof Error ? e.message.slice(0, 120) : 'ElevenLabs failed' }; }
  },
};

export function ttsProvider(): TtsProvider { return process.env.YOUTUBE_TTS_PROVIDER === 'elevenlabs' ? elevenLabsTts : openaiTts; }

/** Synthesize each line, then join. Errors name the failing line. */
export async function synthLines(lines: string[], p: TtsProvider = ttsProvider()): Promise<{ status: 'ok'; wav: Buffer; durations: number[] } | { status: 'not_configured'; missing: string[] } | { status: 'error'; message: string }> {
  const missing = p.configured();
  if (missing.length) return { status: 'not_configured', missing };
  const wavs: Buffer[] = [];
  for (let i = 0; i < lines.length; i++) {
    const r = await p.synth(lines[i]);
    if ('error' in r) return { status: 'error', message: `Line ${i + 1}: ${r.error}` };
    wavs.push(r.wav);
  }
  const joined = concatLines(wavs);
  if (!joined) return { status: 'error', message: 'The voice returned audio in an unexpected format (need 24 kHz mono WAV).' };
  return { status: 'ok', ...joined };
}
