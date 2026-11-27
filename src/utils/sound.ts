// Subtle, realistic Web Audio API wooden chess piece acoustics (zero external assets)

const SOUND_STORAGE_KEY = 'ten-steps-sound-enabled-v1';

class ChessAudioEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = true;
  private listeners = new Set<(enabled: boolean) => void>();

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(SOUND_STORAGE_KEY);
        if (saved === 'false') this.enabled = false;
      } catch {
        // ignore storage errors
      }

      const unlock = () => {
        if (this.enabled) {
          this.ensureContext();
        }
      };
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
    }
  }

  private ensureContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.ctx && !this.noiseBuffer) {
      // Short filtered white-noise buffer for realistic wood-on-wood contact transient
      const sampleRate = this.ctx.sampleRate;
      const length = Math.floor(sampleRate * 0.035);
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        const env = Math.exp(-i / (sampleRate * 0.006));
        data[i] = (Math.random() * 2 - 1) * env;
      }
      this.noiseBuffer = buffer;
    }
    return this.ctx;
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
      } catch {
        // ignore
      }
    }
    if (enabled) {
      this.ensureContext();
    }
    this.listeners.forEach((cb) => cb(enabled));
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public subscribe(cb: (enabled: boolean) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private withReadyContext(fn: (ctx: AudioContext) => void) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx
        .resume()
        .then(() => {
          if (this.enabled) fn(ctx);
        })
        .catch(() => {});
    } else {
      fn(ctx);
    }
  }

  /**
   * Natural wooden Staunton piece placement sound:
   * - Brief bandpass-filtered wood transient (~14ms)
   * - Short warm low-end board thud (~42ms)
   */
  private triggerWoodTap(
    ctx: AudioContext,
    bodyFreqStart: number,
    bodyFreqEnd: number,
    clickCenterFreq: number,
    volume: number,
    delay = 0
  ) {
    const now = ctx.currentTime + delay;

    // 1. Crisp wooden contact transient
    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(clickCenterFreq, now);
      bandpass.Q.setValueAtTime(2.2, now);

      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(0.001, now);
      clickGain.gain.linearRampToValueAtTime(volume * 0.55, now + 0.002);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);

      noise.connect(bandpass);
      bandpass.connect(clickGain);
      clickGain.connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.03);
    }

    // 2. Subtle wooden body resonance thud
    const osc = ctx.createOscillator();
    const oscFilter = ctx.createBiquadFilter();
    const oscGain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(bodyFreqStart, now);
    osc.frequency.exponentialRampToValueAtTime(bodyFreqEnd, now + 0.042);

    oscFilter.type = 'lowpass';
    oscFilter.frequency.setValueAtTime(750, now);

    oscGain.gain.setValueAtTime(0.001, now);
    oscGain.gain.linearRampToValueAtTime(volume * 0.85, now + 0.003);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.052);

    osc.connect(oscFilter);
    oscFilter.connect(oscGain);
    oscGain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playMove() {
    this.withReadyContext((ctx) => {
      this.triggerWoodTap(ctx, 185, 78, 860, 0.22, 0);
    });
  }

  public playCapture() {
    this.withReadyContext((ctx) => {
      this.triggerWoodTap(ctx, 230, 72, 1180, 0.28, 0);
      this.triggerWoodTap(ctx, 140, 62, 680, 0.14, 0.022);
    });
  }

  public playCastle() {
    this.withReadyContext((ctx) => {
      this.triggerWoodTap(ctx, 180, 76, 840, 0.2, 0);
      this.triggerWoodTap(ctx, 200, 82, 920, 0.22, 0.085);
    });
  }

  public playCheck() {
    this.withReadyContext((ctx) => {
      this.triggerWoodTap(ctx, 210, 82, 980, 0.23, 0);

      // Soft, understated acoustic harmonic ping (nothing shrill)
      const now = ctx.currentTime + 0.01;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.075, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.18);
    });
  }

  public playPromote() {
    this.withReadyContext((ctx) => {
      this.triggerWoodTap(ctx, 200, 80, 960, 0.22, 0);
      [440, 587.33].forEach((freq, i) => {
        const now = ctx.currentTime + 0.02 + i * 0.06;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.07, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.17);
      });
    });
  }

  public playVictory() {
    this.withReadyContext((ctx) => {
      this.triggerWoodTap(ctx, 195, 78, 920, 0.2, 0);
      // Clean, warm 3-note wooden chime (gentle volume)
      [440, 554.37, 659.25].forEach((freq, i) => {
        const now = ctx.currentTime + 0.03 + i * 0.07;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.28);
      });
    });
  }

  public playWrong() {
    this.withReadyContext((ctx) => {
      // Muted double wooden tap (non-jarring feedback)
      this.triggerWoodTap(ctx, 130, 72, 420, 0.16, 0);
      this.triggerWoodTap(ctx, 115, 65, 360, 0.13, 0.09);
    });
  }
}

export const chessAudio = new ChessAudioEngine();
