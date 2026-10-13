import { gameState } from '../core/GameState';
import type { AttributeKey } from '../core/GameState';
import { Survey } from '../journal/Survey';
import { SURVEY_LEVEL_NAMES } from '../content/discoveries';
import type { SurveyLevel } from '../content/discoveries';
import { chartTrip } from '../galaxy/planetData';
import { motion, DUR, STAGGER, staggerDelays } from '../motion';

const LEVELS: SurveyLevel[] = ['wren', 'kethra', 'vessek'];
const ATTRIBUTES: [AttributeKey, string][] = [
  ['insight', 'Insight'],
  ['archaeology', 'Archaeology'],
  ['engineering', 'Engineering'],
  ['traversal', 'Traversal'],
  ['persuasion', 'Persuasion'],
  ['perception', 'Perception'],
];

/** What the bargain for the alloy was, by the flag Varro's dialogue left. */
const DEALS: [string, string][] = [
  ['vessek_deal_message', 'You promised Varro the ledger would go home, and sent it.'],
  ['vessek_deal_knowledge', 'You traded what Kethra taught you for the Anchorage’s trust.'],
  ['vessek_deal_repair', 'You paid for the alloy in repairs.'],
];

/** The journey as the save records it: the figures, and what the player chose along the way. */
export function journeyFacts(): { days: number; found: number; total: number; level: number; choices: string[] } {
  const has = (flag: string) => gameState.hasFlag(flag);
  // Each trip is counted once flown: Kethra's as plotted in MG1, the Anchorage's at the chart's figure.
  let days = 0;
  if (has('canopy_flown')) days += gameState.data.course?.days ?? chartTrip('kethra').days;
  if (has('vessek_alloy_given')) days += chartTrip('vessek').days;

  const choices: string[] = [];
  if (has('kethra_mechanism_solved')) choices.push('You woke Kethra’s Heart with the Rite in its true order.');
  if (has('kethra_hush_unseen')) choices.push('The Wickmoth never once caught your light.');
  else if (has('kethra_moth_caught')) choices.push('The Wickmoth caught your light, and fanned you back.');
  if (has('vessek_alloy_given')) choices.push(DEALS.find(([flag]) => has(flag))?.[1] ?? 'You kept your core, and Varro gave the alloy freely.');
  if (has('wren_found_locker')) choices.push('You recovered the Wren’s day-22 log from Carrow’s locker.');
  if (has('kethra_found_oshel')) choices.push('You found whose grove Fen was fighting for.');

  return {
    days,
    found: LEVELS.reduce((n, level) => n + Survey.found(level), 0),
    total: LEVELS.reduce((n, level) => n + Survey.total(level), 0),
    level: gameState.data.level,
    choices,
  };
}

/**
 * The ending's summary (docs/DESIGN.md §6): three figures that count up, the six skills, the survey
 * world by world, and the choices made. `play()` brings the blocks in one after another.
 */
export function buildJourneySummary(): { el: HTMLElement; play: () => void } {
  const facts = journeyFacts();
  const el = document.createElement('div');
  el.className = 'summary';
  const counted: { node: HTMLElement; to: number }[] = [];
  const blocks: HTMLElement[] = [];
  const block = (className: string): HTMLElement => {
    const b = document.createElement('div');
    b.className = className;
    el.appendChild(b);
    blocks.push(b);
    return b;
  };
  /** A number that counts up to `to` when the summary plays. */
  const count = (parent: HTMLElement, to: number, className: string): void => {
    const node = document.createElement('span');
    node.className = `${className} num`;
    node.textContent = '0';
    parent.appendChild(node);
    counted.push({ node, to });
  };
  const text = (parent: HTMLElement, tag: string, className: string, value: string): void => {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = value;
    parent.appendChild(node);
  };

  const figures = block('summary-figures');
  const figure = (label: string, to: number, of?: number): void => {
    const tile = document.createElement('div');
    tile.className = 'summary-figure';
    const value = document.createElement('div');
    value.className = 'summary-value';
    count(value, to, 'summary-number');
    if (of !== undefined) text(value, 'span', 'summary-of num', ` of ${of}`);
    tile.appendChild(value);
    text(tile, 'div', 'eyebrow', label);
    figures.appendChild(tile);
  };
  figure('Days in flight', facts.days);
  figure('Survey finds', facts.found, facts.total);
  figure('Level', facts.level);

  const stats = block('summary-stats');
  for (const [key, label] of ATTRIBUTES) {
    const stat = document.createElement('div');
    stat.className = 'summary-stat';
    text(stat, 'span', 'summary-stat-name', label);
    count(stat, gameState.data.attributes[key], 'summary-stat-value');
    stats.appendChild(stat);
  }

  const worlds = block('summary-worlds');
  for (const level of LEVELS) {
    text(worlds, 'span', 'summary-world num', `${SURVEY_LEVEL_NAMES[level]}: ${Survey.found(level)} of ${Survey.total(level)}`);
  }

  if (facts.choices.length) {
    const list = block('summary-choices');
    for (const line of facts.choices) text(list, 'p', 'summary-choice', line);
  }

  const play = (): void => {
    const delays = staggerDelays(blocks.length, STAGGER.step * 4, STAGGER.cap * 3);
    blocks.forEach((b, i) => {
      motion.ui.animate(b, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { dur: 'medium', delay: delays[i], fill: 'backwards' });
    });
    if (motion.reduced) {
      for (const { node, to } of counted) node.textContent = String(to);
      return;
    }
    counted.forEach(({ node, to }, i) => {
      motion.ui.tween({
        duration: DUR.large + Math.min(0.5, to * 0.02),
        delay: i < 3 ? delays[0] : delays[1],
        update: (e) => {
          node.textContent = String(Math.round(to * e));
        },
      });
    });
  };
  return { el, play };
}
