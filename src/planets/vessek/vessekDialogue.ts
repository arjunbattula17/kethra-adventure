// Vessek Anchorage dialogue: Harbormaster Ilse Varro and Dace (LORE.md, Characters).
//
// Voice (LORE.md, Voice guide): the Anchorage is practical and joking, and counts things. Nodes
// stay at three sentences or fewer.
//
// FLAGS set here:
//   vessek_dace_met           first conversation with Dace
//   vessek_dace_stars         the player told Dace what other stars look like
//   vessek_varro_met          the deal is struck; Varro sends the player to the aft junction
//   vessek_deal_message       persuasion route: Varro's hall lamps skip their auto-reset
//                             (VessekScene applies it)
//   vessek_deal_knowledge     insight route: the player also gets the junction door's code
//   vessek_deal_repair        engineering route: the player fixes the ring's bus
//   vessek_junction_code      the player knows the junction keypad's code
//   vessek_alloy_given        the reward has been handed over
//
// FLAGS read here, set by VessekScene:
//   vessek_school_lit, vessek_junction_reset (the player reported it: VessekScene fires the pulse),
//   vessek_pulse, vessek_power_restored, vessek_ledger_read

import type { DialogueTree, DialogueOption } from '../../dialogue/DialogueSystem';
import { gameState } from '../../core/GameState';

const DEAL_FLAGS = ['vessek_deal_message', 'vessek_deal_knowledge', 'vessek_deal_repair'];
const hasDeal = () => DEAL_FLAGS.some((f) => gameState.hasFlag(f));

function varroStartNode(): string {
  if (gameState.hasFlag('vessek_alloy_given')) return 'varro_after';
  if (gameState.hasFlag('vessek_ledger_read')) return 'varro_reversal';
  if (gameState.hasFlag('vessek_power_restored')) return 'varro_restored';
  if (gameState.hasFlag('vessek_pulse')) return 'varro_crisis';
  if (gameState.hasFlag('vessek_junction_reset')) return 'varro_junction_done';
  if (gameState.hasFlag('vessek_varro_met')) return 'varro_waiting';
  return 'varro_greeting';
}

function coreOptions(): DialogueOption[] {
  const end = () => gameState.setFlag('vessek_varro_met');
  return [
    { text: 'The core is my only way home. I can’t trade it.', next: 'varro_refuse', onChoose: end },
    {
      text: 'Help me fix my comms, and the Wren carries your ledger home. Every name in it.',
      next: 'varro_deal_message',
      requires: { attribute: 'persuasion', min: 3 },
      lockedHint: 'There’s a better offer here, if you could find the words.',
      onChoose: () => {
        gameState.setFlag('vessek_deal_message');
        end();
      },
    },
    ...(gameState.hasFlag('kethra_mechanism_solved')
      ? [{
          text: 'I woke Kethra’s Heart. I know how Kindling machines are tuned. That’s worth something.',
          next: 'varro_deal_knowledge',
          requires: { attribute: 'insight' as const, min: 2 },
          lockedHint: 'What you saw on Kethra matters here. You can’t put it into words yet.',
          onChoose: () => {
            gameState.setFlag('vessek_deal_knowledge');
            end();
          },
        }]
      : []),
    {
      text: 'Your power bus is running at its limit. I can hear it. Let me fix it instead.',
      next: 'varro_deal_repair',
      requires: { attribute: 'engineering', min: 2 },
      lockedHint: 'Something in the hum of this place sounds wrong. You can’t say what.',
      onChoose: () => {
        gameState.setFlag('vessek_deal_repair');
        end();
      },
    },
  ];
}

