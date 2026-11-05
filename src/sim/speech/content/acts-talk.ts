/* Phrasings for the things people talk about (statements) and for how listeners answer (R_* replies). One act per idea; tags pick the variant that fits.
   Slots: {n} {x} {y} person or thing, {p}/{pk} place, {num} number, {skill}, {dream}, {job}, {kind}, {town}. */
import { defineActs, PLAIN } from '../engine';

/* ---------- richer greetings and goodbyes (appended to the legacy ones) ---------- */
defineActs({
  HELLO: [['Happy festival!', 'festival'], ['Hello, cousin.', 'kin'], ['Look who it is!', 'close glad'], ['Fine weather for ducks.', 'rain'], ['Mind the puddles.', 'rain'], ['Lovely day for it.', 'summer !rain'], ['Brr! Cold one.', 'cold'], ['Can\'t sleep either?', 'night'], ['Morning, sunshine.', 'morning close'], ['Spring at last.', 'spring !rain'], ['Leaves everywhere.', 'autumn'], ['Mind how you go, it\'s slippery.', 'snow'], ['Well met.', 'elder'], ['Oh, hello. Didn\'t see you there.', 'shy']],
  'HELLO P': [['{n}! Happy festival!', 'festival'], ['Hello, cousin {n}.', 'kin'], ['Is that {n}? Heavens, it is.', 'elder'], ['{n}, you old rascal!', 'close'], ['Ah, {n}. Just the person.', 'familiar'], ['{n}. What a surprise.', 'cool']],
  BYE: [['Enjoy the festival!', 'festival'], ['Give my love to the family.', 'close partnered'], ['Home for tea.', 'evening'], ['See you in the morning.', 'evening|night'], ['Better get on.', 'busy'], ['Say hello to the others.', 'close'], ['Don\'t be a stranger.', 'close'], ['Well. That\'s that.', 'cool']],
}, { plain: true });
for (const k of ['HELLO', 'HELLO P', 'BYE', 'YES', 'NO', 'THANKS', 'SORRY', 'ANGRY', 'NO SORRY', 'KID', 'BRIDGE', 'ME LOVE YOU', 'ME MARRY YOU', 'STOP THIEF', 'AFRAID', 'P THIEF', 'ME JEALOUS']) PLAIN.add(k);

defineActs({
  KID: ['I can climb the big tree. Nearly.', 'Do you want to see my rock?', 'I\'m not tired! You\'re tired!', 'Last one to the well is a turnip!', 'I\'m going to be mayor when I grow up.', 'I have a secret. No, I won\'t tell.', 'Why can\'t we have pudding every day?', 'My shoes are too small. Or my feet are too big.', ['Brr! Let\'s throw snowballs!', 'snow'], ['Splash! Puddle jumping time!', 'rain'], ['It\'s festival! There\'ll be cake!', 'festival'], ['I\'m hungry. Again.', 'hungryish'], ['I\'m too sleepy to play.', 'tired']],
  BRIDGE: ['Funny you should say that.', 'Speaking of which...', 'That reminds me.', 'Well, since you ask...', 'Since we\'re on the subject...', ['Oh, don\'t get me started.', 'hothead|gossip'], ['If I may...', 'shy'], ['Right. My turn.', 'cool']],
});

