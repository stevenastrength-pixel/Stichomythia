import Anthropic from '@anthropic-ai/sdk';
import { readJson, getSettingsPath } from '../utils/files.js';

interface Character {
  id: string;
  personality: string;
  speechStyle: string;
  interests: string[];
  quirks: string[];
  emotionalProfile: {
    temperament: string;
    triggers: Array<{ topic: string; reaction: string; intensity: string; description: string }>;
    recoverySpeed: string;
  };
}

interface MemoryBlock {
  summary: string;
  tier: 'recent' | 'mid' | 'old';
}

let clientInstance: Anthropic | null = null;
let lastKey = '';

async function getClient(): Promise<Anthropic> {
  const key = process.env.ANTHROPIC_API_KEY
    || (await readJson<{ anthropicApiKey?: string }>(getSettingsPath()))?.anthropicApiKey
    || '';
  if (!clientInstance || key !== lastKey) {
    clientInstance = new Anthropic({ apiKey: key });
    lastKey = key;
  }
  return clientInstance;
}

export async function buildAIDirection(
  characters: Character[],
  labelMap: Map<string, string>,
  previousSummary: EmotionalSummary,
  memories: MemoryBlock[],
  coveredTopics: string[],
  segmentNumber: number,
  targetTurnCount: number,
): Promise<DirectorInput> {
  const client = await getClient();

  const charProfiles = characters.map(c => {
    const label = labelMap.get(c.id)!;
    return `${label}: ${c.personality}. Interests: ${c.interests.join(', ')}. Quirks: ${c.quirks.join(', ')}. Temperament: ${c.emotionalProfile.temperament}. Triggers: ${c.emotionalProfile.triggers.map(t => `${t.topic} (${t.reaction})`).join(', ') || 'none'}.`;
  }).join('\n');

  const memoryText = memories.length > 0
    ? memories.map(m => m.summary).join('\n\n')
    : 'No previous conversation history.';

  const emotionalState = Object.entries(previousSummary.emotionalStates)
    .map(([label, s]) => `${label}: ${s.emotion} (intensity ${s.intensity}, ${s.note || 'no note'})`)
    .join('\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: `You are the director of a naturalistic conversation between four people. Your job is to guide the next segment of their conversation by providing emotional landscape and creative suggestions.

You are NOT writing the conversation. You are writing stage direction — describing where the conversation should go emotionally, what dynamics should shift, what topics could come up, and what the pacing should feel like.

Think about:
- Character dynamics that should evolve (who's been too quiet? who's dominating? any tension building?)
- Narrative pacing (has it been intense? time for a breather? time to escalate?)
- Topics that would be interesting for THESE specific characters given their personalities and triggers
- Emotional arcs — not every segment needs conflict, but the conversation should feel like it's going somewhere

CRITICAL: The conversation must ALWAYS move forward. NEVER suggest returning to topics already covered — they are OFF-LIMITS. NEVER suggest discussing a character's personality or traits — the characters should talk about the WORLD, not about each other's personalities. Push the conversation into genuinely new territory every single segment.

Your most important job is injecting SPECIFIC, CONCRETE new topics — not vague meta-suggestions like "someone changes the subject." Name the actual subject: "someone brings up a weird dream they had about being chased through a supermarket" or "someone asks the group whether they think aliens have visited Earth." Real topics that real people would bring up sitting around talking.

Think about: random memories, hypothetical scenarios, things in the news, debates about everyday life, confessions, plans, childhood stories, unpopular opinions, travel stories, weird facts, relationship drama, work stories, philosophical questions, funny observations.

Return a JSON object:
{
  "emotionalLandscape": { "Person A": "description", "Person B": "description", ... },
  "suggestions": ["suggestion 1", "suggestion 2", ...],
  "newTopic": "a specific, concrete topic for someone to bring up naturally"
}

Keep suggestions to 2-4 items. The "newTopic" field is REQUIRED — it must be a specific subject that has NOT been covered before, described concretely enough that the writer knows exactly what to have someone bring up. Write suggestions as natural nudges, not rigid commands.

Return ONLY the JSON object.`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Segment ${segmentNumber + 1} of the conversation. Each segment is about ${targetTurnCount} turns.

CHARACTER PROFILES:
${charProfiles}

CONVERSATION SO FAR (memory summaries):
${memoryText}

CURRENT EMOTIONAL STATE (end of last segment):
${emotionalState}

UNRESOLVED THREADS: ${previousSummary.unresolvedThreads.join(', ') || 'none'}

TOPICS THAT ARE OFF-LIMITS (already explored — do NOT revisit these):
${coveredTopics.join(', ') || 'none yet'}

Write the direction for the next segment.`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const suggestions = parsed.suggestions ?? [];
      if (parsed.newTopic) {
        suggestions.push(`Someone naturally brings up ${parsed.newTopic}`);
      }
      return {
        emotionalLandscape: parsed.emotionalLandscape ?? {},
        suggestions,
        topicSeeds: [],
        targetTurnCount,
      };
    } catch {}
  }

  return buildNextSegmentDirection(previousSummary, [], coveredTopics, targetTurnCount, segmentNumber);
}

