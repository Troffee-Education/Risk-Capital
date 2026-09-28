// Player Mobile Controller
(function() {
  'use strict';

  // UUID Generation / Retrieval (Isolated per browser tab so multiple tabs on 1 laptop act as independent students)
  function getOrCreatePlayerUUID() {
    let uuid = sessionStorage.getItem('rc_player_uuid');
    if (!uuid) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        uuid = crypto.randomUUID();
      } else {
        uuid = 'p-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now().toString(36);
      }
      sessionStorage.setItem('rc_player_uuid', uuid);
    }
    return uuid;
  }

  const playerUUID = getOrCreatePlayerUUID();

  // Socket Connection
  const socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000
  });

  // State
  let currentRoomCode = sessionStorage.getItem('rc_room_code') || localStorage.getItem('rc_room_code') || null;
  let currentNickname = sessionStorage.getItem('rc_nickname') || localStorage.getItem('rc_nickname') || null;
  let currentMode = 'mode_1_sprint';
  let liquidCash = 100000;
  let lockedPortfolio = [];
  let lockedValue = 0;
  let netWorth = 100000;
  let currentTitle = 'The Cautious One';
  let riskScore = 0;
  let activeOptions = [];
  let selectedOptionId = null;
  let currentRoundIndex = 1;
  let allocationPercent = 100; // 25, 50, 100
  let timerInterval = null;
  let serverClockOffset = 0; // One-time client/server clock offset in ms
  const toastQueue = [];

  // DOM Elements - Screens
  const screenJoin = document.getElementById('screen-join');
  const screenLobby = document.getElementById('screen-lobby');
  const screenDecision = document.getElementById('screen-decision');
  const screenSubmitted = document.getElementById('screen-submitted');
  const screenResult = document.getElementById('screen-result');
  const screenBomb = document.getElementById('screen-bomb');
  const screenEndgame = document.getElementById('screen-endgame');

  // DOM Elements - Bomb Mini-Game
  const bombScreenContainer = document.getElementById('bomb-screen-container');
  const bombTimerDigits = document.getElementById('bomb-timer-digits');
  const bombTimerBar = document.getElementById('bomb-timer-bar');
  const bombHolderView = document.getElementById('bomb-holder-view');
  const bombSafeView = document.getElementById('bomb-safe-view');
  const bombResultView = document.getElementById('bomb-result-view');
  const btnPassBomb = document.getElementById('btn-pass-bomb');
  const bombResultIcon = document.getElementById('bomb-result-icon');
  const bombResultTitle = document.getElementById('bomb-result-title');
  const bombResultDelta = document.getElementById('bomb-result-delta');
  const bombResultDesc = document.getElementById('bomb-result-desc');
  const bombResultCash = document.getElementById('bomb-result-cash');

  // DOM Elements - Cash Frenzy Mini-Game
  const screenFrenzy = document.getElementById('screen-frenzy');
  const frenzyCountdownOverlay = document.getElementById('frenzy-countdown-overlay');
  const frenzyCountdownNum = document.getElementById('frenzy-countdown-num');
  const frenzyTimerDigits = document.getElementById('frenzy-timer-digits');
  const frenzyTimerFill = document.getElementById('frenzy-timer-fill');
  const frenzyLiveCash = document.getElementById('frenzy-live-cash');
  const frenzyTapSurface = document.getElementById('frenzy-tap-surface');
  const frenzySpawnContainer = document.getElementById('frenzy-spawn-container');
  const frenzyComboBadge = document.getElementById('frenzy-combo-badge');
  const frenzyResultModal = document.getElementById('frenzy-result-modal');
  const frenzyResDelta = document.getElementById('frenzy-res-delta');
  const frenzyResTaps = document.getElementById('frenzy-res-taps');
  const frenzyResNewCash = document.getElementById('frenzy-res-new-cash');

  let playerHasBomb = false;
  let bombTimerInterval = null;
  let bombLastTickMs = 0;

  let frenzyActive = false;
  let frenzyCashEarned = 0;
  let frenzyTotalTaps = 0;
  let frenzyComboCount = 0;
  let frenzyFrozenUntil = 0;
  let frenzyTimerInterval = null;
  let frenzySpawnInterval = null;

  // DOM Elements - HUD & Drawer
  const playerHud = document.getElementById('player-hud');
  const hudNickname = document.getElementById('hud-nickname');
  const hudTitleBadge = document.getElementById('hud-title-badge');
  const hudGoalBadge = document.getElementById('hud-goal-badge');
  const btnSoundToggle = document.getElementById('btn-sound-toggle');
  const hudSoundIcon = document.getElementById('hud-sound-icon');
  const btnToggleDrawer = document.getElementById('btn-toggle-portfolio-drawer');
  const hudCashVal = document.getElementById('hud-cash-val');
  const hudLockedVal = document.getElementById('hud-locked-val');
  const portfolioDrawer = document.getElementById('portfolio-drawer');
  const drawerBackdrop = document.getElementById('drawer-backdrop');
  const drawerNetworth = document.getElementById('drawer-networth');
  const drawerAssetsList = document.getElementById('drawer-assets-list');
  const btnCloseDrawer = document.getElementById('btn-close-drawer');
  const toastContainer = document.getElementById('toast-container');

  // DOM Elements - Join & Lobby
  const formJoin = document.getElementById('form-join');
  const inputRoomCode = document.getElementById('input-room-code');
  const inputNickname = document.getElementById('input-nickname');
  const btnJoin = document.getElementById('btn-join');
  const joinError = document.getElementById('join-error');
  const lobbyTraderName = document.getElementById('lobby-trader-name');
  const lobbyActiveRoom = document.getElementById('lobby-active-room');

  // DOM Elements - Decision
  const decisionRoundTag = document.getElementById('decision-round-tag');
  const decisionSeconds = document.getElementById('decision-seconds');
  const decisionProgressFill = document.getElementById('decision-progress-fill');
  const allocAmountVal = document.getElementById('alloc-amount-val');
  const allocPresetBtns = document.querySelectorAll('.btn-preset');
  const customAllocContainer = document.getElementById('custom-alloc-container');
  const inputCustomAmount = document.getElementById('input-custom-amount');
  const allocValidationWarning = document.getElementById('alloc-validation-warning');
  const allocWarningText = document.getElementById('alloc-warning-text');
  const insufficientFundsBanner = document.getElementById('insufficient-funds-banner');
  const btnQuickTrade = document.getElementById('btn-quick-trade');
  const playerOptionsList = document.getElementById('player-options-list');

  // Business Spotlight & Dossier Elements (Mode 1)
  const playerBusinessBanner = document.getElementById('player-business-banner');
  const playerBusinessName = document.getElementById('player-business-name');
  const playerBusinessIndustry = document.getElementById('player-business-industry');
  const playerBusinessTagline = document.getElementById('player-business-tagline');
  const btnOpenDossier = document.getElementById('btn-open-dossier');
  const dossierModal = document.getElementById('dossier-modal');
  const dossierBackdrop = document.getElementById('dossier-backdrop');
  const btnCloseDossier = document.getElementById('btn-close-dossier');
  const dossierModalBizName = document.getElementById('dossier-modal-biz-name');
  const dossierBullet1 = document.getElementById('dossier-bullet-1');
  const dossierBullet2 = document.getElementById('dossier-bullet-2');
  const dossierBullet3 = document.getElementById('dossier-bullet-3');

  // DOM Elements - Submitted & Result
  const lockedChoiceName = document.getElementById('locked-choice-name');
  const lockedChoiceAmount = document.getElementById('locked-choice-amount');
  const resultStatusBadge = document.getElementById('result-status-badge');
  const resultDeltaVal = document.getElementById('result-delta-val');
  const resultPctVal = document.getElementById('result-pct-val');
  const resultCashVal = document.getElementById('result-cash-val');
  const resultSummaryText = document.getElementById('result-summary-text');
  const resultDeltaCard = document.getElementById('result-delta-card');
  const receiptAnalystCard = document.getElementById('receipt-analyst-card');
  const receiptAnalystStatusTag = document.getElementById('receipt-analyst-status-tag');
  const receiptAnalystTruthText = document.getElementById('receipt-analyst-truth-text');

  // DOM Elements - Endgame Scorecard & Exit
  const storyRoomCode = document.getElementById('story-room-code');
  const storyTierBadge = document.getElementById('story-tier-badge');
  const storyNickname = document.getElementById('story-nickname');
  const storyFinalTitle = document.getElementById('story-final-title');
  const storyNetworth = document.getElementById('story-networth');
  const storyRank = document.getElementById('story-rank');
  const storyQuote = document.getElementById('story-quote');
  const btnHudLeave = document.getElementById('btn-hud-leave');
  const btnLeaveLobby = document.getElementById('btn-leave-lobby');
  const btnExitGame = document.getElementById('btn-exit-game');

  // Exit Game & Leave Room Controller
  function exitGameSession() {
    if (window.SoundManager) {
      window.SoundManager.playButtonTap();
    }
    if (timerInterval) clearInterval(timerInterval);
    if (bombTimerInterval) clearInterval(bombTimerInterval);

    // Notify server to disconnect from room
    if (currentRoomCode) {
      socket.emit('player:leaveRoom', {
        roomCode: currentRoomCode,
        playerId: playerUUID
      });
    }

    // Reset local room state & storage
    currentRoomCode = null;
    selectedOptionId = null;
    sessionStorage.removeItem('rc_room_code');
    localStorage.removeItem('rc_room_code');

    // Close any open modals/drawers
    if (portfolioDrawer) portfolioDrawer.classList.add('hidden');
    if (drawerBackdrop) drawerBackdrop.classList.add('hidden');
    if (dossierModal) dossierModal.classList.add('hidden');
    if (dossierBackdrop) dossierBackdrop.classList.add('hidden');
    const modalConfirm = document.getElementById('modal-confirm-allocation');
    const confirmBackdrop = document.getElementById('confirm-backdrop');
    if (modalConfirm) modalConfirm.classList.add('hidden');
    if (confirmBackdrop) confirmBackdrop.classList.add('hidden');
    if (playerHud) playerHud.classList.add('hidden');

    // Reset join form error & room input
    if (joinError) {
      joinError.textContent = '';
      joinError.classList.add('hidden');
    }
    if (inputRoomCode) {
      inputRoomCode.value = '';
    }

    // Return to Join Gateway
    showScreen(screenJoin);
  }

  if (btnHudLeave) {
    btnHudLeave.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Leave this game room and return to the main lobby?')) {
        exitGameSession();
      }
    });
  }

  if (btnLeaveLobby) {
    btnLeaveLobby.addEventListener('click', (e) => {
      e.stopPropagation();
      exitGameSession();
    });
  }

  if (btnExitGame) {
    btnExitGame.addEventListener('click', (e) => {
      e.stopPropagation();
      exitGameSession();
    });
  }

  // Initialize Sound Toggle UI
  function updateSoundIcon() {
    if (!hudSoundIcon || !window.LucideIcons || !window.SoundManager) return;
    const isMuted = window.SoundManager.isMuted();
    hudSoundIcon.innerHTML = isMuted 
      ? window.LucideIcons.getSvg('volume-x', { size: 18, className: 'sound-icon-muted' })
      : window.LucideIcons.getSvg('volume-2', { size: 18, className: 'sound-icon-active' });
    if (btnSoundToggle) {
      btnSoundToggle.setAttribute('aria-label', isMuted ? 'Unmute Audio' : 'Mute Audio');
    }
  }

  if (btnSoundToggle) {
    btnSoundToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.SoundManager) {
        window.SoundManager.unlockAudioContext();
        window.SoundManager.toggleMute();
        window.SoundManager.playButtonTap();
      }
      updateSoundIcon();
    });
  }
  window.addEventListener('rc:muteChanged', updateSoundIcon);
  updateSoundIcon();

  // Currency helper
  function formatCash(amount) {
    return '$' + Number(amount || 0).toLocaleString('en-US');
  }

  function formatShortCash(amount) {
    const num = Number(amount || 0);
    if (num >= 1000000) return '$' + (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return '$' + Math.round(num / 1000) + 'k';
    return '$' + num;
  }

  function showScreen(screenEl) {
    [screenJoin, screenLobby, screenDecision, screenSubmitted, screenResult, screenBomb, screenFrenzy, screenEndgame].forEach(s => {
      if (s) s.classList.remove('active');
    });
    if (screenEl) screenEl.classList.add('active');
  }

  // Update HUD State
  function updateHUD(data) {
    if (data.liquidCash !== undefined) liquidCash = Number(data.liquidCash);
    if (data.lockedPortfolio !== undefined) lockedPortfolio = data.lockedPortfolio || [];
    if (data.mode) currentMode = data.mode;
    
    lockedValue = lockedPortfolio.reduce((sum, item) => sum + (item.amountInvested || 0), 0);
    netWorth = liquidCash + lockedValue;

    if (data.title) currentTitle = data.title;
    if (data.riskScore !== undefined) riskScore = data.riskScore;

    if (hudNickname) hudNickname.textContent = currentNickname || 'Trader';
    if (hudTitleBadge) hudTitleBadge.textContent = currentTitle;
    if (hudCashVal) hudCashVal.textContent = formatShortCash(liquidCash);
    if (hudLockedVal) hudLockedVal.textContent = formatShortCash(lockedValue);
    if (drawerNetworth) drawerNetworth.textContent = `Net Worth: ${formatCash(netWorth)}`;

    const isMode1 = currentMode === 'mode_1_sprint';
    const hudSprintContainer = document.getElementById('hud-sprint-container');
    const hudSprintCash = document.getElementById('hud-sprint-cash-text');
    const hudSprintBar = document.getElementById('hud-sprint-bar');

    if (isMode1) {
      if (btnToggleDrawer) btnToggleDrawer.classList.add('hidden');
      if (hudSprintContainer) hudSprintContainer.classList.remove('hidden');
      const pctGoal = Math.min(100, Math.max(0, Math.round((liquidCash / 500000) * 100)));
      if (hudSprintCash) hudSprintCash.textContent = `${formatCash(liquidCash)} / $500K (${pctGoal}%)`;
      if (hudSprintBar) hudSprintBar.style.width = `${pctGoal}%`;
    } else {
      if (btnToggleDrawer) btnToggleDrawer.classList.remove('hidden');
      if (hudSprintContainer) hudSprintContainer.classList.add('hidden');
    }

    if (playerHud) playerHud.classList.remove('hidden');
    renderDrawerAssets();
    updateSoundIcon();
    validateAllocation();
  }

  // Render Assets in Collapsible Drawer
  function renderDrawerAssets() {
    if (!drawerAssetsList) return;
    drawerAssetsList.innerHTML = '';

    if (!lockedPortfolio || lockedPortfolio.length === 0) {
      drawerAssetsList.innerHTML = `<div class="drawer-empty-state">No locked assets in pipeline. All capital is liquid.</div>`;
      return;
    }

    const lockIconSvg = window.LucideIcons ? window.LucideIcons.getSvg('lock', { size: 13, className: 'inline-lock-icon' }) : '🔒';

    lockedPortfolio.forEach(asset => {
      const remainingRounds = Math.max(0, (asset.maturesAtRound || currentRoundIndex) - currentRoundIndex);
      const sectorIcon = window.LucideIcons ? window.LucideIcons.getSectorIcon(asset.sectorId, { size: 16 }) : '';
      const row = document.createElement('div');
      row.className = 'drawer-asset-row';
      row.innerHTML = `
        <div class="asset-left">
          <div class="asset-name-group">
            ${sectorIcon}
            <span class="asset-name">${escapeHtml(asset.name || 'Locked Asset')}</span>
          </div>
          <span class="asset-countdown">${lockIconSvg} Matures in ${remainingRounds} round${remainingRounds === 1 ? '' : 's'} (Rd ${asset.maturesAtRound})</span>
        </div>
        <div class="asset-right">
          <div class="asset-amount">${formatCash(asset.amountInvested)}</div>
          <div class="asset-proj">${asset.expectedReturn || '+10.0%'}</div>
        </div>
      `;
      drawerAssetsList.appendChild(row);
    });
  }

  // Drawer Toggle Handlers
  function toggleDrawer(open) {
    if (window.SoundManager) window.SoundManager.playButtonTap();
    const isCurrentlyOpen = btnToggleDrawer && btnToggleDrawer.getAttribute('aria-expanded') === 'true';
    const shouldOpen = open !== undefined ? open : !isCurrentlyOpen;

    if (shouldOpen) {
      if (portfolioDrawer) portfolioDrawer.classList.remove('hidden');
      if (drawerBackdrop) drawerBackdrop.classList.remove('hidden');
      if (btnToggleDrawer) btnToggleDrawer.setAttribute('aria-expanded', 'true');
      renderDrawerAssets();
    } else {
      if (portfolioDrawer) portfolioDrawer.classList.add('hidden');
      if (drawerBackdrop) drawerBackdrop.classList.add('hidden');
      if (btnToggleDrawer) btnToggleDrawer.setAttribute('aria-expanded', 'false');
    }
  }

  if (btnToggleDrawer) btnToggleDrawer.addEventListener('click', () => toggleDrawer());
  if (btnCloseDrawer) btnCloseDrawer.addEventListener('click', () => toggleDrawer(false));
  if (drawerBackdrop) drawerBackdrop.addEventListener('click', () => toggleDrawer(false));

  // Dossier Modal Toggle Handlers (Mode 1)
  function toggleDossier(open) {
    if (window.SoundManager) window.SoundManager.playButtonTap();
    const isCurrentlyOpen = dossierModal && !dossierModal.classList.contains('hidden');
    const shouldOpen = open !== undefined ? open : !isCurrentlyOpen;

    if (shouldOpen) {
      if (dossierModal) dossierModal.classList.remove('hidden');
      if (dossierBackdrop) dossierBackdrop.classList.remove('hidden');
    } else {
      if (dossierModal) dossierModal.classList.add('hidden');
      if (dossierBackdrop) dossierBackdrop.classList.add('hidden');
    }
  }

  if (btnOpenDossier) btnOpenDossier.addEventListener('click', () => toggleDossier(true));
  if (btnCloseDossier) btnCloseDossier.addEventListener('click', () => toggleDossier(false));
  if (dossierBackdrop) dossierBackdrop.addEventListener('click', () => toggleDossier(false));

  function updateOptionCardsCashText() {
    if (!playerOptionsList) return;
    const ctaSpans = playerOptionsList.querySelectorAll('.sprint-cta-text');
    ctaSpans.forEach(span => {
      span.textContent = `TAP 100% ALL-IN (${formatCash(liquidCash)}) ⚡`;
    });
  }

  // Non-Blocking Toast Notification Manager (~4s Auto Dismiss)
  function showMaturityToast(notif) {
    if (!toastContainer) return;
    const zapSvg = window.LucideIcons ? window.LucideIcons.getSvg('zap', { size: 18 }) : '⚡';

    const toast = document.createElement('div');
    toast.className = 'toast-item';
    toast.innerHTML = `
      <div class="toast-icon">${zapSvg}</div>
      <div class="toast-content">
        <div class="toast-title">ASSET MATURED!</div>
        <div class="toast-msg">${escapeHtml(notif.message || `${notif.assetName} matured for ${formatCash(notif.totalPayout)}!`)}</div>
      </div>
      <div class="toast-close">✕</div>
    `;

    const dismissToast = () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 200);
    };

    toast.addEventListener('click', dismissToast);
    toastContainer.appendChild(toast);

    // Auto-dismiss after 4 seconds
    setTimeout(dismissToast, 4000);
  }

  function processQueuedToasts() {
    while (toastQueue.length > 0) {
      const notif = toastQueue.shift();
      showMaturityToast(notif);
    }
  }

  // Pre-fill inputs if stored
  if (currentRoomCode && inputRoomCode) inputRoomCode.value = currentRoomCode;
  if (currentNickname && inputNickname) inputNickname.value = currentNickname;

  // Auto uppercase room code on input
  if (inputRoomCode) {
    inputRoomCode.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
  }

  // Auto-reconnect on socket connect
  function tryAutoJoin() {
    if (currentRoomCode && currentNickname) {
      console.log(`[Player] Auto-reconnecting to Room ${currentRoomCode}...`);
      socket.emit('player:join', {
        roomCode: currentRoomCode,
        playerId: playerUUID,
        nickname: currentNickname
      }, handleJoinResponse);
    }
  }

  function handleJoinResponse(res) {
    if (!res || !res.success) {
      if (joinError) {
        joinError.textContent = res ? res.error : 'Connection error. Check room code.';
        joinError.classList.remove('hidden');
      }
      showScreen(screenJoin);
      return;
    }

    if (res.serverTime) {
      serverClockOffset = res.serverTime - Date.now();
    }

    currentRoomCode = res.roomCode;
    currentNickname = res.nickname;
    currentRoundIndex = res.roundIndex || 1;

    sessionStorage.setItem('rc_room_code', currentRoomCode);
    sessionStorage.setItem('rc_nickname', currentNickname);
    localStorage.setItem('rc_room_code', currentRoomCode);
    localStorage.setItem('rc_nickname', currentNickname);

    updateHUD(res);

    if (lobbyTraderName) lobbyTraderName.textContent = currentNickname;
    if (lobbyActiveRoom) lobbyActiveRoom.textContent = currentRoomCode;

    // Route to correct screen based on room status & player progress
    if (res.status === 'LOBBY') {
      showScreen(screenLobby);
    } else if (res.status === 'MARKET_INTEL') {
      showScreen(screenLobby);
      if (res.lastOutcome && res.lastOutcome.maturedNotifications) {
        res.lastOutcome.maturedNotifications.forEach(showMaturityToast);
      }
    } else if (res.status === 'IN_ROUND') {
      activeOptions = res.options || [];
      if (res.currentChoice) {
        selectedOptionId = res.currentChoice;
        const opt = activeOptions.find(o => o.id === selectedOptionId) || (selectedOptionId === 'opt_quick' ? { name: 'Overnight Liquidity' } : null);
        if (lockedChoiceName) lockedChoiceName.textContent = opt ? opt.name : selectedOptionId;
        if (lockedChoiceAmount) lockedChoiceAmount.textContent = `Allocated: ${formatCash(liquidCash)}`;
        showScreen(screenSubmitted);
      } else {
        renderDecisionScreen(activeOptions, res.timerEnd, res.roundIndex, res.business || res.currentEvent?.business);
      }
    } else if (res.status === 'RESOLVED') {
      if (res.lastOutcome) {
        renderResultScreen(res.lastOutcome);
      } else {
        showScreen(screenLobby);
      }
    } else if (res.status === 'FINISHED') {
      renderEndgameScorecard({
        finalNetWorth: res.netWorth || res.liquidCash,
        finalRank: res.finalRank || 1,
        finalTitle: res.title || currentTitle,
        roomCode: currentRoomCode
      });
    }
  }

  // Socket Lifecycle
  socket.on('connect', () => {
    console.log('[Player Socket] Connected.');
    tryAutoJoin();
  });

  socket.on('server:time', ({ serverTime }) => {
    if (serverTime) {
      serverClockOffset = serverTime - Date.now();
      console.log(`[Player] Clock offset synced: ${serverClockOffset}ms`);
    }
  });

  socket.on('room:phaseChange', (data) => {
    if (data.phase === 'MARKET_INTEL') {
      currentRoundIndex = data.roundIndex || currentRoundIndex;
      if (window.SoundManager) window.SoundManager.playNewsAlert();
      processQueuedToasts();
    }
  });

  socket.on('round:started', (data) => {
    selectedOptionId = null;
    currentRoundIndex = data.roundIndex || currentRoundIndex;
    activeOptions = data.options || [];
    renderDecisionScreen(activeOptions, data.endTimestamp, data.roundIndex, data.business || data.event?.business);
  });

  socket.on('player:roundStarted', (data) => {
    selectedOptionId = null;
    currentRoundIndex = data.roundIndex || currentRoundIndex;
    activeOptions = data.options || [];
    renderDecisionScreen(activeOptions, data.endTimestamp, data.roundIndex, data.business || data.event?.business);
  });

  socket.on('player:choiceConfirmed', (data) => {
    selectedOptionId = data.optionId;
    const opt = activeOptions.find(o => o.id === selectedOptionId) || (selectedOptionId === 'opt_quick' ? { name: 'Overnight Liquidity' } : null);
    if (lockedChoiceName) lockedChoiceName.textContent = opt ? opt.name : selectedOptionId;
    if (lockedChoiceAmount) lockedChoiceAmount.textContent = `Allocated: ${formatCash(data.amount || liquidCash)}`;
    showScreen(screenSubmitted);
  });

  // BANDWIDTH SAFE: Received personal outcome ONLY
  socket.on('player:roundResolved', (data) => {
    if (timerInterval) clearInterval(timerInterval);
    updateHUD(data);

    // Queue or display maturity toasts
    if (data.maturedNotifications && data.maturedNotifications.length > 0) {
      data.maturedNotifications.forEach(showMaturityToast);
    }

    renderResultScreen(data);
  });

  socket.on('player:gameFinished', (data) => {
    if (timerInterval) clearInterval(timerInterval);
    updateHUD(data);
    renderEndgameScorecard(data);
  });

  socket.on('room:resetToLobby', (data) => {
    selectedOptionId = null;
    showScreen(screenLobby);
  });

  socket.on('player:scenarioUpdated', (data) => {
    if (data.liquidCash !== undefined) {
      liquidCash = data.liquidCash;
      netWorth = data.netWorth || data.liquidCash;
      updateHUD({ liquidCash, netWorth });
    }
  });

  socket.on('player:sessionReset', (data) => {
    selectedOptionId = null;
    if (data.startingCapital !== undefined) {
      liquidCash = data.startingCapital;
      netWorth = data.startingCapital;
      updateHUD({ liquidCash, netWorth });
    }
    showScreen(screenLobby);
  });

  // -------------------------------------------------------------
  // LIQUIDITY BOMB (HOT POTATO) MINI-GAME CLIENT LOGIC
  // -------------------------------------------------------------

  function renderBombScreen(data) {
    if (timerInterval) clearInterval(timerInterval);
    if (bombTimerInterval) clearInterval(bombTimerInterval);

    if (data.liquidCash !== undefined) {
      liquidCash = data.liquidCash;
      netWorth = data.liquidCash;
      updateHUD({ liquidCash, netWorth });
    }

    playerHasBomb = !!data.hasBomb;

    if (bombResultView) bombResultView.classList.add('hidden');

    if (playerHasBomb) {
      if (bombHolderView) bombHolderView.classList.remove('hidden');
      if (bombSafeView) bombSafeView.classList.add('hidden');
      if (bombScreenContainer) bombScreenContainer.classList.add('has-bomb-active');
      if (window.SoundManager) window.SoundManager.playNewsAlert();
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    } else {
      if (bombHolderView) bombHolderView.classList.add('hidden');
      if (bombSafeView) bombSafeView.classList.remove('hidden');
      if (bombScreenContainer) bombScreenContainer.classList.remove('has-bomb-active');
    }

    // Start Accelerating Timer & Rhythmic Web Audio Synthesis
    const endTimestamp = data.timerEnd || (Date.now() + 10000);
    const totalDuration = 10000;
    bombLastTickMs = 0;

    const bombTick = () => {
      const effectiveNow = Date.now() + serverClockOffset;
      const remainingMs = Math.max(0, endTimestamp - effectiveNow);
      const remainingSec = Math.ceil(remainingMs / 1000);

      if (bombTimerDigits) {
        bombTimerDigits.textContent = remainingSec;
      }
      if (bombTimerBar) {
        const pct = (remainingMs / totalDuration) * 100;
        bombTimerBar.style.width = `${pct}%`;
      }

      // Dynamic Audio Tempo (tan-tan-tan accelerating tempo!)
      const now = Date.now();
      let tickIntervalMs = 600;
      let tempoMult = 1.0;

      if (remainingSec <= 3) {
        tickIntervalMs = 180;
        tempoMult = 3.0;
      } else if (remainingSec <= 6) {
        tickIntervalMs = 320;
        tempoMult = 2.0;
      }

      if (now - bombLastTickMs >= tickIntervalMs && remainingMs > 100) {
        bombLastTickMs = now;
        if (window.SoundManager) window.SoundManager.playBombTick(tempoMult);
        if (playerHasBomb && navigator.vibrate) navigator.vibrate(20);
      }

      if (remainingMs <= 0) {
        clearInterval(bombTimerInterval);
        bombTimerInterval = null;
        if (bombTimerDigits) bombTimerDigits.textContent = '0';
      }
    };

    bombTick();
    bombTimerInterval = setInterval(bombTick, 60);

    showScreen(screenBomb);
  }

  function handlePassBombClick(e) {
    if (e) e.preventDefault();
    if (!playerHasBomb) return;

    if (window.SoundManager) window.SoundManager.playBombPass();
    if (navigator.vibrate) navigator.vibrate([40, 50]);

    socket.emit('player:passBomb', {
      roomCode: currentRoomCode,
      playerId: playerUUID
    });
  }

  function handleSafeScreenTap(e) {
    if (e) e.preventDefault();
    if (playerHasBomb) return; // If holding bomb, pass handler triggers

    // Panic Misclick Penalty (-$500)
    if (window.SoundManager) window.SoundManager.playPanicPenalty();
    if (navigator.vibrate) navigator.vibrate(120);

    socket.emit('player:panicTap', {
      roomCode: currentRoomCode,
      playerId: playerUUID
    });

    // Screen Flash Warning
    const flashEl = document.getElementById('screen-flash-fx');
    if (flashEl) {
      flashEl.className = 'screen-flash-fx flash-loss';
      setTimeout(() => { flashEl.className = 'screen-flash-fx'; }, 250);
    }
  }

  // Bind Bomb Interaction Events
  if (btnPassBomb) {
    btnPassBomb.addEventListener('click', handlePassBombClick);
    btnPassBomb.addEventListener('touchstart', handlePassBombClick, { passive: false });
  }

  if (bombHolderView) {
    bombHolderView.addEventListener('click', handlePassBombClick);
  }

  if (bombSafeView) {
    bombSafeView.addEventListener('click', handleSafeScreenTap);
  }

  socket.on('player:bombState', (data) => {
    renderBombScreen(data);
  });

  socket.on('player:panicPenaltyApplied', (data) => {
    liquidCash = data.liquidCash;
    netWorth = data.liquidCash;
    updateHUD({ liquidCash, netWorth });

    if (window.SoundManager) window.SoundManager.playPanicPenalty();
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);

    showMaturityToast({
      message: `⚠️ PANIC PENALTY! -$${(data.penalty || 500).toLocaleString()} (Don't tap while safe!)`
    });
  });

  socket.on('player:bombResolved', (data) => {
    if (bombTimerInterval) clearInterval(bombTimerInterval);
    liquidCash = data.liquidCash;
    netWorth = data.liquidCash;
    updateHUD({ liquidCash, netWorth });

    if (bombHolderView) bombHolderView.classList.add('hidden');
    if (bombSafeView) bombSafeView.classList.add('hidden');
    if (bombScreenContainer) bombScreenContainer.classList.remove('has-bomb-active');

    if (bombResultView) {
      bombResultView.classList.remove('hidden');
      if (data.exploded) {
        if (bombResultIcon) bombResultIcon.textContent = '💥';
        if (bombResultTitle) {
          bombResultTitle.textContent = 'DETONATED!';
          bombResultTitle.className = 'bomb-result-title text-coral';
        }
        if (bombResultDelta) {
          bombResultDelta.textContent = `-$${(data.penalty || 10000).toLocaleString()}`;
          bombResultDelta.className = 'bomb-result-delta text-coral';
        }
        if (bombResultDesc) bombResultDesc.textContent = 'The liquidity bomb detonated in your portfolio!';
        if (window.SoundManager) window.SoundManager.playBombExplode();
        if (navigator.vibrate) navigator.vibrate([200, 100, 300]);
      } else {
        if (bombResultIcon) bombResultIcon.textContent = '🛡️';
        if (bombResultTitle) {
          bombResultTitle.textContent = 'SURVIVED!';
          bombResultTitle.className = 'bomb-result-title text-emerald';
        }
        if (bombResultDelta) {
          bombResultDelta.textContent = '+$0 SAFE';
          bombResultDelta.className = 'bomb-result-delta text-emerald';
        }
        if (bombResultDesc) bombResultDesc.textContent = 'You successfully passed the liquidity shock!';
        if (window.SoundManager) window.SoundManager.playCashUp();
        if (navigator.vibrate) navigator.vibrate([60, 80]);
      }

      if (bombResultCash) {
        bombResultCash.textContent = formatCash(data.liquidCash);
      }
    }
  });

  // -------------------------------------------------------------
  // CASH FRENZY / GREED GRAB MINI-GAME CLIENT LOGIC
  // -------------------------------------------------------------

  function startFrenzyMinigame(data) {
    if (bombTimerInterval) clearInterval(bombTimerInterval);
    if (frenzyTimerInterval) clearInterval(frenzyTimerInterval);
    if (frenzySpawnInterval) clearInterval(frenzySpawnInterval);

    showScreen(screenFrenzy);
    frenzyActive = false;
    frenzyCashEarned = 0;
    frenzyTotalTaps = 0;
    frenzyComboCount = 0;
    frenzyFrozenUntil = 0;

    if (frenzyLiveCash) frenzyLiveCash.textContent = '+$0';
    if (frenzyTimerDigits) frenzyTimerDigits.textContent = '5.0s';
    if (frenzyTimerFill) frenzyTimerFill.style.width = '100%';
    if (frenzySpawnContainer) frenzySpawnContainer.innerHTML = '';
    if (frenzyComboBadge) frenzyComboBadge.classList.add('hidden');
    if (frenzyResultModal) frenzyResultModal.classList.add('hidden');

    if (frenzyCountdownOverlay) {
      frenzyCountdownOverlay.classList.remove('hidden');
    }

    if (window.SoundManager) window.SoundManager.playNewsAlert();

    // 3-2-1 Countdown Timer
    let readySec = 3;
    if (frenzyCountdownNum) frenzyCountdownNum.textContent = '3';
    
    const countInterval = setInterval(() => {
      readySec--;
      if (readySec > 0) {
        if (frenzyCountdownNum) frenzyCountdownNum.textContent = readySec;
        if (window.SoundManager) window.SoundManager.playCountdownTick(readySec);
      } else {
        clearInterval(countInterval);
        if (frenzyCountdownNum) frenzyCountdownNum.textContent = 'GO! 🔥';
        if (window.SoundManager) window.SoundManager.playRoundReveal();
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

        setTimeout(() => {
          if (frenzyCountdownOverlay) frenzyCountdownOverlay.classList.add('hidden');
          activateFrenzyTapPhase(data.timerEnd || (Date.now() + 5000));
        }, 400);
      }
    }, 1000);
  }

  function activateFrenzyTapPhase(endTimestamp) {
    frenzyActive = true;
    const totalDuration = 5000;

    // Spawning Loop
    frenzySpawnInterval = setInterval(() => {
      if (!frenzyActive) return;
      spawnFrenzyToken();
    }, 320);

    // Initial Burst of Tokens
    for (let i = 0; i < 3; i++) {
      setTimeout(spawnFrenzyToken, i * 120);
    }

    // Timer Loop
    frenzyTimerInterval = setInterval(() => {
      const now = Date.now() + serverClockOffset;
      const remainingMs = Math.max(0, endTimestamp - now);
      const remainingSec = (remainingMs / 1000).toFixed(1);

      if (frenzyTimerDigits) {
        frenzyTimerDigits.textContent = `${remainingSec}s`;
        frenzyTimerDigits.style.color = remainingMs <= 1500 ? '#ef4444' : '#f59e0b';
      }

      if (frenzyTimerFill) {
        const pct = (remainingMs / totalDuration) * 100;
        frenzyTimerFill.style.width = `${pct}%`;
      }

      if (remainingMs <= 0) {
        clearInterval(frenzyTimerInterval);
        clearInterval(frenzySpawnInterval);
        frenzyActive = false;

        // Final Batch Sync to Server
        socket.emit('player:frenzySync', {
          roomCode: currentRoomCode,
          playerId: currentPlayerId,
          cashEarned: frenzyCashEarned,
          totalTaps: frenzyTotalTaps
        });
      }
    }, 50);
  }

  function spawnFrenzyToken() {
    if (!frenzySpawnContainer) return;
    const containerRect = frenzySpawnContainer.getBoundingClientRect();
    if (!containerRect.width || !containerRect.height) return;

    const token = document.createElement('div');
    const rand = Math.random();
    let type = 'cash';
    let icon = '💵';
    let className = 'cash-bill';

    if (rand < 0.18) {
      type = 'golden';
      icon = '👑';
      className = 'golden-bull';
    } else if (rand > 0.82) {
      type = 'toxic';
      icon = '💀';
      className = 'toxic-asset';
    }

    token.className = `frenzy-target-token ${className}`;
    token.innerHTML = icon;
    token.dataset.type = type;

    const padding = 60;
    const maxX = Math.max(20, containerRect.width - padding);
    const maxY = Math.max(20, containerRect.height - padding);
    const posX = Math.floor(Math.random() * maxX);
    const posY = Math.floor(Math.random() * maxY);

    token.style.left = `${posX}px`;
    token.style.top = `${posY}px`;

    const handleTokenTap = (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!frenzyActive) return;
      token.remove();
      triggerFrenzyTapAction(type, e.clientX || posX, e.clientY || posY);
    };

    token.addEventListener('pointerdown', handleTokenTap);
    token.addEventListener('click', handleTokenTap);

    frenzySpawnContainer.appendChild(token);

    setTimeout(() => {
      if (token.parentNode) token.remove();
    }, 2200);
  }

  function triggerFrenzyTapAction(type, clientX, clientY) {
    if (!frenzyActive) return;
    if (Date.now() < frenzyFrozenUntil) return;

    frenzyTotalTaps++;
    let delta = 1000;
    let popClass = 'pop-gain';
    let popText = '+$1,000';

    if (type === 'golden') {
      delta = 3000;
      popClass = 'pop-golden';
      popText = '+$3,000 👑';
      frenzyComboCount += 2;
      if (window.SoundManager) window.SoundManager.playFrenzyGolden();
      if (navigator.vibrate) navigator.vibrate([60, 40, 80]);
    } else if (type === 'toxic') {
      delta = -2500;
      popClass = 'pop-loss';
      popText = '-$2,500 💀';
      frenzyComboCount = 0;
      frenzyFrozenUntil = Date.now() + 600; // 0.6s freeze
      if (window.SoundManager) window.SoundManager.playFrenzyToxic();
      if (navigator.vibrate) navigator.vibrate([200, 100]);
      if (screenFrenzy) {
        screenFrenzy.classList.add('frenzy-shock-wave');
        setTimeout(() => screenFrenzy.classList.remove('frenzy-shock-wave'), 400);
      }
    } else {
      delta = 1000;
      frenzyComboCount++;
      if (window.SoundManager) window.SoundManager.playFrenzyCoin();
      if (navigator.vibrate) navigator.vibrate(25);
    }

    frenzyCashEarned += delta;

    if (frenzyLiveCash) {
      frenzyLiveCash.textContent = `${frenzyCashEarned >= 0 ? '+' : ''}$${frenzyCashEarned.toLocaleString()}`;
      frenzyLiveCash.style.color = frenzyCashEarned >= 0 ? '#10b981' : '#ef4444';
    }

    if (frenzyComboBadge) {
      if (frenzyComboCount >= 8) {
        frenzyComboBadge.classList.remove('hidden');
        frenzyComboBadge.textContent = `🔥 ${frenzyComboCount}X COMBO!`;
      } else {
        frenzyComboBadge.classList.add('hidden');
      }
    }

    // Spawn Floating Number Popup
    createFrenzyPopNum(popText, popClass, clientX, clientY);

    // Emit live tap to server
    socket.emit('player:frenzyTap', {
      roomCode: currentRoomCode,
      playerId: currentPlayerId,
      type
    });
  }

  function createFrenzyPopNum(text, className, x, y) {
    if (!screenFrenzy) return;
    const pop = document.createElement('div');
    pop.className = `frenzy-pop-num ${className}`;
    pop.textContent = text;
    
    const rect = screenFrenzy.getBoundingClientRect();
    const relX = (x || (rect.left + rect.width / 2)) - rect.left - 30;
    const relY = (y || (rect.top + rect.height / 2)) - rect.top - 20;

    pop.style.left = `${Math.max(10, relX)}px`;
    pop.style.top = `${Math.max(10, relY)}px`;

    screenFrenzy.appendChild(pop);

    setTimeout(() => {
      if (pop.parentNode) pop.remove();
    }, 750);
  }

  if (frenzyTapSurface) {
    frenzyTapSurface.addEventListener('pointerdown', (e) => {
      // Tap on empty space acts as standard cash bill tap
      if (e.target === frenzyTapSurface || e.target.closest('.frenzy-tap-pad-content')) {
        triggerFrenzyTapAction('cash', e.clientX, e.clientY);
      }
    });
  }

  socket.on('player:frenzyStarted', (data) => {
    startFrenzyMinigame(data);
  });

  socket.on('player:frenzyTapAck', (data) => {
    if (data && data.totalEarned !== undefined) {
      frenzyCashEarned = data.totalEarned;
      if (frenzyLiveCash) {
        frenzyLiveCash.textContent = `${frenzyCashEarned >= 0 ? '+' : ''}$${frenzyCashEarned.toLocaleString()}`;
      }
    }
  });

  socket.on('player:frenzyResolved', (data) => {
    frenzyActive = false;
    if (frenzyTimerInterval) clearInterval(frenzyTimerInterval);
    if (frenzySpawnInterval) clearInterval(frenzySpawnInterval);

    if (frenzyResultModal) {
      frenzyResultModal.classList.remove('hidden');
      const earned = data.cashEarned || 0;
      if (frenzyResDelta) {
        frenzyResDelta.textContent = `${earned >= 0 ? '+' : ''}$${earned.toLocaleString()}`;
        frenzyResDelta.className = earned >= 0 ? 'frenzy-res-delta text-emerald' : 'frenzy-res-delta text-coral';
      }
      if (frenzyResTaps) frenzyResTaps.textContent = data.totalTaps || frenzyTotalTaps;
      if (frenzyResNewCash) frenzyResNewCash.textContent = formatCash(data.newLiquidCash || liquidCash);

      if (earned > 0) {
        if (window.SoundManager) window.SoundManager.playCashUp();
        if (window.ConfettiCelebration) window.ConfettiCelebration.fire({ particleCount: 80, duration: 2500 });
      } else {
        if (window.SoundManager) window.SoundManager.playCashDown();
      }
    }

    if (data.newLiquidCash !== undefined) {
      liquidCash = data.newLiquidCash;
      updateHUD({ liquidCash });
    }
  });

  let isCustomAlloc = false;
  let customAmountValue = 0;

  // Allocation Amount Calculations & Validation
  function computeAllocationAmount() {
    if (isCustomAlloc) {
      return customAmountValue;
    }
    return Math.round(liquidCash * (allocationPercent / 100));
  }

  function validateAllocation() {
    const amount = computeAllocationAmount();
    if (allocAmountVal) {
      allocAmountVal.textContent = formatCash(amount);
    }

    let isValid = true;
    let warningMsg = '';

    if (liquidCash <= 0) {
      isValid = false;
      warningMsg = 'Insufficient liquid funds ($0 available). Existing investments maturing soon.';
    } else if (amount < 1000) {
      isValid = false;
      warningMsg = 'Minimum allocation is $1,000 to prevent portfolio clutter.';
    } else if (amount > liquidCash) {
      isValid = false;
      warningMsg = `Allocation (${formatCash(amount)}) exceeds available liquid cash (${formatCash(liquidCash)}).`;
    }

    if (allocValidationWarning) {
      if (!isValid && liquidCash > 0) {
        allocValidationWarning.classList.remove('hidden');
        if (allocWarningText) allocWarningText.textContent = warningMsg;
      } else {
        allocValidationWarning.classList.add('hidden');
      }
    }

    // Update disabled states on all option buttons
    const allBtns = playerOptionsList ? playerOptionsList.querySelectorAll('.btn-option') : [];
    allBtns.forEach(btn => {
      btn.disabled = !isValid || !!selectedOptionId;
    });
    if (btnQuickTrade) {
      btnQuickTrade.disabled = !isValid || !!selectedOptionId;
    }

    return { amount, isValid };
  }

  // Allocation Preset Buttons
  allocPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.SoundManager) window.SoundManager.playButtonTap();
      allocPresetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const pct = btn.dataset.pct;
      if (pct === 'custom') {
        isCustomAlloc = true;
        if (customAllocContainer) customAllocContainer.classList.remove('hidden');
        if (inputCustomAmount) {
          inputCustomAmount.focus();
          customAmountValue = Number(inputCustomAmount.value) || 1000;
        }
      } else {
        isCustomAlloc = false;
        if (customAllocContainer) customAllocContainer.classList.add('hidden');
        allocationPercent = Number(pct || 100);
      }
      validateAllocation();
    });
  });

  if (inputCustomAmount) {
    inputCustomAmount.addEventListener('input', (e) => {
      customAmountValue = Number(e.target.value) || 0;
      validateAllocation();
    });
  }

  let currentOpportunity = null;
  let sliderAllocationPct = 50;

  // Live Slider Quick Math Calculation Function
  function updateSliderMath() {
    if (!currentOpportunity) return;

    const opp = currentOpportunity;
    const allocPct = sliderAllocationPct;
    const investedAmt = Math.round(liquidCash * (allocPct / 100));
    const reserveAmt = liquidCash - investedAmt;

    const winPct = opp.win !== undefined ? opp.win : 25;
    const failPct = opp.fail !== undefined ? opp.fail : -10;

    const winDelta = Math.round(investedAmt * (winPct / 100));
    const winTotal = reserveAmt + investedAmt + winDelta;
    const lossDelta = Math.round(investedAmt * (Math.abs(failPct) / 100));
    const lossTotal = Math.max(0, reserveAmt + investedAmt - lossDelta);

    // Update Split Displays
    const sliderPctLabel = document.getElementById('slider-pct-label');
    const sliderInvestedVal = document.getElementById('slider-invested-val');
    const sliderInvestedSub = document.getElementById('slider-invested-sub');
    const sliderReserveVal = document.getElementById('slider-reserve-val');
    const sliderReserveSub = document.getElementById('slider-reserve-sub');
    const btnLockText = document.getElementById('btn-lock-slider-text');
    const btnLock = document.getElementById('btn-lock-slider-order');

    if (sliderPctLabel) sliderPctLabel.textContent = `${allocPct}%`;
    if (sliderInvestedVal) sliderInvestedVal.textContent = formatCash(investedAmt);
    if (sliderInvestedSub) sliderInvestedSub.textContent = `(${allocPct}% of your funds)`;
    if (sliderReserveVal) sliderReserveVal.textContent = formatCash(reserveAmt);
    if (sliderReserveSub) sliderReserveSub.textContent = `(${100 - allocPct}% kept safe)`;

    // Update Projections
    const mathWinPct = document.getElementById('math-win-pct-tag');
    const mathWinDelta = document.getElementById('math-win-delta');
    const mathWinTotal = document.getElementById('math-win-total');
    const mathFailPct = document.getElementById('math-fail-pct-tag');
    const mathLossDelta = document.getElementById('math-loss-delta');
    const mathLossTotal = document.getElementById('math-loss-total');

    if (mathWinPct) mathWinPct.textContent = `(+${winPct}%)`;
    if (mathWinDelta) mathWinDelta.textContent = `+${formatCash(winDelta)}`;
    if (mathWinTotal) mathWinTotal.textContent = formatCash(winTotal);

    if (mathFailPct) mathFailPct.textContent = `(${failPct >= 0 ? '+' + failPct : failPct}%)`;
    if (mathLossDelta) mathLossDelta.textContent = `-${formatCash(lossDelta)}`;
    if (mathLossTotal) mathLossTotal.textContent = formatCash(lossTotal);

    if (btnLockText) {
      if (allocPct === 0) {
        btnLockText.textContent = `🛡️ PASS & KEEP 100% IN BANK ($0 RISKED)`;
      } else if (allocPct === 100) {
        btnLockText.textContent = `🔥 ALL-IN: LOCK IN ${formatCash(investedAmt)} (100%)`;
      } else {
        btnLockText.textContent = `⚡ CONFIRM & LOCK IN ${formatCash(investedAmt)} (${allocPct}%)`;
      }
    }

    if (btnLock) {
      btnLock.disabled = liquidCash <= 0 || !!selectedOptionId;
    }
  }

  // Setup Money Slider Events
  const moneySliderInput = document.getElementById('input-money-slider');
  const sliderPresetBtns = document.querySelectorAll('.btn-slider-preset');

  let chosenAllocationPct = 100;

  function updateAllocationDisplay() {
    const allocPct = chosenAllocationPct;
    const investedAmt = Math.round(liquidCash * (allocPct / 100));

    // Update percentage chip active states
    const pctBtns = document.querySelectorAll('.btn-pct-chip');
    pctBtns.forEach(b => {
      if (Number(b.dataset.pct) === allocPct) b.classList.add('active');
      else b.classList.remove('active');
    });

    // Update bottom bar
    const bottomInvestedPct = document.getElementById('bottom-invested-pct');
    if (bottomInvestedPct) bottomInvestedPct.textContent = `${allocPct}%`;

    const bottomCashAmount = document.getElementById('bottom-cash-amount');
    if (bottomCashAmount) bottomCashAmount.textContent = formatCash(investedAmt);

    const btnLockText = document.getElementById('btn-lock-slider-text');
    if (btnLockText) {
      if (allocPct === 100) {
        btnLockText.textContent = `🔥 ALL-IN: LOCK IN ${formatCash(investedAmt)}`;
      } else {
        btnLockText.textContent = `⚡ LOCK IN ${formatCash(investedAmt)} (${allocPct}%)`;
      }
    }

    // Update outcome header on the current card
    if (currentOpportunity) {
      const opt = currentOpportunity;
      const winPct = Number(opt.win !== undefined ? opt.win : 20);
      const failPct = Number(opt.fail !== undefined ? opt.fail : -10);
      const winDollar = Math.round(investedAmt * (winPct / 100));
      const lossDollar = Math.round(investedAmt * (Math.abs(failPct) / 100));

      const cardWinVal = document.querySelector('.qc-outcome-col.win-col .qc-outcome-val');
      if (cardWinVal) {
        cardWinVal.innerHTML = `+${formatCash(winDollar)} <span class="qc-outcome-pct">(+${winPct}%)</span>`;
      }

      const cardLossVal = document.querySelector('.qc-outcome-col.loss-col .qc-outcome-val');
      if (cardLossVal) {
        cardLossVal.innerHTML = `-${formatCash(lossDollar)} <span class="qc-outcome-pct">(${failPct}%)</span>`;
      }
    }
  }

  // Percentage bar button events
  const pctButtons = document.querySelectorAll('.btn-pct-chip');
  pctButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.SoundManager) window.SoundManager.playButtonTap();
      chosenAllocationPct = Number(btn.dataset.pct || 100);
      updateAllocationDisplay();
    });
  });

  // Setup Order Lock-in Submission
  const btnLockSliderOrder = document.getElementById('btn-lock-slider-order');
  const handleOrderSubmission = (e) => {
    if (e) e.preventDefault();
    if (selectedOptionId) return;
    if (liquidCash <= 0) return;

    if (navigator.vibrate) navigator.vibrate(30);
    if (window.SoundManager) window.SoundManager.playButtonTap();

    const allocPct = chosenAllocationPct;
    const investedAmt = Math.round(liquidCash * (allocPct / 100));
    const oppId = currentOpportunity?.id || 'opportunity';

    selectedOptionId = oppId;
    if (btnLockSliderOrder) btnLockSliderOrder.disabled = true;

    socket.emit('player:submitChoice', {
      roomCode: currentRoomCode,
      playerId: playerUUID,
      optionId: oppId,
      allocationPct: allocPct,
      amount: investedAmt
    }, (res) => {
      if (res && res.success) {
        if (lockedChoiceName) lockedChoiceName.textContent = currentOpportunity?.name || 'Investment Deal';
        if (lockedChoiceAmount) {
          lockedChoiceAmount.textContent = `Allocated: ${formatCash(investedAmt)} (${allocPct}%)`;
        }
        showScreen(screenSubmitted);
      } else {
        selectedOptionId = null;
        if (btnLockSliderOrder) btnLockSliderOrder.disabled = false;
        console.warn('[Submission Error]', res?.error);
      }
    });
  };

  if (btnLockSliderOrder) {
    btnLockSliderOrder.addEventListener('click', handleOrderSubmission);
    btnLockSliderOrder.addEventListener('touchend', (e) => {
      handleOrderSubmission(e);
    }, { passive: false });
  }

  let activeDealIndex = 0;
  let cachedOptions = [];
  let currentLiveTimerSec = 80;

  // Single Card Carousel Renderer
  function renderSingleCard(idx) {
    if (!cachedOptions || cachedOptions.length === 0) return;
    activeDealIndex = (idx + cachedOptions.length) % cachedOptions.length;
    currentOpportunity = cachedOptions[activeDealIndex];

    const cardsContainer = document.getElementById('player-cards-container');
    const tabs = document.querySelectorAll('#deal-selector-tabs .deal-tab-btn');
    const dots = document.querySelectorAll('#deal-carousel-dots .carousel-dot');

    // Update Tab states
    tabs.forEach((tab, i) => {
      if (i === activeDealIndex) tab.classList.add('active');
      else tab.classList.remove('active');
    });

    // Update Dot states
    dots.forEach((dot, i) => {
      if (i === activeDealIndex) dot.classList.add('active');
      else dot.classList.remove('active');
    });

    const opt = currentOpportunity;
    const winPct = Number(opt.win !== undefined ? opt.win : 20);
    const failPct = Number(opt.fail !== undefined ? opt.fail : -10);
    const investedAmt = Math.round(liquidCash * (chosenAllocationPct / 100));
    const winDollar = Math.round(investedAmt * (winPct / 100));
    const lossDollar = Math.round(investedAmt * (Math.abs(failPct) / 100));

    const riskScore = Number(opt.riskScore) >= 1 ? Number(opt.riskScore) : (opt.riskTier === 'High Risk' ? 8 : opt.riskTier === 'Medium Risk' ? 5 : 2);
    let riskClass = 'risk-high';
    let riskLabelText = 'HIGH';
    let riskLabelColor = '#f87171';
    let riskSpriteName = 'skull';

    if (riskScore <= 3 || (opt.riskTier && opt.riskTier.toLowerCase().includes('safe'))) {
      riskClass = 'risk-safe'; riskLabelText = 'SAFE'; riskLabelColor = '#34d399'; riskSpriteName = 'shield';
    } else if (riskScore <= 6 || (opt.riskTier && opt.riskTier.toLowerCase().includes('medium'))) {
      riskClass = 'risk-medium'; riskLabelText = 'MED'; riskLabelColor = '#fbbf24'; riskSpriteName = 'scale';
    }

    const spriteSvg = window.PixelSprites ? window.PixelSprites.getSpriteSvg(riskSpriteName, 22) : '⚡';
    const cardImg = (opt.imageUrl && opt.imageUrl.trim()) ? opt.imageUrl.trim() : 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600';

    if (cardsContainer) {
      cardsContainer.innerHTML = '';
      const cardEl = document.createElement('div');
      cardEl.className = `qc-card ${riskClass} pixelated card-selected card-slide-in`;
      cardEl.dataset.optId = opt.id;

      cardEl.innerHTML = `
        <!-- Gold Corners (Rivets) -->
        <div class="qc-gold-corner top-left"></div>
        <div class="qc-gold-corner top-right"></div>
        <div class="qc-gold-corner bottom-left"></div>
        <div class="qc-gold-corner bottom-right"></div>

        <!-- Top Circular Badges -->
        <div class="qc-badge-circle top-left">${spriteSvg}</div>
        <div class="qc-badge-circle top-right-timer">
          <span class="qc-badge-text-timer card-timer-digits">${currentLiveTimerSec}s</span>
        </div>

        <!-- TOP MONEY OUTCOME BANNER (Clear Win / Lose Amounts) -->
        <div class="qc-outcome-header-bar">
          <div class="qc-outcome-col win-col">
            <span class="qc-outcome-icon">🟢</span>
            <div class="qc-outcome-text-group">
              <span class="qc-outcome-label lbl-win">WIN GET:</span>
              <strong class="qc-outcome-val text-emerald">+${formatCash(winDollar)} <span class="qc-outcome-pct">(+${winPct}%)</span></strong>
            </div>
          </div>
          <div class="qc-outcome-divider"></div>
          <div class="qc-outcome-col loss-col">
            <span class="qc-outcome-icon">🔴</span>
            <div class="qc-outcome-text-group">
              <span class="qc-outcome-label lbl-loss">FAIL LOSE:</span>
              <strong class="qc-outcome-val text-coral">-${formatCash(lossDollar)} <span class="qc-outcome-pct">(${failPct}%)</span></strong>
            </div>
          </div>
        </div>

        <!-- Title Ribbon Banner -->
        <div class="qc-title-ribbon">
          <span class="qc-industry-tag">${escapeHtml(opt.industry || opt.category || 'DEAL').toUpperCase()}</span>
          <h3 class="qc-business-name">${escapeHtml(opt.name)}</h3>
        </div>

        <!-- Central Art Frame -->
        <div class="qc-art-frame">
          <img class="qc-art-image" src="${cardImg}" alt="${escapeHtml(opt.name)}" onerror="this.src='https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600'">
          <div class="qc-art-scanline"></div>
        </div>

        <!-- Parchment Text Box -->
        <div class="qc-parchment-box">
          <p class="qc-description">${escapeHtml(opt.description || opt.shortDesc || '')}</p>
        </div>

        <!-- Bottom Circular Badges -->
        <div class="qc-badge-circle bottom-left">
          <span class="qc-badge-sublabel">RISK</span>
          <span class="qc-badge-text-risk" style="color: ${riskLabelColor}">${riskLabelText}</span>
        </div>
        <div class="qc-badge-circle bottom-right">
          <span class="qc-badge-sublabel">RETURN</span>
          <span class="qc-badge-text-return">+${winPct}% / ${failPct}%</span>
        </div>
      `;

      // Tap on card to submit directly
      cardEl.addEventListener('click', (e) => {
        handleOrderSubmission(e);
      });

      cardsContainer.appendChild(cardEl);
    }

    // Update Bottom Action Bar
    const bottomCashAmount = document.getElementById('bottom-cash-amount');
    if (bottomCashAmount) {
      bottomCashAmount.textContent = formatCash(liquidCash);
    }
    const btnLockText = document.getElementById('btn-lock-slider-text');
    if (btnLockText) {
      btnLockText.textContent = `⚡ LOCK IN ${escapeHtml(opt.name)}`;
    }
    if (btnLockSliderOrder) {
      btnLockSliderOrder.disabled = liquidCash <= 0 || !!selectedOptionId;
    }

    updateSliderMath();
  }

  // Decision UI & Countdown
  function renderDecisionScreen(options, endTimestamp, roundIndex, businessData) {
    if (decisionRoundTag) {
      decisionRoundTag.textContent = `ROUND ${roundIndex || 1} • 80S SPRINT`;
    }

    selectedOptionId = null;
    chosenAllocationPct = 100;

    const btnLock = document.getElementById('btn-lock-slider-order');
    if (btnLock) {
      btnLock.disabled = false;
    }

    updateAllocationDisplay();

    cachedOptions = (options && options.length > 0) ? options : [
      {
        id: 'r1_safe',
        name: '🏢 Metro Residential Apartments',
        industry: 'Real Estate',
        riskTier: 'Safe',
        riskScore: 2,
        win: 15,
        fail: -5,
        imageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400',
        description: 'Funding 150 apartment units next to a metro hub. Guaranteed steady rental yield.'
      },
      {
        id: 'r1_balanced',
        name: '☀️ Desert Solar Array',
        industry: 'Clean Energy',
        riskTier: 'Medium Risk',
        riskScore: 4,
        win: 35,
        fail: -15,
        imageUrl: 'https://images.unsplash.com/photo-1509391365360-2e959784a276?w=400',
        description: '15-year municipal clean power grid contract with stable feed-in tariffs.'
      },
      {
        id: 'r1_high',
        name: '🌾 AgTech Vertical Farms',
        industry: 'Deep Tech',
        riskTier: 'High Risk',
        riskScore: 8,
        win: 75,
        fail: -35,
        imageUrl: 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=400',
        description: 'AI-automated aeroponic food domes targeting high-margin export grocery chains.'
      }
    ];

    // Render the active single card (starting at deal 0)
    renderSingleCard(0);

    // Bind Carousel Arrow Controls
    const btnPrev = document.getElementById('btn-card-prev');
    const btnNext = document.getElementById('btn-card-next');

    if (btnPrev) {
      btnPrev.onclick = (e) => {
        e.preventDefault();
        if (window.SoundManager) window.SoundManager.playButtonTap();
        if (navigator.vibrate) navigator.vibrate(15);
        renderSingleCard(activeDealIndex - 1);
      };
    }

    if (btnNext) {
      btnNext.onclick = (e) => {
        e.preventDefault();
        if (window.SoundManager) window.SoundManager.playButtonTap();
        if (navigator.vibrate) navigator.vibrate(15);
        renderSingleCard(activeDealIndex + 1);
      };
    }

    // Bind Deal Tabs
    const tabs = document.querySelectorAll('#deal-selector-tabs .deal-tab-btn');
    tabs.forEach(tab => {
      tab.onclick = (e) => {
        e.preventDefault();
        const idx = Number(tab.dataset.idx || 0);
        if (window.SoundManager) window.SoundManager.playButtonTap();
        renderSingleCard(idx);
      };
    });

    // Bind Deal Dots
    const dots = document.querySelectorAll('#deal-carousel-dots .carousel-dot');
    dots.forEach(dot => {
      dot.onclick = (e) => {
        e.preventDefault();
        const idx = Number(dot.dataset.idx || 0);
        if (window.SoundManager) window.SoundManager.playButtonTap();
        renderSingleCard(idx);
      };
    });

    // Bind Touch Swiping on Card Viewport
    const cardsContainer = document.getElementById('player-cards-container');
    if (cardsContainer && !cardsContainer.dataset.touchBound) {
      cardsContainer.dataset.touchBound = 'true';
      let touchStartX = 0;
      let touchStartY = 0;

      cardsContainer.addEventListener('touchstart', (e) => {
        if (!e.touches || e.touches.length === 0) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }, { passive: true });

      cardsContainer.addEventListener('touchend', (e) => {
        if (!e.changedTouches || e.changedTouches.length === 0) return;
        const deltaX = e.changedTouches[0].clientX - touchStartX;
        const deltaY = e.changedTouches[0].clientY - touchStartY;

        // Ensure horizontal swipe
        if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY)) {
          if (deltaX < 0) {
            // Swiped Left -> Next Card
            if (window.SoundManager) window.SoundManager.playButtonTap();
            renderSingleCard(activeDealIndex + 1);
          } else {
            // Swiped Right -> Prev Card
            if (window.SoundManager) window.SoundManager.playButtonTap();
            renderSingleCard(activeDealIndex - 1);
          }
        }
      }, { passive: true });
    }

    const duration = 80000;
    startPlayerTimer(endTimestamp, duration);
    showScreen(screenDecision);
  }

  function startPlayerTimer(endTimestamp, totalDurationMs) {
    if (timerInterval) clearInterval(timerInterval);

    const totalDuration = totalDurationMs || 80000;
    let lastTickSec = null;
    const timerWrapper = document.getElementById('decision-timer-wrapper');

    const tick = () => {
      const effectiveNow = Date.now() + serverClockOffset;
      const remainingMs = Math.max(0, endTimestamp - effectiveNow);
      const remainingSec = Math.ceil(remainingMs / 1000);
      currentLiveTimerSec = remainingSec;

      if (decisionSeconds) {
        decisionSeconds.textContent = remainingSec;
        if (remainingSec <= 5) {
          if (timerWrapper) timerWrapper.classList.add('timer-panic');
          if (remainingSec !== lastTickSec && remainingSec > 0) {
            lastTickSec = remainingSec;
            if (navigator.vibrate) navigator.vibrate(25);
            if (window.SoundManager) window.SoundManager.playCountdownTick(remainingSec);
          }
        } else {
          if (timerWrapper) timerWrapper.classList.remove('timer-panic');
        }
      }

      // Sync all card timer badges
      const cardTimerEls = document.querySelectorAll('.card-timer-digits');
      cardTimerEls.forEach(el => {
        el.textContent = remainingSec + 's';
        el.style.color = remainingSec <= 5 ? '#ef4444' : '#fef08a';
      });

      if (decisionProgressFill) {
        const pct = (remainingMs / totalDuration) * 100;
        decisionProgressFill.style.width = `${pct}%`;
      }

      if (remainingMs <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        if (decisionSeconds) decisionSeconds.textContent = '0';
        if (timerWrapper) timerWrapper.classList.remove('timer-panic');
        // Grey out pixel cards on timeout
        const allCards = document.querySelectorAll('.qc-card');
        allCards.forEach(c => c.classList.add('disabled'));
      }
    };

    tick();
    timerInterval = setInterval(tick, 100);
  }

  function renderResultScreen(outcome) {
    updateHUD(outcome);

    const isPositive = outcome.deltaCash > 0;
    const isNegative = outcome.deltaCash < 0;
    const sign = isPositive ? '+' : (isNegative ? '-' : '');
    const absDelta = Math.abs(outcome.deltaCash);

    // Black Swan Shock Alert
    const shockBanner = document.getElementById('receipt-shock-banner');
    const shockTag = document.getElementById('receipt-shock-tag');
    if (shockBanner) {
      if (outcome.isBlackSwan) {
        shockBanner.classList.remove('hidden');
        if (shockTag) {
          shockTag.textContent = outcome.deltaCash > 0 ? '🌙 MOONSHOT BREAKOUT EVENT!' : '⚡ BLACK SWAN SHOCK COLLAPSE!';
        }
      } else {
        shockBanner.classList.add('hidden');
      }
    }

    // Screen Flash FX
    const flashEl = document.getElementById('screen-flash-fx');
    if (flashEl) {
      flashEl.className = isPositive ? 'screen-flash-fx flash-win' : (isNegative ? 'screen-flash-fx flash-loss' : 'screen-flash-fx');
      setTimeout(() => { flashEl.className = 'screen-flash-fx'; }, 300);
    }

    if (navigator.vibrate) {
      navigator.vibrate(outcome.isBlackSwan ? [100, 50, 100] : (isPositive ? [40, 60, 40] : [80]));
    }

    // Acoustic presentation
    if (window.SoundManager) {
      if (isPositive) window.SoundManager.playCashUp();
      else if (isNegative) window.SoundManager.playCashDown();
      else window.SoundManager.playRoundReveal();
    }

    if (resultDeltaVal) {
      resultDeltaVal.textContent = `${sign}${formatCash(absDelta)}`;
      resultDeltaVal.className = `delta-val ${isPositive ? 'gain' : (isNegative ? 'loss' : '')}`;
    }

    if (resultPctVal) {
      const pctSign = outcome.percentChange >= 0 ? '+' : '';
      resultPctVal.textContent = `(${pctSign}${outcome.percentChange.toFixed(1)}%)`;
      resultPctVal.className = `delta-pct ${isPositive ? 'gain' : (isNegative ? 'loss' : '')}`;
    }

    if (resultCashVal) {
      resultCashVal.textContent = formatCash(outcome.liquidCash);
    }

    if (resultSummaryText) {
      resultSummaryText.textContent = outcome.narrativeReceipt || outcome.outcomeSummary;
    }

    if (resultStatusBadge && outcome.roundIndex) {
      resultStatusBadge.textContent = `ROUND ${outcome.roundIndex} RESULT`;
    }

    showScreen(screenResult);
  }

  // Render Final 9:16 Social-Ready Scorecard
  function renderEndgameScorecard(data) {
    if (storyRoomCode) storyRoomCode.textContent = `ROOM ${data.roomCode || currentRoomCode || '----'}`;
    if (storyNickname) storyNickname.textContent = currentNickname || 'Trader';
    if (storyFinalTitle) storyFinalTitle.textContent = (data.finalTitle || currentTitle || 'THE INVESTOR').toUpperCase();
    if (storyNetworth) storyNetworth.textContent = formatCash(data.finalNetWorth || liquidCash);
    if (storyRank) storyRank.textContent = `#${data.finalRank || 1} / ${data.totalPlayers || 50}`;

    const tier = data.outcomeTier || { badge: '👑 MOGUL TIER', title: 'The Mogul', id: 'mogul' };
    if (storyTierBadge) {
      storyTierBadge.textContent = tier.badge || '👑 MOGUL TIER';
    }

    // Top-tier celebration confetti & fanfare
    const isTopTier = tier.id === 'mogul' || data.finalRank === 1 || (data.finalNetWorth || liquidCash) >= 150000;
    if (isTopTier) {
      if (window.ConfettiCelebration) {
        window.ConfettiCelebration.fire({ particleCount: 140, duration: 4000 });
      }
      if (window.SoundManager) {
        window.SoundManager.playCashUp();
      }
    } else if (window.SoundManager) {
      window.SoundManager.playRoundReveal();
    }

    if (storyQuote) {
      if (data.primaryDriverPunchline) {
        storyQuote.textContent = `"${data.primaryDriverPunchline}"`;
      } else if ((data.finalNetWorth || liquidCash) >= 150000) {
        storyQuote.textContent = '"High-conviction speculation. When the ledger closed, you dominated the market."';
      } else if ((data.finalNetWorth || liquidCash) >= 70000) {
        storyQuote.textContent = '"Strategic discipline. Balanced allocations kept your balance sheet resilient."';
      } else {
        storyQuote.textContent = '"Turbulent volatility. A tough lesson in market risk, but survived the floor."';
      }
    }

    showScreen(screenEndgame);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // Join Form Submit Handler (Audio Context Unlock on first tap)
  if (formJoin) {
    formJoin.addEventListener('submit', (e) => {
      e.preventDefault();
      if (window.SoundManager) {
        window.SoundManager.unlockAudioContext();
        window.SoundManager.playButtonTap();
      }
      if (joinError) joinError.classList.add('hidden');

      const code = (inputRoomCode ? inputRoomCode.value : '').toUpperCase().trim();
      const nick = (inputNickname ? inputNickname.value : '').trim();

      if (!code || !nick) return;

      btnJoin.disabled = true;

      socket.emit('player:join', {
        roomCode: code,
        playerId: playerUUID,
        nickname: nick
      }, (res) => {
        btnJoin.disabled = false;
        handleJoinResponse(res);
      });
    });
  }

})();
