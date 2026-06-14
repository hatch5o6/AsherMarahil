# Asher Marahil — عشر مراحل

A multiplayer Phase 10 card game web app. The name means "ten phases" in Arabic.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11 · FastAPI · WebSockets |
| Frontend | Vanilla HTML / CSS / JavaScript (no build step) |
| Real-time | WebSocket rooms with shareable room codes |
| Serving | FastAPI serves static frontend files |

## Project Structure

```
AsherMarahil/
├── .venv/                      Python 3.11 virtual environment
├── requirements.txt
├── backend/
│   ├── __init__.py
│   ├── main.py                 FastAPI app, WebSocket handler, static file serving
│   ├── game.py                 Game class — all Phase 10 logic
│   └── models.py               Dataclasses (Card, PlayerState, GameState) + phase definitions
└── frontend/
    ├── index.html              Single-page app (lobby / waiting room / game — three sections)
    ├── css/
    │   └── style.css           Dark theme, card styles, layout, animations
    └── js/
        ├── app.js              WebSocket connection, screen routing, action buttons, phase-build UI
        └── game.js             Game rendering (scoreboard, hands, table, log)
```

## Setup

```bash
# Install dependencies (only needed once — packages are already in .venv)
.venv/bin/python3 -m pip install -r requirements.txt

# Start the server
.venv/bin/python3 -m uvicorn backend.main:app --reload --port 8000
```

Open `http://localhost:8000` in your browser.

## Multiplayer

Room codes are embedded in the URL (`?room=ABC123`). Share the full URL with other players. Everyone who can reach your machine's port 8000 can join.

For public access over the internet, expose the port via a tunnel (e.g. `ngrok http 8000`) or deploy to a server.

## Architecture

### WebSocket Protocol

All game communication goes over a single WebSocket connection per player at `/ws/{room_code}`. The first message after connecting must be a `join` message. After that, clients send action messages and the server broadcasts a full `state_update` to every player in the room after each valid action. Errors are sent only to the player who caused them.

**Client → Server message types:**

| Type | Payload | Notes |
|---|---|---|
| `join` | `{ player_name }` | Must be the first message sent |
| `start_game` | `{}` | Host only (first player to join) |
| `draw_card` | `{ source: "deck" \| "discard" }` | |
| `play_phase` | `{ groups: [[card_ids], [card_ids]] }` | Groups must match phase definition order |
| `lay_off` | `{ target_player, group_index, card_ids }` | Target must have an active played phase |
| `discard` | `{ card_id, skip_player? }` | `skip_player` only valid with a Skip card |

**Server → Client message types:**

| Type | Payload |
|---|---|
| `state_update` | Full game state (see below) |
| `error` | `{ message }` |

### Game State Shape

```json
{
  "room_code": "ABC123",
  "status": "waiting | playing | game_over",
  "round": 1,
  "current_player_index": 0,
  "draw_pile_count": 87,
  "discard_top": { "id": 0, "color": "red", "number": 1, "type": "number" },
  "players": [
    {
      "name": "Alice",
      "phase_number": 1,
      "score": 0,
      "hand": [{ "id": 5, "color": "blue", "number": 7, "type": "number" }],
      "played_groups": null,
      "has_drawn": false,
      "is_skipped": false,
      "finished_round": false
    }
  ],
  "phase_definitions": [...],
  "log": ["Alice drew from the deck"],
  "winner": null
}
```

The full hand of every player is included in the state (broadcast to all). The frontend renders other players' hands face-down.

### Game Logic (`backend/game.py`)

**Deck:** 108 cards — 96 numbered (1–12 in red, blue, green, yellow × 2 copies each), 8 Wild, 4 Skip.

**Phase validation:**
- *Set:* all non-Wild cards must share the same number. All-Wild groups are valid.
- *Run:* sort non-Wild numbers, check for duplicates (invalid), count gaps between consecutive values — gaps must be ≤ available Wilds. All-Wild groups are valid.
- *Color:* all non-Wild cards must share the same color. All-Wild groups are valid.

**Lay-off validation:** Merges new cards into the existing group and re-validates using the same rules (no fixed size constraint).

**Turn order:** Players who have `finished_round=True` or `is_skipped=True` are skipped over when advancing turns. A skipped player's `is_skipped` flag is cleared after their turn is skipped. If all remaining active players are simultaneously marked skipped (edge case from rapid skip plays), the server forces the turn to the first available non-finished player and logs it.

**Round end:** Triggered when any player empties their hand after play_phase, lay_off, or discard. All remaining hands are scored. Players who laid down their phase advance to the next phase number. If any player's phase advances past 10, the game ends; lowest cumulative score among finishers wins.

**Draw pile exhaustion:** If the draw pile empties, the discard pile (minus its top card) is reshuffled and becomes the new draw pile.

**Room cleanup:** If all WebSocket connections to a room drop, the room is deleted after 5 minutes.

## Dependencies

```
fastapi>=0.111.0
uvicorn[standard]>=0.29.0
```
# AsherMarahil
