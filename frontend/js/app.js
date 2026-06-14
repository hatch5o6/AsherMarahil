// ── App State ──────────────────────────────────────────────────────────────
const AppState = {
  ws: null,
  playerName: null,
  roomCode: null,
  isHost: false,
  gameState: null,
  selectedCardIds: [],
  // Phase-play UI state (no mode concept — panel is always visible when applicable)
  phaseGroups: [],       // array of arrays of card ids, one per remaining group
  activePhaseSlot: null, // index into phaseGroups of the active slot (null = none)
  // Lay-off state
  layOffMode: false,
  layOffTarget: null,    // {playerName, groupIndex}
  // Skip modal
  pendingSkipCardId: null,
  // Drawn card highlight
  lastDrawnCardId: null,
  _prevHandIds: null,
  _drawHighlightTimer: null,
};

// ── Toast Notifications ────────────────────────────────────────────────────
(function initToasts() {
  const c = document.createElement('div');
  c.id = 'toast-container';
  document.body.appendChild(c);
})();

function showToast(message, type = '') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast${type ? ' ' + type : ''}`;
  t.textContent = message;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function showError(msg) { showToast(msg, 'error'); }
function showSuccess(msg) { showToast(msg, 'success'); }

// ── Screen routing ─────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function showLobby()   { showScreen('lobby-screen'); }
function showWaiting() { showScreen('waiting-screen'); }
function showGame()    { showScreen('game-screen'); }

// ── WebSocket ──────────────────────────────────────────────────────────────
function connect(roomCode) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  AppState.ws = new WebSocket(`${protocol}//${location.host}/ws/${roomCode}`);

  AppState.ws.onopen = () => {
    send({ type: 'join', payload: { player_name: AppState.playerName } });
  };

  AppState.ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleServerMessage(msg);
  };

  AppState.ws.onclose = () => {
    // Only redirect if we were not already in lobby
    if (document.getElementById('game-screen').classList.contains('active') ||
        document.getElementById('waiting-screen').classList.contains('active')) {
      showLobby();
      showError('Disconnected from server');
    }
  };

  AppState.ws.onerror = () => {
    showError('Connection error');
  };
}

function send(msg) {
  if (AppState.ws && AppState.ws.readyState === WebSocket.OPEN) {
    AppState.ws.send(JSON.stringify(msg));
  }
}

// ── Server message handler ─────────────────────────────────────────────────
function handleServerMessage(msg) {
  if (msg.type === 'state_update') {
    const state = msg.payload;

    // Detect newly drawn card for highlight
    if (AppState._prevHandIds) {
      const me = state.players.find(p => p.name === AppState.playerName);
      if (me) {
        const newCard = me.hand.find(c => !AppState._prevHandIds.has(c.id));
        if (newCard) {
          AppState.lastDrawnCardId = newCard.id;
          clearTimeout(AppState._drawHighlightTimer);
          AppState._drawHighlightTimer = setTimeout(() => { AppState.lastDrawnCardId = null; }, 2000);
        }
      }
      AppState._prevHandIds = null;
    }

    AppState.roomCode = state.room_code;

    // Detect when a group was just played — reset local phase state for remaining groups
    const nowMyTurn = state.players[state.current_player_index]?.name === AppState.playerName;
    if (AppState.gameState && nowMyTurn) {
      const prevMe = AppState.gameState.players.find(p => p.name === AppState.playerName);
      const newMe = state.players.find(p => p.name === AppState.playerName);
      const prevCount = prevMe?.played_groups?.length ?? 0;
      const newCount = newMe?.played_groups?.length ?? 0;
      if (newCount > prevCount) {
        AppState.phaseGroups = [];
        AppState.activePhaseSlot = null;
      }
    }

    AppState.gameState = state;

    // Clear interaction state when it's no longer our turn
    if (!nowMyTurn) {
      AppState.selectedCardIds = [];
      AppState.layOffMode = false;
      AppState.layOffTarget = null;
      AppState.phaseGroups = [];
      AppState.activePhaseSlot = null;
    }

    // Update URL so users can share the link
    const url = new URL(location.href);
    if (url.searchParams.get('room') !== state.room_code) {
      url.searchParams.set('room', state.room_code);
      history.pushState({ roomCode: state.room_code }, '', url.toString());
    }

    if (state.status === 'waiting') {
      renderWaiting(state);
      showWaiting();
    } else if (state.status === 'playing') {
      renderGame(state);
      showGame();
    } else if (state.status === 'game_over') {
      renderGame(state);
      showGame();
      renderGameOver(state);
    }
  } else if (msg.type === 'error') {
    showError(msg.payload.message);
  }
}