/* ---------- small talk ---------- */
defineActs({
  WEATHER: [['Snow! Proper snow.', 'snow'], ['Can\'t feel my toes in this.', 'snow'], ['Snow on the ground and nothing to do about it.', 'snow'], ['Wet again.', 'rain'], ['Rain, rain, rain.', 'rain'], ['I\'m soaked to the bone.', 'rain'], ['This rain\'s set in for the day.', 'rain'],
    ['Spring\'s on the way. You can smell it.', 'spring !rain'], ['Mornings are getting lighter.', 'spring morning !rain'], ['Glorious weather.', 'summer !rain'], ['Too hot to think straight.', 'summer afternoon !rain'], ['Perfect for a stroll.', 'summer !rain'],
    ['The leaves are turning.', 'autumn !rain'], ['Smells like autumn.', 'autumn !rain'], ['Bit of a nip in the air.', 'autumn|cold !rain'], ['Cold, but dry. Mustn\'t grumble.', 'winter !rain !snow'], ['Winter\'s here to stay.', 'winter'], ['My breath is frosting up.', 'cold'],
    ['Dark early these days.', 'night winter'], ['Look at all those stars.', 'night !rain']],
  FESTIVAL: ['Isn\'t this festival marvellous?', 'I\'ve eaten far too much. Worth it.', 'Best day of the year, and it\'s only a Tuesday.', 'Have you tried the cake? Don\'t. Have two.', ['The children haven\'t sat still all day.', 'partnered'], ['I could dance all night. My knees say otherwise.', 'elder']],
  FOOD_DEAR: ['Food\'s dear these days.', 'Have you seen the price of bread?', 'My money doesn\'t go as far as it used to.', ['Daylight robbery, the market.', 'hothead'], ['I shall have to grow my own at this rate.', 'frugal']],
  FOOD_CHEAP: ['Food\'s cheap at the moment. Stock up.', 'The market\'s full. Good prices.', 'Can\'t complain about the price of food.', 'Bread\'s cheap, for once.'],
  TAX_MAYOR: ['{x} has put the tax at {num}%. What do they take us for?', 'Tax is {num}% now. {x} says it\'s for the roads.', ['{x} promised lower tax. {num}%, apparently.', 'cool'], ['{x} is doing a fine job. {num}% is fair.', 'glad']],
  TAX_HIGH: ['Taxes are a scandal.', 'They take a fifth of everything and call it fair.', 'Taxes. Don\'t get me started on taxes.'],
  TAX_LOW: ['Tax is bearable, I suppose.', 'The tax\'s not so bad this year.', 'Can\'t grumble about the tax.'],
  PARTY: ['I voted {x}, and I\'d do it again.', 'The {x} lot are the only ones making sense.', ['I\'ve lost faith in the {x} party.', 'sad'], ['Vote {x}. That\'s all I\'m saying.', 'gossip']],
});

