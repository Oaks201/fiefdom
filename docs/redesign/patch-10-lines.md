# Patch 10 stage 3: the rulers’ words in parts (for Rich’s approval)

Drafted 2026-11-17 by Claude (R5, D-91). **Approved by Rich as written the same day (D-92)** and moved into `rivalLines.json`, so every build speaks them.

**How a line is built.** Each slot below holds parts: one **body**, with an **opening** before it and a **close** after it where the slot has them. The game picks one of each by the campaign’s seeded draw for the day, so a visit reads the same all day and the next day may differ. Approve the parts; the built lines under each slot are samples, with example facts filled in (Ashgate for a hex, week 12, Mon, Nov 23 for a last day).

**To approve:** move a ruler’s `requests` and `topics` entries from `rivalLines.draft.json` into `rivalLines.json` under the same ruler, editing any part as you like. A part you strike out is simply never picked. Placeholders must stay as they are.

## Ugrak

### His commission (his Audience card)

- **Openings:** “Ugrak has work for you, lordling.” · “Listen. The Steppe is restless.”
- **Bodies:** “Fight me {need} days before {until}. Any fight. Win or lose, it counts.” · “Bring your war to my march {need} days by {until}. Blood on the grass, every one.”
- **Closes:** “Ugrak will remember who answered.” · “Do it, and Ugrak speaks your name at the fires.”

Built, for example:

> Ugrak has work for you, lordling. Fight me 3 days before Mon, Nov 23. Any fight. Win or lose, it counts. Do it, and Ugrak speaks your name at the fires.
> Ugrak has work for you, lordling. Bring your war to my march 3 days by Mon, Nov 23. Blood on the grass, every one. Do it, and Ugrak speaks your name at the fires.
> Ugrak has work for you, lordling. Bring your war to my march 3 days by Mon, Nov 23. Blood on the grass, every one. Ugrak will remember who answered.
> Listen. The Steppe is restless. Bring your war to my march 3 days by Mon, Nov 23. Blood on the grass, every one. Do it, and Ugrak speaks your name at the fires.

### His terms to stand down from a Siege

- **Openings:** “The war-bands are already marching.” · “Hear Ugrak, lordling.”
- **Bodies:** “Stand and fight me {need} days before {until}, and I turn my bands for home.” · “Give me {need} days of real war by {until}. Do that, and there is no siege.”
- **Closes:** “Hide behind your walls, and I come for them.”

Built, for example:

> The war-bands are already marching. Give me 3 days of real war by Mon, Nov 23. Do that, and there is no siege. Hide behind your walls, and I come for them.
> The war-bands are already marching. Stand and fight me 3 days before Mon, Nov 23, and I turn my bands for home. Hide behind your walls, and I come for them.
> Hear Ugrak, lordling. Stand and fight me 3 days before Mon, Nov 23, and I turn my bands for home. Hide behind your walls, and I come for them.
> Hear Ugrak, lordling. Give me 3 days of real war by Mon, Nov 23. Do that, and there is no siege. Hide behind your walls, and I come for them.

### His reply when you take a commission up

- **Bodies:** “Good. Ugrak will be waiting.” · “Ha! Now we see what you are made of.”

Built, for example:

> Ha! Now we see what you are made of.
> Good. Ugrak will be waiting.

### His reply when you decline one

- **Bodies:** “Busy? Fine. The Steppe can wait. A little.” · “No? Ugrak will find someone braver to fight.”

Built, for example:

> No? Ugrak will find someone braver to fight.
> Busy? Fine. The Steppe can wait. A little.

### Topic: his commission met

- **Bodies:** “You came to fight, as Ugrak asked. Good days. Ugrak counted every one.” · “You answered Ugrak's call with steel. The fires burn brighter for it.”

Built, for example:

> You came to fight, as Ugrak asked. Good days. Ugrak counted every one.
> You answered Ugrak's call with steel. The fires burn brighter for it.

### Topic: his commission unmet

- **Bodies:** “Ugrak asked for a fight and the grass stayed quiet. Next time, lordling.” · “Ugrak waited for you in the field. You did not come. The field will still be there.”

Built, for example:

> Ugrak waited for you in the field. You did not come. The field will still be there.
> Ugrak asked for a fight and the grass stayed quiet. Next time, lordling.

### Topic: walls raised near him (Hrodgar: anywhere)

- **Bodies:** “You put stones on {hex}. Level {level}. Walls are for people who fear the night.” · “More walls at {hex}? Ugrak will climb them. Or go around.”

Built, for example:

> More walls at Ashgate? Ugrak will climb them. Or go around.
> You put stones on Ashgate. Level 2. Walls are for people who fear the night.

