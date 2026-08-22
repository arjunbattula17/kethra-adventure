// Kethra dialogue trees — Warden Corvenna (gatekeeper) and Fen Larkspur (archivist/guide).
//
// FLAGS invented in this file (for puzzle/scene code to read or react to):
//   kethra_warden_met            — set once the player has explained themselves to the Warden.
//   kethra_warden_trust_1        — set after the persuasion(2+) trust option is chosen.
//   kethra_warden_trust_2        — set after the persuasion(4+) deep-trust option is chosen.
//   kethra_warden_valve_thanks   — set after the Warden thanks the player for the valve repair.
//   kethra_archivist_doubts_ritual — set after Fen admits they suspect the ritual is wrong.
//
// FLAG CHECKED BUT NOT SET HERE (expected to be set by puzzle logic elsewhere in the scene):
//   kethra_helped_with_valve     — gates a non-persuasion trust option with the Warden once true.
//
// CLUES invented in this file (via gameState.addClue):
//   kethra_clue_outsiders_history  — past outsiders exploited the Aiveth.
//   kethra_clue_warden_confession  — the Warden's private doubt about the ritual.
//   kethra_clue_glyph_altered      — archaeology read: the ritual glyphs look recently altered.
//   kethra_clue_cistern_mechanism  — how the Cistern Heart is supposed to work.
//   kethra_clue_fragment_hint      — hint on how to read the inscription fragments in order.
//   kethra_clue_guardian_behavior  — the Wickmoth's territorial/light-sensitive behavior.
//   kethra_clue_kindling_vanishing — the Kindling civilization's disappearance.
//   kethra_clue_ship_echo          — the player's own realization linking that to their ship.
//
// CLUE CONNECTION made in this file (via gameState.connectClues):
//   kethra_clue_kindling_vanishing <-> kethra_clue_ship_echo

import type { DialogueTree, DialogueOption } from '../../dialogue/DialogueSystem';
import { gameState } from '../../core/GameState';

function buildWardenTopicsOptions(): DialogueOption[] {
  const options: DialogueOption[] = [
    {
      text: 'Tell me about these ruins.',
      next: 'warden_history',
    },
    {
      text: 'Why is the canopy dimming?',
      next: 'warden_dimming',
    },
    {
      text: 'What guards the inner chamber?',
      next: 'warden_guardian',
    },
    {
      text: 'Convince me you\'re not like the others who came here.',
      next: 'warden_trust1',
      requires: { attribute: 'persuasion', min: 2 },
      lockedHint: 'You sense you have not earned this question yet.',
      onChoose: () => gameState.setFlag('kethra_warden_trust_1'),
    },
  ];

  if (gameState.hasFlag('kethra_helped_with_valve')) {
    options.push({
      text: 'I fixed the lower valve for your people. Does that count for anything?',
      next: 'warden_valve_thanks',
      onChoose: () => gameState.setFlag('kethra_warden_valve_thanks'),
    });
  }

  options.push({ text: 'That\'s all, for now.', next: null });
  return options;
}

