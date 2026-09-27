import { motion, DUR, staggerDelays } from '../motion';

/**
 * Kinetic type for arrival titles (docs/DESIGN.md §3, "Signature: light travels"): the name lights
 * letter by letter in reading order, each letter flaring as the wavefront passes and settling to
 * ink. Never a slide-up. Reduced motion shows the word with a short fade.
 */
export function playKineticTitle(el: HTMLElement, text: string, glow = 'rgba(217, 164, 65, 0.9)'): void {
  el.textContent = '';
  el.setAttribute('aria-label', text);
  const letters = [...text].map((ch) => {
    const span = document.createElement('span');
    span.className = 'kt-letter';
    span.textContent = ch === ' ' ? ' ' : ch;
    span.setAttribute('aria-hidden', 'true');
    el.appendChild(span);
    return span;
  });
  if (motion.reduced) {
    motion.ui.animate(el, [{ opacity: 0 }, { opacity: 1 }], { dur: 'small' });
    return;
  }
  // The sweep is authored, not a list stagger: a longer name still crosses in about half a second.
  const delays = staggerDelays(letters.length, 0.045, 0.55);
  letters.forEach((span, i) => {
    motion.ui.animate(
      span,
      [
        { opacity: 0, transform: 'translateY(0.12em)', textShadow: '0 0 0 rgba(0,0,0,0)' },
        { opacity: 1, transform: 'none', textShadow: `0 0 18px ${glow}`, offset: 0.35 },
        { opacity: 1, transform: 'none', textShadow: '0 0 0 rgba(0,0,0,0)' },
      ],
      { dur: DUR.large, delay: delays[i], fill: 'backwards', reduced: 'keep' },
    );
  });
}
