// Host Screen Controller (Projector View)
(function() {
  'use strict';

  const socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000
  });

  // State
  let currentRoomCode = null;
  let currentHostToken = null;
  let currentMode = 'mode_1_sprint';
  let currentStatus = 'CREATE';
  let currentRoundIndex = 0;
  let totalPlayersCount = 0;
  let submittedCount = 0;
  let timerInterval = null;
  let serverClockOffset = 0; // One-time client/server clock offset in ms

  // DOM Elements
  const viewCreate = document.getElementById('view-create');
  const viewLobby = document.getElementById('view-lobby');
  const viewIntel = document.getElementById('view-intel');
  const viewRound = document.getElementById('view-round');
  const viewResolved = document.getElementById('view-resolved');
  const viewBomb = document.getElementById('view-bomb');
  const viewEndgame = document.getElementById('view-endgame');

  const btnCreateRoom = document.getElementById('btn-create-room');
  const selectGameMode = document.getElementById('select-game-mode');
  const lobbyModeBadge = document.getElementById('lobby-mode-badge');
  const btnStartRound1 = document.getElementById('btn-start-round-1');
  const btnNextRound = document.getElementById('btn-next-round');
  const btnNextRoundText = document.getElementById('btn-next-round-text');
  const btnLaunchBomb = document.getElementById('btn-launch-bomb');
  const btnRestartGame = document.getElementById('btn-restart-game');
  const createError = document.getElementById('create-error');

  // Bomb Arena DOM Elements
  const bombHostTimerDigits = document.getElementById('bomb-host-timer-digits');
  const bombHostTimerBar = document.getElementById('bomb-host-timer-bar');
  const bombHostActiveBombs = document.getElementById('bomb-host-active-bombs');
  const bombHostSafeTraders = document.getElementById('bomb-host-safe-traders');
  const bombHostPassCount = document.getElementById('bomb-host-pass-count');
  const bombFeedContent = document.getElementById('bomb-feed-content');
  const bombHostResolutionModal = document.getElementById('bomb-host-resolution-modal');
  const bombHostExplodedCount = document.getElementById('bomb-host-exploded-count');
  const bombHostSurvivedCount = document.getElementById('bomb-host-survived-count');
  const bombHostBurntTotal = document.getElementById('bomb-host-burnt-total');
  const bombHostVictimsList = document.getElementById('bomb-host-victims-list');
  const btnContinueAfterBomb = document.getElementById('btn-continue-after-bomb');
  const btnContinueAfterBombText = document.getElementById('btn-continue-after-bomb-text');
  let bombArenaTimerInterval = null;
  let bombHostLastTickMs = 0;

  // Custom Scenario Upload Elements
  const mode1ScenarioUploader = document.getElementById('mode1-scenario-uploader');
  const btnDownloadTemplate = document.getElementById('btn-download-template');
  const scenarioDropzone = document.getElementById('scenario-dropzone');
  const inputScenarioFile = document.getElementById('input-scenario-file');
  const scenarioPreviewCard = document.getElementById('scenario-preview-card');
  const previewScenarioName = document.getElementById('preview-scenario-name');
  const previewScenarioDesc = document.getElementById('preview-scenario-desc');
  const previewRoundsChip = document.getElementById('preview-rounds-chip');
  const previewStartChip = document.getElementById('preview-start-chip');
  const previewTargetChip = document.getElementById('preview-target-chip');
  const previewBusinessesList = document.getElementById('preview-businesses-list');
  const btnRemoveCustomScenario = document.getElementById('btn-remove-custom-scenario');
  const scenarioError = document.getElementById('scenario-error');

  const lobbyScenarioBanner = document.getElementById('lobby-scenario-banner');
  const lobbyScenarioNameText = document.getElementById('lobby-scenario-name-text');
  const btnLobbyChangeScenario = document.getElementById('btn-lobby-change-scenario');

  const btnPlayAgainCustom = document.getElementById('btn-play-again-custom');
  const btnNewRoom = document.getElementById('btn-new-room');

  // Modal Elements
  const modalUploadScenario = document.getElementById('modal-upload-scenario');
  const btnCloseScenarioModal = document.getElementById('btn-close-scenario-modal');
  const btnCancelModalScenario = document.getElementById('btn-cancel-modal-scenario');
  const modalScenarioDropzone = document.getElementById('modal-scenario-dropzone');
  const modalInputScenarioFile = document.getElementById('modal-input-scenario-file');
  const modalScenarioPreview = document.getElementById('modal-scenario-preview');
  const modalPreviewScenarioName = document.getElementById('modal-preview-scenario-name');
  const modalPreviewScenarioDesc = document.getElementById('modal-preview-scenario-desc');
  const modalPreviewRoundsChip = document.getElementById('modal-preview-rounds-chip');
  const modalPreviewStartChip = document.getElementById('modal-preview-start-chip');
  const modalPreviewTargetChip = document.getElementById('modal-preview-target-chip');
  const modalPreviewBusinessesList = document.getElementById('modal-preview-businesses-list');
  const modalScenarioError = document.getElementById('modal-scenario-error');
  const btnDownloadModalTemplate = document.getElementById('btn-download-modal-template');
  const btnApplyModalScenario = document.getElementById('btn-apply-modal-scenario');

  let loadedCustomScenarios = null;
  let modalStagedScenarios = null;
  let modalTargetContext = 'lobby'; // 'lobby' | 'replay'

  const headerStatusBadge = document.getElementById('room-status-badge');
  const headerStatusText = document.getElementById('header-status-text');
  const headerCodeContainer = document.getElementById('header-code-container');
  const headerRoomCode = document.getElementById('header-room-code');

  const lobbyRoomCode = document.getElementById('lobby-room-code');
  const lobbyPlayerCount = document.getElementById('lobby-player-count');
  const lobbyJoinFeed = document.getElementById('lobby-join-feed');
  const displayJoinUrl = document.getElementById('display-join-url');

  // Intel View Elements
  const intelRoundLabel = document.getElementById('intel-round-label');
  const intelTimerDigits = document.getElementById('intel-timer-digits');
  const intelTimerBar = document.getElementById('intel-timer-bar');
  const intelAvatar = document.getElementById('intel-avatar');
  const intelPersonaName = document.getElementById('intel-persona-name');
  const intelPersonaRole = document.getElementById('intel-persona-role');
  const intelHintStrength = document.getElementById('intel-hint-strength');
  const intelHeadlineText = document.getElementById('intel-headline-text');
  const intelBodyText = document.getElementById('intel-body-text');
  const intelSectorChips = document.getElementById('intel-sector-chips');
  const intelProbabilisticHint = document.getElementById('intel-probabilistic-hint');

  // Active Round Elements
  const activeRoundLabel = document.getElementById('active-round-label');
  const roundTimerDigits = document.getElementById('round-timer-digits');
  const roundTimerBar = document.getElementById('round-timer-bar');
  const roundSubmittedCount = document.getElementById('round-submitted-count');
  const roundTotalCount = document.getElementById('round-total-count');
  const roundPercentCount = document.getElementById('round-percent-count');
  const roundOptionsContainer = document.getElementById('round-options-container');

  // Resolution Elements
  const resolvedRoundTitle = document.getElementById('resolved-round-title');
  const spotlightContainer = document.getElementById('spotlight-container');
  const resolutionSplitBars = document.getElementById('resolution-split-bars');
  const wealthDistributionContainer = document.getElementById('wealth-distribution-container');
  const resolutionPodium = document.getElementById('resolution-podium');
  const resolutionInactionText = document.getElementById('resolution-inaction-text');

  // Endgame Elements
  const endgameTiersContainer = document.getElementById('endgame-tiers-container');
  const endgamePodiumContainer = document.getElementById('endgame-podium-container');

  function updateLobbyModeBadge() {
    if (lobbyModeBadge) {
      if (currentMode === 'mode_1_sprint') {
        lobbyModeBadge.textContent = '⚡ THE CASH SPRINT (TARGET: $500K)';
      } else {
        lobbyModeBadge.textContent = '🏛️ MACRO MARATHON (15 ROUNDS)';
      }
    }
  }

  // Format currency
  function formatCash(amount) {
    return '$' + Number(amount || 0).toLocaleString('en-US');
  }

  function formatShortCash(amount) {
    const num = Number(amount || 0);
    if (num >= 1000000) return '$' + (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return '$' + Math.round(num / 1000) + 'k';
    return '$' + num;
  }

  // Web Audio Heartbeat Sound Synthesizer (for last 3s tension)
  function playHeartbeatSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(80, ctx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 0.15);
      gain1.gain.setValueAtTime(0.7, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.16);

      setTimeout(() => {
        try {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(70, ctx.currentTime);
          osc2.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.15);
          gain2.gain.setValueAtTime(0.5, ctx.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start();
          osc2.stop(ctx.currentTime + 0.16);
        } catch (e) {}
      }, 120);
    } catch (err) {
      console.warn('Heartbeat audio synth error:', err);
    }
  }

  // ZONE 2: Horizontal Live Stock / Crypto Ticker Board
  function renderHostLiveLeaderboard(standings) {
    const lbList = document.getElementById('host-live-leaderboard-list');
    if (!lbList) return;
    if (!standings || standings.length === 0) {
      lbList.innerHTML = '<div class="lb-empty-placeholder">Waiting for traders to join...</div>';
      return;
    }

    lbList.innerHTML = '';
    const avatars = ['🦁', '🦊', '🦅', '🐺', '🐉', '🐯', '⚡', '🚀', '💎', '🎲'];

    standings.forEach((p, idx) => {
      const isLeader = (idx === 0);
      const item = document.createElement('div');
      item.className = `stock-trader-tile ${isLeader ? 'leader-golden-aura' : ''}`;
      
      const delta = p.deltaCash || 0;
      let streakHtml = `<span class="stock-delta-tag delta-neutral">― 0.0%</span>`;
      if (delta > 0) {
        streakHtml = `<span class="stock-delta-tag delta-up">▲ +${formatShortCash(delta)}</span>`;
      } else if (delta < 0) {
        streakHtml = `<span class="stock-delta-tag delta-down">▼ -${formatShortCash(Math.abs(delta))}</span>`;
      }

      // Wager Badge
      let wagerHtml = '<span class="stock-wager-pill wager-deciding">DECIDING...</span>';
      if (p.wagerPct !== null && p.wagerPct !== undefined) {
        const pct = Number(p.wagerPct);
        if (pct === 100) {
          wagerHtml = '<span class="stock-wager-pill wager-high">ALL-IN (100%)</span>';
        } else if (pct >= 50) {
          wagerHtml = `<span class="stock-wager-pill wager-med">Wagered: ${pct}%</span>`;
        } else if (pct > 0) {
          wagerHtml = `<span class="stock-wager-pill wager-safe">Wagered: ${pct}%</span>`;
        } else {
          wagerHtml = '<span class="stock-wager-pill wager-safe">0% (PASS)</span>';
        }
      }

      const avatar = avatars[idx % avatars.length];

      item.innerHTML = `
        <div class="stock-tile-top">
          <div class="stock-avatar-group">
            <div class="stock-avatar-icon">${avatar}</div>
            <div class="stock-name-rank">
              <span class="stock-player-name">${isLeader ? '👑 ' : ''}${escapeHtml(p.nickname || 'Trader')}</span>
              <span class="stock-player-rank">RANK #${idx + 1}</span>
            </div>
          </div>
          <div class="stock-wager-box">
            ${wagerHtml}
          </div>
        </div>
        <div class="stock-tile-bottom">
          <span class="stock-cash-val">${formatCash(p.liquidCash || p.netWorth || 0)}</span>
          ${streakHtml}
        </div>
      `;
      lbList.appendChild(item);
    });
  }

  // ZONE 3: Center Stage Moon Trajectory & 80% Emergency Screamer
  function renderHostMoonTracks(standings) {
    const tracksContainer = document.getElementById('host-moon-tracks-container');
    const moonWarningBanner = document.getElementById('moon-warning-banner');
    const moonWarningText = document.getElementById('moon-warning-text');
    if (!tracksContainer) return;

    if (!standings || standings.length === 0) {
      tracksContainer.innerHTML = '<div class="feed-placeholder">Trajectories syncing...</div>';
      if (moonWarningBanner) moonWarningBanner.style.display = 'none';
      return;
    }

    tracksContainer.innerHTML = '';
    const topPlayers = standings.slice(0, 6);
    let closeToMoonPlayer = null;

    topPlayers.forEach(p => {
      const cash = p.liquidCash || p.netWorth || 0;
      const pct = Math.min(100, Math.max(0, Math.round((cash / 500000) * 100)));
      if (cash >= 400000 && !closeToMoonPlayer) {
        closeToMoonPlayer = p;
      }

      const row = document.createElement('div');
      row.className = 'moon-track-row';
      row.innerHTML = `
        <span class="track-player-label" title="${escapeHtml(p.nickname)}">${escapeHtml(p.nickname || 'Trader')}</span>
        <div class="track-bar-wrapper">
          <div class="track-bar-fill" style="width: ${pct}%;">
            <span class="track-rocket-icon">🚀</span>
          </div>
        </div>
        <span class="track-cash-label">${formatShortCash(cash)}</span>
      `;
      tracksContainer.appendChild(row);
    });

    // Zone 3 Moon Alarm Screamer
    if (moonWarningBanner && moonWarningText) {
      if (closeToMoonPlayer) {
        moonWarningText.textContent = `${closeToMoonPlayer.nickname.toUpperCase()} IS CLOSE TO THE MOON! (${formatCash(closeToMoonPlayer.liquidCash)} / $500K)`;
        moonWarningBanner.style.display = 'flex';
      } else {
        moonWarningBanner.style.display = 'none';
      }
    }
  }

  // ZONE 4: Right Sidebar - Live SVG Donut Pie Chart & Crowd Sentiment
  function updateSentimentPie(sentiment) {
    if (!sentiment) return;

    const safePct = sentiment.safePct !== undefined ? sentiment.safePct : 0;
    const medPct = sentiment.medPct !== undefined ? sentiment.medPct : 0;
    const highPct = sentiment.highPct !== undefined ? sentiment.highPct : 0;

    const circumference = 376.99; // 2 * PI * 60
    const safeLen = (safePct / 100) * circumference;
    const medLen = (medPct / 100) * circumference;
    const highLen = (highPct / 100) * circumference;

    const segSafe = document.getElementById('pie-segment-safe');
    const segMed = document.getElementById('pie-segment-med');
    const segHigh = document.getElementById('pie-segment-high');

    if (segSafe) {
      segSafe.setAttribute('stroke-dasharray', `${safeLen} ${circumference}`);
      segSafe.setAttribute('stroke-dashoffset', '0');
    }
    if (segMed) {
      segMed.setAttribute('stroke-dasharray', `${medLen} ${circumference}`);
      segMed.setAttribute('stroke-dashoffset', `-${safeLen}`);
    }
    if (segHigh) {
      segHigh.setAttribute('stroke-dasharray', `${highLen} ${circumference}`);
      segHigh.setAttribute('stroke-dashoffset', `-${safeLen + medLen}`);
    }

    const txtSafe = document.getElementById('sentiment-safe-pct');
    const txtMed = document.getElementById('sentiment-med-pct');
    const txtHigh = document.getElementById('sentiment-high-pct');
    const barSafe = document.getElementById('sentiment-safe-bar');
    const barMed = document.getElementById('sentiment-med-bar');
    const barHigh = document.getElementById('sentiment-high-bar');

    if (txtSafe) txtSafe.textContent = `${safePct}%`;
    if (txtMed) txtMed.textContent = `${medPct}%`;
    if (txtHigh) txtHigh.textContent = `${highPct}%`;

    if (barSafe) barSafe.style.width = `${safePct}%`;
    if (barMed) barMed.style.width = `${medPct}%`;
    if (barHigh) barHigh.style.width = `${highPct}%`;

    const pieCount = document.getElementById('pie-center-count');
    const totalCap = document.getElementById('pulse-total-capital');
    const partRate = document.getElementById('pulse-participation-rate');

    if (pieCount) pieCount.textContent = `${sentiment.totalSubmitted || 0} LOCKED`;
    if (totalCap) totalCap.textContent = formatShortCash(sentiment.totalLockedCapital || 0);
    if (partRate && totalPlayersCount > 0) {
      const pPct = Math.round(((sentiment.totalSubmitted || 0) / totalPlayersCount) * 100);
      partRate.textContent = `${pPct}%`;
    }
  }

  // ZONE 5: Bottom Ticker - The Drama Feed
  function appendDramaTickerItem(text) {
    const tickerContent = document.getElementById('drama-ticker-content');
    if (!tickerContent || !text) return;

    const span = document.createElement('span');
    span.className = 'ticker-item';
    span.textContent = text;
    tickerContent.prepend(span);

    // Keep marquee fresh & manageable
    while (tickerContent.children.length > 8) {
      tickerContent.removeChild(tickerContent.lastChild);
    }
  }

  // Set Join URL in UI (Smart detection: public domain in cloud, Wi-Fi IP for local testing)
  if (displayJoinUrl) {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    displayJoinUrl.textContent = window.location.host;
    if (isLocal) {
      fetch('/api/info')
        .then(res => res.json())
        .then(data => {
          if (data && data.playerUrl) {
            displayJoinUrl.textContent = data.playerUrl.replace('http://', '');
          }
        })
        .catch(() => {});
    }
  }

  // View Switcher
  function showView(viewId) {
    document.querySelectorAll('.host-view').forEach(v => {
      v.classList.remove('active');
    });
    const target = document.getElementById(viewId);
    if (target) {
      target.classList.add('active');
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      try {
        target.scrollIntoView({ behavior: 'instant', block: 'start' });
      } catch (e) {}
    }

    // Toggle End Game Early Button visibility
    const btnEndGame = document.getElementById('btn-host-end-game');
    if (btnEndGame) {
      const activePhases = ['view-lobby', 'view-intel', 'view-round', 'view-resolved', 'view-bomb'];
      if (activePhases.includes(viewId)) {
        btnEndGame.classList.remove('hidden');
      } else {
        btnEndGame.classList.add('hidden');
      }
    }
  }

  function updateHeader(status, code) {
    if (code) {
      headerCodeContainer.classList.remove('hidden');
      headerRoomCode.textContent = code;
    }
    if (status) {
      headerStatusBadge.classList.remove('hidden');
      headerStatusText.textContent = status;
    }
  }

  // Check Session Storage for Reconnection
  function tryHostReconnect() {
    const savedCode = sessionStorage.getItem('rc_host_room');
    const savedToken = sessionStorage.getItem('rc_host_token');
    const savedMode = sessionStorage.getItem('rc_host_mode');
    if (savedMode) currentMode = savedMode;

    if (savedCode && savedToken) {
      console.log(`[Host] Attempting session restore for Room ${savedCode}...`);
      socket.emit('host:reconnect', { roomCode: savedCode, hostToken: savedToken }, (res) => {
        if (res && res.success) {
          currentRoomCode = res.roomCode;
          currentHostToken = savedToken;
          currentMode = res.mode || savedMode || 'mode_1_sprint';
          handleRestoreState(res);
        } else {
          console.warn('[Host] Reconnect failed, clearing session.');
          sessionStorage.removeItem('rc_host_room');
          sessionStorage.removeItem('rc_host_token');
          sessionStorage.removeItem('rc_host_mode');
          showView('view-create');
        }
      });
    }
  }

  function handleRestoreState(data) {
    if (data.serverTime) {
      serverClockOffset = data.serverTime - Date.now();
    }
    currentStatus = data.status;
    currentMode = data.mode || currentMode || 'mode_1_sprint';
    currentRoundIndex = data.roundIndex || 0;
    totalPlayersCount = data.playerCount || 0;
    submittedCount = data.submittedCount || 0;

    lobbyRoomCode.textContent = currentRoomCode;
    lobbyPlayerCount.textContent = totalPlayersCount;
    updateLobbyModeBadge();
    updateHeader(data.status, currentRoomCode);

    if (data.status === 'LOBBY') {
      showView('view-lobby');
    } else if (data.status === 'MARKET_INTEL') {
      showView('view-intel');
      renderIntelPhase(data.currentEvent, data.roundIndex, data.timerEnd);
    } else if (data.status === 'IN_ROUND') {
      showView('view-round');
      activeRoundLabel.textContent = `ROUND ${data.roundIndex}`;
      renderRoundOptions(data.roundOptions);
      updateSubmissionProgress(data.submittedCount, data.playerCount);
      const totalDur = currentMode === 'mode_1_sprint' ? 80000 : 25000;
      if (data.timerEnd) {
        startTimerCountdown(data.timerEnd, totalDur, roundTimerDigits, roundTimerBar);
      }
    } else if (data.status === 'RESOLVED') {
      showView('view-resolved');
      if (data.lastResolutionStats) {
        renderResolution(data.lastResolutionStats);
      }
    } else if (data.status === 'FINISHED') {
      showView('view-endgame');
      if (data.lastResolutionStats) {
        renderEndgame({
          roomCode: currentRoomCode,
          totalRounds: data.roundIndex,
          top3: data.lastResolutionStats.top3,
          tierDistribution: data.lastResolutionStats.tierDistribution || []
        });
      }
    }
  }

  // Socket Connection Events
  socket.on('connect', () => {
    console.log('[Host Socket] Connected to server.');
    tryHostReconnect();
  });

  socket.on('server:time', ({ serverTime }) => {
    if (serverTime) {
      serverClockOffset = serverTime - Date.now();
      console.log(`[Host] Clock offset synced: ${serverClockOffset}ms`);
    }
  });

  socket.on('host:roomCreated', (data) => {
    currentRoomCode = data.roomCode;
    currentHostToken = data.hostToken;

    sessionStorage.setItem('rc_host_room', data.roomCode);
    sessionStorage.setItem('rc_host_token', data.hostToken);

    lobbyRoomCode.textContent = data.roomCode;
    lobbyPlayerCount.textContent = '0';
    totalPlayersCount = 0;

    updateHeader('LOBBY', data.roomCode);
    showView('view-lobby');
  });

  socket.on('host:playerCountUpdate', (data) => {
    totalPlayersCount = data.count || 0;
    lobbyPlayerCount.textContent = totalPlayersCount;
    roundTotalCount.textContent = totalPlayersCount;

    const counterBox = document.getElementById('lobby-counter-box');
    if (counterBox) {
      counterBox.classList.remove('pulse-join');
      void counterBox.offsetWidth;
      counterBox.classList.add('pulse-join');
    }

    if (data.recentJoin) {
      addJoinFeedItem(data.recentJoin);
    }
  });

  // Server-Controlled Sub-Phase Broadcast
  socket.on('host:phaseChange', (data) => {
    handlePhaseChange(data);
  });

  socket.on('room:phaseChange', (data) => {
    handlePhaseChange(data);
  });

  function handlePhaseChange(data) {
    if (data.phase === 'MARKET_INTEL') {
      currentStatus = 'MARKET_INTEL';
      currentRoundIndex = data.roundIndex;
      updateHeader('MARKET INTEL', currentRoomCode);
      if (window.SoundManager) window.SoundManager.playNewsAlert();
      renderIntelPhase(data.event, data.roundIndex, data.endTimestamp);
      showView('view-intel');
    }
  }

  socket.on('host:roundStarted', (data) => {
    currentStatus = 'IN_ROUND';
    currentRoundIndex = data.roundIndex;
    activeRoundLabel.textContent = `ROUND ${data.roundIndex}`;
    totalPlayersCount = data.playerCount || totalPlayersCount;
    submittedCount = 0;

    if (viewRound) viewRound.classList.remove('screen-panic-red-pulse');

    updateHeader('MARKET OPEN', currentRoomCode);
    showView('view-round');
    renderRoundOptions(data.options);
    updateSubmissionProgress(0, totalPlayersCount);

    // Initial sentiment reset for the round
    updateSentimentPie({ safePct: 0, medPct: 0, highPct: 0, totalSubmitted: 0, totalLockedCapital: 0 });

    if (data.standings) {
      renderHostLiveLeaderboard(data.standings);
      renderHostMoonTracks(data.standings);
    }

    const durationMs = data.durationSeconds ? data.durationSeconds * 1000 : (currentMode === 'mode_1_sprint' ? 80000 : 25000);
    startTimerCountdown(data.endTimestamp, durationMs, roundTimerDigits, roundTimerBar);
  });

  socket.on('host:submissionUpdate', (data) => {
    submittedCount = data.submittedCount;
    totalPlayersCount = data.totalPlayers;
    updateSubmissionProgress(submittedCount, totalPlayersCount);

    if (data.standings) {
      renderHostLiveLeaderboard(data.standings);
      renderHostMoonTracks(data.standings);
    }
    if (data.sentiment) {
      updateSentimentPie(data.sentiment);
    }
    if (data.dramaEvent && data.dramaEvent.text) {
      appendDramaTickerItem(data.dramaEvent.text);
    }
  });

  socket.on('host:roundResolved', (data) => {
    currentStatus = 'RESOLVED';
    if (timerInterval) clearInterval(timerInterval);
    if (viewRound) viewRound.classList.remove('screen-panic-red-pulse');
    if (window.SoundManager) window.SoundManager.playRoundReveal();
    updateHeader('SETTLED', currentRoomCode);

    if (data.standings || data.top3) {
      renderHostLiveLeaderboard(data.standings || data.top3);
      renderHostMoonTracks(data.standings || data.top3);
    }

    if (data.dramaFeed && Array.isArray(data.dramaFeed)) {
      data.dramaFeed.forEach(msg => appendDramaTickerItem(msg));
    }

    renderResolution(data);
    showView('view-resolved');
  });

  socket.on('host:gameFinished', (data) => {
    currentStatus = 'FINISHED';
    if (timerInterval) clearInterval(timerInterval);
    if (window.ConfettiCelebration) {
      window.ConfettiCelebration.fire({ particleCount: 220, duration: 5500 });
    }
    if (window.SoundManager) window.SoundManager.playCashUp();
    updateHeader('GAME FINISHED', currentRoomCode);
    renderEndgame(data);
    showView('view-endgame');
  });

  socket.on('host:lobbyReady', (data) => {
    currentStatus = 'LOBBY';
    updateHeader('LOBBY', currentRoomCode);
    showView('view-lobby');
  });

  // -------------------------------------------------------------
  // LIQUIDITY BOMB (HOT POTATO) HOST HANDLERS
  // -------------------------------------------------------------

  function renderBombArena(data) {
    if (timerInterval) clearInterval(timerInterval);
    if (bombArenaTimerInterval) clearInterval(bombArenaTimerInterval);
    currentStatus = 'LIQUIDITY_BOMB';
    updateHeader('LIQUIDITY BOMB', currentRoomCode);

    if (bombHostActiveBombs) bombHostActiveBombs.textContent = data.totalBombs;
    if (bombHostSafeTraders) bombHostSafeTraders.textContent = Math.max(0, data.totalPlayers - data.totalBombs);
    if (bombHostPassCount) bombHostPassCount.textContent = '0';
    if (bombHostResolutionModal) bombHostResolutionModal.classList.add('hidden');

    if (bombFeedContent) {
      bombFeedContent.innerHTML = `<span class="ticker-item">🚨 Liquidity Bomb Protocol Activated! ${data.totalBombs} bombs armed across ${data.totalPlayers} traders!</span>`;
    }

    if (window.SoundManager) window.SoundManager.playNewsAlert();

    const endTimestamp = data.timerEnd || (Date.now() + 10000);
    const totalDuration = 10000;
    bombHostLastTickMs = 0;

    const tick = () => {
      const effectiveNow = Date.now() + serverClockOffset;
      const remainingMs = Math.max(0, endTimestamp - effectiveNow);
      const remainingSec = Math.ceil(remainingMs / 1000);

      if (bombHostTimerDigits) {
        bombHostTimerDigits.textContent = remainingSec;
        bombHostTimerDigits.style.color = remainingSec <= 3 ? '#ef4444' : '#f59e0b';
      }
      if (bombHostTimerBar) {
        const pct = (remainingMs / totalDuration) * 100;
        bombHostTimerBar.style.width = `${pct}%`;
      }

      // Audio Tempo Acceleration
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

      if (now - bombHostLastTickMs >= tickIntervalMs && remainingMs > 100) {
        bombHostLastTickMs = now;
        if (window.SoundManager) window.SoundManager.playBombTick(tempoMult);
      }

      if (remainingMs <= 0) {
        clearInterval(bombArenaTimerInterval);
        bombArenaTimerInterval = null;
        if (bombHostTimerDigits) bombHostTimerDigits.textContent = '0';
      }
    };

    tick();
    bombArenaTimerInterval = setInterval(tick, 60);

    showView('view-bomb');
  }

  function handleBombPassUpdate(data) {
    if (bombHostPassCount) bombHostPassCount.textContent = data.passCount;
    if (bombFeedContent) {
      const item = document.createElement('span');
      item.className = 'ticker-item';
      item.textContent = `💥 ${data.passer} tossed a bomb to ${data.receiver}!`;
      bombFeedContent.prepend(item);
    }
    if (window.SoundManager) window.SoundManager.playBombPass();
  }

  function renderBombDetonationResult(data) {
    if (bombArenaTimerInterval) clearInterval(bombArenaTimerInterval);
    if (window.SoundManager) window.SoundManager.playBombExplode();

    if (viewBomb) {
      viewBomb.classList.add('screen-panic-red-pulse');
      setTimeout(() => { if (viewBomb) viewBomb.classList.remove('screen-panic-red-pulse'); }, 600);
    }

    if (bombHostExplodedCount) bombHostExplodedCount.textContent = data.explodedCount;
    if (bombHostSurvivedCount) bombHostSurvivedCount.textContent = data.survivedCount;
    if (bombHostBurntTotal) bombHostBurntTotal.textContent = formatCash(data.totalBurntCash || 0);

    if (bombHostVictimsList) {
      bombHostVictimsList.innerHTML = '';
      if (data.explodedPlayers && data.explodedPlayers.length > 0) {
        data.explodedPlayers.forEach(p => {
          const chip = document.createElement('div');
          chip.className = 'victim-chip';
          chip.innerHTML = `
            <span class="victim-avatar">💥</span>
            <span class="victim-name">${escapeHtml(p.nickname)}</span>
            <span class="victim-loss text-coral">-$${(p.penalty || 10000).toLocaleString()}</span>
          `;
          bombHostVictimsList.appendChild(chip);
        });
      } else {
        bombHostVictimsList.innerHTML = '<div class="no-victims">Miracle on Wall Street! 0 traders caught in the explosion!</div>';
      }
    }

    if (btnContinueAfterBombText) {
      btnContinueAfterBombText.textContent = `CONTINUE TO ROUND ${data.nextRoundIndex || 1} 🚀`;
    }

    if (bombHostResolutionModal) {
      bombHostResolutionModal.classList.remove('hidden');
    }
  }

  socket.on('host:bombMinigameStarted', (data) => {
    renderBombArena(data);
  });

  socket.on('host:bombPassUpdate', (data) => {
    handleBombPassUpdate(data);
  });

  socket.on('host:bombResolved', (data) => {
    renderBombDetonationResult(data);
  });

  // UI Helper Functions
  function addJoinFeedItem(nickname) {
    if (!lobbyJoinFeed) return;
    const placeholder = lobbyJoinFeed.querySelector('.feed-placeholder');
    if (placeholder) placeholder.remove();

    const item = document.createElement('div');
    item.className = 'feed-item';
    item.textContent = `+ ${nickname} entered market`;
    lobbyJoinFeed.prepend(item);

    // Keep feed trimmed
    while (lobbyJoinFeed.children.length > 8) {
      lobbyJoinFeed.removeChild(lobbyJoinFeed.lastChild);
    }
  }

  function renderIntelPhase(eventData, roundIndex, endTimestamp) {
    if (intelRoundLabel) intelRoundLabel.textContent = `ROUND ${roundIndex}`;
    if (!eventData) return;

    if (intelAvatar) intelAvatar.textContent = eventData.persona?.avatar || '🏛️';
    if (intelPersonaName) intelPersonaName.textContent = eventData.persona?.name || 'Central Authority';
    if (intelPersonaRole) intelPersonaRole.textContent = eventData.persona?.role || 'Market Observer';

    if (intelHintStrength) {
      intelHintStrength.innerHTML = `<span class="strength-tag">CONFIDENCE: ${eventData.hintStrength || 'STRONG'}</span>`;
    }

    if (intelHeadlineText) intelHeadlineText.textContent = eventData.headlineText || 'MARKET VOLATILITY ANTICIPATED';
    if (intelBodyText) intelBodyText.textContent = eventData.bodyText || '';

    if (intelSectorChips) {
      intelSectorChips.innerHTML = '';
      const sectorNames = {
        agriculture: { label: 'Agriculture', class: 'chip-safe' },
        auto_parts: { label: 'Auto / Parts', class: 'chip-high' },
        biotechnology: { label: 'Biotechnology', class: 'chip-balanced' },
        business_products_services: { label: 'Business Services', class: 'chip-safe' },
        chemicals: { label: 'Chemicals', class: 'chip-high' },
        food_beverage: { label: 'Food & Beverage', class: 'chip-high' },
        education: { label: 'Education', class: 'chip-safe' },
        electronics: { label: 'Electronics', class: 'chip-safe' },
        gaming: { label: 'Gaming', class: 'chip-high' },
        health_beauty: { label: 'Health & Beauty', class: 'chip-safe' },
        crypto: { label: 'Crypto', class: 'chip-high' },
        quickTrade: { label: 'Overnight Liquidity', class: 'chip-balanced' },
        opt_safe: { label: 'Agriculture', class: 'chip-safe' },
        opt_balanced: { label: 'Biotechnology', class: 'chip-balanced' },
        opt_high: { label: 'Crypto', class: 'chip-high' }
      };

      (eventData.affectedSectorIds || []).forEach(secId => {
        const sec = sectorNames[secId] || { label: secId, class: 'chip-safe' };
        const iconSvg = window.LucideIcons ? window.LucideIcons.getSectorIcon(secId, { size: 15, className: 'chip-svg' }) : '';
        const chip = document.createElement('span');
        chip.className = `chip ${sec.class}`;
        chip.innerHTML = `${iconSvg} <span>${escapeHtml(sec.label)}</span>`;
        intelSectorChips.appendChild(chip);
      });
    }

    if (intelProbabilisticHint) {
      intelProbabilisticHint.textContent = `💡 ${eventData.probabilisticHint || 'Evaluate market fundamentals before allocating capital.'}`;
    }

    if (endTimestamp) {
      startTimerCountdown(endTimestamp, 10000, intelTimerDigits, intelTimerBar);
    }
  }

  function renderRoundOptions(options) {
    if (!roundOptionsContainer || !options) return;
    roundOptionsContainer.innerHTML = '';

    options.forEach(opt => {
      let cardClass = 'card-safe';
      let valClass = 'val-safe';
      let riskScore = opt.riskScore || '1/10';
      let winRate = opt.winRate || '100%';
      let riskLabel = '🟢 LOW RISK (SAFE ANCHOR)';

      if (opt.riskTier === 'high' || opt.id === 'opt_high') {
        cardClass = 'card-high';
        valClass = 'val-high';
        riskScore = opt.riskScore || '8/10';
        winRate = opt.winRate || '75%';
        riskLabel = '🔴 HIGH RISK';
      } else if (opt.riskTier === 'medium' || opt.id === 'opt_balanced') {
        cardClass = 'card-balanced';
        valClass = 'val-balanced';
        riskScore = opt.riskScore || '5/10';
        winRate = opt.winRate || '80%';
        riskLabel = '🟡 MEDIUM RISK';
      }

      const sectorIconSvg = window.LucideIcons ? window.LucideIcons.getSectorIcon(opt.id, { size: 22, className: 'host-opt-sector-svg' }) : '';
      const winPct = opt.win !== undefined ? opt.win : (opt.id === 'opt_high' ? 100 : opt.id === 'opt_balanced' ? 25 : 4);
      const failPct = opt.fail !== undefined ? opt.fail : (opt.id === 'opt_high' ? -60 : opt.id === 'opt_balanced' ? -10 : 4);
      const returnBadge = opt.badge || (failPct === winPct ? `+${winPct}% Guaranteed` : `+${winPct}% / ${failPct}%`);

      const card = document.createElement('div');
      card.className = `host-opt-card ${cardClass}`;
      card.innerHTML = `
        <div class="host-opt-header">
          <div class="host-opt-title-row">
            ${sectorIconSvg}
            <span class="host-opt-category">${riskLabel} • (Risk: ${riskScore} | Win: ${winRate})</span>
          </div>
          <h3 class="host-opt-name">${escapeHtml(opt.name)}</h3>
        </div>
        <p class="host-opt-desc">${escapeHtml(opt.shortDesc || opt.description || '')}</p>
        <div class="host-opt-footer">
          <span class="host-opt-ret-label">PAYOUT DYNAMICS</span>
          <span class="host-opt-ret-val ${valClass}">${returnBadge}</span>
        </div>
      `;
      roundOptionsContainer.appendChild(card);
    });
  }

  function updateSubmissionProgress(submitted, total) {
    roundSubmittedCount.textContent = submitted;
    roundTotalCount.textContent = total;
    const pct = total > 0 ? Math.round((submitted / total) * 100) : 0;
    roundPercentCount.textContent = `${pct}%`;
    const barFill = document.getElementById('submission-bar-fill');
    if (barFill) barFill.style.width = `${pct}%`;
  }

  function startTimerCountdown(endTimestamp, totalDurationMs, digitsEl, barEl) {
    if (timerInterval) clearInterval(timerInterval);

    const totalDuration = totalDurationMs || 15000;
    let lastTickSec = null;

    const tick = () => {
      const effectiveNow = Date.now() + serverClockOffset;
      const remainingMs = Math.max(0, endTimestamp - effectiveNow);
      const remainingSec = Math.ceil(remainingMs / 1000);

      if (digitsEl) {
        digitsEl.textContent = remainingSec;
        if (remainingSec <= 5) {
          if (remainingSec <= 3) {
            digitsEl.style.color = '#ef4444';
          } else {
            digitsEl.style.color = 'var(--gold)';
          }
          if (remainingSec !== lastTickSec && remainingSec > 0) {
            lastTickSec = remainingSec;
            if (window.SoundManager) window.SoundManager.playCountdownTick(remainingSec);
            if (remainingSec <= 3) {
              playHeartbeatSound();
            }
          }
        } else {
          digitsEl.style.color = 'var(--gold)';
        }
      }

      // Zone 1 Tension Red Pulse on screen
      if (viewRound) {
        if (remainingSec <= 3 && remainingSec > 0) {
          viewRound.classList.add('screen-panic-red-pulse');
        } else {
          viewRound.classList.remove('screen-panic-red-pulse');
        }
      }

      if (barEl) {
        const pct = (remainingMs / totalDuration) * 100;
        barEl.style.width = `${pct}%`;
      }

      if (remainingMs <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        if (digitsEl) digitsEl.textContent = '0';
        if (viewRound) viewRound.classList.remove('screen-panic-red-pulse');
      }
    };

    tick();
    timerInterval = setInterval(tick, 100);
  }

  let revealTimeoutId = null;

  function renderResolution(data) {
    if (!data) return;
    if (revealTimeoutId) clearTimeout(revealTimeoutId);

    if (resolvedRoundTitle) {
      resolvedRoundTitle.textContent = `ROUND ${data.roundIndex} MARKET SETTLEMENT`;
    }

    const isMode1 = (data.mode === 'mode_1_sprint' || currentMode === 'mode_1_sprint');
    const maxRounds = isMode1 ? 10 : 15;

    // Mode Tag & Goal Display
    const modeTag = document.getElementById('resolved-mode-tag');
    if (modeTag) {
      modeTag.textContent = isMode1 ? '⚡ SPRINT TARGET: $500,000' : '🏛️ MACRO MARATHON (15 RDS)';
    }

    // Toggle Bomb Mini-Game Trigger Button (Highlighted every 2 rounds)
    if (btnLaunchBomb) {
      if (!data.isGameOver && (data.roundIndex % 2 === 0 || data.roundIndex === 2 || data.roundIndex === 4 || data.roundIndex === 6 || data.roundIndex === 8)) {
        btnLaunchBomb.classList.remove('hidden');
      } else {
        btnLaunchBomb.classList.add('hidden');
      }
    }

    // Hide macro wealth quantiles in Mode 1
    const wealthCard = document.getElementById('wealth-dist-card');
    if (wealthCard) {
      if (isMode1) wealthCard.classList.add('hidden');
      else wealthCard.classList.remove('hidden');
    }

    const stageIndicator = document.getElementById('res-stage-indicator');
    const consensusHero = document.getElementById('res-consensus-hero');
    const consensusHeroTitle = document.getElementById('res-consensus-hero-title');
    const headlineCard = document.getElementById('resolved-breaking-headline');
    const headlineText = document.getElementById('resolved-headline-text');
    const breakingTag = document.getElementById('resolved-breaking-tag');

    // 2-STAGE DRAMATIC REVEAL FOR MODE 1
    if (isMode1 && data.percentages) {
      const pSafe = parseFloat(data.percentages.opt_safe) || 0;
      const pBal = parseFloat(data.percentages.opt_balanced) || 0;
      const pHigh = parseFloat(data.percentages.opt_high) || 0;

      let dominantName = 'THE ROCKET 🚀';
      let dominantPct = pHigh;
      if (pSafe >= pBal && pSafe >= pHigh) {
        dominantName = 'THE ANCHOR ⚓';
        dominantPct = pSafe;
      } else if (pBal >= pSafe && pBal >= pHigh) {
        dominantName = 'THE ENGINE ⚙️';
        dominantPct = pBal;
      }

      // STAGE A: THE CONSENSUS
      if (stageIndicator) {
        stageIndicator.innerHTML = '<span class="pulse-dot"></span> STAGE 1: THE CONSENSUS';
        stageIndicator.className = 'settle-tag stage-consensus';
      }
      if (consensusHero && consensusHeroTitle) {
        consensusHero.classList.remove('hidden');
        consensusHeroTitle.innerHTML = `📊 <strong>${dominantPct}%</strong> OF THE ROOM PILED INTO <strong>${dominantName}</strong>!`;
      }
      if (headlineCard) headlineCard.classList.add('hidden');

      // STAGE B: THE VERDICT (after 3 seconds)
      revealTimeoutId = setTimeout(() => {
        if (stageIndicator) {
          stageIndicator.innerHTML = '<span class="pulse-dot"></span> STAGE 2: THE VERDICT';
          stageIndicator.className = 'settle-tag stage-verdict';
        }
        if (headlineCard && headlineText) {
          headlineText.textContent = data.hostHeadline || 'MARKET ROUND RESOLVED';
          if (data.isBlackSwan) {
            if (breakingTag) breakingTag.textContent = '⚡ BLACK SWAN SHOCK EVENT TRIGGERED!';
            headlineCard.className = 'breaking-headline-card black-swan-shock';
            if (window.SoundManager) window.SoundManager.playNewsAlert();
          } else {
            if (breakingTag) breakingTag.textContent = '⚡ MARKET VERDICT // CLOSING PRICES';
            headlineCard.className = 'breaking-headline-card verdict-standard';
            if (window.SoundManager) window.SoundManager.playRoundReveal();
          }
          headlineCard.classList.remove('hidden');
        }
      }, 3000);

    } else {
      // Legacy 15-Round mode: Instant resolution
      if (consensusHero) consensusHero.classList.add('hidden');
      if (headlineCard && headlineText) {
        if (data.hostHeadline) {
          headlineText.textContent = data.hostHeadline;
          headlineCard.classList.remove('hidden');
        } else {
          headlineCard.classList.add('hidden');
        }
      }
    }

    // Sprint Target Reached Banner
    const sprintGoalBanner = document.getElementById('resolved-sprint-goal-banner');
    if (sprintGoalBanner) {
      if (data.winners && data.winners.length > 0) {
        const names = data.winners.map(w => `${w.nickname} (${formatCash(w.liquidCash)})`).join(', ');
        sprintGoalBanner.innerHTML = `🏆 <strong>TARGET MET!</strong> ${escapeHtml(names)} reached $500,000!`;
        sprintGoalBanner.classList.remove('hidden');
      } else {
        sprintGoalBanner.classList.add('hidden');
      }
    }

    if (btnNextRoundText) {
      if (data.isGameOver || data.roundIndex >= maxRounds) {
        btnNextRoundText.textContent = 'VIEW FINAL CHAMPIONSHIP RESULTS 🏆';
      } else {
        btnNextRoundText.textContent = `PROCEED TO ROUND ${data.roundIndex + 1} OF ${maxRounds} ⚡`;
      }
    }

    // 1. Render Oddest Decision Spotlight (or In-Universe Hive Mind Fallback)
    if (spotlightContainer) {
      if (data.outlierPlayer) {
        spotlightContainer.innerHTML = `
          <div class="spotlight-card">
            <div class="spotlight-left">
              <span class="spotlight-tag">ODDEST DECISION SPOTLIGHT</span>
              <span class="spotlight-text">
                Trader <span class="spotlight-highlight">${escapeHtml(data.outlierPlayer.nickname)}</span> was the sole contrarian taking <span class="spotlight-highlight">${escapeHtml(data.outlierPlayer.optionLabel)}</span>
              </span>
            </div>
            <span class="spotlight-uptake-badge">${data.outlierPlayer.percentage}% Room Uptake</span>
          </div>
        `;
      } else {
        spotlightContainer.innerHTML = `
          <div class="spotlight-fallback">
            <span class="fallback-dot"></span>
            <span>Market Consensus: the room moved as a hive mind this round.</span>
          </div>
        `;
      }
    }

    // 2. Render Sector Split Breakdown (Giant Neo-Brutalist Bars)
    if (resolutionSplitBars && data.percentages) {
      const safeLabel = isMode1 ? '⚓ Safe Anchor (Bonds)' : '🟢 Sovereign Bonds (+3%)';
      const balLabel = isMode1 ? '⚙️ Medium Risk (Partner/Supplier)' : '🟡 Logistics Fleet (+10%)';
      const rocketLabel = isMode1 ? '🚀 High Risk (Direct Equity)' : '🔴 Crypto Venture (+50% / -40%)';

      resolutionSplitBars.innerHTML = `
        <div class="split-row">
          <div class="split-labels">
            <span class="split-name">${safeLabel}</span>
            <strong class="split-pct text-emerald">${data.percentages.opt_safe}% (${data.counts.opt_safe || 0})</strong>
          </div>
          <div class="split-bar-track">
            <div class="split-bar-fill bar-safe" style="width: ${data.percentages.opt_safe}%;"></div>
          </div>
        </div>

        <div class="split-row">
          <div class="split-labels">
            <span class="split-name">${balLabel}</span>
            <strong class="split-pct text-gold">${data.percentages.opt_balanced}% (${data.counts.opt_balanced || 0})</strong>
          </div>
          <div class="split-bar-track">
            <div class="split-bar-fill bar-balanced" style="width: ${data.percentages.opt_balanced}%;"></div>
          </div>
        </div>

        <div class="split-row">
          <div class="split-labels">
            <span class="split-name">${rocketLabel}</span>
            <strong class="split-pct text-coral">${data.percentages.opt_high}% (${data.counts.opt_high || 0})</strong>
          </div>
          <div class="split-bar-track">
            <div class="split-bar-fill bar-rocket" style="width: ${data.percentages.opt_high}%;"></div>
          </div>
        </div>
      `;
    }

    // 3. Render Inactivity Tax notice
    if (resolutionInactionText) {
      const inact = data.counts.inactive || 0;
      resolutionInactionText.textContent = `${inact} investor${inact === 1 ? '' : 's'} timed out and received Safe Anchor with a 3.0% inactivity tax.`;
    }

    // 4. Render Live Wealth Distribution (Only in 15-Round Marathon)
    if (wealthDistributionContainer && data.wealthDistribution && !isMode1) {
      wealthDistributionContainer.innerHTML = '';
      data.wealthDistribution.forEach(bucket => {
        const row = document.createElement('div');
        row.className = 'wealth-bar-row';
        row.innerHTML = `
          <span class="wealth-bar-label">${escapeHtml(bucket.label)}</span>
          <div class="wealth-track-wrapper">
            <div class="wealth-fill" style="width: ${bucket.percentage}%;"></div>
          </div>
          <span class="wealth-bar-stat">${bucket.percentage}% (${bucket.count})</span>
        `;
        wealthDistributionContainer.appendChild(row);
      });
    }

    // 5. Render Top Leaders with Animated $500k Progress Bars
    if (resolutionPodium && data.top3) {
      resolutionPodium.innerHTML = '';
      const badges = ['gold', 'silver', 'bronze', 'runner', 'runner'];
      const medals = ['1', '2', '3', '4', '5'];

      data.top3.forEach((player, idx) => {
        const row = document.createElement('div');
        row.className = `podium-row rank-${idx + 1}`;
        const tiedBadgeHtml = player.isTied ? `<span class="tied-badge">TIED</span>` : '';
        const titleText = player.currentTitle || 'Investor';
        const playerCashVal = player.liquidCash || player.netWorth || 0;
        const pctToGoal = Math.min(100, Math.max(0, Math.round((playerCashVal / 500000) * 100)));

        row.innerHTML = `
          <div class="podium-left">
            <div class="podium-badge ${badges[idx] || 'bronze'}">#${medals[idx] || idx + 1}</div>
            <div class="podium-name-group">
              <div class="podium-name-row">
                <span class="podium-name">${escapeHtml(player.nickname)}</span>
                ${tiedBadgeHtml}
                <span class="podium-title-tag">${escapeHtml(titleText)}</span>
              </div>
              ${isMode1 ? `
                <div class="podium-goal-track">
                  <div class="podium-goal-fill" style="width: ${pctToGoal}%;"></div>
                </div>
              ` : ''}
            </div>
          </div>
          <div class="podium-cash-group">
            <span class="podium-cash ${playerCashVal >= 500000 ? 'text-gold' : 'text-emerald'}">${formatCash(playerCashVal)}</span>
            ${isMode1 ? `<span class="podium-goal-pct">${pctToGoal}% of $500k</span>` : ''}
          </div>
        `;
        resolutionPodium.appendChild(row);
      });

      if (data.top3.length === 0) {
        resolutionPodium.innerHTML = '<div class="feed-placeholder">No investor records available.</div>';
      }
    }

    if (btnNextRoundText) {
      if (data.isGameOver) {
        btnNextRoundText.textContent = 'VIEW FINAL RESULTS 🏆';
      } else if (data.roundIndex === 3 || data.roundIndex === 7) {
        btnNextRoundText.textContent = 'START LIQUIDITY BOMB 💣 (MINIGAME)';
      } else {
        btnNextRoundText.textContent = `START ROUND ${data.roundIndex + 1} 🚀`;
      }
    }
  }

  function renderEndgame(data) {
    if (!data) return;

    const endgameHeroTag = document.getElementById('endgame-hero-tag');
    const endgameSubtitleText = document.getElementById('endgame-subtitle-text');
    const endgameTiersContainer = document.getElementById('endgame-tiers-container');
    const endgamePodiumContainer = document.getElementById('endgame-podium-container');
    const endgameTradersCountBadge = document.getElementById('endgame-traders-count-badge');
    const endgameFullLeaderboardBody = document.getElementById('endgame-full-leaderboard-body');

    // Dynamic Header
    if (endgameHeroTag) {
      if (data.isEarlyEnd) {
        endgameHeroTag.textContent = `⏹️ TERMINATED EARLY (ROUND ${data.totalRounds || 1})`;
        endgameHeroTag.className = 'hero-tag tag-early-finish';
      } else {
        endgameHeroTag.textContent = `🎉 ALL ${data.totalRounds || 10} ROUNDS COMPLETED`;
        endgameHeroTag.className = 'hero-tag tag-standard-finish';
      }
    }

    if (endgameSubtitleText) {
      endgameSubtitleText.textContent = data.isEarlyEnd
        ? 'The host called an early market close. Final audited net worths and room rankings are locked.'
        : 'The market floor is officially closed! Here is the final wealth and tier distribution of the hall.';
    }

    // 1. Render Outcome Tier Cards (from data/endings.json)
    if (endgameTiersContainer && data.tierDistribution) {
      endgameTiersContainer.innerHTML = '';
      data.tierDistribution.forEach(tier => {
        const card = document.createElement('div');
        card.className = `tier-card ${tier.themeClass || ''}`;
        card.innerHTML = `
          <div class="tier-card-top">
            <div class="tier-badge">${escapeHtml(tier.badge || tier.title)}</div>
            <h3 class="tier-title">${escapeHtml(tier.title)}</h3>
            <p class="tier-desc">${escapeHtml(tier.description)}</p>
          </div>
          <div class="tier-stats-row">
            <span class="tier-count-val">${tier.count || 0} Traders</span>
            <span class="tier-pct-val">${tier.percentage || '0.0'}% OF ROOM</span>
          </div>
        `;
        endgameTiersContainer.appendChild(card);
      });
    }

    // 2. Render Final Champion Podium (Top 3)
    if (endgamePodiumContainer && data.top3) {
      endgamePodiumContainer.innerHTML = '';
      const badges = ['gold', 'silver', 'bronze'];
      const medals = ['1', '2', '3'];

      data.top3.forEach((player, idx) => {
        const row = document.createElement('div');
        row.className = `podium-row rank-${idx + 1}`;
        const tiedBadgeHtml = player.isTied ? `<span class="tied-badge">TIED</span>` : '';
        const titleText = player.currentTitle || 'Investor';

        row.innerHTML = `
          <div class="podium-left">
            <div class="podium-badge ${badges[idx] || 'bronze'}">#${medals[idx] || idx + 1}</div>
            <div class="podium-name-group">
              <div class="podium-name-row">
                <span class="podium-name">${escapeHtml(player.nickname)}</span>
                ${tiedBadgeHtml}
              </div>
              <span class="podium-title-tag">FINAL TITLE: ${escapeHtml(titleText)}</span>
            </div>
          </div>
          <div class="podium-cash text-gold">${formatCash(player.liquidCash || player.netWorth)}</div>
        `;
        endgamePodiumContainer.appendChild(row);
      });
    }

    // 3. Render Full Room Leaderboard Table
    const fullList = data.fullLeaderboard || data.top3 || [];
    if (endgameTradersCountBadge) {
      endgameTradersCountBadge.textContent = `${fullList.length} TOTAL TRADERS`;
    }

    if (endgameFullLeaderboardBody) {
      endgameFullLeaderboardBody.innerHTML = '';
      fullList.forEach((player, idx) => {
        const tr = document.createElement('tr');
        const rank = player.rank || idx + 1;
        let medalBadge = `<span class="table-rank-num">#${rank}</span>`;
        if (rank === 1) medalBadge = `<span class="table-medal gold">🥇 #1</span>`;
        else if (rank === 2) medalBadge = `<span class="table-medal silver">🥈 #2</span>`;
        else if (rank === 3) medalBadge = `<span class="table-medal bronze">🥉 #3</span>`;

        const netVal = player.netWorth !== undefined ? player.netWorth : (player.liquidCash || 0);
        const roiVal = player.returnPct !== undefined ? player.returnPct : (((netVal - 100000) / 100000) * 100).toFixed(1);
        const isPosRoi = Number(roiVal) >= 0;

        tr.className = rank <= 3 ? `tr-top rank-row-${rank}` : 'tr-standard';
        tr.innerHTML = `
          <td class="td-rank">${medalBadge}</td>
          <td class="td-trader">
            <span class="trader-name-bold">${escapeHtml(player.nickname)}</span>
          </td>
          <td class="td-title">
            <span class="trader-title-chip">${escapeHtml(player.currentTitle || player.title || 'Investor')}</span>
          </td>
          <td class="td-worth ${netVal >= 100000 ? 'text-emerald' : 'text-coral'}">
            <strong>${formatCash(netVal)}</strong>
          </td>
          <td class="td-roi ${isPosRoi ? 'text-emerald' : 'text-coral'}">
            ${isPosRoi ? '+' : ''}${roiVal}%
          </td>
        `;
        endgameFullLeaderboardBody.appendChild(tr);
      });

      if (fullList.length === 0) {
        endgameFullLeaderboardBody.innerHTML = `
          <tr><td colspan="5" class="table-empty-cell">No trader records found.</td></tr>
        `;
      }
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // =============================================================
  // CUSTOM SCENARIO PARSING, VALIDATION & TEMPLATE DOWNLOADS
  // =============================================================

  function validateScenarioJson(jsonStrOrObj) {
    let data = jsonStrOrObj;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(jsonStrOrObj);
      } catch (err) {
        return { valid: false, error: `Invalid JSON syntax: ${err.message}` };
      }
    }
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Custom scenario must be a JSON object.' };
    }
    if (!Array.isArray(data.rounds) || data.rounds.length === 0) {
      return { valid: false, error: 'Custom scenario must contain a non-empty "rounds" array.' };
    }

    for (let i = 0; i < data.rounds.length; i++) {
      const r = data.rounds[i];
      const rNum = r.round || (i + 1);
      if (!r.business || !r.business.name || typeof r.business.name !== 'string' || !r.business.name.trim()) {
        return { valid: false, error: `Round ${rNum} is missing "business.name".` };
      }
      if (!Array.isArray(r.options) || r.options.length === 0) {
        return { valid: false, error: `Round ${rNum} must have at least one option in "options".` };
      }
    }

    return { valid: true, data };
  }

  function renderScenarioPreview(data, isModal = false) {
    const nameEl = isModal ? modalPreviewScenarioName : previewScenarioName;
    const descEl = isModal ? modalPreviewScenarioDesc : previewScenarioDesc;
    const rChip = isModal ? modalPreviewRoundsChip : previewRoundsChip;
    const sChip = isModal ? modalPreviewStartChip : previewStartChip;
    const tChip = isModal ? modalPreviewTargetChip : previewTargetChip;
    const listEl = isModal ? modalPreviewBusinessesList : previewBusinessesList;
    const cardEl = isModal ? modalScenarioPreview : scenarioPreviewCard;
    const errEl = isModal ? modalScenarioError : scenarioError;

    if (errEl) errEl.classList.add('hidden');
    if (cardEl) cardEl.classList.remove('hidden');

    if (nameEl) nameEl.textContent = data.name || 'Custom Business Spotlight';
    if (descEl) descEl.textContent = data.description || `Custom ${data.rounds.length}-Round scenario deck loaded.`;
    if (rChip) rChip.textContent = `📊 ${data.rounds.length} Rounds`;
    if (sChip) sChip.textContent = `💵 Starting: ${formatCash(data.startingCapital || 100000)}`;
    if (tChip) tChip.textContent = `🎯 Target: ${formatCash(data.targetCapital || 500000)}`;

    if (listEl) {
      listEl.innerHTML = '';
      data.rounds.forEach((r, idx) => {
        const item = document.createElement('div');
        item.className = 'biz-pill';
        const b = r.business || {};
        item.innerHTML = `
          <span class="biz-num">#${r.round || idx + 1}</span>
          <span class="biz-name">${escapeHtml(b.name || 'Business')}</span>
          <span class="biz-tagline">${escapeHtml(b.industry || b.tagline || '')}</span>
        `;
        listEl.appendChild(item);
      });
    }

    if (isModal && btnApplyModalScenario) {
      btnApplyModalScenario.disabled = false;
    }
  }

  function handleFileSelected(file, isModal = false) {
    const errEl = isModal ? modalScenarioError : scenarioError;
    const cardEl = isModal ? modalScenarioPreview : scenarioPreviewCard;

    if (!file) return;
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      if (errEl) {
        errEl.textContent = 'Please select a valid .json scenario file.';
        errEl.classList.remove('hidden');
      }
      if (cardEl) cardEl.classList.add('hidden');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const res = validateScenarioJson(e.target.result);
      if (!res.valid) {
        if (errEl) {
          errEl.textContent = `Validation Error: ${res.error}`;
          errEl.classList.remove('hidden');
        }
        if (cardEl) cardEl.classList.add('hidden');
        if (isModal && btnApplyModalScenario) btnApplyModalScenario.disabled = true;
      } else {
        if (isModal) {
          modalStagedScenarios = res.data;
        } else {
          loadedCustomScenarios = res.data;
        }
        renderScenarioPreview(res.data, isModal);
      }
    };
    reader.onerror = () => {
      if (errEl) {
        errEl.textContent = 'Failed to read file from disk.';
        errEl.classList.remove('hidden');
      }
    };
    reader.readAsText(file);
  }

  function triggerTemplateDownload() {
    fetch('/api/template/mode1')
      .then(res => {
        if (!res.ok) throw new Error('API download response not OK');
        return res.blob();
      })
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mode1_custom_scenario_template.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(err => {
        console.warn('Direct fetch download fallback:', err);
        window.open('/api/template/mode1', '_blank');
      });
  }

  // Setup Dropzone
  function setupDropzone(dropzoneEl, fileInputEl, isModal = false) {
    if (!dropzoneEl || !fileInputEl) return;

    dropzoneEl.addEventListener('click', (e) => {
      if (e.target !== fileInputEl) fileInputEl.click();
    });

    fileInputEl.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFileSelected(e.target.files[0], isModal);
      }
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzoneEl.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzoneEl.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzoneEl.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzoneEl.classList.remove('dragover');
      });
    });

    dropzoneEl.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files[0]) {
        handleFileSelected(dt.files[0], isModal);
      }
    });
  }

  setupDropzone(scenarioDropzone, inputScenarioFile, false);
  setupDropzone(modalScenarioDropzone, modalInputScenarioFile, true);

  if (btnDownloadTemplate) {
    btnDownloadTemplate.addEventListener('click', (e) => {
      e.preventDefault();
      triggerTemplateDownload();
    });
  }

  if (btnDownloadModalTemplate) {
    btnDownloadModalTemplate.addEventListener('click', (e) => {
      e.preventDefault();
      triggerTemplateDownload();
    });
  }

  if (btnRemoveCustomScenario) {
    btnRemoveCustomScenario.addEventListener('click', () => {
      loadedCustomScenarios = null;
      if (inputScenarioFile) inputScenarioFile.value = '';
      if (scenarioPreviewCard) scenarioPreviewCard.classList.add('hidden');
      if (scenarioError) scenarioError.classList.add('hidden');
    });
  }

  // Toggle Scenario Uploader based on Mode dropdown
  if (selectGameMode) {
    selectGameMode.addEventListener('change', () => {
      if (mode1ScenarioUploader) {
        if (selectGameMode.value === 'mode_1_sprint') {
          mode1ScenarioUploader.classList.remove('hidden');
        } else {
          mode1ScenarioUploader.classList.add('hidden');
        }
      }
    });
  }

  // Modal Controls
  function openScenarioModal(context = 'lobby') {
    modalTargetContext = context;
    modalStagedScenarios = null;
    if (modalScenarioPreview) modalScenarioPreview.classList.add('hidden');
    if (modalScenarioError) modalScenarioError.classList.add('hidden');
    if (modalInputScenarioFile) modalInputScenarioFile.value = '';
    if (btnApplyModalScenario) btnApplyModalScenario.disabled = true;

    if (modalUploadScenario) {
      modalUploadScenario.classList.remove('hidden');
    }
  }

  function closeScenarioModal() {
    if (modalUploadScenario) {
      modalUploadScenario.classList.add('hidden');
    }
  }

  if (btnCloseScenarioModal) btnCloseScenarioModal.addEventListener('click', closeScenarioModal);
  if (btnCancelModalScenario) btnCancelModalScenario.addEventListener('click', closeScenarioModal);
  if (btnLobbyChangeScenario) btnLobbyChangeScenario.addEventListener('click', () => openScenarioModal('lobby'));
  if (btnPlayAgainCustom) btnPlayAgainCustom.addEventListener('click', () => openScenarioModal('replay'));

  if (btnApplyModalScenario) {
    btnApplyModalScenario.addEventListener('click', () => {
      if (!modalStagedScenarios) return;
      btnApplyModalScenario.disabled = true;

      if (modalTargetContext === 'lobby') {
        socket.emit('host:uploadCustomScenarios', {
          roomCode: currentRoomCode,
          hostToken: currentHostToken,
          customScenarios: modalStagedScenarios
        }, (res) => {
          btnApplyModalScenario.disabled = false;
          if (res && res.success) {
            closeScenarioModal();
            if (lobbyScenarioNameText) {
              lobbyScenarioNameText.textContent = `Custom: ${res.scenarioName} (${res.roundsCount} Rds)`;
            }
          } else {
            if (modalScenarioError) {
              modalScenarioError.textContent = res ? res.error : 'Failed to apply custom scenario.';
              modalScenarioError.classList.remove('hidden');
            }
          }
        });
      } else if (modalTargetContext === 'replay') {
        socket.emit('host:resetSession', {
          roomCode: currentRoomCode,
          hostToken: currentHostToken,
          customScenarios: modalStagedScenarios
        }, (res) => {
          btnApplyModalScenario.disabled = false;
          if (res && res.success) {
            closeScenarioModal();
            showView('view-lobby');
          } else {
            if (modalScenarioError) {
              modalScenarioError.textContent = res ? res.error : 'Failed to replay with custom scenario.';
              modalScenarioError.classList.remove('hidden');
            }
          }
        });
      }
    });
  }

  // Socket updates for custom scenario
  socket.on('host:customScenariosUpdated', (data) => {
    if (lobbyScenarioNameText) {
      lobbyScenarioNameText.textContent = `Custom: ${data.scenarioName} (${data.roundsCount} Rds)`;
    }
  });

  socket.on('host:sessionReset', (data) => {
    totalPlayersCount = data.playerCount || 0;
    lobbyPlayerCount.textContent = totalPlayersCount;
    if (data.customScenarios && lobbyScenarioNameText) {
      lobbyScenarioNameText.textContent = `Custom: ${data.customScenarios.name} (${data.customScenarios.roundsCount} Rds)`;
    } else if (lobbyScenarioNameText) {
      lobbyScenarioNameText.textContent = 'Default: The Business Spotlight (10 Rds)';
    }
    updateHeader('LOBBY', currentRoomCode);
    showView('view-lobby');
  });

  // Socket room created scenario info
  socket.on('host:roomCreated', (data) => {
    currentRoomCode = data.roomCode;
    currentHostToken = data.hostToken;

    sessionStorage.setItem('rc_host_room', data.roomCode);
    sessionStorage.setItem('rc_host_token', data.hostToken);

    lobbyRoomCode.textContent = data.roomCode;
    lobbyPlayerCount.textContent = '0';
    totalPlayersCount = 0;

    if (data.customScenarios && lobbyScenarioNameText) {
      lobbyScenarioNameText.textContent = `Custom: ${data.customScenarios.name} (${data.customScenarios.roundsCount} Rds)`;
    } else if (lobbyScenarioNameText) {
      lobbyScenarioNameText.textContent = 'Default: The Business Spotlight (10 Rds)';
    }

    updateHeader('LOBBY', data.roomCode);
    showView('view-lobby');
  });

  // -------------------------------------------------------------
  // 5 CURATED SCENARIO SETS (50 DEALS TOTAL) LOGIC
  // -------------------------------------------------------------
  let selectedScenarioSetIndex = 1;

  // Create screen set card click
  const createSetCards = document.querySelectorAll('#create-sets-grid .set-card-btn');
  createSetCards.forEach(card => {
    card.addEventListener('click', () => {
      createSetCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      selectedScenarioSetIndex = Number(card.dataset.set) || 1;
      if (window.SoundManager) window.SoundManager.playButtonTap();
    });
  });

  // Lobby screen quick set pill click
  const lobbySetBtns = document.querySelectorAll('#lobby-sets-bar .btn-lobby-set');
  lobbySetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const setNum = Number(btn.dataset.set) || 1;
      selectedScenarioSetIndex = setNum;
      lobbySetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (window.SoundManager) window.SoundManager.playButtonTap();

      if (currentRoomCode && currentHostToken) {
        socket.emit('host:selectScenarioSet', {
          roomCode: currentRoomCode,
          hostToken: currentHostToken,
          setIndex: setNum
        });
      }
    });
  });

  socket.on('host:setUpdated', (data) => {
    selectedScenarioSetIndex = data.selectedSet || 1;
    if (lobbyScenarioNameText) {
      lobbyScenarioNameText.textContent = `${data.scenarioName} (10 Deals)`;
    }
    lobbySetBtns.forEach(btn => {
      const setNum = Number(btn.dataset.set) || 1;
      if (setNum === selectedScenarioSetIndex) btn.classList.add('active');
      else btn.classList.remove('active');
    });
  });

  // -------------------------------------------------------------
  // HOST END GAME EARLY LOGIC
  // -------------------------------------------------------------
  const btnHostEndGame = document.getElementById('btn-host-end-game');
  const btnResolvedEndGame = document.getElementById('btn-resolved-end-game');
  const modalEndGameEarly = document.getElementById('modal-end-game-early');
  const btnCloseEndGameModal = document.getElementById('btn-close-endgame-modal');
  const btnCancelEndGame = document.getElementById('btn-cancel-end-game');
  const btnConfirmEndGame = document.getElementById('btn-confirm-end-game');

  function openEndGameModal() {
    if (window.SoundManager) window.SoundManager.playButtonTap();
    if (modalEndGameEarly) {
      modalEndGameEarly.classList.remove('hidden');
      modalEndGameEarly.style.display = 'flex';
    }
  }

  function closeEndGameModal() {
    if (modalEndGameEarly) {
      modalEndGameEarly.classList.add('hidden');
      modalEndGameEarly.style.display = 'none';
    }
  }

  if (btnHostEndGame) {
    btnHostEndGame.addEventListener('click', openEndGameModal);
  }

  if (btnResolvedEndGame) {
    btnResolvedEndGame.addEventListener('click', openEndGameModal);
  }

  if (btnCloseEndGameModal) {
    btnCloseEndGameModal.addEventListener('click', closeEndGameModal);
  }

  if (btnCancelEndGame) {
    btnCancelEndGame.addEventListener('click', closeEndGameModal);
  }

  if (btnConfirmEndGame) {
    btnConfirmEndGame.addEventListener('click', () => {
      const code = currentRoomCode || sessionStorage.getItem('rc_host_room');
      const token = currentHostToken || sessionStorage.getItem('rc_host_token');
      if (!code || !token) {
        console.warn('[Host End Game] Missing room code or host token.');
        closeEndGameModal();
        return;
      }
      btnConfirmEndGame.disabled = true;
      closeEndGameModal();
      if (window.SoundManager) window.SoundManager.playButtonTap();
      socket.emit('host:endGameEarly', {
        roomCode: code,
        hostToken: token
      }, (res) => {
        btnConfirmEndGame.disabled = false;
        console.log('[Host] Early end game acknowledged:', res);
      });
    });
  }

  // Event Listeners
  if (btnCreateRoom) {
    btnCreateRoom.addEventListener('click', () => {
      btnCreateRoom.disabled = true;
      const selectedMode = selectGameMode ? selectGameMode.value : 'mode_1_sprint';
      const scenarioPayload = (selectedMode === 'mode_1_sprint' && loadedCustomScenarios) ? loadedCustomScenarios : null;

      socket.emit('host:createRoom', {
        mode: selectedMode,
        customScenarios: scenarioPayload,
        scenarioSet: selectedScenarioSetIndex
      }, (res) => {
        btnCreateRoom.disabled = false;
        if (!res || !res.success) {
          createError.textContent = (res && res.error) ? res.error : 'Failed to create room. Please try again.';
          createError.classList.remove('hidden');
        }
      });
    });
  }

  if (btnStartRound1) {
    btnStartRound1.addEventListener('click', () => {
      if (!currentRoomCode || !currentHostToken) return;
      socket.emit('host:startRound', {
        roomCode: currentRoomCode,
        hostToken: currentHostToken
      });
    });
  }

  if (btnNextRound) {
    btnNextRound.addEventListener('click', () => {
      if (!currentRoomCode || !currentHostToken) return;
      socket.emit('host:nextRound', {
        roomCode: currentRoomCode,
        hostToken: currentHostToken
      });
    });
  }

  if (btnLaunchBomb) {
    btnLaunchBomb.addEventListener('click', () => {
      if (!currentRoomCode || !currentHostToken) return;
      socket.emit('host:startBombMinigame', {
        roomCode: currentRoomCode,
        hostToken: currentHostToken
      });
    });
  }

  if (btnContinueAfterBomb) {
    btnContinueAfterBomb.addEventListener('click', () => {
      if (!currentRoomCode || !currentHostToken) return;
      socket.emit('host:continueAfterBomb', {
        roomCode: currentRoomCode,
        hostToken: currentHostToken
      });
    });
  }

  // Endgame Flow: Play Again with current scenario
  if (btnRestartGame) {
    btnRestartGame.addEventListener('click', () => {
      if (!currentRoomCode || !currentHostToken) return;
      socket.emit('host:resetSession', {
        roomCode: currentRoomCode,
        hostToken: currentHostToken
      }, (res) => {
        if (res && res.success) {
          showView('view-lobby');
        }
      });
    });
  }

  // Endgame Flow: Create New Room from scratch
  if (btnNewRoom) {
    btnNewRoom.addEventListener('click', () => {
      sessionStorage.removeItem('rc_host_room');
      sessionStorage.removeItem('rc_host_token');
      sessionStorage.removeItem('rc_host_mode');
      showView('view-create');
    });
  }

})();