export const WARDEN_DIALOGUE: DialogueTree = {
  id: 'kethra_warden',
  startNode: 'warden_greeting',
  nodes: {
    warden_greeting: {
      id: 'warden_greeting',
      speaker: 'Warden Corvenna',
      text: 'The bioluminescence along her arms draws inward as you approach, wary rather than welcoming. "Outsiders don\'t land on Kethra by accident. State your business, or turn back toward whatever wreck brought you here."',
      options: [
        { text: 'My ship is grounded. I need materials your ruins might spare.', next: 'warden_explain' },
        { text: 'Say nothing. Let your silence speak for you.', next: 'warden_silent_listen' },
        { text: 'Step back and leave her be.', next: null },
      ],
    },
    warden_explain: {
      id: 'warden_explain',
      speaker: 'Warden Corvenna',
      text: 'Her glow pulses once — a considering color, not quite trust. "Spare. As if the Cistern Heart owes strangers anything. Others came before you with the same story, and left carrying more than they should have."',
      options: [
        { text: 'I only need what\'s already broken beyond your use.', next: 'warden_topics' },
        { text: 'Then tell me plainly what I shouldn\'t touch.', next: 'warden_topics' },
      ],
      onEnter: () => gameState.setFlag('kethra_warden_met'),
    },
    warden_silent_listen: {
      id: 'warden_silent_listen',
      speaker: 'Warden Corvenna',
      text: 'You say nothing. For a long moment, neither does she — the tree-city\'s hush filling the space between you. Then, softer: "...Most talk more than they should, this soon. Come. Ask what you need to ask."',
      options: [{ text: 'Continue.', next: 'warden_topics' }],
      onEnter: () => gameState.setFlag('kethra_warden_met'),
    },
    warden_topics: {
      id: 'warden_topics',
      speaker: 'Warden Corvenna',
      text: 'She watches you the way one watches weather — waiting to see which way you\'ll turn.',
      options: buildWardenTopicsOptions(),
      onEnter: () => {
        WARDEN_DIALOGUE.nodes.warden_topics.options = buildWardenTopicsOptions();
      },
    },
    warden_history: {
      id: 'warden_history',
      speaker: 'Warden Corvenna',
      text: '"These boughs were not grown, they were built — by the Kindling, long before the Aiveth climbed this high. We inherited their city the way a bird inherits an empty nest: gratefully, and without understanding how it was woven." Her eyes flick to the glyphs ringing the terrace. "We do not read what they left. We only repeat what we were told it means."',
      options: [
        {
          text: 'Read the boundary glyphs yourself, instead of trusting what you were told.',
          next: 'warden_history_glyphs',
          requires: { attribute: 'archaeology', min: 3 },
          lockedHint: 'The glyphs mean nothing to you yet.',
        },
        { text: 'Go back to other questions.', next: 'warden_topics' },
        { text: 'That\'s all, for now.', next: null },
      ],
    },
    warden_history_glyphs: {
      id: 'warden_history_glyphs',
      speaker: 'Warden Corvenna',
      text: 'You trace the boundary glyphs with your own eyes, and something in the phrasing snags. The ritual stanza carved here does not quite match the one the acolytes chant — a stroke simplified, a repetition dropped, the kind of drift that happens when a text is copied by ear instead of by eye for a hundred generations. Corvenna watches you notice it, and says nothing to deny it.',
      options: [
        { text: 'Go back to other questions.', next: 'warden_topics' },
        { text: 'That\'s all, for now.', next: null },
      ],
      onEnter: () =>
        gameState.addClue({
          id: 'kethra_clue_glyph_altered',
          title: 'The Ritual Glyphs Don\'t Match the Ritual',
          summary: 'The carved boundary stanza differs subtly from the chant the Aiveth perform today — generations of oral drift, not deliberate change.',
          source: 'Warden Corvenna, Kethra',
        }),
    },
    warden_dimming: {
      id: 'warden_dimming',
      speaker: 'Warden Corvenna',
      text: '"The Cistern Heart has fed light and water up through this whole city since before any of us were born. It has been dimming for three seasons now. We perform the Rite of Three Breaths exactly as it was given to us — and still, every season, it dims a little further." A pause. "You will not go near it. It is not a machine to you. It is sacred, and it is not yours to open."',
      options: [
        { text: 'Go back to other questions.', next: 'warden_topics' },
        { text: 'That\'s all, for now.', next: null },
      ],
    },
    warden_guardian: {
      id: 'warden_guardian',
      speaker: 'Warden Corvenna',
      text: '"The Wickmoth keeps the inner chamber. It has always kept it — since before the Rite was ours to perform. It does not hunt. It does not forgive carelessness, either. Carry an open flame or a restless light near it, and it will treat you as a threat to what it guards." Her tone leaves no room for argument. "Go quietly, or don\'t go at all."',
      options: [
        { text: 'Go back to other questions.', next: 'warden_topics' },
        { text: 'That\'s all, for now.', next: null },
      ],
    },
    warden_trust1: {
      id: 'warden_trust1',
      speaker: 'Warden Corvenna',
      text: 'Something in her posture loosens, fractionally. "There were others, years back. Traders. They smiled the way you smile, asked the questions you\'re asking, and left with three cart-loads of grave goods and a promise to return that they never kept. So. You\'ll forgive me the wariness." She studies you a moment longer. "You may yet be different. I haven\'t decided."',
      options: [
        {
          text: 'Ask what would actually change her mind.',
          next: 'warden_trust2',
          requires: { attribute: 'persuasion', min: 4 },
          lockedHint: 'She isn\'t ready to say more than this, not to you — not yet.',
          onChoose: () => gameState.setFlag('kethra_warden_trust_2'),
        },
        { text: 'Go back to other questions.', next: 'warden_topics' },
        { text: 'Leave it there.', next: null },
      ],
      onEnter: () =>
        gameState.addClue({
          id: 'kethra_clue_outsiders_history',
          title: 'What the Last Outsiders Took',
          summary: 'Traders once won the Aiveth\'s trust and repaid it by stripping the ruins of grave goods. It explains the Warden\'s wariness.',
          source: 'Warden Corvenna, Kethra',
        }),
    },
    warden_trust2: {
      id: 'warden_trust2',
      speaker: 'Warden Corvenna',
      text: 'She lowers her voice, as if the terrace itself might be listening. "I will tell you what I tell no acolyte. I do not think the Rite works anymore — I do not think it has worked in my lifetime. I think something in it was lost long before it reached my hands. And I think the true shape of it is still out there, cut into stone the Kindling left behind, in pieces scattered too far apart for any one of us to read alone." She meets your eyes. "Find them, if you can. Do not tell the others where you heard that."',
      options: [
        { text: 'What happened to the Kindling, in the end?', next: 'warden_trust2_kindling' },
        { text: 'Go back to other questions.', next: 'warden_topics' },
        { text: 'Leave it there.', next: null },
      ],
      onEnter: () =>
        gameState.addClue({
          id: 'kethra_clue_warden_confession',
          title: 'The Warden\'s Doubt',
          summary: 'Corvenna privately believes the Rite of Three Breaths is broken and that the true sequence survives only in scattered Kindling inscriptions.',
          source: 'Warden Corvenna, Kethra',
        }),
    },
    warden_trust2_kindling: {
      id: 'warden_trust2_kindling',
      speaker: 'Warden Corvenna',
      text: '"No one knows, truly. Our oldest stories say the sky over Kethra went white all at once — not a fire spreading, but every light in the world called home in the same breath. No siege. No war. Just... absence, after." She looks at you sidelong. "You have that same look some nights, when you think no one is watching your ship. Like you\'re waiting for the sky to do it again."',
      options: [
        { text: 'Go back to other questions.', next: 'warden_topics' },
        { text: 'Leave it there.', next: null },
      ],
    },
    warden_valve_thanks: {
      id: 'warden_valve_thanks',
      speaker: 'Warden Corvenna',
      text: 'For the first time, something like warmth reaches her glow. "That valve has wept rust since before I was warded. You didn\'t have to fix it, and you did." She inclines her head, a real concession. "Go to the inner terraces if you must. I won\'t stand in your way there. Just remember what I said about the Wickmoth — kindness to us won\'t soften it."',
      options: [
        { text: 'Go back to other questions.', next: 'warden_topics' },
        { text: 'Thank you.', next: null },
      ],
    },
  },
};

