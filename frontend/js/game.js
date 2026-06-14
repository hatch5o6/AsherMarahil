// ── Game rendering — all pure display, no state mutation ──────────────────

function renderGame(state) {
  renderScoreboard(state);
  renderPiles(state);
  renderPhasePanel(state);
  renderYourPlayedPhase(state);
  renderPlayersPanel(state);
  renderYourHand(state);
  renderActionButtons(state);
  renderLog(state);
  renderPhaseInfo(state);
}

// ── Scoreboard ─────────────────────────────────────────────────────────────
function renderScoreboard(state) {
  const el = document.getElementById('scoreboard');
  el.innerHTML = '';

  state.players.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'score-card';
    if (i === state.current_player_index && state.status === 'playing') {
      card.classList.add('active-turn');
    }
    if (state.status === 'game_over') {
      const w = state.winner;
      if ((Array.isArray(w) && w.includes(p.name)) || p.name === w) {
        card.classList.add('game-over-winner');
      }
    }

    card.innerHTML = `
      <div class="sc-name">${escHtml(p.name)}${p.name === AppState.playerName ? ' (you)' : ''}</div>
      <div class="sc-detail">Phase ${p.phase_number} · ${p.score} pts · ${p.hand.length} cards</div>
    `;
    el.appendChild(card);
  });
}

// ── Draw & Discard Piles ───────────────────────────────────────────────────
function renderPiles(state) {
  document.getElementById('draw-count').textContent = `${state.draw_pile_count} cards`;

  const discardEl = document.getElementById('discard-top-card');
  discardEl.className = 'card';
  discardEl.innerHTML = '';

  if (state.discard_top) {
    applyCardStyle(discardEl, state.discard_top);
  } else {
    discardEl.classList.add('card-back');
  }
}

// ── Phase panel (always visible when applicable, supports partial group play) ──
function renderPhasePanel(state) {
  const panel = document.getElementById('phase-group-ui');
  const me = state.players.find(p => p.name === AppState.playerName);
  const isMyTurn = state.players[state.current_player_index]?.name === AppState.playerName
                   && state.status === 'playing';

  if (!me || !isMyTurn || !me.has_drawn || me.phase_number > 10) {
    panel.style.display = 'none';
    return;
  }

  const phaseDef = state.phase_definitions[me.phase_number - 1];
  const playedCount = me.played_groups ? me.played_groups.length : 0;
  const totalGroups = phaseDef.groups.length;

  if (playedCount >= totalGroups) {
    panel.style.display = 'none';
    return;
  }

  const remainingCount = totalGroups - playedCount;
  if (AppState.phaseGroups.length !== remainingCount) {
    AppState.phaseGroups = Array(remainingCount).fill(null).map(() => []);
    AppState.activePhaseSlot = null;
  }
  panel.style.display = 'flex';
  renderPhaseGroupUI(phaseDef, playedCount);
}

// ── Your own played phase groups ───────────────────────────────────────────
function renderYourPlayedPhase(state) {
  const el = document.getElementById('your-played-phase');
  const me = state.players.find(p => p.name === AppState.playerName);
  if (!me || !me.played_groups || me.played_groups.length === 0) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }

  el.style.display = 'flex';
  el.innerHTML = '';

  const phaseDef = state.phase_definitions[me.phase_number - 1];
  const playedCount = me.played_groups.length;
  const totalGroups = phaseDef.groups.length;
  const statusLabel = playedCount >= totalGroups ? 'complete' : `${playedCount}/${totalGroups} groups`;

  const header = document.createElement('div');
  header.className = 'ypg-header';
  header.textContent = `Your Phase ${me.phase_number} — ${statusLabel}`;
  el.appendChild(header);

  const groupsRow = document.createElement('div');
  groupsRow.className = 'ypg-groups';

  me.played_groups.forEach((group, gi) => {
    const groupEl = document.createElement('div');
    groupEl.className = 'played-phase-group ypg-group';

    if (AppState.layOffMode) {
      groupEl.classList.add('lay-off-target');
      groupEl.onclick = () => window.handleLayOffTargetClick(AppState.playerName, gi);
    }
    if (AppState.layOffTarget?.playerName === AppState.playerName && AppState.layOffTarget?.groupIndex === gi) {
      groupEl.classList.add('lay-off-selected');
    }

    groupEl.addEventListener('dragover', e => { e.preventDefault(); groupEl.classList.add('drag-over'); });
    groupEl.addEventListener('dragleave', () => groupEl.classList.remove('drag-over'));
    groupEl.addEventListener('drop', e => {
      e.preventDefault();
      groupEl.classList.remove('drag-over');
      const cardId = parseInt(e.dataTransfer.getData('cardId'));
      if (!isNaN(cardId)) {
        send({ type: 'lay_off', payload: { target_player: AppState.playerName, group_index: gi, card_ids: [cardId] } });
      }
    });

    group.forEach(c => groupEl.appendChild(buildCardElement(c, false, false, 'card-mini')));
    groupsRow.appendChild(groupEl);
  });

  el.appendChild(groupsRow);
}

