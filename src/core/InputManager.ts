class InputManagerImpl {
  private keys = new Set<string>();
  private justPressed = new Set<string>();
  pointerLocked = false;
  mouseDeltaX = 0;
  mouseDeltaY = 0;
  private lockedElement: HTMLElement | null = null;
  private programmaticExit = false;
  private delta = { x: 0, y: 0 };
  /** The player released the mouse themselves (Esc while it was captured). The pause menu listens. */
  onUserUnlock: (() => void) | null = null;

  init(canvas: HTMLElement): void {
    this.lockedElement = canvas;

    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    });

    document.addEventListener('pointerlockchange', () => {
      const wasLocked = this.pointerLocked;
      this.pointerLocked = document.pointerLockElement === this.lockedElement;
      // A browser eats the Esc that releases a captured mouse, so the release itself is the only
      // signal that the player asked to stop. Releases the game makes (opening a panel) don't count.
      if (wasLocked && !this.pointerLocked && !this.programmaticExit) this.onUserUnlock?.();
      this.programmaticExit = false;
    });

    document.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.mouseDeltaX += e.movementX;
        this.mouseDeltaY += e.movementY;
      }
    });
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  wasJustPressed(code: string): boolean {
    return this.justPressed.has(code);
  }

  /** Mouse movement since the last call. Returns a shared object: read it before the next call. */
  consumeMouseDelta(): { x: number; y: number } {
    this.delta.x = this.mouseDeltaX;
    this.delta.y = this.mouseDeltaY;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return this.delta;
  }

  endFrame(): void {
    this.justPressed.clear();
  }

  exitPointerLock(): void {
    if (document.pointerLockElement) {
      this.programmaticExit = true;
      document.exitPointerLock();
    }
  }

  requestPointerLock(): void {
    this.lockedElement?.requestPointerLock?.();
  }
}

export const InputManager = new InputManagerImpl();
