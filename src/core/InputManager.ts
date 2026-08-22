class InputManagerImpl {
  private keys = new Set<string>();
  private justPressed = new Set<string>();
  pointerLocked = false;
  mouseDeltaX = 0;
  mouseDeltaY = 0;
  private lockedElement: HTMLElement | null = null;

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
      this.pointerLocked = document.pointerLockElement === this.lockedElement;
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

  consumeMouseDelta(): { x: number; y: number } {
    const d = { x: this.mouseDeltaX, y: this.mouseDeltaY };
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return d;
  }

  endFrame(): void {
    this.justPressed.clear();
  }

  exitPointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  requestPointerLock(): void {
    this.lockedElement?.requestPointerLock?.();
  }
}

export const InputManager = new InputManagerImpl();