/* ---------- me, my life ---------- */
defineActs({
  WORK_FARM: [['Sowing\'s begun. My back\'s already aching.', 'spring'], ['The fields are thirsty. So am I.', 'summer'], ['Harvest is in. Best in years.', 'autumn'], ['Nothing grows in this cold. Mending fences.', 'winter'], ['Mud up to my knees today.', 'rain'], ['Can\'t beat a morning in the field.', 'morning glad']],
  WORK_TAVERN_BUSY: ['Busy at the tavern. Feet are killing me.', 'Packed to the rafters tonight.', 'Never poured so many pints.'],
  WORK_TAVERN_QUIET: ['Quiet at the tavern. Takings are poor.', 'Hardly a soul in the tavern today.', 'I\'ve polished the same glass for an hour.'],
  WORK_UNPAID: ['{p} missed our wages again. Again!', 'No wages from {p} this week. How are we to eat?', ['I\'m about ready to walk out of {p}.', 'hothead|lazy']],
  WORK_BOSS: ['{x} keeps us on our toes at {p}.', '{x} runs a tight ship at {p}. Too tight.', ['{x} is the best boss I\'ve had.', 'glad'], ['{x} wouldn\'t know hard work if it bit them.', 'cool|sad']],
  WORK_GENERIC: ['Another day at {p}.', 'Work\'s work. {p} keeps me busy.', 'Not complaining. Much. {p} has been fine.', ['Honest wages for honest work at {p}.', 'honest'], ['I\'m going places at {p}, you watch.', 'ambitious'], ['Counting the minutes at {p}.', 'lazy']],
  WORK_JOBLESS: ['I\'m between jobs. Looking, honestly.', 'No work to be had anywhere.', 'Anyone hiring? Anyone at all?', ['They don\'t make it easy to find a position.', 'sad']],
  FAMILY_GOOD: ['Me and {x} are getting on famously.', '{x} makes me laugh every single day.', ['{x} is the best thing that ever happened to me.', 'romantic|newlywed'], ['I don\'t deserve {x}, but I\'ll keep them.', 'kind']],
  FAMILY_STRAINED: ['Things are a bit strained with {x} lately.', '{x} and I aren\'t speaking much.', 'I love {x}. I do. Some days.'],
  FAMILY_PARTNER: ['My {kind}, {x}, is the best thing in my life.', 'I\'ve got {x} at home. Can\'t complain.', ['{x} and I are happy. Simple as that.', 'glad']],
  FAMILY_KIDS: ['{num} little ones at home. Never a quiet moment.', 'The children are a handful. A lovely handful.', ['Nobody told me how tired {num} children would make me.', 'tired'], ['The little ones have eaten us out of house and home.', 'broke']],
  FAMILY_ONEKID: ['A little one at home. Never a quiet moment.', 'The baby\'s walking now. Nothing is safe.', ['She said her first word. It was "no".', 'glad']],
  DREAM_rich: ['One day I\'ll be rich. You\'ll see.', 'I keep a little jar. One day it\'ll be a big jar.', ['Money isn\'t everything. But I\'d like to find out.', 'broke']],
  DREAM_famous: ['I want a house full of friends.', 'I\'d like to be known. Properly known.', 'I want to be the one everyone calls on.'],
  DREAM_love: ['I just want to find someone.', 'I keep hoping the right person will walk round the corner.', ['I\'d settle for someone who laughs at my jokes.', 'glad']],
  DREAM_family: ['I want a proper family. Noisy, muddy, happy.', 'I dream of a full house and a long table.', 'I\'d like children. A few. Maybe more.'],
  DREAM_content: ['I\'m content, you know. Truly.', 'All I ever wanted, I have.'],
  MEMORY_OWN: ['I still think about {x}.', 'Funny. I was just remembering {x}.', 'You never forget {x}, do you?', ['{x}. I think of it more than I should.', 'sad'], ['Some days I\'m back at {x}.', 'elder']],
  MEMORY_SHARED: ['You remember {x}, don\'t you? You were there.', 'I was just thinking about {x}. You were there.', ['We\'ve never spoken of {x}. But you remember, don\'t you?', 'close sad']],
  FAME: ['People stop me in the street these days. It\'s exhausting. And lovely.', 'I can\'t buy bread without a crowd.', ['I never asked for the attention. Not really.', 'shy|calm'], ['Fame suits me, I think.', 'charming|ambitious']],
  INFAMY: ['Everyone\'s staring at me. I can feel it.', 'Say what you like, I know what I did. They\'ll forget.', ['I\'m not a bad person. I\'ve just had a bad month.', 'sad']],
  SKILL_PROUD: ['I\'ve got rather good at {skill} work, if I say so myself.', 'Funny how practice pays off. I\'m quite the {skill} now.', 'A good {skill} is never out of work, my mum said.', ['Nobody does {skill} work like me.', 'ambitious|charming']],
  SKILL_MASTER: ['They call me a master {skill}. Imagine!', 'Master {skill}. Has a nice ring, doesn\'t it?', ['Forty years of practice and I\'m finally a master {skill}.', 'elder'], ['I mastered {skill} work. Don\'t tell my teacher; he\'ll want credit.', 'glad']],
  GEAR_COAT: ['My new coat is a marvel. Warm as toast.', 'Best coat I\'ve ever owned.', ['It\'s a good coat. It\'s a very good coat.', 'winter']],
  GEAR_TATTERS: ['My clothes are in tatters.', 'I need a new coat. This one is more hole than coat.', 'Everything I own is falling apart.'],
});