### Topic: your streak in his field

- **Bodies:** “{days} days you have fought me now. Ugrak is starting to like you.” · “Day {days} in my field. The Steppe sings of stubborn lordlings.”

Built, for example:

> 7 days you have fought me now. Ugrak is starting to like you.
> Day 7 in my field. The Steppe sings of stubborn lordlings.

### Topic: his own tag leads your strikes

- **Bodies:** “Your companies fight with {tag} now. Good. Ugrak understands {tag}.” · “{tag} leads your armies. Finally, someone who fights properly.”

Built, for example:

> Steel leads your armies. Finally, someone who fights properly.
> Your companies fight with Steel now. Good. Ugrak understands Steel.

### Memory: the first hex you took from him

- **Bodies:** “Week {week}. You took {hex} from me. The first of many. Ugrak still remembers the smoke.” · “{hex}, week {week}. The first ground you took from the Steppe. It was a good fight.”

Built, for example:

> Week 12. You took Ashgate from me. The first of many. Ugrak still remembers the smoke.
> Ashgate, week 12. The first ground you took from the Steppe. It was a good fight.

### Memory: the last Grand Battle against him

- **Bodies:** “Week {week}, at {hex}. That was a battle. Ugrak still has the scars.” · “Remember {hex}? Week {week}. The Steppe still sings about it.”

Built, for example:

> Week 12, at Ashgate. That was a battle. Ugrak still has the scars.
> Remember Ashgate? Week 12. The Steppe still sings about it.

### Memory: a pact with him kept to its end

- **Bodies:** “In week {week} our pact ended, kept. Ugrak does not say this often: you keep your word.” · “Week {week}. A pact, kept to its end. Ugrak remembers.”

Built, for example:

> In week 12 our pact ended, kept. Ugrak does not say this often: you keep your word.
> Week 12. A pact, kept to its end. Ugrak remembers.

## Skivvet

### His commission (his Audience card)

- **Openings:** “Business proposal, friend!” · “Got a little opportunity for you.”
- **Bodies:** “Win me a hex by coin before {until}. A bribe, a courtship, a trade: any honest purchase will do.” · “Buy yourself some land before {until}. Bribe it, court it, trade for it. Just don't take it by force.”
- **Closes:** “There's a little something in it for you.” · “Think of the profit!”

Built, for example:

> Got a little opportunity for you. Win me a hex by coin before Mon, Nov 23. A bribe, a courtship, a trade: any honest purchase will do. There's a little something in it for you.
> Business proposal, friend! Win me a hex by coin before Mon, Nov 23. A bribe, a courtship, a trade: any honest purchase will do. Think of the profit!
> Business proposal, friend! Win me a hex by coin before Mon, Nov 23. A bribe, a courtship, a trade: any honest purchase will do. There's a little something in it for you.
> Got a little opportunity for you. Buy yourself some land before Mon, Nov 23. Bribe it, court it, trade for it. Just don't take it by force. There's a little something in it for you.

### His terms to stand down from a Siege

- **Openings:** “Now, now, no need for sieges.” · “Let's be reasonable, friend.”
- **Bodies:** “Win a hex by coin before {until}, and my lads go home. Business as usual.” · “Show me you still trade like a civilized lord. One hex bought or courted by {until}, and I call my lads back.”
- **Closes:** “Everyone profits. Mostly me.”

Built, for example:

> Let's be reasonable, friend. Show me you still trade like a civilized lord. One hex bought or courted by Mon, Nov 23, and I call my lads back. Everyone profits. Mostly me.
> Let's be reasonable, friend. Win a hex by coin before Mon, Nov 23, and my lads go home. Business as usual. Everyone profits. Mostly me.
> Now, now, no need for sieges. Win a hex by coin before Mon, Nov 23, and my lads go home. Business as usual. Everyone profits. Mostly me.
> Now, now, no need for sieges. Show me you still trade like a civilized lord. One hex bought or courted by Mon, Nov 23, and I call my lads back. Everyone profits. Mostly me.

### His reply when you take a commission up

- **Bodies:** “Pleasure doing business, friend!” · “Lovely. I'll draw up the papers.”

Built, for example:

> Pleasure doing business, friend!
> Lovely. I'll draw up the papers.

### His reply when you decline one

- **Bodies:** “No? Your loss, friend. Literally.” · “Pity. The offer was a bargain.”

Built, for example:

> Pity. The offer was a bargain.
> No? Your loss, friend. Literally.

### Topic: his commission met

