/* Speech: how dots talk. English, built from real state, no LLM.
   Systems still say *what they mean* as a dialogue act (a list of concept tokens, as before, or a string key plus arguments); this module turns the act
   into a sentence. Three things make the result read like people rather than a lookup table:
     1. Variants: every act has many phrasings, picked by what is true right now (time of day, weather, mood, who is listening, how well they know
        each other, the speaker's age and traits), with the more specific variants favoured.
     2. Voice: each dot has a register from their traits (hotheads shout, cowards hedge, gossips lower their voice, the lazy sigh) and one personal
        verbal tic, so you can tell who is talking before you read the name.
     3. Memory: a dot does not repeat a line it said recently.
   Choices come from a hash of (tick, speaker, act), never from the world's RNG, so speech can never change what the simulation does. */
import type { Dot, Building } from '../shared/types';
import { World } from './world';
import * as K from '../shared/constants';

const { C } = K;

/** What a system hands over to be said: legacy concept tokens (TOK_PERSON+id, TOK_PLACE+id, TOK_SETT+id) or ready text. */
export type Act = number[] | string;

/* ---------- hashing ---------- */
function mix(a: number, b = 0, c = 0): number {
  let h = (a | 0) ^ Math.imul(b | 0, 0x9e3779b1) ^ Math.imul(c | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0;
}
const hstr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/* ---------- names ---------- */
const strip = (n: string) => n.replace(/ “[^”]*”$/, '');
const first = (d: Dot) => strip(d.base || d.name);
function placeLong(w: World, b: Building): string { return b.type === K.BT.HOUSE ? `the ${b.fam || 'old'} house` : b.sqPark ? `${w.S[b.sid].name} park` : `${b.name} ${w.kindName(b).toLowerCase()}`; }
function placeShort(w: World, b: Building): string { return b.type === K.BT.HOUSE ? 'home' : b.sqPark ? 'the park' : `the ${w.kindName(b).toLowerCase()}`; }

/* ---------- variants ---------- */
/** A phrasing, optionally with required tags ("rain", "!night", "close"). Tagged variants are favoured over untagged ones. */
type V = string | [string, string];
const BANK: Record<string, V[]> = {
  HELLO: ['Hello.', 'Hullo there.', 'Well, hello.', ['Morning!', 'morning'], ['Good morning.', 'morning'], ['Afternoon.', 'afternoon'], ['Evening.', 'evening'], ['Hiya!', 'glad'], ['Oh. Hello.', 'sad'], ['Alright?', '!kid'], ['Ah, there you are.', 'close'],
    ['Hello, stranger!', 'stranger'], ['Hi!', 'kid'], ['Hello, hello!', 'glad'], ['Cold enough for you?', 'winter'], ['Wet enough for you?', 'rain'], ['Out late, aren\'t we?', 'night']],
  'HELLO P': ['Hello, {n}.', 'Ah, {n}.', 'Well, if it isn\'t {n}.', ['Morning, {n}!', 'morning'], ['Evening, {n}.', 'evening'], ['{n}! Good to see you.', 'close'], ['{n}! Come here, you.', 'close glad'], ['Oh. {n}.', 'cool'], ['{n}.', 'cool'], ['Hi, {n}!', 'kid'], ['Hello again, {n}.', '!stranger'], ['How do you do, {n}?', 'elder']],
  BYE: ['Bye.', 'See you.', 'Take care.', 'Right, must be off.', 'Cheerio.', 'Mind how you go.', ['See you soon, friend.', 'close'], ['Good night.', 'night'], ['Back to it, I suppose.', 'lazy'], ['Bye, then.', 'cool'], ['Bye!', 'kid'], ['Can\'t stand here all day.', 'busy'], ['Stay dry!', 'rain'], ['Wrap up warm.', 'winter'], ['Off I go. These knees won\'t walk themselves.', 'elder']],
  YES: ['Yes.', 'Yes, please.', 'Why not?', 'Go on, then.', 'Sounds good.', ['Oh yes!', 'glad'], ['I suppose so.', 'sad'], ['Of course.', 'close'], ['Aye.', 'elder'], ['Yeah!', 'kid'], ['If you must.', 'lazy']],
  NO: ['No.', 'No, thank you.', 'Not today.', 'I don\'t think so.', ['Absolutely not.', 'hothead'], ['Er... no, sorry.', 'coward'], ['Not likely.', 'cool'], ['Nope.', 'kid'], ['Maybe another time.', 'kind']],
  THANKS: ['Thanks.', 'Thank you.', 'Much obliged.', 'Ta.', ['Bless you.', 'kind'], ['Thanks, friend.', 'close'], ['You\'re too kind.', 'kind'], ['Cheers!', 'glad'], ['Thank you ever so much.', 'elder']],
  'ME HAPPY': ['I\'m in a good mood.', 'Can\'t complain.', 'Things are looking up.', 'Life\'s good.', 'Not a bad day.', ['Slept like a log.', 'morning'], ['Even the rain can\'t spoil it.', 'rain'], ['Yay!', 'kid'], ['Fit as a fiddle, me.', 'elder'], ['Thinking of my other half.', 'partnered'], ['Money\'s good, and so am I.', 'flush'], ['Lovely evening.', 'evening !rain'], ['Spring in the air.', 'spring !rain'], ['Sun\'s out, and so am I.', 'summer !rain !night']],
  'ME SAD': ['I\'m a bit down.', 'Not my best day.', 'Don\'t mind me. Just feeling low.', 'It\'s been a hard week.', ['I want my mum.', 'kid'], ['At my age, you feel it.', 'elder'], ['This weather doesn\'t help.', 'rain']],
  'ME HUNGRY': ['I\'m starving.', 'I could eat a horse.', 'My stomach\'s rumbling.', 'When did I last eat?', ['I\'m hungry! Hungry hungry!', 'kid'], ['Right, that\'s it. Food. Now.', 'hothead'], ['Sorry... could I trouble you for some bread?', 'coward'], ['Hungry. Ugh.', 'lazy'], ['A bite to eat would be heaven.', 'kind']],
  'ME TIRED': ['I\'m worn out.', 'Could sleep standing up.', 'Need my bed.', 'Long day.', ['Bed. Now.', 'night'], ['I\'m tired. So tired.', 'kid'], ['Not as young as I was.', 'elder']],
  'ME BROKE': ['I\'m skint.', 'Not a penny to my name.', 'Purse is empty again.', 'Money runs through my fingers.', ['I\'m ruined.', 'sad'], ['Broke again. Typical.', 'cool'], ['Can\'t afford a thing.', 'winter']],
  'ME LONELY': ['I\'m a bit lonely.', 'Haven\'t had a proper chat in days.', 'Nobody ever calls round.', 'Quiet, isn\'t it? Too quiet.', ['Come and play with me!', 'kid'], ['The house is so empty.', 'elder']],
  'ME JEALOUS': ['I saw that, you know.', 'I don\'t like how close they\'ve got.', 'Who was that? Who?', ['I am NOT jealous!', 'hothead'], ['I\'m sure it\'s nothing... isn\'t it?', 'coward']],
  'ME ANGRY': ['I\'m furious.', 'This is the last straw.', 'I\'ve had enough of this.', ['I\'ll thump the next person who says hello.', 'hothead'], ['I\'m... a bit cross.', 'coward'], ['Count to ten, count to ten...', 'calm']],
  ANGRY: ['Right!', 'That\'s enough!', ['How dare you!', 'hothead'], ['Oh, grow up.', 'cool'], ['Hmph.', 'lazy']],
  'ME LOVE YOU': ['I\'ve something to tell you. I love you.', 'I think I\'m in love with you.', ['You\'re all I think about.', 'romantic'], ['I... I think I like you. A lot.', 'coward'], ['I love you. There. I said it.', 'brave']],
  'NO SORRY': ['No. Sorry.', 'I\'m sorry. I can\'t.', 'It\'s not you, I promise.'],
  'STOP THIEF': ['Stop, thief!', 'Oi! Give that back!', 'Thief! Somebody grab them!', ['Help! Thief!', 'coward'], ['I\'ll have your hands for that!', 'hothead']],
  SORRY: ['Sorry.', 'Sorry, it was a mistake.', 'My apologies.'],
  AFRAID: ['I\'m scared.', 'I want to go home.', ['Not again...', 'coward'], ['What was that?!', 'coward']],
  'ME MARRY YOU': ['Will you marry me?', 'Marry me. Please.', ['I can\'t live without you. Marry me?', 'romantic'], ['I\'ve bought a ring. Well. A bit of wire. Marry me?', 'ambitious']],
  'FARM BAD': ['The crops have failed.', 'Not a thing grew this year.', ['The blight\'s got everything. Everything.', 'sad']],
  'P GOOD': ['{n}? Lovely sort.', 'Have you met {n}? Good as gold.', '{n}\'s all right, you know.', ['{n} has been so kind to me.', 'kind'], ['{n} is the best of us.', 'close'], ['{n}? Salt of the earth.', 'elder']],
  'P BAD': ['I wouldn\'t trust {n}.', 'Keep an eye on {n}.', 'Don\'t get me started on {n}.', ['{n} gets right up my nose.', 'hothead'], ['Between us, {n} is not what they seem.', 'gossip'], ['I\'d rather not say anything about {n}.', 'coward']],
  'P THIEF': ['{n} is a thief. I\'m sure of it.', 'Count your coins around {n}.', ['I saw {n} with their hand in someone\'s pocket!', 'gossip'], ['Lock your door. {n} is about.', 'coward']],
  'PLACE BAD': ['{pk} has run dry.', 'Don\'t bother with {p}. Nothing left.', 'Shelves were empty at {p}.', ['Nothing at {pk}, and the price! Daylight robbery.', 'hothead'], ['They say {p} is out of food.', 'gossip']],
  'PLACE GOOD': ['{p} has plenty in.', 'Stocks are fine at {pk}.', 'Good prices at {p}.'],
  'PLACE NO FOOD': ['There\'s no food at {p}.', 'Don\'t go to {p}, they\'ve nothing.', 'The shelves at {pk} are bare.', ['I went to {p}. Bare shelves. Bare!', 'hothead'], ['Heard {p} has nothing left.', 'gossip']],
  'YOU GO PLACE': ['Try {p}.', 'Why not go to {pk}?', 'Get yourself down to {p}.', ['You\'ll find something at {p}, I\'m sure.', 'kind'], ['{p}. Don\'t ask me again.', 'cool']],
  'YOU AND ME GO PLACE': ['Fancy a trip to {p}?', 'Come on, let\'s go to {pk}.', 'You and me, {p}. What do you say?', ['Let\'s go to {pk}. My treat.', 'flush'], ['Come on! {p}! Race you!', 'kid'], ['Walk with me to {pk}?', 'close']],
  'YOU GO WORK': ['Why don\'t you get a job?', 'Have you tried getting work?', 'There\'s always honest work.', ['Get yourself a shift. Stop moaning.', 'cool'], ['Work\'s hard, but it pays. Try the market.', 'kind'], ['They\'re always hiring somewhere.', 'close']],
  'DRINK GOOD': ['Good ale tonight.', 'The ale\'s not bad here.', 'This is a good pint.', ['Best drink in the country.', 'glad'], ['It\'ll do.', 'cool']],
  'ME WANT DRINK': ['I want a drink.', 'I could murder a pint.', 'Time for a drink.', ['Landlord! The usual.', 'close'], ['Wet my whistle, I will.', 'elder']],
  'ME LIKE FRIEND': ['I like having friends round.', 'Good company in here.', 'It\'s nice to see friendly faces.', ['Never been happier.', 'glad']],
  'YOU GOOD': ['You\'re good company.', 'You\'re all right, you.', 'Nice to see you.', ['I\'m glad you came.', 'close']],
};


/* replies a listener gives, chosen by who they are and how they feel about the speaker */
Object.assign(BANK, {
  R_SYMPATHY: ['Oh, I\'m so sorry.', 'That\'s awful. I\'m here if you need me.', 'Poor you.', ['Come here. It\'ll pass.', 'close'], ['Well. These things happen.', 'cool'], ['Stiff upper lip, eh?', 'elder'], ['Ooh, tell me everything.', 'gossip'], ['That\'s dreadful. What can I do?', 'kind'], ['Bad luck. Could be worse.', 'cool']],
  R_CONGRATS: ['That\'s wonderful!', 'Good for you!', 'About time!', ['I\'m so happy for you.', 'kind close'], ['Hmph. Lucky you.', 'cool'], ['I always said you\'d do well.', 'close'], ['Drinks are on you, then.', 'brave'], ['Ooh, lovely.', 'romantic']],
  R_AGREE: ['Isn\'t it just.', 'You can say that again.', 'Too right.', 'Mm. Quite.', ['Don\'t I know it.', 'elder'], ['Tell me about it.', 'close']],
  R_DISAGREE: ['Oh, I don\'t know...', 'Really? I\'ve always found them fine.', 'That\'s not how I remember it.', ['Now, now. Let\'s not be unkind.', 'kind'], ['You\'re wrong, and you know it.', 'hothead']],
  R_CURIOUS: ['Go on...', 'Do tell.', 'Never!', 'No!', ['I knew it!', 'gossip'], ['Well, I never.', 'elder'], ['Is that so?', 'cool']],
  R_SHRUG: ['Hm.', 'If you say so.', 'Well.', 'Fair enough.', ['Mm-hm.', 'lazy'], ['Right.', 'cool']],
  R_SAMEBOAT: ['Tell me about it. I\'m there too.', 'Don\'t I know it. Same here.'],
  R_REMEMBER: ['I\'ll never forget it.', 'Neither will I.', 'How could I? I was there.', ['Some days I think about it too.', 'close']],
  KID: ['Want to play chase?', 'I found a really big stick.', 'My legs are tired.', 'Do you know any songs?', 'I\'m the king of this lane.', 'Race you to the tree!', 'Mum says I can\'t, but I will.', 'I saw a frog.', 'Why is the sky up there?'],
});

/* ---------- context tags ---------- */
interface Ctx { s?: Dot; b?: Building; l?: Dot; tags: Set<string>; speaker: number; }
function tagsFor(w: World, s: Dot | undefined, l: Dot | undefined, b?: Building): Set<string> {
  const t = new Set<string>(), td = w.tod(), season = w.season();
  t.add(td < 0.25 ? 'night' : td < 0.45 ? 'morning' : td < 0.75 ? 'afternoon' : td < 0.88 ? 'evening' : 'night'); if (td > 0.88 || td < 0.22) t.add('night');
  t.add(['spring', 'summer', 'autumn', 'winter'][season]); if (w.weather === 1) t.add('rain'); if (w.weather === 2) { t.add('snow'); t.add('winter'); } if (season === 3) t.add('cold');
  if (s) {
    const m = w.mood(s); if (m > 65) t.add('glad'); if (m < 38) t.add('sad');
    if (!s.adult) t.add('kid'); else if (s.age > 62) t.add('elder');
    for (const tr of s.traits) t.add(tr);
    if (s.fx) { if (s.fx.temper > 1.3) t.add('hothead'); if (s.fx.courage < -0.3) t.add('coward'); if (s.fx.courage > 0.3) t.add('brave'); if (s.fx.gossip > 1.3) t.add('gossip'); if (s.fx.dil < -0.15) t.add('lazy'); if (s.fx.romance > 1.3) t.add('romantic'); if (s.fx.generosity > 1.3) t.add('kind'); if (s.fx.ambition > 1.3) t.add('ambitious'); }
    if (s.partner >= 0) t.add('partnered'); if (s.coin > 60 * K.KB) t.add('flush'); if (s.work >= 0) t.add('busy');
  }
  if (s && l) { const a = s.aff.get(l.id) || 0; if (a >= 40) t.add('close'); else if (a < -5) t.add('cool'); else if (a < 8) t.add('stranger'); }
  void b; return t;
}
const ok = (v: V, tags: Set<string>): number => {
  if (typeof v === 'string') return 1;
  let weight = 3;
  for (const req of v[1].split(' ')) { if (req[0] === '!') { if (tags.has(req.slice(1))) return 0; } else if (!tags.has(req)) return 0; else weight += 1; }
  return weight;
};

/* ---------- recent lines (a person does not repeat themselves) ---------- */
const RECENT = new WeakMap<World, Map<number, number[]>>();
function recent(w: World, who: number): number[] { let m = RECENT.get(w); if (!m) RECENT.set(w, m = new Map()); let r = m.get(who); if (!r) m.set(who, r = []); return r; }

/* ---------- voice: the way a particular person speaks ---------- */
const TICS = ['Mark my words', 'Honestly', 'Truth be told', 'Right then', 'Bless my boots', 'Swear on my life', 'As I always say', 'Mind you', 'Funny thing', 'Well, I never', 'Strewth', 'Heaven help us', 'If you ask me', 'You know what they say', 'I tell you what', 'Believe you me', 'God\'s honest truth'];
/** The one phrase a person leans on. Fixed for life (a hash of their id), so viewers learn it. */
export function ticOf(d: Dot): string { return TICS[mix(d.id, 7919) % TICS.length]; }

/** Greetings, goodbyes and one-word answers carry no flourish; everything else can. */
const PLAIN = new Set(['HELLO', 'HELLO P', 'BYE', 'YES', 'NO', 'THANKS', 'SORRY', 'ANGRY', 'NO SORRY', 'KID']);
const isPlain = (key: string) => PLAIN.has(key) || key.startsWith('R_');
function voice(w: World, d: Dot, tags: Set<string>, text: string, h: number): string {
  if (!d.adult) return text;
  const r = (h >>> 8) % 100;
  if (r < 12 && text.length < 70) text = `${ticOf(d)}, ${text[0].toLowerCase()}${text.slice(1)}`;          /* verbal tic */
  else if (tags.has('hothead') && r < 40 && /\.$/.test(text) && text.length < 50) text = text.replace(/\.$/, '!');
  else if (tags.has('coward') && r < 30 && text.length < 55) text = `Um, ${text[0].toLowerCase()}${text.slice(1)}`;
  else if (tags.has('gossip') && r < 22 && text.length < 60) text += ' Between us.';
  else if (tags.has('lazy') && r < 25 && text.length < 50) text = 'Ugh. ' + text;
  else if (tags.has('romantic') && r < 18 && /\.$/.test(text) && text.length < 50) text = text.replace(/\.$/, '...');
  else if (tags.has('kind') && r < 15 && text.length < 50) text += ' Bless you.';
  else if (tags.has('elder') && r < 18 && text.length < 50) text += ' In my day, anyway.';
  return text;
}

/* ---------- rendering ---------- */
function fill(w: World, text: string, args: Record<string, any>): string {
  return text.replace(/\{(\w+)\}/g, (_m, k) => { const v = args[k]; return v === undefined || v === null ? '' : String(v); });
}
const cap = (s: string) => s.replace(/^(\W*)([a-z])/, (_m, a, b) => a + b.toUpperCase());

/** Shape key of a token list: 'HELLO P', 'YOU AND ME GO PLACE'. Also pulls out the person and place arguments. */
function parse(w: World, k: number[]): { key: string; n?: Dot; place?: Building } {
  let n: Dot | undefined, place: Building | undefined; const parts: string[] = [];
  for (const t of k) {
    if (t >= K.TOK_SETT) { parts.push('S'); } else if (t >= K.TOK_PLACE) { const b = w.buildings[t - K.TOK_PLACE]; if (b) { place = b; parts.push('PLACE'); } else parts.push('PLACE'); }
    else if (t >= K.TOK_PERSON) { n = w.dots[t - K.TOK_PERSON]; parts.push('P'); } else parts.push(K.CON[t][0]);
  }
  return { key: parts.join(' '), n, place };
}

/** The sentence for an act. `s` = speaking dot, `l` = who is being spoken to (if anyone), `b` = a speaking building (taverns mutter too). */
export function render(w: World, act: Act, s?: Dot, l?: Dot, b?: Building, args: Record<string, any> = {}): string {
  if (typeof act === 'string') {
    const tags = tagsFor(w, s, l, b);
    return BANK[act] ? pick(w, act, args, s, tags, l, b) : finish(w, act, s, tags, hstr(act) ^ w.tick);   /* a bank key, or a ready sentence */
  }
  const { key, n, place } = parse(w, act);
  const a = { ...args }; if (n) a.n = first(n); if (place) { a.p = placeLong(w, place); a.pk = placeShort(w, place); }
  const tags = tagsFor(w, s, l, b);
  if (BANK[key]) return pick(w, key, a, s, tags, l, b);
  /* an act with no phrasings yet: say its words plainly rather than nothing */
  const words = act.map(t => t >= K.TOK_SETT ? (w.S[t - K.TOK_SETT]?.name || '') : t >= K.TOK_PLACE ? (a.p || 'home') : t >= K.TOK_PERSON ? (a.n || '?') : K.CON[t][1]);
  return cap(words.join(' ')) + '.';
}
function pick(w: World, key: string, args: Record<string, any>, s: Dot | undefined, tags: Set<string>, l?: Dot, b?: Building): string {
  const bank = BANK[key] || [key];
  const who = s ? s.id : b ? 100000 + b.id : -1, rec = recent(w, who), h = mix(w.tick, who + 1, hstr(key));
  let cand: [number, number][] = []; bank.forEach((v, i) => { const wt = ok(v, tags); if (wt) cand.push([i, wt]); });
  const fresh = cand.filter(([i]) => rec.indexOf(hstr(key) + i) < 0); if (fresh.length) cand = fresh;
  let total = 0; for (const c of cand) total += c[1]; let roll = h % Math.max(1, total), idx = cand[0][0];
  for (const [i, wt] of cand) { if (roll < wt) { idx = i; break; } roll -= wt; }
  rec.push(hstr(key) + idx); if (rec.length > 6) rec.shift();
  const v = bank[idx], text = typeof v === 'string' ? v : v[0];
  void l; return finish(w, fill(w, text, args), s, tags, h, isPlain(key));
}
function finish(w: World, text: string, s: Dot | undefined, tags: Set<string>, h: number, plain = false): string { return cap(s && !plain ? voice(w, s, tags, text, h) : text); }


/* ---------- conversation: what people actually talk about ---------- */
const THOUGHTS: Record<string, string[]> = {
  love: ['I\'ve fallen for someone. I can\'t think straight.', 'I think I\'m in love. Is it supposed to feel like this?'],
  breakup: ['It\'s over between us. I don\'t want to talk about it. Well, I do.', 'We\'re finished. I keep expecting them at the door.'],
  wedding: ['I got married! Did I tell you? I got married!', 'Married life suits me so far. Give it a week.'],
  birth: ['The baby kept me up all night. Worth it, though.', 'We have a new baby in the house. Nobody sleeps.'],
  death: ['I still can\'t believe they\'re gone.', 'The house is so quiet since we lost them.'],
  theft: ['Someone took my money. Right out of my pocket.', 'I got robbed. I never even felt it.'],
  burg: ['Somebody broke into my house. I can\'t sleep.', 'I keep checking the lock since the break-in.'],
  fight: ['I got into a scrap. Don\'t ask.', 'There was a bit of a brawl. I don\'t come out of it well.'],
  bankrupt: ['The business is gone. All of it.', 'I put everything into that business, and now it\'s nothing.'],
  foreclose: ['The bank took my house.', 'I lost my home. The bank didn\'t even blink.'],
  fire: ['I lost everything in the fire.', 'It all burned. Everything I owned.'],
  rich: ['Money\'s been good to me lately.', 'Funny. I never thought I\'d have money in the bank.'],
  found: ['I\'m starting my own business. Terrifying.', 'I\'ve gone and started a business. Wish me luck.'],
  sale: ['Closed a cracking deal today.', 'Had a good sale. Feeling pleased with myself.'],
  quit: ['I quit my job. Just walked out.', 'I handed in my notice. Well, I just left.'],
  unpaid: ['They didn\'t pay me. Again.', 'Another shift, no wages. How am I supposed to live?'],
  pile: ['The whole country hates me, apparently.', 'Everyone\'s turned on me. Everyone.'],
  deal: ['I\'ve landed a sponsorship!', 'A company wants to pay me to say nice things. Me!'],
  jail: ['I\'ve done time. It changes you.', 'Locked up. I won\'t be doing that again.'],
  starve: ['I haven\'t eaten properly in days.', 'I\'m wasting away.'],
  elect: ['The town chose me! Me!', 'They made me mayor. What have I done?'],
  recall: ['They threw me out of office.', 'Recalled. After all I did for this town.'],
  corrupt: ['I\'m disgraced. Everyone knows.', 'Everyone knows what I did. I can\'t look anyone in the eye.'],
  mortgage: ['I bought a place of my own!', 'I\'ve got the keys to my very own house.'],
  payoff: ['The mortgage is paid off. Every penny!', 'I own my house outright. I keep saying it out loud.'],
  default: ['I can\'t pay what I owe.', 'The debts are piling up and I can\'t see a way out.'],
  embezzle: ['People are looking at me funny. I\'m under suspicion.', 'They think I took the money. I didn\'t. Not much.'],
  arrest: ['They arrested me. Me!', 'I spent a night in the cells.'],
  hangover: ['My head. Oh, my head.', 'Never drinking again. I mean it.'],
};
const GOOD = new Set(['love', 'wedding', 'birth', 'rich', 'found', 'sale', 'deal', 'elect', 'mortgage', 'payoff']);
const baseKind = (k: string) => k.replace(/\d+$/, '');

type Line = [Dot, string]; interface Conv { lines: Line[]; fx: (() => void)[]; }
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const WEATHER_LINES = (w: World, td: Set<string>): string[] => {
  if (w.weather === 2) return ['Snow! Proper snow.', 'Can\'t feel my toes in this.', 'Snow on the ground and nothing to do about it.'];
  if (w.weather === 1) return ['Wet again.', 'Rain, rain, rain.', 'I\'m soaked to the bone.', 'This rain\'s set in for the day.'];
  const sn = w.season(); const L: string[] = [];
  if (sn === 0) L.push('Spring\'s on the way. You can smell it.', 'Mornings are getting lighter.');
  if (sn === 1) L.push('Glorious weather.', 'Too hot to think straight.', 'Perfect for a stroll.');
  if (sn === 2) L.push('The leaves are turning.', 'Smells like autumn.', 'Bit of a nip in the air.');
  if (sn === 3) L.push('Cold, but dry. Mustn\'t grumble.', 'Winter\'s here to stay.', 'My breath is frosting up.');
  if (td.has('night')) L.push('Dark early these days.', 'Look at all those stars.');
  return L;
};

/** A real conversation between two people, grounded in what is true about them. Returns null if they have nothing to say beyond a greeting. */
export function conversation(w: World, s: Dot, l: Dot): Conv | null {
  const lines: Line[] = [], fx: (() => void)[] = [], tags = tagsFor(w, s, l);
  const say = (who: Dot, act: Act, other: Dot, args?: Record<string, any>) => lines.push([who, render(w, act, who, other, undefined, args)]);
  const tk = w.tick, rnd = () => w.rnd(), pick = <T,>(a: T[]) => a[Math.min(a.length - 1, (rnd() * a.length) | 0)];
  const aff = s.aff.get(l.id) || 0, laf = l.aff.get(s.id) || 0;
  /* what could I talk about, and how much do I want to? */
  type T = { w: number; run: () => boolean }; const topics: T[] = [];
  if (!s.adult) topics.push({ w: 9, run: () => { say(s, 'KID', l); say(l, !l.adult ? 'YES' : 'R_SHRUG', s); return true; } });
  else {
    /* a strong, fresh thought: the most vivid one */
    const th: any[] = s.th || []; let tbest: any = null, tv = 0;
    for (const t of th) { const left = t.until - tk; if (left <= 0) continue; const v = Math.abs(t.v) * Math.min(1, left / Math.max(1, t.until - t.from)); if (v > tv) { tv = v; tbest = t; } }
    if (tbest && tv > 3 && (THOUGHTS[baseKind(tbest.k)] || baseKind(tbest.k) === 'worry')) {
      topics.push({ w: 3 + tv * 0.6 + (aff > 25 ? 3 : 0), run: () => {
        const bk = baseKind(tbest.k), good = GOOD.has(bk);
        if (bk === 'worry') { const who = /about (.+?)\.?$/.exec(tbest.txt); lines.push([s, who ? `I\'m worried about ${who[1]}. I can\'t help it.` : 'I\'m worried sick, and I can\'t say why.']); }
        else lines.push([s, pick(THOUGHTS[bk])]);
        const fond = laf >= 15 || l.fx.generosity > 1.2;
        say(l, bk === 'worry' ? 'R_SYMPATHY' : good ? 'R_CONGRATS' : bk === 'fight' || bk === 'hangover' ? 'R_SHRUG' : 'R_SYMPATHY', s);
        if (fond) fx.push(() => { w.addAff(s, l, 2); w.addThought(s, 'talked', 3, 2, 'Got it off my chest.'); });
        return true;
      } });
    }
    /* a memory that shaped me; better still if the listener was there */
    const mem: any[] = s.mem || [];
    if (mem.length) {
      const m = mem[((rnd() * mem.length) | 0)], shared = m.with === l.id;
      topics.push({ w: shared ? 7 : 1.5, run: () => {
        if (shared) { lines.push([s, pick([`You remember ${m.x}, don\'t you? You were there.`, `I was just thinking about ${m.x}. You were there.`])]); say(l, 'R_REMEMBER', s); fx.push(() => { w.addAff(s, l, 3); w.addAff(l, s, 3); }); }
        else { lines.push([s, pick([`I still think about ${m.x}.`, `Funny. I was just remembering ${m.x}.`, `You never forget ${m.x}, do you?`])]); say(l, w.rnd() < 0.5 ? 'R_SYMPATHY' : 'R_CURIOUS', s); }
        return true;
      } });
    }
    /* my job */
    if (s.work >= 0 && w.buildings[s.work] && w.buildings[s.work].state === 'ok') {
      const b = w.buildings[s.work], kind = w.kindName(b).toLowerCase(), boss = b.owner >= 0 ? w.dots[b.owner] : null, sn = w.season();
      topics.push({ w: 2.5, run: () => {
        const opts: string[] = [];
        if (b.type === K.BT.FARM) opts.push(['Sowing\'s begun. My back\'s already aching.', 'The fields are thirsty. So am I.', 'Harvest is in. Best in years.', 'Nothing grows in this cold. Mending fences.'][sn]);
        if (b.type === K.BT.TAVERN) opts.push(b.occ > 3 ? 'Busy at the tavern. Feet are killing me.' : 'Quiet at the tavern. Takings are poor.');
        if ((s.unpaid || 0) > 0) opts.push(`${b.name} ${kind} missed our wages again. Again!`);
        if (boss && boss.id !== s.id) opts.push(`${first(boss)} keeps us on our toes at ${b.name}.`);
        opts.push(`Another day at ${b.name} ${kind}.`, `Work\'s work. ${b.name} keeps me busy.`);
        lines.push([s, pick(opts)]);
        if (l.work === s.work) say(l, 'R_SAMEBOAT', s); else say(l, w.rnd() < 0.5 ? 'R_AGREE' : 'R_SHRUG', s);
        return true;
      } });
    }
    /* family */
    if (s.partner >= 0 && w.dots[s.partner] && !w.dots[s.partner].dead) {
      const p = w.dots[s.partner];
      topics.push({ w: 2, run: () => {
        const wd = s.married ? pick(['spouse', 'other half', 'better half']) : pick(['sweetheart', 'partner']), pa = s.aff.get(p.id) || 0;
        lines.push([s, pa > 60 ? `Me and ${first(p)} are getting on famously.` : pa < 20 ? `Things are a bit strained with ${first(p)} lately.` : s.kids ? `${first(p)} and I have ${s.kids === 1 ? 'a little one' : s.kids + ' little ones'} to think of. Never a quiet moment.` : `My ${wd}, ${first(p)}, is the best thing in my life.`]);
        say(l, pa < 20 ? 'R_SYMPATHY' : 'R_CONGRATS', s); return true;
      } });
    } else if (s.kids > 0) topics.push({ w: 1.5, run: () => { lines.push([s, `${s.kids === 1 ? 'A little one' : s.kids + ' little ones'} at home. Never a quiet moment.`]); say(l, 'R_CONGRATS', s); return true; } });
    /* someone we both know */
    const who = [...s.aff.keys()].filter(k => k !== l.id && w.dots[k] && !w.dots[k].dead);
    if (who.length) {
      topics.push({ w: 3 * Math.pow(s.fx.gossip, 0.8) + (aff > 20 ? 1 : 0), run: () => {
        const c = w.dots[who[(rnd() * who.length) | 0]], ca = s.aff.get(c.id) || 0, cp = c.partner >= 0 ? w.dots[c.partner] : null, n = first(c);
        let line: string, judge = 0, reply: string;
        if (s.thieves.has(c.id)) { line = `${n} robbed me. I\'d stake my life on it.`; judge = -1; reply = 'R_CURIOUS'; }
        else if (c.nick && rnd() < 0.5) { line = `Have you heard what they call ${n} now? “${c.nick}”.`; reply = 'R_CURIOUS'; }
        else if (cp && !cp.dead && rnd() < 0.6) { line = `Did you know ${n} and ${first(cp)} are together?`; reply = 'R_CURIOUS'; }
        else if (c.coin > 100 * K.KB && rnd() < 0.5) { line = `${n} has done very well for themselves.`; reply = 'R_AGREE'; }
        else if (ca >= 10) { line = pick([`${n} has been good to me.`, `Have you met ${n}? Good as gold.`, `${n}\'s all right, you know.`]); judge = 1; reply = 'R_AGREE'; }
        else { line = pick([`I wouldn\'t trust ${n}.`, `Keep an eye on ${n}.`, `${n} owes me an apology.`]); judge = -1; reply = 'R_AGREE'; }
        lines.push([s, line]);
        const la = l.aff.get(c.id) || 0;
        if (judge && Math.sign(la) === -judge && Math.abs(la) > 8) say(l, 'R_DISAGREE', s);
        else { say(l, reply, s); if (judge) fx.push(() => w.addAff(l, c, judge * 3)); }
        return true;
      } });
    }
    /* the town */
    const g = w.gov(w.S[w.buildings[s.home].sid]), mayor = g.mayor >= 0 ? w.dots[g.mayor] : null;
    topics.push({ w: 1, run: () => {
      lines.push([s, mayor && mayor.id !== s.id && rnd() < 0.5 ? `${first(mayor)} has put the tax at ${g.tax}%. What do they take us for?` : g.tax >= 5 ? 'Taxes are a scandal.' : 'Tax is bearable, I suppose.']);
      say(l, 'R_AGREE', s); return true;
    } });
  }
  /* the weather: always something to say */
  topics.push({ w: 2, run: () => { const o = WEATHER_LINES(w, tags); lines.push([s, pick(o)]); say(l, 'R_AGREE', s); return true; } });
  let tot = 0; for (const t of topics) tot += t.w; let roll = rnd() * tot;
  for (const t of topics) { if (roll < t.w) return t.run() ? { lines, fx } : null; roll -= t.w; }
  return null;
}

Object.assign(World.prototype, {
  conversation: function (this: World, s: Dot, l: Dot) { return conversation(this, s, l); },
  speak: function (this: World, act: Act, s?: Dot, l?: Dot, b?: Building, args?: Record<string, any>) { return render(this, act, s, l, b, args); },
});
declare module './world' { interface World { conversation: (s: Dot, l: Dot) => Conv | null; speak: (act: Act, s?: Dot, l?: Dot, b?: Building, args?: Record<string, any>) => string } }
void C;
