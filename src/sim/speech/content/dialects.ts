/* Dialects: each settlement talks a little differently (picked by hash, by weight). A dialect is word swaps; capitalisation is kept.
   Dialect follows where a person lives, so a visitor sounds like their own town and the locals like theirs: that is how viewers learn to tell towns apart. */
import { defineDialect } from '../voice';

defineDialect({ id: 'plain', weight: 5, swaps: [] });
defineDialect({ id: 'northern', weight: 2, swaps: [[/\bhello\b/gi, 'ey up'], [/\bhullo there\b/gi, 'ey up'], [/\byes\b/gi, 'aye'], [/\bnot\b/gi, 'nowt'], [/\bnothing\b/gi, 'nowt'], [/\bsomething\b/gi, 'summat'], [/\bfriend\b/gi, 'mate'], [/\bthe\b(?= (?:market|farm|tavern|park|clinic))/gi, 't\''], [/\bnice\b/gi, 'grand'], [/\bvery\b/gi, 'right'], [/\blovely\b/gi, 'champion']] });
defineDialect({ id: 'coastal', weight: 2, swaps: [[/\bhello\b/gi, 'ahoy'], [/\bbye\b/gi, 'fair winds'], [/\byes\b/gi, 'aye'], [/\bfriend\b/gi, 'matey'], [/\bmoney\b/gi, 'coin'], [/\bstarving\b/gi, 'famished as a stranded whale'], [/\bmy\b/gi, 'me'], [/\bstorm\b/gi, 'gale']] });
defineDialect({ id: 'farmland', weight: 2, swaps: [[/\bhello\b/gi, 'howdy'], [/\bvery\b/gi, 'right'], [/\bgood\b/gi, 'fine'], [/\bI am\b/g, 'I be'], [/\byes\b/gi, 'aye'], [/\bwhat do you think\b/gi, 'what d\'you reckon'], [/\bstarving\b/gi, 'hungry as a horse'], [/\bwonderful\b/gi, 'top-notch'], [/\bdear\b/gi, 'pet']] });
defineDialect({ id: 'townie', weight: 1.5, swaps: [[/\bhello\b/gi, 'how do you do'], [/\balright\?/gi, 'quite well?'], [/\bskint\b/gi, 'impecunious'], [/\bmate\b/gi, 'old boy'], [/\bhiya\b/gi, 'good day'], [/\bbroke\b/gi, 'embarrassed financially'], [/\bgreat\b/gi, 'splendid'], [/\bthanks\b/gi, 'most obliged']] });