- **Bodies:** “You bought your land, just as I asked. A lord who pays! I'm touched.” · “Deal done and delivered. You've got a merchant's soul, friend.”

Built, for example:

> You bought your land, just as I asked. A lord who pays! I'm touched.
> Deal done and delivered. You've got a merchant's soul, friend.

### Topic: his commission unmet

- **Bodies:** “You didn't buy a thing this week, friend. The market reopens. It always does.” · “No sale this time. Never mind. I keep a ledger, not a grudge. Mostly.”

Built, for example:

> No sale this time. Never mind. I keep a ledger, not a grudge. Mostly.
> You didn't buy a thing this week, friend. The market reopens. It always does.

### Topic: walls raised near him (Hrodgar: anywhere)

- **Bodies:** “Walls at {hex}, level {level}. Expensive things, walls. Who's your mason? I want a cut.” · “You're walling {hex}. Smart. Walls protect investments.”

Built, for example:

> You're walling Ashgate. Smart. Walls protect investments.
> Walls at Ashgate, level 2. Expensive things, walls. Who's your mason? I want a cut.

### Topic: your streak in Ugrak’s field, from 7 days

- **Bodies:** “{rival} says you've fought him {days} days running. Expensive hobby, friend.” · “Day {days} fighting {rival}? Think of the coin you could be making instead.”

Built, for example:

> Ugrak says you've fought him 7 days running. Expensive hobby, friend.
> Day 7 fighting Ugrak? Think of the coin you could be making instead.

### Topic: his own tag leads your strikes

- **Bodies:** “Your companies carry {tag} now. A lord after my own heart.” · “{tag} leads your armies. Finally, a properly funded war.”

Built, for example:

> Your companies carry Coin now. A lord after my own heart.
> Coin leads your armies. Finally, a properly funded war.

### Memory: the first hex you took from him

- **Bodies:** “{hex}, week {week}. The first property you ever took off me. I still have the receipt.” · “Week {week}. You took {hex}. I've been billing you for it ever since.”

Built, for example:

> Ashgate, week 12. The first property you ever took off me. I still have the receipt.
> Week 12. You took Ashgate. I've been billing you for it ever since.

### Memory: the last Grand Battle against him

- **Bodies:** “Week {week}, at {hex}. Costliest battle of my career. I still have the invoices.” · “Remember {hex}? Week {week}. My accountants still weep about it.”

Built, for example:

> Remember Ashgate? Week 12. My accountants still weep about it.
> Week 12, at Ashgate. Costliest battle of my career. I still have the invoices.

### Memory: a pact with him kept to its end

- **Bodies:** “Week {week}: our pact, paid in full. I frame my best contracts, you know.” · “In week {week} you kept every line of our pact. I still tell the story to new customers.”

Built, for example:

> In week 12 you kept every line of our pact. I still tell the story to new customers.
> Week 12: our pact, paid in full. I frame my best contracts, you know.

## Hrodgar

### His commission (his Audience card)

- **Openings:** “Hear me, outsider.” · “A task, if you have the stone for it.”
- **Bodies:** “Raise {need} levels of wall on your land before {until}. Good stone, set true.” · “Build me {need} levels of wall by {until}. A border that holds is worth more than one that grows.”
- **Closes:** “It will be written in the book.” · “Do this, and a dwarf will think better of you.”

Built, for example:

> Hear me, outsider. Raise 3 levels of wall on your land before Mon, Nov 23. Good stone, set true. It will be written in the book.
> A task, if you have the stone for it. Raise 3 levels of wall on your land before Mon, Nov 23. Good stone, set true. It will be written in the book.
> Hear me, outsider. Raise 3 levels of wall on your land before Mon, Nov 23. Good stone, set true. Do this, and a dwarf will think better of you.
> A task, if you have the stone for it. Build me 3 levels of wall by Mon, Nov 23. A border that holds is worth more than one that grows. Do this, and a dwarf will think better of you.

### His terms to stand down from a Siege

- **Openings:** “My clans stand ready.” · “Hear the terms, outsider.”
- **Bodies:** “Raise {need} levels of wall by {until}, and my clans stand down.” · “Show me {need} levels of good stone by {until}, and there will be no siege from the mountain.”
- **Closes:** “The book does not lie.”

Built, for example:

> My clans stand ready. Raise 3 levels of wall by Mon, Nov 23, and my clans stand down. The book does not lie.
> Hear the terms, outsider. Raise 3 levels of wall by Mon, Nov 23, and my clans stand down. The book does not lie.
> Hear the terms, outsider. Show me 3 levels of good stone by Mon, Nov 23, and there will be no siege from the mountain. The book does not lie.
> My clans stand ready. Show me 3 levels of good stone by Mon, Nov 23, and there will be no siege from the mountain. The book does not lie.