/* ---------- other people ---------- */
defineActs({
  GOSSIP_THIEF: ['{n} robbed me. I\'d stake my life on it.', '{n} is the thief in this town. I\'m sure of it.', ['Somebody ought to do something about {n}.', 'hothead']],
  GOSSIP_NICK: ['Have you heard what they call {n} now? “{x}”.', 'They\'re calling {n} “{x}” these days. It\'s caught on.', ['“{x}”. That\'s {n} now. Poor thing.', 'kind']],
  GOSSIP_COUPLE: ['Did you know {n} and {y} are together?', '{n} and {y}. Together. I saw them.', ['{n} and {y} are an item! You didn\'t hear it from me.', 'gossip']],
  GOSSIP_RICH: ['{n} has done very well for themselves.', '{n} must be rolling in it these days.', ['{n} wasn\'t born with a silver spoon. Good for them.', 'kind']],
  GOSSIP_GOOD: ['{n} has been good to me.', 'Have you met {n}? Good as gold.', '{n}\'s all right, you know.', ['{n} is the best of us.', 'close'], ['{n}? Salt of the earth.', 'elder']],
  GOSSIP_BAD: ['I wouldn\'t trust {n}.', 'Keep an eye on {n}.', '{n} owes me an apology.', ['{n} gets right up my nose.', 'hothead'], ['I\'d rather not say anything about {n}.', 'coward']],
  NEWS: ['Did you hear? {x}', 'Have you heard? {x}', '{x} Can you believe it?', 'They\'re saying {x}', ['I shouldn\'t say, but {x}', 'gossip'], 'Word is that {x}', 'You\'ll never guess. {x}'],
  PRAISE: ['You\'re looking well.', 'You\'ve a lovely way about you, you know.', 'It\'s always good to see you.', ['You make this town a better place.', 'kind|romantic'], ['I\'ve always admired you.', 'shy'], ['You\'re the cleverest person I know.', 'close']],
  TEASE_lazy: ['Still avoiding work, are you?', 'Don\'t strain yourself.', 'Do you ever get tired of doing nothing?'],
  TEASE_gossip: ['Anything you haven\'t told the whole town?', 'Go on then, what\'s the news?', 'Your ears must be burning. Or your mouth.'],
  TEASE_hothead: ['Try not to punch anyone today.', 'Deep breaths. In. Out.', 'Who\'s annoyed you this time?'],
  TEASE_coward: ['Don\'t jump, it\'s only me.', 'I\'ll protect you from the big bad squirrel.', 'You\'re white as a sheet. Again.'],
  TEASE_greedy: ['Counting your coins again?', 'You\'d charge for a smile, you would.', 'Spend a penny for once.'],
  TEASE_romantic: ['Written any poetry lately?', 'Still waiting for your true love?', 'Sighing at the moon again?'],
  TEASE_ambitious: ['Planning to run the country yet?', 'Don\'t forget us little people.', 'Ten-year plan, is it?'],
  TEASE_jealous: ['Don\'t look at me like that.', 'Who are you glaring at today?', 'You can relax. I\'m not after your spot.'],
  TEASE_curious: ['Asking questions again?', 'Curiosity killed the cat, you know.', 'You want to know everything, don\'t you?'],
  TEASE_pessimist: ['Cheer up, it might not rain.', 'Go on, say something nice.', 'Glass half empty, I suppose?'],
  TEASE_optimistic: ['You\'re sunshine itself, you are.', 'Is there anything you can\'t smile at?', 'Always the bright side with you.'],
  TEASE_superstitious: ['Careful, black cat behind you.', 'Walk round the ladder, won\'t you?', 'Touch wood. Quick!'],
  TEASE_shy: ['Say something. Anything.', 'I won\'t bite. Much.', 'There\'s a person in there somewhere.'],
  TEASE_thief: ['Keep your hands where I can see them.', 'Count my coins before you leave.', 'I\'ve hidden the silver.'],
  TEASE_spendthrift: ['Spent it all already?', 'How\'s the purse? Empty?', 'Money burns a hole, does it?'],
  TEASE_GENERIC: ['You\'re looking well. Unlike me.', 'Fancy meeting you here. Again.', 'Same old you. Don\'t change.', 'Your hair\'s doing something new.'],
  ARGUE_lazy: ['You wouldn\'t know hard work if it hit you.', 'Some of us do more than lie about.'],
  ARGUE_greedy: ['Always grasping, aren\'t you?', 'Money, money, money. That\'s all you care about.'],
  ARGUE_hothead: ['Calm down? Look who\'s talking.', 'You and your temper. Honestly.'],
  ARGUE_gossip: ['Is there anyone you haven\'t slandered?', 'Everything you hear is all over town by teatime.'],
  ARGUE_thief: ['I don\'t trust you. Not a bit.', 'Hands off. All of them.'],
  ARGUE_coward: ['Stand up for yourself for once.', 'Running away again, are you?'],
  ARGUE_GENERIC: ['I\'ve nothing to say to you.', 'We\'ll never agree. Let\'s not start.', 'You always do this.', 'Don\'t speak to me in that tone.'],
});