export const AI_DIRECTOR_INTERVAL = 3;

const CONCRETE_TOPICS = [
  // Dreams, memories, childhood
  'a weird dream someone had last night',
  'a childhood memory that feels like it happened to someone else',
  'a fear they had as a kid that seems ridiculous now',
  'the first thing they remember being obsessed with as a kid',
  'a recurring dream they keep having',
  'the earliest memory they can actually recall',
  'a toy or game from childhood they wish still existed',
  'the dumbest thing they did as a teenager',
  'a nightmare that stuck with them for days',
  'what their childhood bedroom looked like',
  'a game they used to play with neighborhood kids that would get them arrested now',
  'a lie they told as a kid that somehow never got found out',
  'the first time they realized adults did not have everything figured out',
  'a smell that instantly takes them back to a specific moment',
  'whether they think childhood was actually better or if nostalgia is lying to them',
  'a secret hideout or fort they had as a kid',
  'the most trouble they ever got in at school',
  'a phase they went through that they pretend never happened',
  'the first album or song they ever bought with their own money',
  'a family road trip that went completely sideways',

  // Food and cooking
  'the best meal they ever had and where it was',
  'a food combination that sounds disgusting but actually works',
  'the weirdest thing they have ever eaten',
  'a dish they can cook perfectly and how they learned it',
  'the worst thing they ever cooked',
  'a food they hated as a kid but love now',
  'whether cereal is soup',
  'the most expensive meal they ever paid for and whether it was worth it',
  'a food trend they think is ridiculous',
  'what they would eat for their last meal',
  'a family recipe that has been passed down',
  'the most they have ever eaten in one sitting',
  'a restaurant they keep going back to even though they should try new places',
  'whether a hot dog is a sandwich',
  'a snack they are embarrassed to admit they eat',
  'the worst food poisoning they ever had',
  'whether they could go vegetarian for a year',
  'a cooking disaster that turned into something edible',
  'the best street food they have ever tried',
  'a food they will never try no matter what anyone says',

  // Travel and places
  'a place they have always wanted to visit but never have',
  'the most beautiful place they have ever seen',
  'the worst hotel or accommodation they ever stayed in',
  'a trip that completely changed their perspective on something',
  'whether they prefer mountains or the ocean',
  'the longest road trip they have ever taken',
  'a city they expected to love but ended up hating',
  'the best spontaneous trip they ever took',
  'somewhere they have been that felt like another planet',
  'a travel disaster that became a great story',
  'whether they would rather explore every country or every ocean',
  'the most remote place they have ever been',
  'a place they lived that they miss the most',
  'whether they would take a one-way trip to explore deep space',
  'the best sunrise or sunset they have ever seen',
  'a town or city they drove through and immediately wanted to live in',
  'the scariest flight or car ride they have been on',
  'a country whose food alone is worth the trip',
  'whether they could live as a nomad with no permanent home',
  'the most overrated tourist destination they have visited',

  // Hypotheticals and would-you-rather
  'whether they could survive alone in the wilderness for a week',
  'whether time travel would actually be worth the risk',
  'whether they would rather know the future or change the past',
  'whether they would live on Mars if they could never come back',
  'what they would do if they were invisible for a day',
  'what superpower would actually be the most practical',
  'whether they would want to read minds if it meant hearing everything',
  'what they would do if they won an absurd amount of money',
  'whether they would clone their pet if they could',
  'what they would do with an extra hour every day',
  'whether they would take a pill that meant they never needed to sleep again',
  'if they could master any instrument overnight which one they would pick',
  'whether they would want to know the exact date of their death',
  'what they would do if they woke up and nobody remembered who they were',
  'whether they would give up the internet forever for ten million dollars',
  'if they could witness any historical event firsthand which one',
  'whether they would rather be the funniest or the smartest person in the room',
  'what they would do if they found out the simulation theory was true',
  'whether they would trade ten years of their life for perfect health the rest of it',
  'if they could have dinner with any fictional character who it would be',
  'whether they would rather fight one horse-sized duck or a hundred duck-sized horses',
  'what they would do if they had a pause button for real life',
  'whether they would want to relive their twenties knowing what they know now',
  'if they could add one amendment to the constitution what it would be',
  'whether they would choose immortality if everyone they loved would still age normally',

  // Philosophy and big questions
  'what they think happens after you die',
  'whether they believe in luck or think everything is cause and effect',
  'whether they think people can truly change',
  'whether it is possible to be truly selfless',
  'whether money actually buys happiness or just comfort',
  'whether they think there is such a thing as a soulmate',
  'whether it is better to be smart or to be kind',
  'whether free will is real or if everything is predetermined',
  'what they think consciousness actually is',
  'whether morality is objective or just something humans made up',
  'what the meaning of life is if there even is one',
  'whether ignorance really is bliss',
  'whether justice and revenge are the same thing',
  'what they think the purpose of suffering is',
  'whether they think the universe has a point or if it is all random',
  'whether being remembered after death actually matters',
  'what they think makes someone a good person',
  'whether absolute power always corrupts',
  'whether they think truth is more important than kindness',
  'whether loyalty should have limits',

  // Technology and the future
  'what the world will look like in fifty years',
  'whether AI is going to take their job someday',
  'a piece of technology they refuse to use',
  'whether social media has made people better or worse',
  'whether they could go a full year without their phone',
  'what invention they think the world still needs',
  'whether self-driving cars will ever actually work',
  'a piece of technology that genuinely blew their mind when it came out',
  'whether they think we will ever cure aging',
  'the most dystopian thing about modern life that everyone just accepts',
  'whether they would get a brain chip implant if it made them smarter',
  'what technology from science fiction they wish actually existed',
  'whether they think the internet was a net positive for humanity',
  'the most useless app on their phone that they keep anyway',
  'whether they trust algorithms to make decisions about their life',
  'what they think phones will look like in twenty years',
  'whether streaming killed the magic of discovering music and movies',
  'a website or service that disappeared that they actually miss',
  'whether virtual reality will ever replace real experiences',
  'what the scariest possible use of AI would be',

  // Work, careers, money
  'the strangest job they ever had or heard about',
  'a job they think does not get enough respect',
  'what they would do differently if they started their career over',
  'the worst boss they have ever had',
  'whether they work to live or live to work',
  'the most money they ever wasted on something stupid',
  'a job they would do for free if money did not matter',
  'the worst job interview they ever had',
  'whether they think the forty hour work week still makes sense',
  'what they would do if they never had to work again',
  'a coworker who made their life significantly better or worse',
  'the best financial decision they ever made',
  'whether they would rather have a job they love that pays poorly or one they hate that pays well',
  'the weirdest workplace rule they ever had to follow',
  'what their dream business would be if they could start anything',
  'whether unpaid internships are exploitative',
  'the most useless meeting they ever sat through',
  'whether hustle culture is inspirational or toxic',
  'a career they considered but never pursued',
  'the biggest risk they ever took professionally',

  // Relationships and people
  'a time they were completely wrong about someone',
  'a recurring argument they have with someone close to them',
  'what they think their friends really think of them',
  'the worst date or social event they have been to',
  'a compliment someone gave them that they still think about',
  'the most interesting stranger they have ever talked to',
  'a teacher or mentor who shaped who they are',
  'the best or worst neighbor they have ever had',
  'the longest friendship they have maintained and why it has lasted',
  'a relationship they ended that they sometimes wonder about',
  'whether it is possible to be friends with an ex',
  'the most awkward introduction they have ever had',
  'a person who changed their life without realizing it',
  'whether they think opposites attract or if that is nonsense',
  'the hardest conversation they have ever had to have',
  'a friend they lost touch with and wish they had not',
  'whether honesty is always the best policy in relationships',
  'the worst gift they have ever received and what they did about it',
  'a time they had to choose between two people they cared about',
  'whether they think long-distance relationships can actually work',

  // Fears, risks, danger
  'the scariest experience they have ever had',
  'a phobia they have that they know is irrational',
  'the worst injury they have ever had and how it happened',
  'the closest call they have ever had with death or serious injury',
  'something they are afraid of that most people are not',
  'the bravest thing they have ever done',
  'whether they are more afraid of the ocean or space',
  'a risk they took that paid off big time',
  'a risk they took that completely backfired',
  'whether they think fear is useful or just holds people back',
  'the most dangerous thing they have done on purpose',
  'whether they would go skydiving or bungee jumping',
  'a time they had a gut feeling that turned out to be right',
  'the creepiest place they have ever been',
  'whether they could spend a night alone in a haunted house',

  // Entertainment, media, culture
  'a book, movie, or show that genuinely changed how they think',
  'the worst movie they have sat through to the end',
  'the best concert, show, or live event they have been to',
  'the most interesting documentary they have watched',
  'a song that brings back a specific vivid memory',
  'a TV show they have rewatched an embarrassing number of times',
  'a movie everyone loves that they think is terrible',
  'the best villain in any movie or book and why',
  'a piece of music that makes them emotional every single time',
  'a band or artist they used to love but cannot stand anymore',
  'the most underrated movie they have seen',
  'a book they started but could never finish',
  'whether the book is always better than the movie',
  'a fictional world they would actually want to live in',
  'the funniest comedy special or stand-up set they have seen',
  'a song lyric they misheard for years before finding out the real words',
  'whether they think modern music is worse than older music or if every generation says that',
  'a movie that scared them so badly they could not sleep',
  'the best plot twist they have ever experienced in any medium',
  'a character from fiction they relate to uncomfortably well',

  // Nature, animals, outdoors
  'an animal they think is underrated',
  'whether they think there is intelligent life in the ocean we have not found',
  'whether zoos are ethical or not',
  'the most incredible thing they have seen in nature',
  'whether they would rather encounter a bear or a moose in the wild',
  'an animal they are terrified of that most people think is harmless',
  'the weirdest animal fact they know',
  'whether they could live off the grid for a year',
  'a time they were caught in a storm and what happened',
  'whether they think we should bring back extinct animals',
  'the most impressive thing they have seen an animal do',
  'whether they think plants can feel pain',
  'the best camping or outdoor experience they have had',
  'an encounter with wildlife that caught them off guard',
  'whether they think the ocean is scarier than space',

  // Opinions, debates, hot takes
  'a hill they would die on that nobody else cares about',
  'the most overrated thing in modern life',
  'a trend they absolutely do not understand',
  'a rule or law they think is completely pointless',
  'a conspiracy theory that actually makes them think',
  'an unpopular opinion they hold that they know will start an argument',
  'whether tipping culture has gotten out of control',
  'something everyone wastes money on that they refuse to buy',
  'whether participation trophies ruined a generation or if that complaint is overblown',
  'the most overrated holiday and why',
  'whether cursive handwriting should still be taught in schools',
  'a societal norm they think will seem absurd in fifty years',
  'whether college is still worth the cost',
  'the most pointless debate they keep getting into',
  'whether first impressions are usually right or usually wrong',
  'something that was better before it got popular',
  'whether cancel culture is real or just accountability with a new name',
  'the dumbest trend they have ever participated in',
  'whether people are fundamentally good or fundamentally selfish',
  'a double standard that drives them crazy',

  // Personal growth, habits, self
  'a skill they wish they had learned when they were younger',
  'a habit they cannot break no matter how hard they try',
  'a guilty pleasure they would never admit to most people',
  'the most useless talent they have',
  'what they would teach a class on if they had to',
  'a hobby they picked up and dropped within a month',
  'what their younger self would think of their life now',
  'what their autobiography title would be',
  'something they believed for way too long before finding out it was wrong',
  'the pettiest thing they have ever done',
  'the most spontaneous thing they have ever done',
  'what they would name a bar or restaurant if they opened one',
  'the worst haircut they ever had',
  'a moment of their life they wish they could relive',
  'what language they would learn instantly if they could',
  'a tradition they have that other people find strange',
  'a house rule they grew up with that they later realized was weird',
  'the most physically challenging thing they have done',
  'what their ideal retirement looks like',
  'whether they are a morning person or a night person and whether they wish they could switch',

  // Mystery, paranormal, unexplained
  'a mystery or unsolved case that fascinates them',
  'the strangest coincidence that ever happened to them',
  'whether they have ever experienced something they genuinely cannot explain',
  'a local legend or urban myth from where they grew up',
  'whether they think ghosts are real and why',
  'the creepiest thing that ever happened to them at night',
  'whether they believe in intuition or think it is just pattern recognition',
  'a historical mystery they wish someone would solve',
  'whether they think Bigfoot or the Loch Ness Monster could possibly exist',
  'a time something felt too perfectly timed to be a coincidence',
  'whether they think deja vu means something or is just a brain glitch',
  'the strangest thing they have found in a place they moved into',
  'whether they would want proof that ghosts exist even if it changed everything',
  'a conspiracy theory they used to believe but grew out of',
  'the most unexplainable experience someone they trust has told them about',

  // Social situations, awkwardness, humor
  'the most embarrassing thing that happened to them in public',
  'the funniest misunderstanding they have been part of',
  'the most awkward elevator or waiting room moment they experienced',
  'a time they had to pretend to like something they hated',
  'the funniest thing a kid ever said to them',
  'a random act of kindness they witnessed or did',
  'the most awkward thing they have accidentally said out loud',
  'a time they waved back at someone who was not waving at them',
  'the worst small talk they have ever been trapped in',
  'a party or gathering they walked into and immediately wanted to leave',
  'the most absurd argument they have ever witnessed between strangers',
  'a time autocorrect or a typo got them in actual trouble',
  'the longest they have pretended to know what someone was talking about',
  'a time they laughed at completely the wrong moment',
  'the most creative excuse they have ever come up with to get out of something',

  // History and society
  'a historical figure they would want to have dinner with',
  'what era they would want to live in if they could pick',
  'whether they think humanity is getting smarter or dumber',
  'a period of history they think is underappreciated',
  'whether the world is actually getting better or worse',
  'a historical event that would have gone completely differently with modern technology',
  'whether they think democracy is the best system or just the least bad one',
  'a civilization or culture they find fascinating',
  'whether they think history repeats itself or just rhymes',
  'a war or conflict most people have never heard of that is worth knowing about',
  'what they think the biggest turning point in human history was',
  'whether they think future generations will judge us harshly and for what',
  'a historical myth or legend that turned out to be true',
  'whether they think we have already passed the peak of human civilization',
  'what lesson from history they think people keep refusing to learn',

  // Health, body, weird human stuff
  'the longest they have gone without sleep and what happened',
  'a home remedy that actually works even though it sounds fake',
  'the weirdest thing their body has ever done',
  'whether they think the human body is well designed or full of flaws',
  'a health trend they tried that was completely useless',
  'the worst pain they have ever felt',
  'whether they could do a thirty day fast or cleanse',
  'a weird physical ability they have that most people do not',
  'whether they think humans were meant to eat meat',
  'the worst hangover or food reaction they have ever had',
  'a medical fact that genuinely surprised them',
  'whether they trust doctors completely or question everything',
  'the most disgusting thing they have witnessed that they cannot unsee',
  'whether they think we will ever fully understand the human brain',
  'a time they pushed their body way past its limit',

  // Home, living, daily life
  'the worst apartment or house they ever lived in',
  'whether they are a clean freak or comfortably messy',
  'the most unnecessary thing in their home that they love',
  'a home improvement project that went terribly wrong',
  'whether they prefer living in a city, suburb, or rural area',
  'the best purchase under twenty dollars they have ever made',
  'a household chore they secretly do not mind',
  'the weirdest thing a delivery driver has witnessed at their door',
  'whether they have ever found something valuable at a yard sale or thrift store',
  'a product they bought from an infomercial that actually worked',
  'the most ridiculous thing they own that they refuse to throw away',
  'whether they could live in a tiny house',
  'a power outage or weather event that disrupted their life',
  'the strangest thing about the town or neighborhood they live in',
  'whether they lock their doors at night or think that is paranoid',

  // Sports, games, competition
  'the most competitive they have ever gotten over something trivial',
  'a sport or game they are surprisingly good at',
  'the greatest sports moment they have ever witnessed live or on TV',
  'whether they think esports are real sports',
  'a board game that has ended friendships',
  'the most physical pain they have endured for fun',
  'whether they think athletes are overpaid',
  'a bet they made that they deeply regretted',
  'the worst call by a referee they have ever seen',
  'whether they would rather be the best at one sport or decent at every sport',
  'a gym or workout experience that was hilariously bad',
  'whether competition brings out the best or worst in people',
  'a video game they sank way too many hours into',
  'whether they have ever cheated at a game and gotten caught',
  'the most intense pickup game or casual competition they have been in',

  // Family and home life
  'the weirdest tradition their family has',
  'a family secret they found out about way too late',
  'whether birth order actually affects personality',
  'the most embarrassing thing a family member has done in public',
  'a piece of advice from a parent or grandparent that turned out to be gold',
  'whether they want to raise their kids the same way they were raised',
  'a family reunion moment that was unforgettable for the wrong reasons',
  'the funniest story their parents tell about them as a baby',
  'whether they think family dinners matter or are just performative',
  'a relative they barely know who is apparently a character',
  'the most heated family argument they have witnessed over something stupid',
  'whether they think siblings make you tougher or just traumatized',
  'a holiday gathering that went completely off the rails',
  'something their family does that they thought was normal until they told someone',
  'a family heirloom that has a surprisingly dark or funny backstory',

  // Crime, justice, ethics
  'whether they think the justice system works',
  'a true crime case they have strong opinions about',
  'the most illegal thing they have done that they are willing to admit',
  'whether they would turn in a friend who committed a serious crime',
  'a scam or con they almost fell for',
  'whether they think prison actually rehabilitates people',
  'what crime they think is punished too harshly or too lightly',
  'whether vigilante justice is ever acceptable',
  'a time they caught someone stealing or lying and had to decide what to do',
  'whether they think most people would commit crimes if they knew they would not get caught',
  'the cleverest heist or con they have heard about',
  'whether they think the death penalty is ever justified',
  'a moral dilemma they have faced in real life with no good answer',
  'whether they have ever found a wallet and what they did',
  'a law they break regularly without thinking about it',

  // Weather, seasons, environment
  'their favorite season and the real reason why',
  'the worst weather they have ever been stuck in',
  'whether climate change makes them anxious or if they have accepted it',
  'a natural disaster they experienced or barely missed',
  'whether they prefer extreme heat or extreme cold',
  'the most dramatic thunderstorm they have ever watched',
  'whether they think humans will ever control the weather',
  'a time the weather completely ruined their plans',
  'whether they care about recycling or think individual effort is pointless',
  'the most extreme temperature they have ever experienced',

  // Random, absurd, fun
  'whether they think their last words will be',
  'whether they would want to be famous and for what',
  'the worst advice someone gave them that they actually followed',
  'what their life would look like if they had made one different decision',
  'what they would put in a time capsule for a hundred years from now',
  'what they would do if they found a door in their house they had never noticed before',
  'whether they think pigeons are watching us',
  'the most ridiculous thing they have seen someone do in traffic',
  'whether they have a catchphrase and if so whether they chose it',
  'the most absurd thing they have Googled at three in the morning',
  'whether fish get thirsty',
  'the dumbest injury they have ever gotten',
  'a product that exists for no reason but somehow sells',
  'whether they could eat only one food for the rest of their life and what it would be',
  'what they would do if they woke up ten inches taller',
  'the most bizarre thing they have found in a public restroom',
  'whether they have ever had a conversation with an animal and what they said',
  'the strangest thing on their bucket list',
  'whether they think we are living in the weirdest timeline',
  'what they would do if gravity turned off for thirty seconds',

  // Education and learning
  'the most useless thing they learned in school that they still remember',
  'a subject they hated in school that they now find interesting',
  'whether college taught them anything useful or if they learned everything on the job',
  'the best teacher they ever had and what made them special',
  'the worst group project they were ever part of',
  'a random fact they learned that completely blew their mind',
  'whether they learn better by reading, watching, or doing',
  'something they taught themselves from YouTube or the internet',
  'a class they wish existed when they were in school',
  'whether they think standardized testing measures anything real',
  'the most interesting lecture or talk they have ever attended',
  'whether they would go back to school if money and time were not a factor',
  'a textbook or teacher that was so wrong it was funny',
  'whether homework actually helps kids learn',
  'the biggest gap in their knowledge that they are embarrassed about',

  // Fashion, appearance, style
  'the worst outfit they have ever worn in public on purpose',
  'whether they dress for themselves or for other people',
  'a fashion trend they participated in that aged terribly',
  'the most uncomfortable thing they have ever worn for the sake of looking good',
  'whether they judge people by their shoes',
  'an item of clothing they have owned for way too long',
  'whether they think tattoos will ever go out of style',
  'the best Halloween costume they have ever seen',
  'whether first impressions based on appearance are usually accurate',
  'the most money they have ever spent on a single piece of clothing',

  // Cars, driving, transportation
  'the worst car they have ever owned',
  'their road rage story they are not proud of',
  'the longest they have ever been lost while driving',
  'whether they think flying cars will ever happen',
  'a car they had that they were emotionally attached to',
  'the most absurd thing they have seen on the highway',
  'whether public transportation should be free',
  'the worst parking job they have ever witnessed',
  'a driving habit other people have that makes them lose their mind',
  'whether they have ever picked up a hitchhiker or been one',

  // Language, communication, words
  'a word they mispronounced for years before someone corrected them',
  'the best insult they have ever heard that was not a curse word',
  'whether they think sarcasm is funny or just rude',
  'a phrase their parents used to say that they now catch themselves saying',
  'the most annoying buzzword or expression in modern English',
  'whether they have ever learned enough of another language to eavesdrop',
  'a time a miscommunication led to something hilarious or terrible',
  'the best piece of graffiti they have ever seen',
  'whether emoji have made communication better or lazier',
  'a compliment they gave that accidentally came out as an insult',

  // Creativity, art, making things
  'something they built or made that they are genuinely proud of',
  'whether they think everyone is creative or if some people just are not',
  'the worst piece of art they have seen that was taken seriously',
  'a craft or hobby they want to try but keep putting off',
  'whether AI-generated art counts as real art',
  'the most satisfying thing they have ever made with their hands',
  'a creative project they abandoned halfway through',
  'whether they think graffiti is art or vandalism',
  'the most impressive handmade thing they have ever received as a gift',
  'whether they think talent is born or developed',

  // Space, science, the universe
  'whether they think aliens have visited Earth',
  'what they think is at the bottom of the deepest parts of the ocean',
  'whether they would go to space if given the chance even with risk',
  'the most mind-bending science fact they know',
  'whether they think we will colonize another planet in their lifetime',
  'what they think the universe looked like before the Big Bang',
  'whether they think parallel universes exist',
  'a scientific discovery that changed how they see everyday life',
  'whether they find the vastness of space comforting or terrifying',
  'what they think the next major scientific breakthrough will be',

  // Manners, etiquette, social norms
  'a social norm they think is outdated and should go away',
  'whether they think it is rude to recline your seat on a plane',
  'the rudest thing a stranger has ever done to them',
  'whether they think chivalry is dead and whether it should be',
  'an unwritten rule everyone should follow but many do not',
  'whether they answer the phone when an unknown number calls',
  'the most passive-aggressive note they have ever received or written',
  'whether ghosting someone is ever acceptable',
  'a time they accidentally committed a major social faux pas',
  'whether they think people should say bless you when someone sneezes',

  // Luck, chance, fate
  'the luckiest thing that ever happened to them',
  'a near miss that could have changed their entire life',
  'whether they think everything happens for a reason',
  'the unluckiest day they have ever had',
  'whether they have any superstitions they follow even though they know they are silly',
  'a time they found money on the ground and what they did',
  'whether they think some people are just born lucky',
  'the biggest coincidence in their life that still amazes them',
  'whether they play the lottery and why or why not',
  'a decision they made on a coin flip that turned out to matter',
  'whether they have a lucky number and where it came from',
  'a time something bad happened that turned out to be the best thing for them',
];