// ── Waiting room rendering ─────────────────────────────────────────────────
function renderWaiting(state) {
  document.getElementById('room-code-display').textContent = state.room_code;

  const list = document.getElementById('player-list');
  list.innerHTML = '';
  state.players.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'player-list-item';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = p.name;
    item.appendChild(nameSpan);
    if (i === 0) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'HOST';
      item.appendChild(badge);
    }
    list.appendChild(item);
  });

  const isHost = state.players.length > 0 && state.players[0].name === AppState.playerName;
  AppState.isHost = isHost;
  const startBtn = document.getElementById('start-game-btn');
  const waitMsg  = document.getElementById('waiting-msg');
  startBtn.style.display = isHost ? 'block' : 'none';
  waitMsg.style.display  = isHost ? 'none' : 'block';
}

// ── Lobby button wiring ────────────────────────────────────────────────────
document.getElementById('create-room-btn').onclick = () => {
  const name = document.getElementById('player-name').value.trim();
  if (!name) { showError('Enter your name first'); return; }
  AppState.playerName = name;
  connect('new');
};

document.getElementById('join-room-btn').onclick = () => {
  const name = document.getElementById('player-name').value.trim();
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (!name) { showError('Enter your name first'); return; }
  if (!code) { showError('Enter a room code'); return; }
  AppState.playerName = name;
  connect(code);
};

document.getElementById('copy-link-btn').onclick = () => {
  const url = new URL(location.href);
  url.searchParams.set('room', AppState.roomCode);
  navigator.clipboard.writeText(url.toString()).then(() => showSuccess('Link copied!'));
};

document.getElementById('start-game-btn').onclick = () => {
  send({ type: 'start_game', payload: {} });
};

document.getElementById('btn-new-game').onclick = () => {
  document.getElementById('game-over-overlay').style.display = 'none';
  showLobby();
  if (AppState.ws) { AppState.ws.close(); AppState.ws = null; }
};

// ── Action buttons ─────────────────────────────────────────────────────────
document.getElementById('btn-draw-deck').onclick = () => {
  const me = AppState.gameState?.players.find(p => p.name === AppState.playerName);
  if (me) AppState._prevHandIds = new Set(me.hand.map(c => c.id));
  send({ type: 'draw_card', payload: { source: 'deck' } });
};

document.getElementById('btn-draw-discard').onclick = () => {
  const me = AppState.gameState?.players.find(p => p.name === AppState.playerName);
  if (me) AppState._prevHandIds = new Set(me.hand.map(c => c.id));
  send({ type: 'draw_card', payload: { source: 'discard' } });
};


