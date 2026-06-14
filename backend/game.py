from __future__ import annotations
import random
from .models import Card, PlayerState, GameState, PHASE_DEFINITIONS


class PhaseValidationError(Exception):
    pass


class GameActionError(Exception):
    pass


class Game:
    def __init__(self, room_code: str):
        self.state = GameState(room_code=room_code)

    # ── Setup ─────────────────────────────────────────────────────────────────

    def add_player(self, name: str) -> None:
        if self.state.status != "waiting":
            raise GameActionError("Game already in progress")
        if len(self.state.players) >= 6:
            raise GameActionError("Room is full (max 6 players)")
        name = name.strip()
        if not name:
            raise GameActionError("Name cannot be empty")
        if len(name) > 20:
            raise GameActionError("Name too long (max 20 characters)")
        if any(p.name == name for p in self.state.players):
            raise GameActionError(f"Name '{name}' is already taken")
        self.state.players.append(PlayerState(name=name))
        self._log(f"{name} joined the room")

    def remove_player(self, name: str) -> None:
        self.state.players = [p for p in self.state.players if p.name != name]
        self._log(f"{name} left the room")

    def start_game(self) -> None:
        if self.state.status != "waiting":
            raise GameActionError("Game already started")
        if len(self.state.players) < 2:
            raise GameActionError("Need at least 2 players to start")
        self._new_round()

    # ── Round management ──────────────────────────────────────────────────────

    def _build_deck(self) -> list[Card]:
        cards: list[Card] = []
        card_id = 0
        colors = ["red", "blue", "green", "yellow"]
        for _ in range(2):
            for color in colors:
                for number in range(1, 13):
                    cards.append(Card(id=card_id, color=color, number=number, type="number"))
                    card_id += 1
        for _ in range(8):
            cards.append(Card(id=card_id, color="wild", number=None, type="wild"))
            card_id += 1
        for _ in range(4):
            cards.append(Card(id=card_id, color="skip", number=None, type="skip"))
            card_id += 1
        return cards

    def _new_round(self) -> None:
        deck = self._build_deck()
        random.shuffle(deck)

        for p in self.state.players:
            p.hand = []
            p.played_groups = None
            p.has_drawn = False
            p.is_skipped = False
            p.pending_skip = None
            p.finished_round = False

        # Deal 10 cards to each player
        for _ in range(10):
            for p in self.state.players:
                p.hand.append(deck.pop())

        # Start discard pile with a numbered card
        self.state.discard_pile = []
        while deck:
            top = deck.pop()
            if top.type == "number":
                self.state.discard_pile = [top]
                break
            deck.insert(0, top)  # put non-number cards at the bottom

        self.state.draw_pile = deck
        self.state.status = "playing"
        self.state.current_player_index = 0
        self._log(f"Round {self.state.round} started")

    def _end_round(self, winner_name: str) -> None:
        self._log(f"{winner_name} went out! Round {self.state.round} over.")

        for p in self.state.players:
            hand_score = self._calculate_hand_score(p.hand)
            p.score += hand_score
            if hand_score > 0:
                self._log(f"{p.name} scores {hand_score} points ({len(p.hand)} cards left)")

        # Advance phase for players who completed all groups this round
        for p in self.state.players:
            if p.played_groups is not None:
                phase_def_local = PHASE_DEFINITIONS[p.phase_number - 1]
                if len(p.played_groups) >= len(phase_def_local["groups"]):
                    p.phase_number += 1

        # Check for game over: anyone who just advanced past phase 10
        finishers = [p for p in self.state.players if p.phase_number > 10]
        if finishers:
            # Lowest score among finishers wins; ties stay as ties
            min_score = min(p.score for p in finishers)
            winners = [p.name for p in finishers if p.score == min_score]
            self.state.winner = winners[0] if len(winners) == 1 else winners
            self.state.status = "game_over"
            if isinstance(self.state.winner, list):
                self._log(f"Game over! Tie between: {', '.join(self.state.winner)}")
            else:
                self._log(f"Game over! {self.state.winner} wins!")
            return

        self.state.round += 1
        self._new_round()

    def _calculate_hand_score(self, hand: list[Card]) -> int:
        total = 0
        for card in hand:
            if card.type == "skip":
                total += 15
            elif card.type == "wild":
                total += 25
            elif card.number is not None:
                total += 5 if card.number <= 9 else 10
        return total

    # ── Turn actions ──────────────────────────────────────────────────────────

    def draw_card(self, player_name: str, source: str) -> None:
        p = self._get_player(player_name)
        self._assert_current_player(player_name)
        if p.has_drawn:
            raise GameActionError("You have already drawn this turn")

        if source == "discard":
            if not self.state.discard_pile:
                raise GameActionError("Discard pile is empty")
            if self.state.discard_pile[-1].type == "skip":
                raise GameActionError("You cannot draw a Skip card from the discard pile")
            card = self.state.discard_pile.pop()
            p.hand.append(card)
            self._log(f"{player_name} drew from the discard pile")
        else:
            self._ensure_draw_pile()
            if not self.state.draw_pile:
                raise GameActionError("No cards left to draw — the deck is exhausted")
            card = self.state.draw_pile.pop()
            p.hand.append(card)
            self._log(f"{player_name} drew from the deck")

        p.has_drawn = True

    def play_phase(self, player_name: str, groups: list[list[int]]) -> None:
        p = self._get_player(player_name)
        self._assert_current_player(player_name)
        if not p.has_drawn:
            raise GameActionError("You must draw before playing your phase")
        if p.played_groups is not None:
            raise GameActionError("You have already played your phase this round")

        phase_def = PHASE_DEFINITIONS[p.phase_number - 1]
        if len(groups) != len(phase_def["groups"]):
            raise PhaseValidationError(
                f"Phase {p.phase_number} requires {len(phase_def['groups'])} group(s), got {len(groups)}"
            )

        card_groups: list[list[Card]] = []
        all_used_ids: set[int] = set()

        for i, (group_ids, group_def) in enumerate(zip(groups, phase_def["groups"])):
            if len(group_ids) != group_def["count"]:
                raise PhaseValidationError(
                    f"Group {i+1} needs {group_def['count']} cards, got {len(group_ids)}"
                )
            for cid in group_ids:
                if cid in all_used_ids:
                    raise PhaseValidationError("Duplicate card in phase groups")
                all_used_ids.add(cid)

            cards = [self._get_card_from_hand(p, cid) for cid in group_ids]
            group_type = group_def["type"]
            if group_type == "set":
                if not self._validate_set(cards):
                    raise PhaseValidationError(f"Group {i+1} is not a valid set of {group_def['count']}")
            elif group_type == "run":
                if not self._validate_run(cards):
                    raise PhaseValidationError(f"Group {i+1} is not a valid run of {group_def['count']}")
            elif group_type == "color":
                if not self._validate_color(cards):
                    raise PhaseValidationError(f"Group {i+1} is not 7 cards of one color")
            card_groups.append(cards)

        # Remove played cards from hand
        for cid in all_used_ids:
            p.hand = [c for c in p.hand if c.id != cid]

        p.played_groups = card_groups
        self._log(f"{player_name} played Phase {p.phase_number}: {phase_def['description']}")

        if len(p.hand) == 0:
            p.finished_round = True
            self._end_round(player_name)

    def play_group(self, player_name: str, group_ids: list[int]) -> None:
        p = self._get_player(player_name)
        self._assert_current_player(player_name)
        if not p.has_drawn:
            raise GameActionError("You must draw before playing a group")

        phase_def = PHASE_DEFINITIONS[p.phase_number - 1]
        next_idx = len(p.played_groups) if p.played_groups is not None else 0
        if next_idx >= len(phase_def["groups"]):
            raise GameActionError("All groups already played this round")

        group_def = phase_def["groups"][next_idx]
        if len(group_ids) != group_def["count"]:
            raise PhaseValidationError(
                f"Group {next_idx + 1} needs {group_def['count']} cards, got {len(group_ids)}"
            )
        if len(set(group_ids)) != len(group_ids):
            raise PhaseValidationError("Duplicate cards in group")

        cards = [self._get_card_from_hand(p, cid) for cid in group_ids]
        group_type = group_def["type"]
        if group_type == "set" and not self._validate_set(cards):
            raise PhaseValidationError(f"Group {next_idx + 1} is not a valid set")
        elif group_type == "run" and not self._validate_run(cards):
            raise PhaseValidationError(f"Group {next_idx + 1} is not a valid run")
        elif group_type == "color" and not self._validate_color(cards):
            raise PhaseValidationError(f"Group {next_idx + 1} is not a valid color group")

        for cid in group_ids:
            p.hand = [c for c in p.hand if c.id != cid]

        if p.played_groups is None:
            p.played_groups = []
        p.played_groups.append(cards)
        self._log(f"{player_name} played group {next_idx + 1} of Phase {p.phase_number}")

        if len(p.hand) == 0:
            p.finished_round = True
            self._end_round(player_name)

    def lay_off(self, player_name: str, target_player: str, group_index: int, card_ids: list[int]) -> None:
        p = self._get_player(player_name)
        self._assert_current_player(player_name)
        if not p.has_drawn:
            raise GameActionError("You must draw before laying off")
        if p.played_groups is None:
            raise GameActionError("You must play your own phase before laying off on others")

        target = self._get_player(target_player)
        if target.played_groups is None:
            raise GameActionError(f"{target_player} has not played their phase yet")
        if group_index < 0 or group_index >= len(target.played_groups):
            raise GameActionError("Invalid group index")

        if not card_ids:
            raise GameActionError("No cards selected to lay off")

        new_cards = [self._get_card_from_hand(p, cid) for cid in card_ids]
        existing_group = target.played_groups[group_index]

        phase_def = PHASE_DEFINITIONS[target.phase_number - 1]
        group_type = phase_def["groups"][group_index]["type"]

        merged = existing_group + new_cards
        if group_type == "set":
            if not self._validate_set(merged):
                raise PhaseValidationError("Cards do not fit this set")
        elif group_type == "run":
            if not self._validate_run(merged):
                raise PhaseValidationError("Cards do not extend this run (no duplicates, must be consecutive)")
        elif group_type == "color":
            if not self._validate_color(merged):
                raise PhaseValidationError("Cards do not match this color group")

        target.played_groups[group_index] = merged
        for cid in card_ids:
            p.hand = [c for c in p.hand if c.id != cid]

        self._log(f"{player_name} laid off {len(card_ids)} card(s) on {target_player}'s phase")

        if len(p.hand) == 0:
            p.finished_round = True
            self._end_round(player_name)

    def discard(self, player_name: str, card_id: int, skip_player: str | None = None) -> None:
        p = self._get_player(player_name)
        self._assert_current_player(player_name)
        if not p.has_drawn:
            raise GameActionError("You must draw before discarding")

        card = self._get_card_from_hand(p, card_id)

        if skip_player is not None:
            if card.type != "skip":
                raise GameActionError("You can only skip a player by discarding a Skip card")
            target = self._get_player(skip_player)
            if target.finished_round:
                raise GameActionError(f"{skip_player} has already finished this round")
            if target.name == player_name:
                raise GameActionError("You cannot skip yourself")
            if target.is_skipped:
                raise GameActionError(f"{skip_player} is already being skipped")
            # Skip card goes in front of the target (not to the discard pile)
            p.hand = [c for c in p.hand if c.id != card_id]
            target.pending_skip = card
            target.is_skipped = True
            self._log(f"{player_name} skipped {skip_player}")
        else:
            p.hand = [c for c in p.hand if c.id != card_id]
            self.state.discard_pile.append(card)
            self._log(f"{player_name} discarded {self._card_label(card)}")

        if len(p.hand) == 0:
            p.finished_round = True
            self._end_round(player_name)
            return

        self._advance_turn()

    # ── Phase validation ──────────────────────────────────────────────────────

    def _validate_set(self, cards: list[Card]) -> bool:
        if any(c.type == "skip" for c in cards):
            return False
        non_wilds = [c for c in cards if c.type != "wild"]
        if not non_wilds:
            return False
        return len(set(c.number for c in non_wilds)) <= 1

    def _validate_run(self, cards: list[Card]) -> bool:
        if any(c.type == "skip" for c in cards):
            return False
        nums = sorted(c.number for c in cards if c.type != "wild")
        if not nums:
            return False  # all-wilds run has no defined sequence
        if len(set(nums)) != len(nums):
            return False  # duplicate numbers
        wilds = sum(1 for c in cards if c.type == "wild")
        gaps = (nums[-1] - nums[0] + 1) - len(nums)
        return gaps <= wilds

    def _validate_color(self, cards: list[Card]) -> bool:
        if any(c.type == "skip" for c in cards):
            return False
        non_wilds = [c for c in cards if c.type != "wild"]
        if not non_wilds:
            return False
        return len(set(c.color for c in non_wilds)) <= 1

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _assert_current_player(self, name: str) -> None:
        if self.state.status != "playing":
            raise GameActionError("Game is not in progress")
        current = self.state.players[self.state.current_player_index]
        if current.name != name:
            raise GameActionError(f"It's {current.name}'s turn, not yours")

    def _get_player(self, name: str) -> PlayerState:
        for p in self.state.players:
            if p.name == name:
                return p
        raise GameActionError(f"Player '{name}' not found")

    def _get_card_from_hand(self, player: PlayerState, card_id: int) -> Card:
        for card in player.hand:
            if card.id == card_id:
                return card
        raise GameActionError(f"Card {card_id} not in your hand")

    def _advance_turn(self) -> None:
        n = len(self.state.players)
        for _ in range(n):
            self.state.current_player_index = (self.state.current_player_index + 1) % n
            next_p = self.state.players[self.state.current_player_index]
            if next_p.finished_round:
                continue
            if next_p.is_skipped:
                if next_p.pending_skip:
                    self.state.discard_pile.append(next_p.pending_skip)
                    next_p.pending_skip = None
                next_p.is_skipped = False
                self._log(f"{next_p.name}'s turn was skipped")
                continue
            next_p.has_drawn = False
            return
        # Emergency fallback: all remaining players were simultaneously skipped
        for i, p in enumerate(self.state.players):
            if not p.finished_round:
                p.is_skipped = False
                p.has_drawn = False
                self.state.current_player_index = i
                self._log(f"Turn forced to {p.name} (all others skipped or finished)")
                return

    def _ensure_draw_pile(self) -> None:
        if self.state.draw_pile:
            return
        if len(self.state.discard_pile) <= 1:
            return  # nothing to reshuffle
        top = self.state.discard_pile.pop()
        random.shuffle(self.state.discard_pile)
        self.state.draw_pile = self.state.discard_pile
        self.state.discard_pile = [top]
        self._log("Draw pile reshuffled from discard pile")

    def _card_label(self, card: Card) -> str:
        if card.type == "wild":
            return "Wild"
        if card.type == "skip":
            return "Skip"
        return f"{card.color.capitalize()} {card.number}"

    def _log(self, msg: str) -> None:
        self.state.log.append(msg)
        if len(self.state.log) > 50:
            self.state.log = self.state.log[-50:]

    def get_state_dict(self) -> dict:
        return self.state.to_dict()
