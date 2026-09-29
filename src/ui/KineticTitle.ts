import { motion, DUR, staggerDelays } from '../motion';

/**
 * Animates an arrival title letter by letter in reading order, each letter fading in with a brief
 * glow. Reduced motion shows the whole word with a short fade.
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
  // The last letter starts within 0.55 s, however long the name.
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