export function varroDialogue(): DialogueTree {
  const tree: DialogueTree = {
    id: 'vessek_varro',
    startNode: varroStartNode(),
    nodes: {
      varro_greeting: {
        id: 'varro_greeting',
        speaker: 'Harbormaster Ilse Varro',
        text: '"Ilse Varro, harbormaster. You’ve got amber running lights and a working hyperdrive core. I’ve got three hundred people, twenty-one ships and a ring held together with cable, so let’s talk trade."',
        options: [
          { text: 'Who are you people?', next: 'varro_history' },
          { text: 'What do you want for conduit alloy?', next: 'varro_core' },
        ],
      },
      varro_history: {
        id: 'varro_history',
        speaker: 'Harbormaster Ilse Varro',
        text: '"Castaways, fourth generation. Every ship here fell out of the sky the way yours did: a white flash, then nothing works. We write every arrival in the ledger, so nobody gets forgotten."',
        options: [{ text: 'What do you want for conduit alloy?', next: 'varro_core' }],
      },
      varro_core: {
        id: 'varro_core',
        speaker: 'Harbormaster Ilse Varro',
        text: '"Your core. One working drive and one of our ships goes home for help. In return, all the alloy you can carry."',
        options: coreOptions(),
      },
      varro_refuse: {
        id: 'varro_refuse',
        speaker: 'Harbormaster Ilse Varro',
        text: '"Fair. Everyone in this ring has said no to something. Then earn the alloy the slow way."',
        options: [{ text: 'How?', next: 'varro_junction' }],
      },
      varro_deal_message: {
        id: 'varro_deal_message',
        speaker: 'Harbormaster Ilse Varro',
        text: '"Sixty years of names, finally going somewhere." She reaches past you and throws the lockout on her own hall lamps. "They trip the bus every time we load it. That’s one less thing in your way."',
        options: [{ text: 'In my way of what?', next: 'varro_junction' }],
      },
      varro_deal_knowledge: {
        id: 'varro_deal_knowledge',
        speaker: 'Harbormaster Ilse Varro',
        text: '"This ring is Kindling too. Nobody here can read a line of it." She leans in, interested for the first time. "Then you’ll want the junction door’s code: four, one, seven."',
        onEnter: () => gameState.setFlag('vessek_junction_code'),
        options: [{ text: 'Which junction?', next: 'varro_junction' }],
      },
      varro_deal_repair: {
        id: 'varro_deal_repair',
        speaker: 'Harbormaster Ilse Varro',
        text: '"You can hear it too? Then you’re hired. Start where it went wrong."',
        options: [{ text: 'Where?', next: 'varro_junction' }],
      },
      varro_junction: {
        id: 'varro_junction',
        speaker: 'Harbormaster Ilse Varro',
        text: '"The aft junction, past the hydroponics tanker. It dropped off the bus a week ago, and the tanker’s heaters run through it. Nobody but Dace fits the ducts, and she’ll want her fans off first."',
        options: [{ text: 'I’ll get it back on the bus.', next: null }],
      },
      varro_waiting: {
        id: 'varro_waiting',
        speaker: 'Harbormaster Ilse Varro',
        text: '"The junction’s still dark. Dace’s school is through the west hatch; she knows every duct on the ring."',
        options: [{ text: 'On my way.', next: null }],
      },
      varro_junction_done: {
        id: 'varro_junction_done',
        speaker: 'Harbormaster Ilse Varro',
        text: '"The junction’s back? Then the heaters can finally—" She stops. Every lamp in the hall flickers at once.',
        options: [{ text: '…', next: null }],
      },
      varro_crisis: {
        id: 'varro_crisis',
        speaker: 'Harbormaster Ilse Varro',
        text: '"Rehearsal pulse, two years early. The pumps and heaters are on the junction, the scrubbers in the tanker, and the lamps that reset themselves will trip the bus the moment you load it. Dace’s lockout boxes are in the ducts."',
        options: [{ text: 'On my way.', next: null }],
      },
      varro_restored: {
        id: 'varro_restored',
        speaker: 'Harbormaster Ilse Varro',
        text: '"You kept the seedlings alive. The ledger’s on the lectern by my desk. Read the last page, then tell me I’m wrong."',
        options: [{ text: 'I’ll read it.', next: null }],
      },
      varro_reversal: {
        id: 'varro_reversal',
        speaker: 'Harbormaster Ilse Varro',
        text: '"Sixty years, every rehearsal on schedule to the week. Then someone relit Kethra, and eleven days later, this."',
        options: [
          { text: 'That was me. I woke their Heart. The Hearts must be relays, and I made the signal louder.', next: 'varro_resolve' },
          { text: 'Something on Kethra changed. I think I know what.', next: 'varro_resolve' },
        ],
      },
      varro_resolve: {
        id: 'varro_resolve',
        speaker: 'Harbormaster Ilse Varro',
        text: '',
        options: [{ text: 'Thank you. I’ll get word out.', next: null }],
        onEnter: () => {
          const node = tree.nodes.varro_resolve;
          const lead = hasDeal()
            ? gameState.hasFlag('vessek_deal_message')
              ? '"Then take the alloy and fix your comms, and send the ledger home like we agreed.'
              : gameState.hasFlag('vessek_deal_knowledge')
                ? '"Then you know more about that signal than anyone alive. The alloy’s yours; that knowledge was worth it.'
                : '"Then you fixed a problem you helped make, and I call that even. The alloy’s yours.'
            : '"You didn’t know. Nobody could have. Take the alloy and keep your core.';
          node.text = `${lead} Whatever’s calling us, you’ve seen more of it than we have in sixty years."`;
          if (!gameState.hasFlag('vessek_alloy_given')) {
            gameState.setFlag('vessek_alloy_given');
            gameState.addResource('conduit_alloy', 3);
            if (gameState.hasFlag('vessek_deal_knowledge')) gameState.addAttributeXp('insight', 1);
            else if (gameState.hasFlag('vessek_deal_repair')) gameState.addAttributeXp('engineering', 1);
            else gameState.addAttributeXp('persuasion', 1);
          }
        },
      },
      varro_after: {
        id: 'varro_after',
        speaker: 'Harbormaster Ilse Varro',
        text: '"Go on, get that comm array working. And if anyone out there answers, tell them to bring spare fuses."',
        options: [{ text: 'I will.', next: null }],
      },
    },
  };
  return tree;
}

