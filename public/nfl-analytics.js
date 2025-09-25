/*
 * Advanced NFL analytics and table rendering for the betting dashboard
 *
 * This module computes several professional betting metrics for each NFL game
 * loaded via the existing `/api/games` endpoint and renders a dedicated
 * "NFL Advanced" table. It adds signals like STEAM (large line moves),
 * REVERSE (line moves opposite the initial favorite direction) and ARB
 * (arbitrage opportunities) along with calculated metrics such as the
 * closing line value (CLV), profit margins for arbitrage and best available
 * moneyline odds.
 */

// Convert American moneyline odds to decimal odds
function moneylineToDecimal(ml) {
  const odds = Number(ml);
  if (!Number.isFinite(odds)) return null;
  // Positive odds: (odds/100) + 1; Negative odds: (100/abs(odds)) + 1
  return odds > 0 ? (odds / 100) + 1 : (100 / Math.abs(odds)) + 1;
}

// Compute derived metrics and betting signals for a list of games
function computeNFLMetrics(games) {
  return games.map(game => {
    const openingSpread = toNumber(game.openingSpread);
    const spread = toNumber(game.spread);
    const homeML = toNumber(game.homeMoneyline);
    const awayML = toNumber(game.awayMoneyline);

    // Difference between current and opening spread
    const lineMove = (spread !== null && openingSpread !== null)
      ? spread - openingSpread
      : null;
    // Steam: absolute line move ≥ 2.5 points
    const isSteam = lineMove !== null && Math.abs(lineMove) >= 2.5;
    // Reverse line movement: line moves opposite the direction of the initial favorite
    let isReverse = false;
    if (openingSpread !== null && spread !== null) {
      // Favorite team has negative spread; reverse if it becomes less negative (closer to zero) or crosses zero
      if (openingSpread < 0 && spread > openingSpread) isReverse = true;
      // Underdog (positive spread) becomes more negative than before
      if (openingSpread > 0 && spread < openingSpread) isReverse = true;
    }
    // Arbitrage margin: if implied probabilities sum to less than 1
    let arbProfit = null;
    if (homeML !== null && awayML !== null) {
      const homeDec = moneylineToDecimal(homeML);
      const awayDec = moneylineToDecimal(awayML);
      if (homeDec && awayDec) {
        const invSum = (1 / homeDec) + (1 / awayDec);
        if (invSum < 1) {
          arbProfit = ((1 - invSum) * 100);
        }
      }
    }
    // Closing line value (CLV): difference between closing and opening spread. A positive CLV
    // indicates you beat the closing line (better number than the market).
    const clv = lineMove !== null ? (-lineMove) : null;
    // Collate signals
    const signals = [];
    if (isSteam) signals.push('STEAM');
    if (isReverse) signals.push('REVERSE');
    if (arbProfit !== null) signals.push('ARB');
    return {
      ...game,
      lineMove,
      isSteam,
      isReverse,
      arbProfit,
      clv,
      signals
    };
  });
}

// Determine the better moneyline (higher payout) between two sides
function computeBestOdds(game) {
  const homeML = toNumber(game.homeMoneyline);
  const awayML = toNumber(game.awayMoneyline);
  if (homeML === null || awayML === null) return null;
  // For moneyline odds, pick the larger decimal odds (better payout)
  const homeDec = moneylineToDecimal(homeML);
  const awayDec = moneylineToDecimal(awayML);
  return (homeDec > awayDec ? homeML : awayML);
}

// Render the NFL advanced table into the DOM
function renderNflAdvancedTable(games) {
  const tbody = document.getElementById('nfl-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  games.forEach(game => {
    const tr = document.createElement('tr');
    const date = (game.startDate || '').split('T')[0];
    const bestOdds = computeBestOdds(game);
    tr.innerHTML = `
      <td>${game.season ?? '—'}</td>
      <td>${game.week ?? '—'}</td>
      <td>${date || '—'}</td>
      <td>${game.homeTeam || '—'} vs ${game.awayTeam || '—'}</td>
      <td>${game.spread !== null ? game.spread : '—'} (<small>${game.openingSpread !== null ? game.openingSpread : '—'}</small>)</td>
      <td>${game.signals.length ? game.signals.join(', ') : '—'}</td>
      <td>${bestOdds !== null ? bestOdds : '—'}</td>
      <td>${game.lineMove !== null ? game.lineMove.toFixed(1) : '—'}</td>
      <td>${game.arbProfit !== null ? game.arbProfit.toFixed(2) + '%' : '—'}</td>
      <td>${game.clv !== null ? game.clv.toFixed(1) : '—'}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Render the entire NFL Advanced tab when NFL data is active
function renderNflAdvancedTab() {
  // Only render if NFL is the current sport
  if (CURRENT_SPORT !== 'nfl') return;
  const games = ALL_GAMES.filter(g => g.sport === 'nfl');
  const metrics = computeNFLMetrics(games);
  renderNflAdvancedTable(metrics);
}

// Extend existing renderAllTabs to include our NFL tab
const _origRenderAllTabs = typeof renderAllTabs === 'function' ? renderAllTabs : null;
function renderAllTabsWrapper() {
  if (_origRenderAllTabs) _origRenderAllTabs();
  renderNflAdvancedTab();
}
// If renderAllTabs exists, replace it with our wrapper. Otherwise, set it.
if (typeof renderAllTabs !== 'undefined') {
  renderAllTabs = renderAllTabsWrapper;
} else {
  renderAllTabs = renderAllTabsWrapper;
}