### His reply when you take a commission up

- **Bodies:** “So. Then build well.” · “Agreed. I will be watching your masons.”

Built, for example:

> Agreed. I will be watching your masons.
> So. Then build well.

### His reply when you decline one

- **Bodies:** “As you like. It is noted.” · “Then the stone waits. It is patient. So am I.”

Built, for example:

> As you like. It is noted.
> Then the stone waits. It is patient. So am I.

### Topic: his commission met

- **Bodies:** “You raised your walls, as asked. Good stone. It is written in the book, in black ink.” · “The walls are up, and they are true. A dwarf could not have asked for better. Well. Almost.”

Built, for example:

> You raised your walls, as asked. Good stone. It is written in the book, in black ink.
> The walls are up, and they are true. A dwarf could not have asked for better. Well. Almost.

### Topic: his commission unmet

- **Bodies:** “The walls I asked for did not rise. The mountain waits. It always does.” · “No new stone this week. It is noted, without anger. Build when you can.”

Built, for example:

> The walls I asked for did not rise. The mountain waits. It always does.
> No new stone this week. It is noted, without anger. Build when you can.

### Topic: walls raised near him (Hrodgar: anywhere)

- **Bodies:** “You walled {hex} to level {level}. Good. Walls are a promise to the future.” · “Level {level} at {hex}. I would have cut the stone finer, but it will hold.”

Built, for example:

> You walled Ashgate to level 2. Good. Walls are a promise to the future.
> Level 2 at Ashgate. I would have cut the stone finer, but it will hold.

### Topic: your streak in Ugrak’s field, from 7 days

- **Bodies:** “{rival} has fought you {days} days running, I hear. Loud work. Does he never build?” · “Day {days} of {rival}'s brawling. Stone outlasts shouting, outsider. Remember it.”

Built, for example:

> Day 7 of Ugrak's brawling. Stone outlasts shouting, outsider. Remember it.
> Ugrak has fought you 7 days running, I hear. Loud work. Does he never build?

### Topic: his own tag leads your strikes

- **Bodies:** “Your companies march with {tag} now. Good. Machines are honest.” · “{tag} leads your armies. A dwarf could get used to you.”

Built, for example:

> Your companies march with Engine now. Good. Machines are honest.
> Engine leads your armies. A dwarf could get used to you.

### Memory: the first hex you took from him

- **Bodies:** “{hex}, week {week}. The first stone you took from me. It is in the book.” · “Week {week}. {hex}. I wrote it down that very night.”

Built, for example:

> Ashgate, week 12. The first stone you took from me. It is in the book.
> Week 12. Ashgate. I wrote it down that very night.

### Memory: the last Grand Battle against him

- **Bodies:** “Week {week}, at {hex}. The book has three pages on that battle.” · “{hex}, week {week}. My clans still sing of it. In a minor key.”

Built, for example:

> Week 12, at Ashgate. The book has three pages on that battle.
> Ashgate, week 12. My clans still sing of it. In a minor key.

### Memory: a pact with him kept to its end

- **Bodies:** “Week {week}: our word to each other, kept to its last day. That is worth more than gold under the mountain.” · “In week {week} our pact ran its full length. I keep that page near the front of the book.”

Built, for example:

> Week 12: our word to each other, kept to its last day. That is worth more than gold under the mountain.
> In week 12 our pact ran its full length. I keep that page near the front of the book.

## Emrys

### His commission (his Audience card)

- **Openings:** “A small experiment, my dear lord.” · “I find myself curious.”
- **Bodies:** “Before {until}, best one of my workings: take a hex of mine on its ebb, hold against a surge, or beat a mythic.” · “Show me you understand magic before {until}. An ebb seized, a surge held or a mythic slain will do.”
- **Closes:** “I'll be taking notes.” · “Do try to be interesting.”

Built, for example:

> A small experiment, my dear lord. Before Mon, Nov 23, best one of my workings: take a hex of mine on its ebb, hold against a surge, or beat a mythic. I'll be taking notes.
> A small experiment, my dear lord. Before Mon, Nov 23, best one of my workings: take a hex of mine on its ebb, hold against a surge, or beat a mythic. Do try to be interesting.
> I find myself curious. Before Mon, Nov 23, best one of my workings: take a hex of mine on its ebb, hold against a surge, or beat a mythic. Do try to be interesting.
> A small experiment, my dear lord. Show me you understand magic before Mon, Nov 23. An ebb seized, a surge held or a mythic slain will do. I'll be taking notes.

