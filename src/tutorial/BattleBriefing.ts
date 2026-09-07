import { AudioSystem } from '../audio/AudioSystem';
import { InputManager } from '../core/InputManager';

/**
 * The last beat of the opening tutorial: a one-screen explanation of how the threat-response puzzle
 * is played, shown between the console-boot cinematic and BattlePuzzle itself.
 *
 * It exists because the puzzle's own first round starts on a timer — a player meeting it cold has
 * to work out that the telegraph is a sequence to memorise while that sequence is already playing.
 * Shown only on the run that reaches the puzzle for the first time; every later route into the ship
 * has `tutorial_battle_complete` set and never comes through here.
 */

const BEATS = [
  {
    icon: '◎',
    title: 'Watch',
    text: 'The console names each system the contact is about to hit, one after another. Remember the order.',
  },
  {
    icon: '◈',
    title: 'Repeat',
    text: 'Then click those same systems back in that same order, before the power timer empties.',
  },
  {
    icon: '▲',
    title: 'Recover',
    text: 'Three rounds, each a step longer. A wrong call or an empty timer only restarts the round — you cannot lose the ship here.',
  },
];

export function showBattleBriefing(onBegin: () => void): void {
  // The player still holds pointer lock coming out of the tutorial, so there is no cursor to click
  // the button with until this is released.
  InputManager.exitPointerLock();

  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay visible interactive';

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.id = 'battle-briefing';

  const heading = document.createElement('h2');
  heading.textContent = 'Threat Response';
  panel.appendChild(heading);

  const subtitle = document.createElement('div');
  subtitle.className = 'subtitle';
  subtitle.textContent = 'Reserve power is limited. You can protect one system at a time, in the order it is needed.';
  panel.appendChild(subtitle);

  const list = document.createElement('div');
  list.className = 'briefing-beats';
  for (const beat of BEATS) {
    const row = document.createElement('div');
    row.className = 'briefing-beat';
    row.innerHTML =
      `<div class="briefing-icon">${beat.icon}</div>` +
      `<div><div class="briefing-beat-title">${beat.title}</div><div class="briefing-beat-text">${beat.text}</div></div>`;
    list.appendChild(row);
  }
  panel.appendChild(list);

  const button = document.createElement('button');
  button.className = 'briefing-begin';
  button.textContent = 'Take the Console';
  panel.appendChild(button);

  const footer = document.createElement('div');
  footer.className = 'briefing-footer';
  footer.innerHTML = 'or press <kbd>Enter</kbd>';
  panel.appendChild(footer);

  overlay.appendChild(panel);
  document.getElementById('ui-root')!.appendChild(overlay);
  button.focus();

  let begun = false;
  const begin = (): void => {
    if (begun) return;
    begun = true;
    window.removeEventListener('keydown', onKeyDown);
    overlay.remove();
    AudioSystem.playUiClick();
    onBegin();
  };
  function onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
      e.preventDefault();
      begin();
    }
  }
  button.addEventListener('click', begin);
  window.addEventListener('keydown', onKeyDown);
}