export function daceDialogue(): DialogueTree {
  const pulse = gameState.hasFlag('vessek_pulse') && !gameState.hasFlag('vessek_power_restored');
  const lit = gameState.hasFlag('vessek_school_lit');
  const start = pulse
    ? 'dace_pulse'
    : !gameState.hasFlag('vessek_dace_met')
      ? 'dace_hello'
      : !lit
        ? 'dace_board'
        : gameState.hasFlag('vessek_varro_met') && !gameState.hasFlag('vessek_junction_reset')
          ? 'dace_ducts'
          : 'dace_again';
  const tree: DialogueTree = {
    id: 'vessek_dace',
    startNode: start,
    nodes: {
      dace_hello: {
        id: 'dace_hello',
        speaker: 'Dace',
        text: '"You’re the amber lights on our east clamp! I’m Dace. This is the school, when the lamps are on, and they’re not: the bus is full."',
        onEnter: () => gameState.setFlag('vessek_dace_met'),
        options: [
          { text: 'Full?', next: 'dace_board' },
          { text: 'What is this place?', next: 'dace_place' },
        ],
      },
      dace_place: {
        id: 'dace_place',
        speaker: 'Dace',
        text: '"Twenty-one ships and one really old ring. The Lantern Bay got here first, so it’s the town hall. This hold was a cargo hull; now it’s where we learn stuff."',
        options: [{ text: 'And the lamps?', next: 'dace_board' }, { text: 'Thanks.', next: null }],
      },
      dace_board: {
        id: 'dace_board',
        speaker: 'Dace',
        text: '"The whole ring carries six units, and it’s at five. The school lamps want two. Something has to go off first, and nobody ever asks me what."',
        options: [{ text: 'Let me look at your board.', next: null }],
      },
      dace_ducts: {
        id: 'dace_ducts',
        speaker: 'Dace',
        text: '"Fans off means the ducts are quiet. Mine’s in the north wall, past the desks: up the ladder and you drop into the tanker. The hall duct goes to the junction, if you don’t mind a ladder."',
        options: [{ text: 'Thanks, Dace.', next: null }, { text: 'Can I ask you something else?', next: 'dace_again' }],
      },
      dace_again: {
        id: 'dace_again',
        speaker: 'Dace',
        text: '"Hey, can I ask YOU something? Is it true other stars are different colours? Ours is the only one I’ve ever seen up close."',
        onEnter: () => gameState.setFlag('vessek_dace_met'),
        options: [
          {
            text: 'Some are red, some are blue-white. The one I grew up under is yellow.',
            next: 'dace_stars',
            onChoose: () => {
              if (!gameState.hasFlag('vessek_dace_stars')) {
                gameState.setFlag('vessek_dace_stars');
                gameState.addAttributeXp('persuasion', 1);
              }
            },
          },
          { text: 'Maybe later.', next: null },
        ],
      },
      dace_stars: {
        id: 'dace_stars',
        speaker: 'Dace',
        text: '"Yellow. Huh." Dace looks at the drawings on the wall for a long moment. "When you get your ship working, I want to see a blue one."',
        options: [{ text: 'Deal.', next: null }],
      },
      dace_pulse: {
        id: 'dace_pulse',
        speaker: 'Dace',
        text: '"The seedlings are freezing! Every time the bus comes up, the dock lights and the hall lamps switch themselves back on and trip it. Their lockout boxes are in the ducts: the dock’s is in mine, the hall lamps’ in the hall duct."',
        options: [{ text: 'I’ll lock them out.', next: null }],
      },
    },
  };
  return tree;
}