// ── Opponents panel — hands + inline played phases ─────────────────────────
function renderPlayersPanel(state) {
  const el = document.getElementById('players-panel');
  el.innerHTML = '';

  state.players.forEach((p, i) => {
    if (p.name === AppState.playerName) return;

    const isActive = i === state.current_player_index && state.status === 'playing';
    const card = document.createElement('div');
    card.className = `player-panel-card${isActive ? ' active-turn' : ''}`;

    // Header
    const header = document.createElement('div');
    header.className = 'ppc-header';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'ppc-name';
    nameSpan.textContent = p.name + (p.is_skipped ? ' ⏭' : '');
    const metaSpan = document.createElement('span');
    metaSpan.className = 'ppc-meta';
    metaSpan.textContent = `Phase ${p.phase_number} · ${p.score} pts · ${p.hand.length} cards`;
    header.appendChild(nameSpan);
    header.appendChild(metaSpan);
    card.appendChild(header);

    // Pending skip indicator
    if (p.pending_skip) {
      const skipRow = document.createElement('div');
      skipRow.className = 'ppc-pending-skip';
      const skipCard = buildCardElement(p.pending_skip, false, false, 'card-mini');
      skipRow.appendChild(skipCard);
      const skipLabel = document.createElement('span');
      skipLabel.textContent = 'Skip pending — discarded on their turn';
      skipRow.appendChild(skipLabel);
      card.appendChild(skipRow);
    }

    // Face-down hand
    const handRow = document.createElement('div');
    handRow.className = 'ppc-hand';
    const show = Math.min(p.hand.length, 13);
    for (let j = 0; j < show; j++) {
      const c = document.createElement('div');
      c.className = 'card card-back card-mini';
      handRow.appendChild(c);
    }
    if (p.hand.length > show) {
      const more = document.createElement('span');
      more.className = 'ppc-more';
      more.textContent = `+${p.hand.length - show}`;
      handRow.appendChild(more);
    }
    card.appendChild(handRow);

    // Played phase groups with lay-off targets
    if (p.played_groups) {
      const phaseRow = document.createElement('div');
      phaseRow.className = 'ppc-phase-groups';

      p.played_groups.forEach((group, gi) => {
        const groupEl = document.createElement('div');
        groupEl.className = 'played-phase-group';

        if (AppState.layOffMode) {
          groupEl.classList.add('lay-off-target');
          groupEl.onclick = () => window.handleLayOffTargetClick(p.name, gi);
        }
        if (AppState.layOffTarget?.playerName === p.name && AppState.layOffTarget?.groupIndex === gi) {
          groupEl.classList.add('lay-off-selected');
        }

        group.forEach(c => groupEl.appendChild(buildCardElement(c, false, false, 'card-mini')));

        // Drag-and-drop lay-off target
        groupEl.addEventListener('dragover', e => {
          e.preventDefault();
          groupEl.classList.add('drag-over');
        });
        groupEl.addEventListener('dragleave', () => groupEl.classList.remove('drag-over'));
        groupEl.addEventListener('drop', e => {
          e.preventDefault();
          groupEl.classList.remove('drag-over');
          const cardId = parseInt(e.dataTransfer.getData('cardId'));
          if (!isNaN(cardId)) {
            send({ type: 'lay_off', payload: { target_player: p.name, group_index: gi, card_ids: [cardId] } });
          }
        });

        phaseRow.appendChild(groupEl);
      });
      card.appendChild(phaseRow);
    }

    el.appendChild(card);
  });
}

