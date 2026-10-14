import type { Engine, GameScene, PrepareOptions } from './Engine';
import type { Pace, Pacer } from './prepare';

type Stage = Parameters<NonNullable<PrepareOptions['onProgress']>>[1];

/**
 * A scene being prepared while something else is on screen (the Wren, behind the intro). Its pace
 * can change mid-way (frugal while the intro plays, all-out once the player is waiting on it), and
 * whoever ends up waiting can take over the progress reports for a loading bar.
 */
export class BackgroundPrep<T extends GameScene> {
  readonly scene: T;
  readonly pacer: Pacer;
  /** Settles when the build (geometry, painting) is done and only GPU work is left, or on failure. */
  readonly built: Promise<void>;
  /** The prepared scene; rejects if the build failed (a kit that would not load). */
  readonly done: Promise<T>;
  finished = false;
  /** Where the preparation has got to, for a loading bar joining late. */
  stage: Stage = 'build';
  fraction = 0;
  onProgress: ((fraction: number, stage: Stage) => void) | null = null;

  constructor(engine: Engine, scene: T, pace: Pace) {
    this.scene = scene;
    this.pacer = engine.newPacer(pace);
    let markBuilt!: () => void;
    this.built = new Promise<void>((resolve) => (markBuilt = resolve));
    this.done = engine
      .prepareScene(scene, {
        pacer: this.pacer,
        onProgress: (fraction, stage) => {
          if (stage !== 'build') markBuilt();
          this.stage = stage;
          this.fraction = fraction;
          this.onProgress?.(fraction, stage);
        },
      })
      .then(() => {
        this.finished = true;
        return scene;
      })
      .finally(markBuilt);
    // Failure is reported to whoever awaits `done`; this keeps an unobserved one from being logged
    // as unhandled in the meantime.
    this.done.catch(() => {});
  }
}