const TOPIC_INTROS = [
  'Someone randomly brings up',
  'Out of nowhere, someone mentions',
  'Someone suddenly asks the group about',
  'Apropos of nothing, someone starts talking about',
  'Someone changes the subject to',
  'Someone remembers something and brings up',
  'A stray thought leads someone to mention',
  'Someone asks if anyone else has thought about',
];

interface EmotionalSummary {
  emotionalStates: Record<string, {
    emotion: string;
    intensity: number;
    valence: number;
    note: string;
  }>;
  unresolvedThreads: string[];
  topicsCovered: string[];
  suggestedNextDirection: string;
}

interface DirectorInput {
  emotionalLandscape: Record<string, string>;
  suggestions: string[];
  topicSeeds: string[];
  targetTurnCount: number;
}

export function buildFirstSegmentDirection(
  topicSeeds: string[],
  targetTurnCount: number,
): DirectorInput {
  const suggestions: string[] = [];

  if (topicSeeds.length > 0) {
    suggestions.push(`Start the conversation around ${topicSeeds[0]} — someone brings it up naturally`);
    if (topicSeeds.length > 1) {
      suggestions.push(`The conversation could also touch on ${topicSeeds.slice(1).join(', ')}`);
    }
  } else {
    suggestions.push('Start with casual small talk — someone brings up something on their mind');
  }

  return {
    emotionalLandscape: {
      'Person A': 'relaxed, settling in',
      'Person B': 'upbeat, ready to chat',
      'Person C': 'calm, listening',
      'Person D': 'alert, in a good mood',
    },
    suggestions,
    topicSeeds,
    targetTurnCount,
  };
}