// ── Phase group UI ─────────────────────────────────────────────────────────
// groupOffset = number of groups already played to the table (shown in #your-played-phase)
function renderPhaseGroupUI(phaseDef, groupOffset = 0) {
  const instructions = document.getElementById('phase-group-instructions');
  const slots = document.getElementById('phase-group-slots');

  instructions.textContent = `Phase ${phaseDef.phase}: ${phaseDef.description}`;
  slots.innerHTML = '';

  const state = AppState.gameState;
  const me = state?.players.find(p => p.name === AppState.playerName);

  phaseDef.groups.slice(groupOffset).forEach((g, i) => {
    const slot = document.createElement('div');
    const isActive = i === AppState.activePhaseSlot;
    slot.className = `phase-slot${isActive ? ' active' : ''}`;
    slot.dataset.groupIndex = i;

    const label = document.createElement('div');
    label.className = 'phase-slot-label';
    label.textContent = `Group ${groupOffset + i + 1}: ${g.type} of ${g.count}${isActive ? ' ← click cards to fill' : ''}`;
    slot.appendChild(label);

    const cardsRow = document.createElement('div');
    cardsRow.className = 'phase-slot-cards';
    const group = AppState.phaseGroups[i] || [];  // reference to the actual array
    group.forEach(cid => {
      const card = me?.hand.find(c => c.id === cid);
      if (card) {
        const chip = document.createElement('span');
        chip.className = 'phase-slot-card';
        chip.textContent = cardLabel(card);
        chip.style.background = cardColor(card);
        chip.style.color = card.color === 'yellow' ? '#1a1a1a' : '#fff';
        cardsRow.appendChild(chip);
      }
    });
    slot.appendChild(cardsRow);

    slot.addEventListener('click', () => {
      const required = g.count;
      const grp = AppState.phaseGroups[i] || [];
      const available = required - grp.length;

      // Card-first: if selected cards exist, assign them to this slot
      const eligible = AppState.selectedCardIds.filter(
        id => !AppState.phaseGroups.some(grp2 => grp2.includes(id))
      );
      if (eligible.length > 0 && available > 0) {
        const toAssign = eligible.slice(0, available);
        toAssign.forEach(id => grp.push(id));
        AppState.selectedCardIds = AppState.selectedCardIds.filter(id => !toAssign.includes(id));
        renderPhaseGroupUI(phaseDef, groupOffset);
        renderGame(AppState.gameState);
        return;
      }

      // Slot-first: toggle activation
      AppState.activePhaseSlot = AppState.activePhaseSlot === i ? null : i;
      renderPhaseGroupUI(phaseDef, groupOffset);
      renderGame(AppState.gameState);
    });

    slot.addEventListener('dragover', e => { e.preventDefault(); slot.classList.add('drag-over'); });
    slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
    slot.addEventListener('drop', e => {
      e.preventDefault();
      slot.classList.remove('drag-over');
      const cardId = parseInt(e.dataTransfer.getData('cardId'));
      if (isNaN(cardId)) return;
      window.handlePhaseCardClick(cardId, i);
    });

    slots.appendChild(slot);
  });
}

function cardLabel(card) {
  if (card.type === 'wild') return 'W';
  if (card.type === 'skip') return 'S';
  return String(card.number);
}
function cardColor(card) {
  const map = { red:'#ef4444',blue:'#3b82f6',green:'#22c55e',yellow:'#fbbf24',wild:'#7c3aed',skip:'#6b7280' };
  return map[card.color] || '#555';
}

document.getElementById('btn-cancel-phase').onclick = () => {
  const state = AppState.gameState;
  const me = state?.players.find(p => p.name === AppState.playerName);
  const phaseDef = me ? state.phase_definitions[me.phase_number - 1] : null;
  const playedCount = me?.played_groups?.length ?? 0;
  const remainingCount = phaseDef ? phaseDef.groups.length - playedCount : 0;
  AppState.phaseGroups = Array(remainingCount).fill(null).map(() => []);
  AppState.activePhaseSlot = null;
  AppState.selectedCardIds = [];
  if (phaseDef) renderPhaseGroupUI(phaseDef, playedCount);
  renderGame(state);
};

document.getElementById('btn-submit-phase').onclick = () => {
  const state = AppState.gameState;
  const me = state?.players.find(p => p.name === AppState.playerName);
  if (!me) return;
  const phaseDef = state.phase_definitions[me.phase_number - 1];
  const playedCount = me.played_groups ? me.played_groups.length : 0;
  const group = AppState.phaseGroups[0] || [];
  const required = phaseDef.groups[playedCount].count;
  if (group.length !== required) {
    showError(`Group ${playedCount + 1} needs ${required} cards (have ${group.length})`);
    return;
  }
  send({ type: 'play_group', payload: { group } });
  AppState.phaseGroups = [];
  AppState.activePhaseSlot = null;
  AppState.selectedCardIds = [];
};

document.getElementById('btn-play-all').onclick = () => {
  const state = AppState.gameState;
  const me = state?.players.find(p => p.name === AppState.playerName);
  if (!me) return;
  const phaseDef = state.phase_definitions[me.phase_number - 1];
  const playedCount = me.played_groups ? me.played_groups.length : 0;

  for (let i = 0; i < AppState.phaseGroups.length; i++) {
    const required = phaseDef.groups[playedCount + i].count;
    if ((AppState.phaseGroups[i] || []).length !== required) {
      showError(`Fill all groups first (Group ${playedCount + i + 1} needs ${required} cards)`);
      return;
    }
  }

  const groups = AppState.phaseGroups.map(g => [...g]);
  AppState.phaseGroups = [];
  AppState.activePhaseSlot = null;
  AppState.selectedCardIds = [];

  if (playedCount === 0) {
    send({ type: 'play_phase', payload: { groups } });
  } else {
    for (const group of groups) {
      send({ type: 'play_group', payload: { group } });
    }
  }
};

