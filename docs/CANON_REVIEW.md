# Canon review · the survey's new story text (D-26)

**Status: not yet approved by the team.** The owner's answer to "is the D-26 story text approved?"
was left blank, so it is treated as *not yet*: the text stays in the game and every line of it is
listed here for review (DECISIONS D-29).

**How to use this.** Each row is one piece of new text, beside the place it was written from, and
what it says that the source does not. Mark each row **keep**, **change** or **cut**. LORE.md is
the team's (D-1); nothing in it was edited. The text lives in `src/content/discoveries.ts` unless a
row says otherwise, and cutting a find is described at the end of D-26.

"LORE" means LORE.md. "Game text" means a line that was already in the game before D-26.

---

## Read these first: four places the new text goes past its source

1. **Where Oshel's grove is.** LORE says Oshel's grove is "the dimmest on the terrace". The find
   puts it on the islet under the old tree, off the east terrace, reached by stepping stones. Either
   the islet counts as part of the terrace, or the find wants a line that says it is Oshel's
   *sleeping place*, apart from the grove.
2. **"The brightest thing in the sky"** (the scope). Meant as the brightest point of light. Read
   literally it outshines the star and Vessek itself. "The brightest light out there" would not.
3. **ARK said no, twice.** Carrow's note says ARK told the crew not to keep a key under the hatch;
   her relay tag says ARK would not pay for two lengths of conduit alloy. LORE gives ARK no
   character beyond paying for the voyage. This makes the company careless with its crew.
4. **Mbeki flew anyway.** LORE says he "argued against taking the contract". The letter adds that he
   put it in writing, never sent it, and agreed to fly. It also gives him an opinion about the cause
   ("it isn't weather"), which is the first time anyone aboard guesses before the white sky.

---

## The Wren (4 finds, 3 of them new documents, and one restored log)

| New text | Written from | What it adds |
|---|---|---|
| **Carrow's note at the bench.** "Whoever has the watch: the vise sticks. Hit it, don't oil it. / The spare log buffer is in my locker, A-1, for when the main one cooks again. Key is under the lip of the sub-deck hatch, where it has been since ARK told us not to keep it there. / If you are reading this and I'm still asleep, something went wrong. Fix it quietly. — Ines" | LORE, Characters: Ines Carrow "built half the Wren's patch jobs; left notes taped inside panels the player will find (a future lore channel)". LORE, Daily life: "one person awake on watch". Locker A-1 is painted on the locker bank already (`src/ship/interior/props.ts`) | A spare log buffer exists. The main one has failed before. A key is hidden against ARK's instruction. She signs with her first name |
| **The key.** "A small key, taped under the lip of the hatch. No tag on it." and, on the locked locker, "Locked. A strip of amber tape on the door says I. CARROW." (`src/ship/interior/finds.ts`) | The note above | Nothing further |
| **Locker A-1.** "A flight jacket, a tin of recycler coffee with NOT ORION'S written on the lid, and a log buffer in a padded sleeve. / ORION reads it in. One corrupted entry comes back whole: day 22, the unknown signal. / Carrow kept a second copy of the Wren's memory in a locker because she didn't trust the first. The travel logs at the log terminal have the restored entry." | LORE, Daily life: "coffee that tastes of the recycler". LORE, Characters: ORION "occasionally wry" | Carrow did not trust the ship's own log. ORION can read a spare buffer in. The crew joke with ORION |
| **The restored day-22 log.** "Picked up **a tone on long-range scan**, repeating **on a fixed cycle**, not in any catalog. Structure to it — too regular for background noise. Recording for **ORION to take apart** later. Whatever it is, it's close." (`RESTORED_SIGNAL_LOG`) | Game text, the corrupted log: "Picked up ▓▓▓▓ repeating ▓▓▓▓ not in any catalog. … Recording for ▓▓▓▓ later." LORE, the Choir's rule 1: rehearsals are "a hum on long-range scanners, the repeating signal in the Wren's Day 22 log". LORE, the world: Isilthe "transmits a signal on a fixed cycle" | The three gaps, in bold. The *final* log, with "we were never supposed to—", is left corrupted: that reading is still the team's (D-11) |
| **Mbeki's unsent letter.** "Folded small and tucked behind the vent slats of suit locker EVA-1. / 'Three freighters gone on one run, and you want a fourth ship to go and look. I have flown freight for twenty years. Nothing out there takes a ship and leaves no wreckage, so whatever this is, it isn't weather. / I'll fly it. I am saying no first so that it is written down somewhere.' / It was never sent. The pilot who argued against the contract is asleep in section 4-B, behind the breach." | LORE, Characters: Hollis Mbeki, "twenty years of freight runs; the one who argued against taking the contract". Game text, the contract brief: "Three freighters on the Kessic Drift run have gone silent in four years: no distress calls, no wreckage". LORE, Places: "cold-sleep berths in section 4-B (sealed behind the breach)". Locker EVA-1 is painted on the suit lockers already | See "Read these first", 4 |
| **The relay rack** (needs engineering 2). "PWR-A, NAV BUS, LIFE SUP and AUX are carrying load. The COMMS relay is dark, fused in the white sky. An old tag is taped under it: / 'This one runs hot. When it goes, don't burn the spares on it: the fault is the conduit behind. Two lengths of new alloy. ARK wouldn't sign for them. — I.C.' / So long-range comms won't come back with anything aboard. It needs conduit alloy, and the Wren has none." Below engineering 2: "Five relays, one dark. You can't tell what it feeds." | The five labels are the rack's own (`src/ship/interior/props.ts`). LORE, Things: conduit alloy "repairs comms, shields and power distribution". LORE, the Choir's rule 2: in a white sky "powered systems brown out" | The comms fault was known before the voyage. See "Read these first", 3 |

