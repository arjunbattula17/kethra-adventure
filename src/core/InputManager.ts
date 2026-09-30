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
  /**
   * Whether the game may capture the mouse (pointer lock) for looking around; a canvas click does
   * so. Screens that use a visible cursor turn this off (the Intercept chart, where the player
   * drags), since pointer lock freezes the cursor position.
   */
  captureAllowed = true;

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
      if (this.captureAllowed && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    });
    // Mouse buttons read like keys, as 'Mouse0' (left), 'Mouse2' (right), so a binding can list them.
    // On the window: with the mouse captured every press lands on the canvas anyway, and without it
    // the HUD layer sits over the canvas and would swallow them.
    window.addEventListener('mousedown', (e) => {
      const code = `Mouse${e.button}`;
      if (!this.keys.has(code)) this.justPressed.add(code);
      this.keys.add(code);
    });
    window.addEventListener('mouseup', (e) => this.keys.delete(`Mouse${e.button}`));
    // The right button holds the lantern's hood on Kethra; the browser's menu would steal it.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

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
    if (!this.captureAllowed) return;
    this.lockedElement?.requestPointerLock?.();
  }
}

export const InputManager = new InputManagerImpl();