// Called when a card is dragged to a slot (groupIndex = slot index in remaining groups),
// when a card is clicked with an active slot, or when an assigned card is clicked (no groupIndex → removes).
window.handlePhaseCardClick = function(cardId, groupIndex) {
  const state = AppState.gameState;
  const me = state.players.find(p => p.name === AppState.playerName);
  if (!me) return;
  const phaseDef = state.phase_definitions[me.phase_number - 1];
  const playedCount = me.played_groups ? me.played_groups.length : 0;

  const alreadyInGroup = AppState.phaseGroups.some(g => g.includes(cardId));
  if (alreadyInGroup) {
    AppState.phaseGroups = AppState.phaseGroups.map(g => g.filter(id => id !== cardId));
    renderPhaseGroupUI(phaseDef, playedCount);
    renderGame(state);
    return;
  }

  // Explicit groupIndex (drag-drop) takes priority; fallback to activePhaseSlot
  const gi = groupIndex != null ? groupIndex : AppState.activePhaseSlot;
  if (gi == null) return;

  const group = AppState.phaseGroups[gi];
  if (!group) return;
  const required = phaseDef.groups[playedCount + gi].count;
  if (group.length >= required) {
    showError(`Group ${playedCount + gi + 1} already has ${required} cards`);
    return;
  }
  group.push(cardId);

  // Auto-advance activePhaseSlot when slot fills
  if (group.length === required) {
    const next = AppState.phaseGroups.findIndex(
      (g, idx) => idx > gi && g.length < phaseDef.groups[playedCount + idx].count
    );
    AppState.activePhaseSlot = next >= 0 ? next : null;
  }

  renderPhaseGroupUI(phaseDef, playedCount);
  renderGame(state);
};

// Called from game.js when a played group is clicked in lay-off mode
window.handleLayOffTargetClick = function(playerName, groupIndex) {
  AppState.layOffTarget = { playerName, groupIndex };
  renderGame(AppState.gameState);
  showToast('Now select cards from your hand and click "Lay Off"', '');
};

document.getElementById('btn-lay-off').onclick = () => {
  if (!AppState.layOffMode) {
    AppState.layOffMode = true;
    AppState.layOffTarget = null;
    AppState.selectedCardIds = [];
    document.getElementById('btn-lay-off').textContent = 'Cancel Lay Off';
    renderGame(AppState.gameState);
    showToast('Click a group on the table, then select cards from your hand to lay off', '');
    return;
  }

  if (AppState.layOffTarget && AppState.selectedCardIds.length > 0) {
    send({
      type: 'lay_off',
      payload: {
        target_player: AppState.layOffTarget.playerName,
        group_index: AppState.layOffTarget.groupIndex,
        card_ids: AppState.selectedCardIds,
      }
    });
    // Stay in lay-off mode so user can retry on rejection or do another lay-off.
    // handleServerMessage clears layOffMode when the turn advances on success.
    AppState.layOffTarget = null;
    AppState.selectedCardIds = [];
    return;
  }

  if (AppState.layOffMode) {
    AppState.layOffMode = false;
    AppState.layOffTarget = null;
    AppState.selectedCardIds = [];
    document.getElementById('btn-lay-off').textContent = 'Lay Off';
    renderGame(AppState.gameState);
  }
};

// ── Skip modal ─────────────────────────────────────────────────────────────
function showSkipModal(state) {
  const modal = document.getElementById('skip-modal');
  const list  = document.getElementById('skip-player-list');
  list.innerHTML = '';

  const eligiblePlayers = state.players.filter(
    p => p.name !== AppState.playerName && !p.finished_round && !p.is_skipped
  );

  eligiblePlayers.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary skip-player-btn';
    btn.textContent = p.name;
    btn.onclick = () => {
      send({ type: 'discard', payload: { card_id: AppState.pendingSkipCardId, skip_player: p.name } });
      AppState.selectedCardIds = [];
      AppState.pendingSkipCardId = null;
      modal.style.display = 'none';
    };
    list.appendChild(btn);
  });

  if (eligiblePlayers.length === 0) {
    list.innerHTML = '<p class="muted">No eligible players to skip</p>';
  }

  modal.style.display = 'flex';
}

