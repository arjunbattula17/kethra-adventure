import { DUR, EXIT_FACTOR, SPRING, STAGGER } from './tokens';
import { cssBezier } from './ease';
import { springToCss } from './spring';

/**
 * Writes the motion tokens into CSS custom properties, so stylesheets and code share one set of
 * values. Imported by main.ts before anything paints; it pulls in no three.js.
 */
export function applyCssTokens(): void {
  const root = document.documentElement.style;
  for (const [name, seconds] of Object.entries(DUR)) {
    root.setProperty(`--dur-${name}`, `${Math.round(seconds * 1000)}ms`);
    root.setProperty(`--dur-${name}-exit`, `${Math.round(seconds * EXIT_FACTOR * 1000)}ms`);
  }
  root.setProperty('--stagger-step', `${Math.round(STAGGER.step * 1000)}ms`);
  root.setProperty('--ease-decelerate', cssBezier('decelerate'));
  root.setProperty('--ease-accelerate', cssBezier('accelerate'));
  root.setProperty('--ease-standard', cssBezier('standard'));
  for (const [name, cfg] of Object.entries(SPRING)) {
    const css = springToCss(cfg);
    root.setProperty(`--ease-spring-${name}`, css ? css.easing : cssBezier('decelerate'));
    root.setProperty(`--dur-spring-${name}`, `${Math.round((css ? css.duration : DUR.small) * 1000)}ms`);
  }
}