/* ---------- body and health ---------- */
defineActs({
  SICK_flu: ['I\'ve got the flu. Terrible. I\'m shivering.', 'My nose is a tap that won\'t turn off.', 'I should be in bed. But who\'d do the work?', ['I\'m dying. It\'s fine. I\'m dying.', 'sad']],
  SICK_injury: ['I hurt myself. It\'s a nuisance, mostly.', 'Everything aches since I got hurt.', ['I wouldn\'t say it\'s nothing. It\'s something.', 'cool']],
  SICK_infection: ['The wound\'s gone bad. I need the clinic.', 'There\'s a nasty look to this cut.', ['I\'m terrified it\'ll get worse.', 'coward']],
  SICK_malnutrition: ['I\'m so weak. Haven\'t eaten properly in weeks.', 'My head swims when I stand.'],
});

/* ---------- replies: how a listener answers (always plain) ---------- */
defineActs({
  R_HELP: ['Is there anything I can do?', 'Let me help.', 'I\'ll sit with you a while.', ['You know where I live. Come any time.', 'close'], ['I\'ll bring something round.', 'kind']],
  R_LAUGH: ['Ha! Very good.', 'Ha ha! Oh, you.', 'Cheeky!', ['You\'re the worst. And I love it.', 'close'], ['Hardy har.', 'cool'], ['*laughs*', 'glad']],
  R_TEASE: ['Oh, listen to you.', 'Dramatic, aren\'t we?', 'Is that all?', 'Poor little thing.', ['Get over yourself.', 'cool'], ['Here we go.', 'close']],
  R_BACK: ['Oh, shut it.', 'Look who\'s talking.', 'I\'ve heard enough from you.', ['Say that again. I dare you.', 'hothead'], ['Well... I... that\'s unfair.', 'coward'], ['You\'re one to talk.', 'cool']],
  R_BRAG: ['Well, I\'ve done rather well myself.', 'That\'s nothing. Listen to this.', 'Pfft. Amateur.'],
  R_WARN: ['Mind yourself.', 'Be careful out there.', 'Watch your back.', 'Take care of yourself, won\'t you?'],
  R_FLIRT: ['Oh, stop it. You\'ll make me blush.', 'Careful, I might believe you.', 'You\'re terrible.', '*grins*', 'Flattery will get you everywhere.'],
  R_SCARED: ['Keep your distance, would you?', 'Don\'t breathe on me!', 'Stay back. I\'ve a weak chest.', 'Maybe you should be in bed?'],
  R_THANKS: ['Thank you. That means a lot.', 'You\'re too kind.', 'Do you really think so?', 'I needed to hear that.'],
  R_NEWS: ['Never! Who told you?', 'No! Really?', 'Well, that explains a lot.', 'I\'d heard something about that.', ['I knew it all along.', 'gossip'], ['I couldn\'t possibly comment.', 'shy|cautious'], ['Serves them right.', 'cruel'], ['Poor things.', 'kind']],
  R_WORKER: ['Tell me about it. I\'m in the same boat.', 'Same here. Same work, same woes.'],
  R_SMALL: ['Hm.', 'Aye.', 'Mm.', 'True enough.'],
});