document.getElementById('skip-cancel-btn').onclick = () => {
  document.getElementById('skip-modal').style.display = 'none';
  AppState.pendingSkipCardId = null;
};

// ── Game Over ──────────────────────────────────────────────────────────────
function renderGameOver(state) {
  const overlay = document.getElementById('game-over-overlay');
  const title   = document.getElementById('game-over-title');
  const winner  = document.getElementById('game-over-winner');
  const scores  = document.getElementById('game-over-scores');

  const w = state.winner;
  if (Array.isArray(w)) {
    title.textContent = 'It\'s a Tie!';
    winner.textContent = `Winners: ${w.join(', ')}`;
  } else {
    title.textContent = 'Game Over!';
    winner.textContent = `🏆 ${w} wins!`;
  }

  scores.innerHTML = '';
  const sorted = [...state.players].sort((a, b) => a.score - b.score);
  sorted.forEach(p => {
    const row = document.createElement('div');
    const isWinner = Array.isArray(w) ? w.includes(p.name) : p.name === w;
    row.className = `go-score-row${isWinner ? ' winner' : ''}`;
    row.innerHTML = `<span>${escHtml(p.name)}</span><span>${p.score} pts</span>`;
    scores.appendChild(row);
  });

  overlay.style.display = 'flex';
}

// ── Discard pile click target (click card → click pile) ───────────────────
document.getElementById('discard-top-card').addEventListener('click', () => {
  if (AppState.layOffMode) return;
  if (AppState.selectedCardIds.length !== 1) return;
  const cardId = AppState.selectedCardIds[0];
  const state = AppState.gameState;
  const me = state?.players.find(p => p.name === AppState.playerName);
  const card = me?.hand.find(c => c.id === cardId);
  if (!card) return;
  AppState.lastDrawnCardId = null;
  if (card.type === 'skip') {
    AppState.pendingSkipCardId = cardId;
    showSkipModal(state);
  } else {
    send({ type: 'discard', payload: { card_id: cardId } });
    AppState.selectedCardIds = [];
  }
});

// ── Discard pile drag-and-drop target ─────────────────────────────────────
(function wireDiscardDropTarget() {
  const zone = document.getElementById('discard-pile-area');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (AppState.layOffMode) return;
    const cardId = parseInt(e.dataTransfer.getData('cardId'));
    if (isNaN(cardId)) return;
    const state = AppState.gameState;
    const me = state?.players.find(p => p.name === AppState.playerName);
    const card = me?.hand.find(c => c.id === cardId);
    if (!card) return;
    if (card.type === 'skip') {
      AppState.pendingSkipCardId = cardId;
      showSkipModal(state);
    } else {
      send({ type: 'discard', payload: { card_id: cardId } });
    }
  });
})();

// ── Theme toggle ──────────────────────────────────────────────────────────
(function initTheme() {
  const themes = [
    { key: 'light', label: '☀️ Light' },
    { key: 'slate', label: '⚡ Slate' },
    { key: 'dark',  label: '🌙 Dark'  },
  ];
  const setTheme = key => {
    if (key === 'dark' || key === 'slate') document.documentElement.setAttribute('data-theme', key);
    else document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('amTheme', key);
  };
  setTheme(localStorage.getItem('amTheme') || 'slate');

  const btn = document.getElementById('theme-toggle');
  const updateLabel = () => {
    const cur = localStorage.getItem('amTheme') || 'slate';
    const curTheme = themes.find(t => t.key === cur) || themes[1];
    btn.textContent = curTheme.label;
    btn.title = 'Switch theme';
  };
  updateLabel();
  btn.onclick = () => {
    const cur = localStorage.getItem('amTheme') || 'slate';
    const idx = themes.findIndex(t => t.key === cur);
    const next = themes[(idx === -1 ? 1 : idx + 1) % themes.length];
    setTheme(next.key);
    updateLabel();
  };
})();

// ── On page load: pre-fill room code from URL ──────────────────────────────
(function checkUrlForRoom() {
  const params = new URLSearchParams(location.search);
  const room = params.get('room');
  if (room) {
    document.getElementById('room-code-input').value = room.toUpperCase();
    document.getElementById('player-name').focus();
  }
})();
