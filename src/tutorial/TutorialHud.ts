/**
 * DOM layer for the opening tutorial: the instruction card at the bottom of the screen, and the
 * screen-space waypoint marker that tracks a world position.
 *
 * Deliberately inert. It renders what TutorialSequence tells it to and reports nothing back — every
 * gate the tutorial advances on is read from the real game systems (InputManager, PlayerController,
 * InteractionSystem), never from a button on this card, so the player is always being asked to do
 * the actual thing rather than to acknowledge a message.
 */

export interface TutorialKeyChip {
  /** KeyboardEvent.code this chip lights up for. `Mouse` is a pseudo-code the sequence marks itself. */
  code: string;
  label: string;
  /** Shown dashed and dimmed, and never required — a mechanic worth knowing, not worth blocking on. */
  optional?: boolean;
}

export interface TutorialCard {
  /** 1-based, for the "Step 2 / 5" line. */
  index: number;
  total: number;
  title: string;
  /** Trusted markup (may contain <kbd>) — authored in TutorialSequence, never player-supplied. */
  body: string;
  keys?: TutorialKeyChip[];
}

const ARROW_SVG =
  '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h15"/><path d="M12 5l7 7-7 7"/></svg>';

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

export class TutorialHud {
  private root = el('div', 'tut-root');
  private card = el('div', 'tut-card');
  private stepEl = el('div', 'tut-step');
  private titleEl = el('div', 'tut-title');
  private bodyEl = el('div', 'tut-body');
  private keyRow = el('div', 'tut-keys');
  private hintEl = el('div', 'tut-hint');
  private dotRow = el('div', 'tut-dots');
  private skipEl = el('div', 'tut-skip');
  private waypoint = el('div', 'tut-waypoint');
  private waypointArrow = el('div', 'tut-waypoint-arrow');
  private waypointPip = el('div', 'tut-waypoint-pip');
  private waypointDist = el('div', 'tut-waypoint-dist');
  private chips = new Map<string, HTMLElement>();
  private flashTimeoutId: number | undefined;
  private cardTop = Infinity;
  private onResize = (): void => this.measureCard();

  mount(): void {
    const head = el('div', 'tut-head');
    head.appendChild(this.stepEl);
    head.appendChild(this.titleEl);
    this.card.appendChild(head);
    this.card.appendChild(this.bodyEl);
    this.card.appendChild(this.keyRow);
    this.card.appendChild(this.hintEl);
    this.card.appendChild(this.dotRow);

    this.waypointArrow.innerHTML = ARROW_SVG;
    this.waypoint.appendChild(this.waypointArrow);
    this.waypoint.appendChild(this.waypointPip);
    this.waypoint.appendChild(this.waypointDist);

    this.skipEl.innerHTML = '<kbd>Space</kbd>Skip';

    this.root.appendChild(this.card);
    this.root.appendChild(this.waypoint);
    this.root.appendChild(this.skipEl);

    // Inserted at the front of #ui-root rather than appended: panels (character sheet, settings,
    // the battle overlay) are positioned siblings with no z-index of their own, so inside
    // #ui-root's stacking context they paint in DOM order. Appending would float the tutorial card
    // on top of the very panel the tutorial asks the player to open.
    const uiRoot = document.getElementById('ui-root')!;
    uiRoot.insertBefore(this.root, uiRoot.firstChild);
    // The card takes over the bottom of the screen, which the toast stack and the click-to-look
    // badge already sit in. They move up while it is mounted rather than overlapping it — see the
    // `body.tutorial-active` rules in style.css.
    document.body.classList.add('tutorial-active');
    window.addEventListener('resize', this.onResize);
  }

  private measureCard(): void {
    this.cardTop = this.card.classList.contains('visible') ? this.card.getBoundingClientRect().top : Infinity;
  }

  /**
   * Top edge of the instruction card in CSS pixels, or Infinity while no card is up — the waypoint
   * marker uses it to stay off the card's text.
   *
   * Cached and refreshed only when the card's content or the viewport changes, rather than measured
   * on demand: the waypoint asks every frame, and getBoundingClientRect forces a layout flush.
   */
  cardTopEdge(): number {
    return this.cardTop;
  }

  setCard(card: TutorialCard): void {
    this.card.classList.remove('done');
    this.stepEl.textContent = `Step ${card.index} / ${card.total}`;
    this.titleEl.textContent = card.title;
    this.bodyEl.innerHTML = card.body;

    this.keyRow.innerHTML = '';
    this.chips.clear();
    for (const key of card.keys ?? []) {
      const chip = el('div', key.optional ? 'tut-key optional' : 'tut-key');
      chip.textContent = key.label;
      this.keyRow.appendChild(chip);
      this.chips.set(key.code, chip);
    }

    this.setHint(null);

    this.dotRow.innerHTML = '';
    for (let i = 1; i <= card.total; i++) {
      const dot = document.createElement('i');
      if (i < card.index) dot.className = 'done';
      else if (i === card.index) dot.className = 'active';
      this.dotRow.appendChild(dot);
    }

    this.card.classList.add('visible');
    this.measureCard();
  }

  markKey(code: string): void {
    this.chips.get(code)?.classList.add('done');
  }

  /** Marks the current card cleared, held on screen for a beat before the next one replaces it. */
  markCardComplete(): void {
    this.card.classList.add('done');
    this.stepEl.textContent = 'Complete';
    this.setHint(null);
    for (const chip of this.chips.values()) chip.classList.add('done');
    this.measureCard();
  }

  setHint(text: string | null): void {
    this.hintEl.textContent = text ?? '';
    this.hintEl.classList.toggle('visible', text !== null);
    this.measureCard();
  }

  /** Attention pulse — used when the player tries something the tutorial has not unlocked yet. */
  flash(): void {
    this.card.classList.remove('flash');
    // Reading offsetWidth forces a reflow so re-adding the class restarts the animation rather
    // than being coalesced into a no-op by the style recalc.
    void this.card.offsetWidth;
    this.card.classList.add('flash');
    window.clearTimeout(this.flashTimeoutId);
    this.flashTimeoutId = window.setTimeout(() => this.card.classList.remove('flash'), 600);
  }

  hideCard(): void {
    this.card.classList.remove('visible');
    this.measureCard();
  }

  showSkipHint(show: boolean): void {
    this.skipEl.classList.toggle('visible', show);
  }

  /**
   * @param x        Left offset in CSS pixels of the marker's centre.
   * @param y        Top offset in CSS pixels of the marker's centre.
   * @param angle    Screen-space heading in radians for the off-screen arrow (0 = pointing right).
   * @param offscreen Whether the target is outside the viewport, so the arrow replaces the pip.
   * @param metres   Straight-line distance from the camera, shown under the marker.
   */
  placeWaypoint(x: number, y: number, angle: number, offscreen: boolean, metres: number): void {
    this.waypoint.classList.add('visible');
    this.waypoint.classList.toggle('offscreen', offscreen);
    this.waypoint.style.left = `${x}px`;
    this.waypoint.style.top = `${y}px`;
    this.waypointArrow.style.transform = `rotate(${angle}rad)`;
    this.waypointDist.textContent = `${Math.max(0, Math.round(metres))} m`;
  }

  hideWaypoint(): void {
    this.waypoint.classList.remove('visible');
  }

  destroy(): void {
    window.clearTimeout(this.flashTimeoutId);
    window.removeEventListener('resize', this.onResize);
    document.body.classList.remove('tutorial-active');
    this.root.remove();
  }
}
