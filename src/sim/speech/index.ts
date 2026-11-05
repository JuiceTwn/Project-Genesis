/* Speech: dots talk in English built from what is true about them, with no LLM. See README.md in this folder for how it fits together and how to
   add speech for a new system (phrasings, tags, topics, flourishes, dialects, reply upgrades): each is one call in one file. */
import type { Dot, Building } from '../../shared/types';
import { World } from '../world';
import { render, type Act } from './engine';
import { conversation, type Conv } from './topics';
import './voice';
import './content/tags';
import './content/acts';
import './content/acts-talk';
import './content/topics-life';
import './content/topics-people';
import './content/topics-body';
import './content/replies';
import './content/flourishes';
import './content/dialects';

export { render, defineActs, defineTags, declareSlots, BANK, TAGS, SLOTS, type Act } from './engine';
export { defineTopic, defineReplyUpgrade, topicIds, conversation, type Topic, type TCtx, type Conv } from './topics';
export { defineFlourish, defineDialect, persona, ticOf, dialectOf, flourishIds } from './voice';
export { lint } from './lint';

Object.assign(World.prototype, {
  conversation: function (this: World, s: Dot, l: Dot) { return conversation(this, s, l); },
  speak: function (this: World, act: Act, s?: Dot, l?: Dot, b?: Building, args?: Record<string, any>) { return render(this, act, s, l, b, args); },
});
declare module '../world' { interface World { conversation: (s: Dot, l: Dot) => Conv | null; speak: (act: Act, s?: Dot, l?: Dot, b?: Building, args?: Record<string, any>) => string } }
