# Speech

Dots talk in English built from what is true about them. No LLM. Everything here is deterministic. Rendering a line never touches the simulation's random numbers (choices come from a hash of tick, speaker and act), so wording cannot change what the world does. Choosing a conversation topic does draw from the sim's stream, in a fixed order, like any other system.

```
engine.ts      registries (bank, tags, slots) and the render pipeline. Knows no phrases.
voice.ts       persona (per-person tic, oath, sign-off, quirk), dialects, flourishes.
topics.ts      what people talk about: topic registry, reply upgrades, multi-turn runner, per-pair memory.
lint.ts        content checks (unknown tags/slots, dupes, too long, missing reply acts).
content/       ALL the words and rules. Add things here.
```

## How a line gets made

1. A system hands over an **act**: a bank key (`'WORK_UNPAID'`) with arguments, or legacy concept tokens (`[C.ME, C.HUNGRY]`).
2. **Tags** describe the moment: time of day, weather, mood, age, traits, relationship to the listener, illness, fame... (`content/tags.ts`).
3. Each phrasing may demand tags (`['Wet again.', 'rain']`, `'close|glad'`, `'!night'`). Only matching ones are eligible; more specific ones weigh more. A speaker avoids their last 8 lines.
4. **Dialect** (by the settlement they live in) swaps words.
5. **Flourishes** add touches: at most one per slot (`swap`, `open`, `close`), two in all, never on greetings or replies.

Conversations: a **topic** is picked by weight (a fresh thought, a shared memory, work, family, gossip with real facts, the news from the feed, banter, a row...). The listener answers with a **reply kind** that their own character can *upgrade* (a kind friend turns sympathy into an offer of help; a rival into a jab). Close or sociable listeners may take a turn of their own (up to three). A pair will not rehash the same topic for days.

## Recipes

Run `npm run speech` to lint and read real conversations. `tests/speech.test.ts` runs the linter, so a typo in content fails the suite.

**New phrasings** (`defineActs`). Plain text, or `[text, tag expression]`. Slots: `{n} {x} {y} {p} {pk} {num} {skill} {dream} {job} {kind} {town}` (add more with `declareSlots`).

```ts
defineActs({ SICK_flu: ['I\'ve got the flu.', ['I should be in bed.', 'tired']] });
```

**A new thing people know** (`defineTags`): list every tag the provider can add, so the linter can check phrasings that use them.

```ts
defineTags('sailing', ['seasick'], ({ s }, add) => { if (s && s.seasick) add('seasick'); });
```

**A new topic** (`defineTopic`). It only chooses acts; the prose lives in the bank. `c.say` = speaker, `c.reply` = listener's reply kind, `c.fx` = effects when the chat ends (never during speech).

```ts
defineTopic({
  id: 'catch',
  weight: c => c.s.fish > 3 ? 2 : 0,
  run: c => { c.say('FISH_BRAG', { num: c.s.fish }); c.reply('CONGRATS'); return true; },
});
```

**A new flourish** (`defineFlourish`). `when` is a tag expression, `chance` is before the speaker's expressiveness.

```ts
defineFlourish({ id: 'seasick-gulp', slot: 'open', when: 'seasick', chance: 0.4, apply: t => `*gulp* ${t}` });
```

**A reply kind**: add `R_<KIND>` phrasings. **Reply upgrade**: `defineReplyUpgrade('SYMPATHY', { to: 'HELP', when: 'kind|close', p: 0.45 })`, where `when` is evaluated for the *listener*. **A dialect**: `defineDialect({ id, weight, swaps: [[/\bhello\b/gi, 'ey up']] })`.

## Conventions

- Keep a line under 100 characters (bubbles wrap to four rows).
- `R_*` keys and keys passed `{ plain: true }` never get flourishes. Anything said inside a topic gets the `talk` tag, which semantic flourishes (optimistic, pious...) require; use it so they do not land on a bare greeting.
- Do not put `!` inside an OR group (`'a|!b'`); write `'a !b'`.
- Never use `w.rnd()` for speech choices. Use `mix`/`hstr` from `engine.ts`. (Topic choice uses `c.rnd()` on purpose: it is the one place speech and the sim share a stream, and the order of draws is fixed.)
- A slot value that is a name should come in through `args` so flourishes know not to lowercase it.