export const ARCHIVIST_DIALOGUE: DialogueTree = {
  id: 'kethra_archivist',
  startNode: 'archivist_greeting',
  nodes: {
    archivist_greeting: {
      id: 'archivist_greeting',
      speaker: 'Fen Larkspur',
      text: 'A young Aiveth drops down from a low branch, landing light on bare feet, already grinning. "An outsider! Actually here, not just a rumor from the lower boughs. I\'m Fen — I keep what records the Kindling left us. Ask me anything, I mean it. Corvenna\'s the one who\'ll make you work for answers, not me."',
      options: [
        { text: 'Who are you, really?', next: 'archivist_about' },
        { text: 'Tell me about the Aiveth.', next: 'archivist_culture' },
        { text: 'What\'s wrong with the canopy?', next: 'archivist_cistern' },
        { text: 'I\'ve heard something guards the inner chamber.', next: 'archivist_guardian' },
        { text: 'Are there records of whoever built this place?', next: 'archivist_kindling' },
        {
          text: 'These ruins remind me of something on my own ship. Do you feel that too?',
          next: 'archivist_insight_link',
          requires: { attribute: 'insight', min: 3 },
          lockedHint: 'You can\'t quite name what\'s nagging at you yet.',
        },
        { text: 'I should go.', next: null },
      ],
    },
    archivist_about: {
      id: 'archivist_about',
      speaker: 'Fen Larkspur',
      text: '"Third-generation archive-keeper. My grove-mother kept the records before me, and hers before that." The grin fades a little. "Truth is, I took it up early. My little sibling, Oshel, is grove-bound — too young to climb to the brighter boughs — and the lower terraces have been getting dimmer every season. I want to understand this place well enough to fix what\'s actually broken, not just light more candles."',
      options: [
        { text: 'What happens if the canopy keeps failing?', next: 'archivist_stakes' },
        { text: 'Go back to other questions.', next: 'archivist_greeting' },
        { text: 'That\'s all, for now.', next: null },
      ],
    },
    archivist_stakes: {
      id: 'archivist_stakes',
      speaker: 'Fen Larkspur',
      text: 'Fen\'s hands go still on the branch they\'re gripping. "The lower boughs go dark first. Oshel\'s grove is already the dimmest in the terrace — they\'ve been sleeping through the daylight cycle because there isn\'t enough of it left to wake them properly." A breath. "I\'m not telling you this so you\'ll pity us. I\'m telling you because I need this fixed, and Corvenna would rather it stayed sacred and broken than working and understood."',
      options: [
        { text: 'Go back to other questions.', next: 'archivist_greeting' },
        { text: 'I\'ll keep that in mind.', next: null },
      ],
    },
    archivist_culture: {
      id: 'archivist_culture',
      speaker: 'Fen Larkspur',
      text: '"We speak half in words and half in glow — you\'ll have noticed. A held color means something a spoken word can\'t. It\'s how we\'ve always greeted, argued, mourned." They gesture at the terraces around you. "And once a season, the whole grove performs the Rite of Three Breaths together, to thank the Cistern Heart for the light it gives us. Except lately it doesn\'t seem to be listening."',
      options: [
        { text: 'Do you think you\'re performing it wrong?', next: 'archivist_ritual_wrong' },
        { text: 'Go back to other questions.', next: 'archivist_greeting' },
        { text: 'That\'s all, for now.', next: null },
      ],
    },
    archivist_ritual_wrong: {
      id: 'archivist_ritual_wrong',
      speaker: 'Fen Larkspur',
      text: 'Fen glances over both shoulders before answering, low. "Don\'t repeat this to the elders. But yes — I think we are. A rite passed mouth to mouth for that many generations doesn\'t survive perfectly. Ours calls the colors in an order that just... doesn\'t feel right to me, and I can\'t prove it, and nobody wants to hear a records-keeper my age say the sacred thing might be a mistake."',
      options: [
        { text: 'Go back to other questions.', next: 'archivist_greeting' },
        { text: 'That\'s all, for now.', next: null },
      ],
      onEnter: () => gameState.setFlag('kethra_archivist_doubts_ritual'),
    },
    archivist_cistern: {
      id: 'archivist_cistern',
      speaker: 'Fen Larkspur',
      text: '"The Cistern Heart draws water up from the deep roots and turns it into light — that part everyone agrees on. What it needs to do that, the old carvings call \'three breaths\': three colors, called in a fixed order, into the chamber at its center. Get the order right and the whole canopy should wake up bright again. Get it wrong, and..." They shrug at the dimming light around you. "Well. This."',
      options: [
        { text: 'How would I even learn the right order?', next: 'archivist_fragments' },
        { text: 'Go back to other questions.', next: 'archivist_greeting' },
        { text: 'That\'s all, for now.', next: null },
      ],
      onEnter: () =>
        gameState.addClue({
          id: 'kethra_clue_cistern_mechanism',
          title: 'The Rite of Three Breaths',
          summary: 'The Cistern Heart wakes when three colors of light are called into its inner chamber in the correct, fixed order.',
          source: 'Fen Larkspur, Kethra',
        }),
    },
    archivist_fragments: {
      id: 'archivist_fragments',
      speaker: 'Fen Larkspur',
      text: '"There are inscription fragments scattered through the outer ruins — three that I know of. Each one describes a single breath of the Rite: what it looks like, and where it falls in the calling. Read as translations they\'re half-poetry, but the order is in there if you\'re patient." Fen taps their chin. "The trouble is reading them right. Kindling script wasn\'t written to be skimmed."',
      options: [
        {
          text: 'What should I watch for, reading Kindling script?',
          next: 'archivist_fragments_hint',
          requires: { attribute: 'archaeology', min: 3 },
          lockedHint: 'You don\'t yet know enough about Kindling script to ask a useful question here.',
        },
        { text: 'Go back to other questions.', next: 'archivist_greeting' },
        { text: 'That\'s all, for now.', next: null },
      ],
    },
    archivist_fragments_hint: {
      id: 'archivist_fragments_hint',
      speaker: 'Fen Larkspur',
      text: 'Fen brightens, delighted someone asked. "Kindling stanzas number themselves by position in the breath, not by where they\'re physically carved — first, between, and last. Don\'t assume the fragment you find first in the ruins is the first breath of the Rite. Read what each one calls itself, not where you found it."',
      options: [
        { text: 'Go back to other questions.', next: 'archivist_greeting' },
        { text: 'That\'s all, for now.', next: null },
      ],
      onEnter: () =>
        gameState.addClue({
          id: 'kethra_clue_fragment_hint',
          title: 'Reading the Fragments in Order',
          summary: 'Each inscription fragment names its own position in the Rite (first, between, last) — physical find order is not sequence order.',
          source: 'Fen Larkspur, Kethra',
        }),
    },
    archivist_guardian: {
      id: 'archivist_guardian',
      speaker: 'Fen Larkspur',
      text: '"The Wickmoth. It\'s been in the inner chamber longer than the Aiveth have lived here — it isn\'t vicious, just possessive. Big, slow, wings like a stained-glass window with the light still moving through it." Fen\'s voice turns careful. "It reads light the way we read faces. Steady glow, it mostly ignores you. Sudden light, bright light, anything that flares or moves erratically — it reads that as a threat and it will come looking for the source."',
      options: [
        { text: 'Go back to other questions.', next: 'archivist_greeting' },
        { text: 'That\'s all, for now.', next: null },
      ],
      onEnter: () =>
        gameState.addClue({
          id: 'kethra_clue_guardian_behavior',
          title: 'The Wickmoth\'s Temperament',
          summary: 'Territorial, not hostile. It ignores steady, dim light but investigates and confronts anything sudden or erratic.',
          source: 'Fen Larkspur, Kethra',
        }),
    },
    archivist_kindling: {
      id: 'archivist_kindling',
      speaker: 'Fen Larkspur',
      text: '"The Kindling. That\'s our name for them — we don\'t actually know what they called themselves. They built the terraces, the Cistern Heart, all of it, and then they just... stopped. No war in the record. No plague. The last carvings before the record goes quiet all describe the same thing, over and over, in different hands: the sky turning white, all at once, everywhere. Then nothing more is carved, ever again."',
      options: [
        { text: 'Go back to other questions.', next: 'archivist_greeting' },
        { text: 'That\'s all, for now.', next: null },
      ],
      onEnter: () =>
        gameState.addClue({
          id: 'kethra_clue_kindling_vanishing',
          title: 'The Kindling\'s Silence',
          summary: 'The precursor civilization\'s records end abruptly with repeated accounts of the sky turning white all at once, everywhere — then nothing.',
          source: 'Fen Larkspur, Kethra',
        }),
    },
    archivist_insight_link: {
      id: 'archivist_insight_link',
      speaker: 'Fen Larkspur',
      text: 'You describe it before you\'ve fully decided to: the reveal over your ship\'s viewport, the sky doing something no sky should do, all at once. Fen goes very still. "That\'s... that\'s almost word for word how the last Kindling carvings describe it. I thought that was just how endings get written — a flourish. What if it isn\'t? What if something out there does that, and it isn\'t the first time?"',
      options: [
        { text: 'Go back to other questions.', next: 'archivist_greeting' },
        { text: 'I don\'t know. But I want to find out.', next: null },
      ],
      onEnter: () => {
        gameState.addClue({
          id: 'kethra_clue_ship_echo',
          title: 'A Familiar Sky',
          summary: 'The player\'s own account of their ship\'s disaster matches the Kindling\'s final carvings almost exactly.',
          source: 'Player observation, shared with Fen Larkspur',
        });
        gameState.connectClues(
          'kethra_clue_kindling_vanishing',
          'kethra_clue_ship_echo',
          'Whatever silenced the Kindling and whatever crippled my ship may be the same kind of event — or the same cause, centuries apart.',
        );
      },
    },
  },
};