// ── Your Hand ──────────────────────────────────────────────────────────────
function renderYourHand(state) {
  const handEl = document.getElementById('your-hand');
  handEl.innerHTML = '';

  const me = state.players.find(p => p.name === AppState.playerName);
  if (!me) return;

  const isMyTurn = state.players[state.current_player_index]?.name === AppState.playerName
                   && state.status === 'playing';

  // Sort hand: number cards by color then number, then wilds, then skips
  const sorted = [...me.hand].sort(sortCards);

  sorted.forEach(card => {
    const inPhaseGroup = AppState.phaseGroups.some(g => g.includes(card.id));
    const isSelected = AppState.selectedCardIds.includes(card.id) || inPhaseGroup;

    const cardEl = buildCardElement(card, isSelected, false, '');
    if (card.id === AppState.lastDrawnCardId) {
      cardEl.classList.add('card-newly-drawn');
    }

    if (isMyTurn) {
      cardEl.classList.add('clickable');
      cardEl.setAttribute('draggable', 'true');
      cardEl.addEventListener('dragstart', e => {
        e.dataTransfer.setData('cardId', String(card.id));
        e.dataTransfer.effectAllowed = 'move';
        cardEl.classList.add('dragging');
      });
      cardEl.addEventListener('dragend', () => cardEl.classList.remove('dragging'));
      cardEl.onclick = () => {
        // Assigned card: clicking removes it from its group
        if (inPhaseGroup) {
          window.handlePhaseCardClick(card.id);
          return;
        }
        // Active slot: clicking assigns card to the slot
        if (AppState.activePhaseSlot !== null) {
          window.handlePhaseCardClick(card.id);
          return;
        }
        // Toggle selection (for phase slot assignment or discard)
        if (AppState.selectedCardIds.includes(card.id)) {
          AppState.selectedCardIds = AppState.selectedCardIds.filter(id => id !== card.id);
        } else {
          AppState.selectedCardIds.push(card.id);
        }
        renderGame(state);
      };
    }

    handEl.appendChild(cardEl);
  });

  // Update selection hint
  const hint = document.getElementById('hand-selection-hint');
  const totalAssigned = AppState.phaseGroups.reduce((n, g) => n + g.length, 0);
  if (totalAssigned > 0 || AppState.selectedCardIds.length > 0) {
    const sel = AppState.selectedCardIds.length;
    hint.textContent = sel > 0
      ? `${sel} card${sel > 1 ? 's' : ''} selected — click a phase slot or the discard pile`
      : `${totalAssigned} card${totalAssigned > 1 ? 's' : ''} assigned to phase groups`;
    hint.style.color = 'var(--accent)';
  } else if (AppState.layOffMode && AppState.layOffTarget) {
    hint.textContent = `${AppState.selectedCardIds.length} card(s) selected — click "Lay Off" to confirm`;
    hint.style.color = '#a78bfa';
  } else {
    hint.textContent = AppState.selectedCardIds.length > 0
      ? `${AppState.selectedCardIds.length} card(s) selected`
      : '';
    hint.style.color = 'var(--muted)';
  }
}

