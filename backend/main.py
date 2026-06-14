from __future__ import annotations
import asyncio
import json
import random
import string
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

from .game import Game, GameActionError, PhaseValidationError
from .models import (
    JoinMessage, DrawCardMessage, PlayPhaseMessage, PlayGroupMessage, LayOffMessage, DiscardMessage
)

app = FastAPI()

rooms: dict[str, Game] = {}
connections: dict[str, dict[str, WebSocket]] = {}
cleanup_tasks: dict[str, asyncio.Task] = {}

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"


def generate_room_code() -> str:
    chars = string.ascii_uppercase + string.digits
    while True:
        code = "".join(random.choices(chars, k=6))
        if code not in rooms:
            return code


async def broadcast(room_code: str, message: dict) -> None:
    if room_code not in connections:
        return
    dead: list[str] = []
    payload = json.dumps(message)
    for player_name, ws in list(connections[room_code].items()):
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(player_name)
    for name in dead:
        connections[room_code].pop(name, None)


async def send_error(ws: WebSocket, message: str) -> None:
    try:
        await ws.send_text(json.dumps({"type": "error", "payload": {"message": message}}))
    except Exception:
        pass


async def schedule_room_cleanup(room_code: str) -> None:
    await asyncio.sleep(300)  # 5 minutes
    if room_code in connections and not connections[room_code]:
        rooms.pop(room_code, None)
        connections.pop(room_code, None)
    cleanup_tasks.pop(room_code, None)


@app.websocket("/ws/{room_code}")
async def websocket_endpoint(websocket: WebSocket, room_code: str) -> None:
    await websocket.accept()

    # Create room if requested
    if room_code == "new":
        room_code = generate_room_code()
        rooms[room_code] = Game(room_code)
        connections[room_code] = {}
    elif room_code not in rooms:
        await send_error(websocket, "Room not found")
        await websocket.close()
        return

    # Cancel any pending cleanup for this room
    if room_code in cleanup_tasks:
        cleanup_tasks[room_code].cancel()
        cleanup_tasks.pop(room_code, None)

    game = rooms[room_code]
    player_name: str | None = None

    try:
        # First message must be a join
        raw = await websocket.receive_text()
        data = json.loads(raw)
        if data.get("type") != "join":
            await send_error(websocket, "First message must be type 'join'")
            await websocket.close()
            return

        msg = JoinMessage(**data.get("payload", {}))
        player_name = msg.player_name.strip()

        # Allow rejoin if player is already in the game (reconnect)
        existing = any(p.name == player_name for p in game.state.players)
        if not existing:
            game.add_player(player_name)

        connections.setdefault(room_code, {})[player_name] = websocket
        await broadcast(room_code, {"type": "state_update", "payload": game.get_state_dict()})

        # Main message loop
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await send_error(websocket, "Invalid JSON")
                continue
            msg_type = data.get("type")
            payload = data.get("payload", {})

            try:
                if msg_type == "start_game":
                    if game.state.players and game.state.players[0].name != player_name:
                        await send_error(websocket, "Only the host can start the game")
                        continue
                    game.start_game()

                elif msg_type == "draw_card":
                    m = DrawCardMessage(**payload)
                    game.draw_card(player_name, m.source)

                elif msg_type == "play_phase":
                    m = PlayPhaseMessage(**payload)
                    game.play_phase(player_name, m.groups)

                elif msg_type == "play_group":
                    m = PlayGroupMessage(**payload)
                    game.play_group(player_name, m.group)

                elif msg_type == "lay_off":
                    m = LayOffMessage(**payload)
                    game.lay_off(player_name, m.target_player, m.group_index, m.card_ids)

                elif msg_type == "discard":
                    m = DiscardMessage(**payload)
                    game.discard(player_name, m.card_id, m.skip_player)

                else:
                    await send_error(websocket, f"Unknown message type: {msg_type}")
                    continue

                await broadcast(room_code, {"type": "state_update", "payload": game.get_state_dict()})

            except (GameActionError, PhaseValidationError) as e:
                await send_error(websocket, str(e))
            except Exception as e:
                await send_error(websocket, f"Server error: {e}")

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if player_name and room_code in connections:
            connections[room_code].pop(player_name, None)

        if room_code in connections and not connections[room_code]:
            task = asyncio.create_task(schedule_room_cleanup(room_code))
            cleanup_tasks[room_code] = task

        if player_name and room_code in rooms:
            game = rooms[room_code]
            if game.state.status == "waiting":
                try:
                    game.remove_player(player_name)
                    await broadcast(room_code, {"type": "state_update", "payload": game.get_state_dict()})
                except Exception:
                    pass


# Serve frontend static files — must come after WebSocket routes
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="static")
