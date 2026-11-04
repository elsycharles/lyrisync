type Listener = () => void;

/**
 * Thin wrapper around the shared <audio> element. Its `currentTime` is the value a tap
 * records. While playing, the playhead is sampled every animation frame into `time`;
 * components read it through `subscribe` (useSyncExternalStore or a DOM ref), never
 * through React state, so the lyric list does not re-render sixty times a second.
 */
export class AudioController {
  time = 0;
  duration = Number.NaN;
  playing = false;
  rate = 1;

  private el: HTMLAudioElement | null = null;
  private listeners = new Set<Listener>();
  private frame = 0;
  private readonly events = ['play', 'pause', 'ended', 'seeked', 'timeupdate', 'loadedmetadata', 'durationchange', 'ratechange', 'emptied'] as const;

  /** Callback ref for the <audio> element. */
  attach = (el: HTMLAudioElement | null): void => {
    if (this.el === el) return;
    if (this.el) for (const e of this.events) this.el.removeEventListener(e, this.onMediaEvent);
    cancelAnimationFrame(this.frame);
    this.el = el;
    this.time = 0;
    this.duration = Number.NaN;
    this.playing = false;
    if (el) {
      for (const e of this.events) el.addEventListener(e, this.onMediaEvent);
      el.playbackRate = this.rate;
      this.sync();
    }
    this.emit();
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get ready(): boolean {
    return this.el !== null;
  }

  async play(): Promise<void> {
    if (!this.el) return;
    try {
      await this.el.play();
    } catch (err) {
      // Autoplay policies or an interrupted load: not fatal, the user can press play again.
      console.warn('[lyrisync] play() rejected', err);
    }
  }

  pause(): void {
    this.el?.pause();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else void this.play();
  }

  seek(seconds: number): void {
    if (!this.el) return;
    const max = Number.isFinite(this.el.duration) ? this.el.duration : Infinity;
    const t = Math.min(Math.max(0, seconds), max);
    this.el.currentTime = t;
    this.time = t;
    this.emit();
  }

  skip(delta: number): void {
    this.seek(this.currentTime() + delta);
  }

  setRate(rate: number): void {
    this.rate = rate;
    if (this.el) this.el.playbackRate = rate;
    this.emit();
  }

  /** Exact position right now, read from the element (used when a tap is recorded). */
  currentTime(): number {
    return this.el ? this.el.currentTime : this.time;
  }

  private onMediaEvent = (): void => {
    this.sync();
    this.emit();
    cancelAnimationFrame(this.frame);
    if (this.playing) this.frame = requestAnimationFrame(this.tick);
  };

  private tick = (): void => {
    if (!this.el) return;
    this.time = this.el.currentTime;
    this.emit();
    if (this.playing) this.frame = requestAnimationFrame(this.tick);
  };

  private sync(): void {
    if (!this.el) return;
    this.time = this.el.currentTime;
    this.duration = this.el.duration;
    this.playing = !this.el.paused && !this.el.ended;
  }

  /** Tells subscribers the playhead or state changed (protected for test doubles). */
  protected emit(): void {
    for (const l of this.listeners) l();
  }
}
