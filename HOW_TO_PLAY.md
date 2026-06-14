# How to Play Asher Marahil

## Overview

Asher Marahil is a digital version of Phase 10 for 2–6 players. Each player races to complete ten phases — specific card combinations — in order. The first player to complete Phase 10 and go out wins. If they can't finish first, points from cards left in hand pile up, and the lowest score wins tiebreakers.

---

## Getting Into a Game

### Creating a Room

1. Go to `http://localhost:8000` (or the shared URL if playing online).
2. Type your name in the **Your Name** field.
3. Click **Create Room**.
4. You'll be taken to the waiting room. Your room code appears at the top.
5. Click **Copy Link** to share the invite URL with other players.

### Joining a Room

1. Get the invite link or room code from the host.
2. If you followed an invite link, the room code is pre-filled.
3. Type your name and click **Join Room**.

### Starting the Game

Once at least 2 players have joined, the host (the player who created the room) sees a **Start Game** button. Everyone else waits. The host clicks it to deal cards and begin.

---

## The Cards

The deck has 108 cards:

| Card | Count | Points if left in hand |
|---|---|---|
| Numbers 1–9 (red, blue, green, yellow) | 16 of each number | 5 |
| Numbers 10–12 (red, blue, green, yellow) | 8 of each number | 10 |
| Wild | 8 | 25 |
| Skip | 4 | 15 |

**Wild cards** can substitute for any number or color when completing a phase or laying off.

**Skip cards** are used to skip another player's turn. They cannot be included in a phase or laid off on a phase group — they can only be discarded.

---

## The Ten Phases

Players must complete these phases in order, one per round. You cannot skip a phase or go back.

| Phase | Requirement |
|---|---|
| 1 | 2 sets of 3 |
| 2 | 1 set of 3 + 1 run of 4 |
| 3 | 1 set of 4 + 1 run of 4 |
| 4 | 1 run of 7 |
| 5 | 1 run of 8 |
| 6 | 1 run of 9 |
| 7 | 2 sets of 4 |
| 8 | 7 cards of one color |
| 9 | 1 set of 5 + 1 set of 2 |
| 10 | 1 set of 5 + 1 set of 3 |

### What counts as a Set

A **set** is a group of cards with the same number. Color does not matter. Wild cards count as any number.

> Example: Red 7, Blue 7, Wild — valid set of 3.

Duplicate numbers within a set are allowed since there are two copies of each numbered card in the deck.

### What counts as a Run

A **run** is a group of cards with consecutive numbers. Color does not matter. Wild cards fill in any gap.

> Example: 4, Wild, 6, 7 — valid run of 4 (Wild fills the 5).

Runs can start and end anywhere from 1 to 12. There is no wrapping. Duplicate numbers are **not** allowed in a run.

### What counts as a Color group (Phase 8)

Seven cards that all share the same color. Wild cards count as any color.

> Example: 5 blue cards + 2 Wilds — valid 7-card color group.

---

## A Turn, Step by Step

On your turn, you **must** do three things in order:

### 1. Draw a Card

Click either:
- **Draw** (next to the draw pile) — take the top card from the face-down draw pile.
- **Draw** (next to the discard pile) — take the top card from the face-up discard pile.

You cannot do anything else until you draw.

### 2. Optionally Play Your Phase

If the cards in your hand (after drawing) form your current phase, you may lay it down on the table. You do not have to — you can hold off to later rounds if you want more cards for laying off.

**To play your phase:**
1. Click **Play Phase**.
2. A group-building panel appears below the action buttons, showing each group required for your phase.
3. Click cards in your hand to assign them to the current group (highlighted with an arrow). Cards move up when selected.
4. The panel auto-advances to the next group once the current one is full.
5. To undo a card assignment, click the card again — it is removed from its group.
6. When all groups are filled, click **Submit Phase**.

If the cards don't form a valid phase, the server will tell you what's wrong and you keep your hand.

