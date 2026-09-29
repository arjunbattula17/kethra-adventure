import { bus } from '../core/EventBus';
import { PanelManager } from '../ui/PanelManager';
import { TutorialBeacon } from '../tutorial/TutorialBeacon';
import { CONSOLE_APPROACH, MONITOR_ANCHOR } from './interior/console';
import type { ShipInteriorScene } from './ShipInteriorScene';

/** Farther than this from the console's approach point, the player gets the light column to walk to. */
const NEAR = 2.2;

/**
 * Points the player at the navigation console once MG1 has plotted the course: Kethra is the
 * objective, and the console is where the course is set. The same markers the tutorial used to walk
 * the player to that console, so they already read as "go here": a light column on the deck from
 * across the room, brackets on the monitor bank up close. Hidden while the player isn't free to move
 * (a panel is open, a cinematic holds the camera), and gone for good once a course is set.
 */
export class ConsoleGuide {
  private readonly ship: ShipInteriorScene;
  private readonly beacon: TutorialBeacon;
  private readonly removeHook: () => void;
  private readonly offTravel: () => void;
  private disposed = false;

  constructor(ship: ShipInteriorScene) {
    this.ship = ship;
    this.beacon = new TutorialBeacon(ship.scene);
    this.removeHook = ship.addFrameHook((elapsed) => this.update(elapsed));
    this.offTravel = bus.on('galaxy:travel_to', () => this.dispose());
  }

  private update(elapsed: number): void {
    const player = this.ship.player;
    if (!player.enabled || PanelManager.isOpen) {
      this.beacon.hide();
      return;
    }
    const p = player.rig.position;
    if (Math.hypot(p.x - CONSOLE_APPROACH.x, p.z - CONSOLE_APPROACH.z) > NEAR) this.beacon.showPillarAt(CONSOLE_APPROACH.x, CONSOLE_APPROACH.z);
    else this.beacon.showBracketAt(MONITOR_ANCHOR.x, MONITOR_ANCHOR.y, MONITOR_ANCHOR.z + 0.25);
    this.beacon.update(elapsed);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeHook();
    this.offTravel();
    this.beacon.dispose();
  }
}