## Kethra (8 finds, 2 of them new documents)

| New text | Written from | What it adds |
|---|---|---|
| **Oshel's grove, before the Heart wakes.** "A sleeping mat rolled under the roots, and a child's lantern hung on the lowest bough, unlit. / Fen said their sibling's grove was the dimmest on the terrace. This is it. Oshel sleeps through the daylight here, because there isn't enough light left to wake them." | LORE, The central conflict: "Oshel sleeps through the daylight because there isn't enough of it left". LORE, Factions: "Oshel's grove is the dimmest on the terrace". LORE, Daily life: the Aiveth "carry lanterns" | The mat and the lantern. See "Read these first", 1 |
| **Oshel's grove, after.** "The lantern on the lowest bough is lit: a small, steady green. The sleeping mat is rolled up and put away. / Nobody is here. Oshel is awake, somewhere up in the boughs." | LORE, Characters: Oshel is "never seen on screen in level 2"; "the lower boughs are too dim to wake them" | That waking the Heart wakes Oshel. LORE implies it and never says it. Oshel is still not seen |
| **The Wickmoth's perch** (readable once the moth has settled on the Heart). "With the moth settled on the Heart, the arch it watched from is empty. Its feet have worn two hollows into the stone, each as deep as a thumb. / The Aiveth's own marks, cut small along the arch, stop short of the hollows on every side. Whoever first climbed up here found it already sitting." | LORE, Open questions, 5: "It predates the Aiveth". LORE, Characters: the Wickmoth is "territorial, slow" | The worn hollows and the marks that stop short. Open question 5 (does it belong to the machines or to Kethra?) stays open |
| The chart's label "Oshel's Grove" (`src/planets/kethra/kethraMapData.ts`) | The find above | Nothing further |

The other six Kethra finds are the three inscriptions, the shrine, the valve and the last carving.
Their text was not changed; they only count toward the survey now.

## Vessek Anchorage (6 finds, 3 of them new documents)

| New text | Written from | What it adds |
|---|---|---|
| **The scope.** "A salvaged survey scope on a gimbal, aimed out of the port and chained there. Someone has scratched tally marks all the way round the eyepiece. / Through it: a green point, steady, brighter than anything near it. Kethra's terraces, lit from end to end. / You did that. From here it is the brightest thing in the sky." | Game text, the ledger (`src/planets/vessek/vessekLore.ts`): "— Scope: lights on Kethra's terraces, bright as we've ever seen." LORE, Level 3: "the ledger's dates sharpen after Kethra's Heart relit" | The scope as an object, where it is, and the tally marks. See "Read these first", 2 |
| **Dace's chalk sky** (in her duct, past the fan circuit). "Along the duct, where no adult fits, the wall is covered in chalk: dots, hundreds of them, each with a careful ring drawn round it. Beside the biggest, in a child's capitals: OURS. / Every other dot has a question mark. / Dace has been drawing a sky out of other people's stories." | LORE, Daily life: "children who have never seen a sky with other stars in it". LORE, Characters: Dace "asks the player what other stars look like"; "the ring's best duct-crawler" | The drawing |
| **The seed book.** "Hung on a nail: a ledger of its own, kept by whoever runs the bay. / 'MIREILLE: beans, two kinds. COPPER HEN: barley, one jar. SIX SISTERS: carried ore. Nothing we could plant, so they brought the songs.' It runs on, a line for every hull. / Twenty-one ships. Everything growing in this hold came out of somebody's galley stores." | The three ship names are the ledger's (`vessekLore.ts`). "Twenty-one ships" is Varro's and Dace's count in dialogue (LORE says "about twenty hulls"). LORE, Places: "hydroponics in a tanker's cargo hold". LORE, Daily life: "rationed hydroponics" | Where the crop came from. What each named ship carried. That the Six Sisters "brought the songs", which is the first mention of music at the Anchorage |
| The chart's labels "The Anchorage scope", "Dace's chalk sky", "The seed book" (`src/planets/vessek/vessekMapData.ts`) | The finds above | Nothing further |

The other three Anchorage finds are the ring plate, the bent grate and Dace's question, unchanged.

---

## Small text that is not story

Changed or added in the same commit; listed so nothing new goes unread.
- The Wren's optional objective: "Optional: the travel logs, the repair station, and whatever the
  crew left lying around." (was "…read the travel logs, or check the damage at the repair station.")
- Kethra, after the Heart: "The Heart is awake. Look around, or take the skiff back to the Wren."
- Falling off a stepping stone: "You slip off the stone and wade back to the terrace."
- The surface chart's list is headed "Sites" (was "Survey"); "survey" now means the count of finds.
- Prompts: "Read the note taped to the bench", "Feel under the hatch's lip", "Unlock Carrow's
  locker", "Read the letter in the suit locker", "Trace the dead relay (engineering)", "Look at the
  child's lantern", "Look up at the empty perch", "Look through the scope", "Look at the chalk on
  the wall", "Read the book on the nail".

## What each find pays (design, not canon)

Perception: the locker, the perch, the chalk sky. Persuasion: Mbeki's letter, Oshel's grove.
Insight: the relay, the scope. Engineering: the seed book. One point each, once. The reasoning is in
D-26 ("Why these rewards").
