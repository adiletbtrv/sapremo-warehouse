/**
 * High-performance Web Audio API sound synthesizer for warehouse POS/WMS feedback.
 * Operates without external audio asset downloads, with zero latency and lazy initialization.
 */

export type FeedbackSoundType = 'success' | 'error' | 'warning';

class SoundFeedbackSynthesizer {
  private audioCtx: AudioContext | null = null;

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.audioCtx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {
        // Autoplay policy might block until explicit user interaction
      });
    }

    return this.audioCtx;
  }

  /**
   * Play a distinct, low-latency audio feedback tone.
   */
  public play(type: FeedbackSoundType): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      switch (type) {
        case 'success': {
          // Crisp high-frequency sine beep (1050 Hz, 90ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(1050, now);
          osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);

          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now);
          osc.stop(now + 0.1);
          break;
        }

        case 'error': {
          // Double low sawtooth buzz (220 Hz -> 170 Hz, 240ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(220, now);
          osc.frequency.setValueAtTime(170, now + 0.12);

          // First buzz
          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.25, now + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

          // Second buzz
          gain.gain.setValueAtTime(0.25, now + 0.12);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now);
          osc.stop(now + 0.25);
          break;
        }

        case 'warning': {
          // Mid-frequency triangle double blip (600 Hz, 140ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(650, now);
          osc.frequency.setValueAtTime(750, now + 0.08);

          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
          gain.gain.setValueAtTime(0.2, now + 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now);
          osc.stop(now + 0.15);
          break;
        }
      }
    } catch (e) {
      // Audio playback fails silently in restricted background tabs
      console.debug('[SoundFeedback] Audio playback prevented:', e);
    }
  }
}

export const soundSynthesizer = new SoundFeedbackSynthesizer();

export function playFeedbackSound(type: FeedbackSoundType = 'success'): void {
  soundSynthesizer.play(type);
}