export function buildNextSegmentDirection(
  previousSummary: EmotionalSummary,
  topicSeeds: string[],
  coveredTopics: string[],
  targetTurnCount: number,
  segmentNumber: number = 1,
): DirectorInput {
  const emotionalLandscape: Record<string, string> = {};
  for (const [label, state] of Object.entries(previousSummary.emotionalStates)) {
    const intensityWord =
      state.intensity > 0.7 ? 'very' :
      state.intensity > 0.4 ? 'somewhat' :
      'mildly';
    const note = state.note ? ` — ${state.note}` : '';
    emotionalLandscape[label] = `${intensityWord} ${state.emotion}${note}`;
  }

  const suggestions: string[] = [];

  if (previousSummary.suggestedNextDirection && Math.random() > 0.3) {
    suggestions.push(previousSummary.suggestedNextDirection);
  }

  if (previousSummary.unresolvedThreads.length > 0 && Math.random() > 0.4) {
    const freshThreads = previousSummary.unresolvedThreads.filter(thread => {
      const threadText = typeof thread === 'object' ? (thread as any).thread ?? String(thread) : String(thread);
      return !coveredTopics.some(topic =>
        threadText.toLowerCase().includes(topic.toLowerCase()) ||
        topic.toLowerCase().includes(threadText.toLowerCase())
      );
    });
    if (freshThreads.length > 0) {
      const thread = freshThreads[Math.floor(Math.random() * freshThreads.length)];
      const threadText = typeof thread === 'object' ? (thread as any).thread ?? String(thread) : String(thread);
      suggestions.push(`The unresolved thread about "${threadText}" could resurface`);
    }
  }

  const driftChance = Math.min(0.9, 0.4 + segmentNumber * 0.1);
  if (Math.random() < driftChance) {
    const unusedTopics = CONCRETE_TOPICS.filter(t =>
      !coveredTopics.some(ct => ct.toLowerCase().includes(t.split(' ').slice(0, 3).join(' ').toLowerCase()))
    );
    const topicPool = unusedTopics.length > 0 ? unusedTopics : CONCRETE_TOPICS;
    const topic = topicPool[Math.floor(Math.random() * topicPool.length)];
    const intro = TOPIC_INTROS[Math.floor(Math.random() * TOPIC_INTROS.length)];
    suggestions.push(`${intro} ${topic}`);
  }

  if (segmentNumber > 2 && Math.random() < 0.4) {
    suggestions.push('Let the conversation breathe — not every moment needs to be high-energy or meaningful. Sometimes people just chat about nothing for a bit.');
  }

  const seedsToUse = topicSeeds.filter(s => !coveredTopics.includes(s));

  return {
    emotionalLandscape,
    suggestions,
    topicSeeds: seedsToUse,
    targetTurnCount,
  };
}