### 3. Optionally Lay Off Cards

After you've played your own phase this round (or in the same turn after playing it), you may add cards to any other player's played phase groups on the table.

**To lay off:**
1. Click **Lay Off**. The button label changes to **Cancel Lay Off** and valid groups on the table become clickable (purple border).
2. Click the group you want to add to — it highlights to show it's selected.
3. Click cards in your hand to select them (they lift up).
4. The button changes to **Confirm Lay Off** — click it to send the cards.

If the server rejects the lay-off (wrong card type, duplicate number in a run, etc.), an error appears and you stay in lay-off mode. Pick different cards or a different group and try again — you do not need to click **Lay Off** a second time.

To exit lay-off mode without sending anything, click **Cancel Lay Off** at any point.

Cards must be valid additions to the group:
- A set: the card must match the set's number (or be a Wild).
- A run: the card must extend the run at either end, or fill a remaining gap (or be a Wild). No duplicates.
- A color group: the card must match the group's color (or be a Wild).

You can lay off multiple times per turn by repeating the steps above on different groups.

### 4. Discard a Card

You must end your turn by discarding exactly one card. Select a card in your hand and click **Discard**.

> The **Discard** button is disabled while you are in lay-off mode. Finish or cancel the lay-off first, then discard.

**Using a Skip card to skip another player:**
If you select a Skip card and click **Discard** (or drag it to the discard pile), a popup appears listing eligible players. Click a name to target them.

The Skip card is placed face-up in front of the targeted player — it does **not** go to the discard pile yet. When that player's turn arrives, the Skip card is automatically moved to the discard pile and their turn is skipped (no draw, no play, no discard).

- You cannot skip a player who has already gone out this round.
- You cannot skip yourself.
- You cannot skip a player who already has a pending Skip in front of them.
- A skipped player's turn is simply lost; they are not out of the round.
- You cannot draw a Skip card from the discard pile.

---

## Going Out

A round ends the moment any player empties their hand — whether by playing a phase, laying off, or discarding. That player "goes out."

You don't need to have played your phase to go out: if you discard your last card, the round ends immediately. However, you will not advance your phase unless you successfully laid it down before going out.

---

## Scoring

At the end of each round, every player except the one who went out scores points equal to the cards remaining in their hand:

| Cards | Points each |
|---|---|
| 1–9 | 5 |
| 10–12 | 10 |
| Skip | 15 |
| Wild | 25 |

**Lower scores are better.** Points accumulate across rounds.

---

## Between Rounds

- Players who successfully played their phase this round **advance** to the next phase number.
- Players who did **not** play their phase stay on the same phase and must complete it next round.
- All hands are re-dealt. The player who went out does not get any special advantage next round.

---

## Winning

The game ends when a player completes Phase 10 and goes out in the same round.

- If only one player finishes Phase 10 that round, they win.
- If multiple players finish Phase 10 in the same round, the one with the **lowest total score** wins.
- If those scores are tied, the result is declared a tie.

A game-over screen appears showing the winner and all players' final scores.

---

## Scoreboard (Top Bar)

The top bar shows a card for each player:
- **Name** — "(you)" is appended to yours.
- **Phase X** — the phase they are currently working on.
- **Score** — cumulative points so far.
- **Card count** — how many cards they currently hold.

The active player's card is highlighted in gold.

---

## Game Log (Left Panel)

A scrollable log on the left shows recent events — draws, discards, phases played, skips, round endings. Newest entries appear at the top.

---

## Tips

- You are never forced to play your phase — sometimes it is better to wait so you can lay off more cards when you do play.
- Wild cards are worth 25 points if you're stuck with them at round end. Use them early.
- Skip cards are 15 points if unplayed. Save them for a well-timed block, but don't hold them too long.
- On runs, remember Wilds can only fill gaps where an integer fits — they cannot extend a run beyond 1–12.
- Phase 8 (7 of one color) pairs well with rounds where you stock up on one color early.