### His terms to stand down from a Siege

- **Openings:** “How tiresome, all this marching.” · “Let us be civilized, my dear lord.”
- **Bodies:** “Best one of my workings before {until}, and I call my forces home. An ebb, a surge or a mythic: your choice.” · “Prove you can handle the unseen by {until}, and there will be no siege. I'd so much rather study you than conquer you.”
- **Closes:** “Don't keep me waiting.”

Built, for example:

> How tiresome, all this marching. Best one of my workings before Mon, Nov 23, and I call my forces home. An ebb, a surge or a mythic: your choice. Don't keep me waiting.
> How tiresome, all this marching. Prove you can handle the unseen by Mon, Nov 23, and there will be no siege. I'd so much rather study you than conquer you. Don't keep me waiting.
> Let us be civilized, my dear lord. Best one of my workings before Mon, Nov 23, and I call my forces home. An ebb, a surge or a mythic: your choice. Don't keep me waiting.
> Let us be civilized, my dear lord. Prove you can handle the unseen by Mon, Nov 23, and there will be no siege. I'd so much rather study you than conquer you. Don't keep me waiting.

### His reply when you take a commission up

- **Bodies:** “Splendid. I'll prepare my notes.” · “Excellent. Let's see what you can do.”

Built, for example:

> Splendid. I'll prepare my notes.
> Excellent. Let's see what you can do.

### His reply when you decline one

- **Bodies:** “No? How disappointingly predictable.” · “Pity. I did so want the data.”

Built, for example:

> No? How disappointingly predictable.
> Pity. I did so want the data.

### Topic: his commission met

- **Bodies:** “You passed my little test. I've written it up. You come out of it rather well.” · “Done, and done properly. I'm almost impressed. Almost.”

Built, for example:

> You passed my little test. I've written it up. You come out of it rather well.
> Done, and done properly. I'm almost impressed. Almost.

### Topic: his commission unmet

- **Bodies:** “My experiment came to nothing this week. Results are results, even dull ones.” · “No result this time. Never mind. Science is mostly failure, beautifully recorded.”

Built, for example:

> No result this time. Never mind. Science is mostly failure, beautifully recorded.
> My experiment came to nothing this week. Results are results, even dull ones.

### Topic: walls raised near him (Hrodgar: anywhere)

- **Bodies:** “Walls at {hex}, level {level}. Stone against magic. How quaint. How sensible.” · “You've walled {hex} to level {level}. My surges will find it a pleasant puzzle.”

Built, for example:

> You've walled Ashgate to level 2. My surges will find it a pleasant puzzle.
> Walls at Ashgate, level 2. Stone against magic. How quaint. How sensible.

### Topic: your streak in Ugrak’s field, from 7 days

- **Bodies:** “{rival} tells me you've fought him {days} days in a row. Exhausting, surely. For him.” · “Day {days} of brawling with {rival}? Do tell me if either of you has an idea.”

Built, for example:

> Ugrak tells me you've fought him 7 days in a row. Exhausting, surely. For him.
> Day 7 of brawling with Ugrak? Do tell me if either of you has an idea.

### Topic: his own tag leads your strikes

- **Bodies:** “Your companies carry {tag} now. Finally, a lord who reads.” · “{tag} leads your armies. Do be careful. Magic bites the careless.”

Built, for example:

> Arcane leads your armies. Do be careful. Magic bites the careless.
> Your companies carry Arcane now. Finally, a lord who reads.

### Memory: the first hex you took from him

- **Bodies:** “{hex}, week {week}. The first hex you took from me. I have a whole chapter on it.” · “Week {week}: you took {hex}. I was annoyed for nearly a decade. Well. An afternoon.”

Built, for example:

> Week 12: you took Ashgate. I was annoyed for nearly a decade. Well. An afternoon.
> Ashgate, week 12. The first hex you took from me. I have a whole chapter on it.

### Memory: the last Grand Battle against him

- **Bodies:** “Week {week}, at {hex}. A fascinating battle. I've studied it since.” · “Remember {hex}, week {week}? I do. I remember everything.”

Built, for example:

> Week 12, at Ashgate. A fascinating battle. I've studied it since.
> Remember Ashgate, week 12? I do. I remember everything.

### Memory: a pact with him kept to its end

- **Bodies:** “Week {week}: our pact, kept to the letter. A useful data point about you.” · “In week {week} you kept every term of our pact. I've filed it under 'surprising'.”

Built, for example:

> In week 12 you kept every term of our pact. I've filed it under 'surprising'.
> Week 12: our pact, kept to the letter. A useful data point about you.
