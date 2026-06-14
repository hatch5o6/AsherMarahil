from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal
from pydantic import BaseModel


PHASE_DEFINITIONS = [
    {"phase": 1,  "description": "2 sets of 3",             "groups": [{"type": "set",   "count": 3}, {"type": "set",   "count": 3}]},
    {"phase": 2,  "description": "1 set of 3 + 1 run of 4", "groups": [{"type": "set",   "count": 3}, {"type": "run",   "count": 4}]},
    {"phase": 3,  "description": "1 set of 4 + 1 run of 4", "groups": [{"type": "set",   "count": 4}, {"type": "run",   "count": 4}]},
    {"phase": 4,  "description": "1 run of 7",               "groups": [{"type": "run",   "count": 7}]},
    {"phase": 5,  "description": "1 run of 8",               "groups": [{"type": "run",   "count": 8}]},
    {"phase": 6,  "description": "1 run of 9",               "groups": [{"type": "run",   "count": 9}]},
    {"phase": 7,  "description": "2 sets of 4",             "groups": [{"type": "set",   "count": 4}, {"type": "set",   "count": 4}]},
    {"phase": 8,  "description": "7 cards of one color",    "groups": [{"type": "color", "count": 7}]},
    {"phase": 9,  "description": "1 set of 5 + 1 set of 2", "groups": [{"type": "set",   "count": 5}, {"type": "set",   "count": 2}]},
    {"phase": 10, "description": "1 set of 5 + 1 set of 3", "groups": [{"type": "set",   "count": 5}, {"type": "set",   "count": 3}]},
]


@dataclass
class Card:
    id: int
    color: str   # "red" | "blue" | "green" | "yellow" | "wild" | "skip"
    number: int | None  # 1-12 for numbered, None for Wild/Skip
    type: str    # "number" | "wild" | "skip"

    def to_dict(self) -> dict:
        return {"id": self.id, "color": self.color, "number": self.number, "type": self.type}


@dataclass
class PlayerState:
    name: str
    phase_number: int = 1
    score: int = 0
    hand: list[Card] = field(default_factory=list)
    played_groups: list[list[Card]] | None = None
    has_drawn: bool = False
    is_skipped: bool = False
    pending_skip: Card | None = None
    finished_round: bool = False

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "phase_number": self.phase_number,
            "score": self.score,
            "hand": [c.to_dict() for c in self.hand],
            "played_groups": [[c.to_dict() for c in g] for g in self.played_groups] if self.played_groups is not None else None,
            "has_drawn": self.has_drawn,
            "is_skipped": self.is_skipped,
            "pending_skip": self.pending_skip.to_dict() if self.pending_skip else None,
            "finished_round": self.finished_round,
        }


@dataclass
class GameState:
    room_code: str
    status: str = "waiting"   # waiting | playing | game_over
    round: int = 1
    current_player_index: int = 0
    draw_pile: list[Card] = field(default_factory=list)
    discard_pile: list[Card] = field(default_factory=list)
    players: list[PlayerState] = field(default_factory=list)
    log: list[str] = field(default_factory=list)
    winner: str | list[str] | None = None

    def to_dict(self) -> dict:
        return {
            "room_code": self.room_code,
            "status": self.status,
            "round": self.round,
            "current_player_index": self.current_player_index,
            "draw_pile_count": len(self.draw_pile),
            "discard_top": self.discard_pile[-1].to_dict() if self.discard_pile else None,
            "players": [p.to_dict() for p in self.players],
            "phase_definitions": PHASE_DEFINITIONS,
            "log": self.log,
            "winner": self.winner,
        }


# ── Pydantic inbound message models ──────────────────────────────────────────

class JoinMessage(BaseModel):
    player_name: str

class DrawCardMessage(BaseModel):
    source: Literal["deck", "discard"]

class PlayPhaseMessage(BaseModel):
    groups: list[list[int]]   # list of card_id lists

class LayOffMessage(BaseModel):
    target_player: str
    group_index: int
    card_ids: list[int]

class DiscardMessage(BaseModel):
    card_id: int
    skip_player: str | None = None

class PlayGroupMessage(BaseModel):
    group: list[int]