// ── Action Buttons ─────────────────────────────────────────────────────────
function renderActionButtons(state) {
  const me = state.players.find(p => p.name === AppState.playerName);
  const isMyTurn = state.players[state.current_player_index]?.name === AppState.playerName
                   && state.status === 'playing';

  const btnDrawDeck    = document.getElementById('btn-draw-deck');
  const btnDrawDiscard = document.getElementById('btn-draw-discard');
  const btnLayOff      = document.getElementById('btn-lay-off');

  const canDraw = isMyTurn && me && !me.has_drawn;
  btnDrawDeck.disabled    = !canDraw;
  btnDrawDiscard.disabled = !canDraw || !state.discard_top || state.discard_top.type === 'skip';

  const canLayOff = isMyTurn && me && me.has_drawn && me.played_groups !== null;
  btnLayOff.disabled = !canLayOff && !AppState.layOffMode;

  // Update lay-off button label based on state
  if (AppState.layOffMode && AppState.layOffTarget && AppState.selectedCardIds.length > 0) {
    btnLayOff.textContent = 'Confirm Lay Off';
    btnLayOff.style.background = 'var(--success)';
  } else if (AppState.layOffMode) {
    btnLayOff.textContent = 'Cancel Lay Off';
    btnLayOff.style.background = '';
    btnLayOff.disabled = false;
  } else {
    btnLayOff.textContent = 'Lay Off';
    btnLayOff.style.background = '';
  }
}

// ── Game Log ───────────────────────────────────────────────────────────────
function renderLog(state) {
  const logEl = document.getElementById('game-log');
  const entries = [...state.log].reverse();
  logEl.innerHTML = '';
  entries.forEach(entry => {
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.textContent = entry;
    logEl.appendChild(div);
  });
}

// ── Phase Info box ─────────────────────────────────────────────────────────
function renderPhaseInfo(state) {
  const me = state.players.find(p => p.name === AppState.playerName);
  if (!me) return;

  const labelEl = document.getElementById('my-phase-label');
  const descEl  = document.getElementById('my-phase-desc');

  if (me.phase_number > 10) {
    labelEl.textContent = 'All Phases Complete!';
    descEl.textContent = '';
    return;
  }

  const phaseDef = state.phase_definitions[me.phase_number - 1];
  labelEl.textContent = `Your Phase: ${me.phase_number}`;
  descEl.textContent = phaseDef.description;

  if (me.played_groups) {
    descEl.textContent += ' ✓';
    labelEl.style.color = 'var(--success)';
  } else {
    labelEl.style.color = '';
  }
}

// ── Card Builder ───────────────────────────────────────────────────────────
function buildCardElement(card, isSelected, faceDown, extraClass) {
  const el = document.createElement('div');
  el.className = 'card';
  if (extraClass) el.classList.add(extraClass);

  if (faceDown) {
    el.classList.add('card-back');
    return el;
  }

  applyCardStyle(el, card);
  if (isSelected) el.classList.add('selected');
  el.dataset.cardId = card.id;

  return el;
}

function applyCardStyle(el, card) {
  el.classList.add(`card-${card.color}`);
  el.innerHTML = '';

  if (card.type === 'number') {
    const tl = document.createElement('div');
    tl.className = 'card-corner card-corner-tl';
    tl.textContent = card.number;

    const center = document.createElement('div');
    center.className = 'card-center-num';
    center.textContent = card.number;

    const br = document.createElement('div');
    br.className = 'card-corner card-corner-br';
    br.textContent = card.number;

    el.appendChild(tl);
    el.appendChild(center);
    el.appendChild(br);

  } else if (card.type === 'wild') {
    el.innerHTML = '<div class="card-wild-inner"><div class="card-wild-star">★</div><div class="card-wild-label">WILD</div></div>';

  } else if (card.type === 'skip') {
    el.innerHTML = '<div class="card-skip-inner"><div class="card-skip-icon">⊘</div><div class="card-skip-label">SKIP</div></div>';
  }
}

// ── Sort hand ──────────────────────────────────────────────────────────────
const COLOR_ORDER = { red: 0, blue: 1, green: 2, yellow: 3, wild: 4, skip: 5 };

function sortCards(a, b) {
  const typeOrder = { number: 0, wild: 1, skip: 2 };
  if (typeOrder[a.type] !== typeOrder[b.type]) return typeOrder[a.type] - typeOrder[b.type];
  if (a.type === 'number') {
    if (a.number !== b.number) return a.number - b.number;
    return COLOR_ORDER[a.color] - COLOR_ORDER[b.color];
  }
  return 0;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
