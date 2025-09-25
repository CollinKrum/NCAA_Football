/*
 * NFL analytics module for the betting dashboard
 *
 * Enriches raw NFL games with market movement metrics sourced from the
 * historical odds workbook (moneyline, spread, and total open/min/max/close).
 * It surfaces steam moves, reverse line movement, arbitrage margin, implied
 * probability shifts, and volatility scores, then renders the advanced NFL
 * table on the dashboard.
 */

// Convert American moneyline odds to decimal odds
function moneylineToDecimal(ml) {
  const odds = Number(ml);
  if (!Number.isFinite(odds)) return null;
  return odds > 0 ? (odds / 100) + 1 : (100 / Math.abs(odds)) + 1;
}

function impliedProbabilityFromMoneyline(ml) {
  const odds = Number(ml);
  if (!Number.isFinite(odds)) return null;
  if (odds > 0) return 100 / (odds + 100);
  const abs = Math.abs(odds);
  return abs / (abs + 100);
}

function selectBestMoneyline(candidates = []) {
  let bestValue = null;
  let bestDecimal = null;
  candidates.forEach(candidate => {
    const value = toNumber(candidate);
    if (value === null) return;
    const decimal = moneylineToDecimal(value);
    if (!decimal) return;
    if (bestDecimal === null || decimal > bestDecimal) {
      bestDecimal = decimal;
      bestValue = value;
    }
  });
  return { value: bestValue, decimal: bestDecimal };
}

function formatOdds(ml) {
  const value = Number(ml);
  if (!Number.isFinite(value)) return '—';
  if (Number.isInteger(value)) return value > 0 ? `+${value}` : `${value}`;
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function formatOddsWithDecimal(ml, decimalOdds) {
  const odds = formatOdds(ml);
  if (odds === '—') return '—';
  if (!Number.isFinite(decimalOdds)) return odds;
  return `${odds} (${decimalOdds.toFixed(2)}x)`;
}

function formatNumber(value, digits = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return num.toFixed(digits);
}

function formatSigned(value, digits = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  const fixed = num.toFixed(digits);
  return num > 0 ? `+${fixed}` : fixed;
}

function formatRange(min, max, digits = 1) {
  const minNum = Number(min);
  const maxNum = Number(max);
  if (!Number.isFinite(minNum) || !Number.isFinite(maxNum)) return '—';
  return `${minNum.toFixed(digits)} to ${maxNum.toFixed(digits)}`;
}

function formatProbShift(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return '';
  const fixed = num.toFixed(1);
  const sign = num > 0 ? '+' : '';
  return ` (${sign}${fixed} pp)`;
}

// Compute derived metrics and betting signals for a list of games
function computeNFLMetrics(games) {
  return games.map(game => {
    const spreadHistory = (game.spreadHistory && game.spreadHistory.home) || {};
    const totalHistory = game.totalHistory || {};
    const homeMoneylineHistory = (game.moneylineHistory && game.moneylineHistory.home) || {};
    const awayMoneylineHistory = (game.moneylineHistory && game.moneylineHistory.away) || {};
    const spreadOddsHistory = (game.spreadOddsHistory && game.spreadOddsHistory.home) || {};
    const totalOverHistory = game.totalOverOddsHistory || {};
    const totalUnderHistory = game.totalUnderOddsHistory || {};

    const spreadOpen = toNumber(spreadHistory.open ?? game.openingSpread);
    const spreadClose = toNumber(spreadHistory.close ?? game.spread);
    const spreadMin = toNumber(spreadHistory.min);
    const spreadMax = toNumber(spreadHistory.max);

    const totalOpen = toNumber(totalHistory.open ?? game.openingOverUnder);
    const totalClose = toNumber(totalHistory.close ?? game.overUnder);
    const totalMin = toNumber(totalHistory.min);
    const totalMax = toNumber(totalHistory.max);

    const homeMlOpen = toNumber(homeMoneylineHistory.open ?? game.homeMoneylineOpen);
    const homeMlClose = toNumber(homeMoneylineHistory.close ?? game.homeMoneyline);
    const homeMlMin = toNumber(homeMoneylineHistory.min ?? game.homeMoneylineMin);
    const homeMlMax = toNumber(homeMoneylineHistory.max ?? game.homeMoneylineMax);

    const awayMlOpen = toNumber(awayMoneylineHistory.open ?? game.awayMoneylineOpen);
    const awayMlClose = toNumber(awayMoneylineHistory.close ?? game.awayMoneyline);
    const awayMlMin = toNumber(awayMoneylineHistory.min ?? game.awayMoneylineMin);
    const awayMlMax = toNumber(awayMoneylineHistory.max ?? game.awayMoneylineMax);

    const spreadOddsOpen = toNumber(spreadOddsHistory.open ?? game.homeLineOddsOpen);
    const spreadOddsClose = toNumber(spreadOddsHistory.close ?? game.homeLineOddsClose);

    const totalOverOpen = toNumber(totalOverHistory.open ?? game.totalScoreOverOpen);
    const totalOverClose = toNumber(totalOverHistory.close ?? game.totalScoreOverClose);
    const totalUnderOpen = toNumber(totalUnderHistory.open ?? game.totalScoreUnderOpen);
    const totalUnderClose = toNumber(totalUnderHistory.close ?? game.totalScoreUnderClose);

    const lineMove = (spreadClose !== null && spreadOpen !== null)
      ? spreadClose - spreadOpen
      : null;
    const totalMove = (totalClose !== null && totalOpen !== null)
      ? totalClose - totalOpen
      : null;
    const spreadRange = (spreadMin !== null && spreadMax !== null)
      ? spreadMax - spreadMin
      : null;
    const totalRange = (totalMin !== null && totalMax !== null)
      ? totalMax - totalMin
      : null;

    const clv = lineMove !== null ? (-lineMove) : null;

    const signals = [];
    if (lineMove !== null && Math.abs(lineMove) >= 2.5) signals.push('SPREAD STEAM');

    let isReverse = false;
    if (spreadOpen !== null && spreadClose !== null) {
      if (spreadOpen < 0 && spreadClose > spreadOpen) isReverse = true;
      if (spreadOpen > 0 && spreadClose < spreadOpen) isReverse = true;
    }
    if (isReverse) signals.push('REVERSE');

    if (totalMove !== null && Math.abs(totalMove) >= 2) signals.push('TOTAL STEAM');

    const homeProbOpen = impliedProbabilityFromMoneyline(homeMlOpen);
    const homeProbClose = impliedProbabilityFromMoneyline(homeMlClose);
    const awayProbOpen = impliedProbabilityFromMoneyline(awayMlOpen);
    const awayProbClose = impliedProbabilityFromMoneyline(awayMlClose);

    const homeProbShift = (homeProbOpen !== null && homeProbClose !== null)
      ? (homeProbClose - homeProbOpen) * 100
      : null;
    const awayProbShift = (awayProbOpen !== null && awayProbClose !== null)
      ? (awayProbClose - awayProbOpen) * 100
      : null;

    const homeProbabilityShift = homeProbShift ?? null;
    const awayProbabilityShift = awayProbShift ?? null;

    const maxProbShift = Math.max(
      Math.abs(homeProbShift ?? 0),
      Math.abs(awayProbShift ?? 0)
    );
    if (Number.isFinite(maxProbShift) && maxProbShift >= 5) signals.push('ML STEAM');

    const bestHome = selectBestMoneyline([homeMlOpen, homeMlClose, homeMlMin, homeMlMax]);
    const bestAway = selectBestMoneyline([awayMlOpen, awayMlClose, awayMlMin, awayMlMax]);

    let arbProfit = null;
    if (bestHome.decimal && bestAway.decimal) {
      const inverseSum = (1 / bestHome.decimal) + (1 / bestAway.decimal);
      if (inverseSum < 1) {
        arbProfit = (1 - inverseSum) * 100;
      }
    }
    if (arbProfit !== null) signals.push('ARB');

    const volatilityComponents = [
      Math.abs(lineMove ?? 0),
      Math.max(spreadRange ?? 0, 0) * 0.5,
      Math.abs(totalMove ?? 0) * 0.5,
      Math.max(totalRange ?? 0, 0) * 0.25,
      Number.isFinite(maxProbShift) ? maxProbShift / 5 : 0
    ];
    const volatilityScore = Number(
      volatilityComponents.reduce((acc, val) => acc + val, 0).toFixed(2)
    );

    return {
      ...game,
      lineMove,
      totalMove,
      spreadRange,
      totalRange,
      clv,
      arbProfit,
      signals,
      spreadOpen,
      spreadClose,
      spreadMin,
      spreadMax,
      totalOpen,
      totalClose,
      totalMin,
      totalMax,
      homeMoneylineOpen: homeMlOpen,
      homeMoneylineClose: homeMlClose,
      homeMoneylineMin: homeMlMin,
      homeMoneylineMax: homeMlMax,
      awayMoneylineOpen: awayMlOpen,
      awayMoneylineClose: awayMlClose,
      awayMoneylineMin: awayMlMin,
      awayMoneylineMax: awayMlMax,
      homeProbabilityShift,
      awayProbabilityShift,
      moneylineSteam: maxProbShift,
      spreadOddsOpen,
      spreadOddsClose,
      totalOverOpen,
      totalOverClose,
      totalUnderOpen,
      totalUnderClose,
      bestHomeMoneyline: bestHome.value,
      bestHomeMoneylineDecimal: bestHome.decimal,
      bestAwayMoneyline: bestAway.value,
      bestAwayMoneylineDecimal: bestAway.decimal,
      volatilityScore
    };
  });
}

function formatSpreadSummary(game) {
  const open = formatNumber(game.spreadOpen, 1);
  const close = formatNumber(game.spreadClose, 1);
  const delta = formatSigned(game.lineMove, 1);
  const range = formatRange(game.spreadMin, game.spreadMax, 1);
  const openOdds = formatOdds(game.spreadOddsOpen);
  const closeOdds = formatOdds(game.spreadOddsClose);
  const deltaSection = delta ? ` (delta ${delta})` : '';
  return (
    `<div>Open ${open} @ ${openOdds}</div>` +
    `<div>Close ${close}${deltaSection} @ ${closeOdds}</div>` +
    `<div class="muted">Range ${range}</div>`
  );
}

function buildMoneylineRow(label, open, close, min, max, probShift, bestValue, bestDecimal) {
  const openStr = formatOdds(open);
  const closeStr = formatOdds(close);
  const delta = (Number.isFinite(open) && Number.isFinite(close))
    ? formatSigned(close - open, 0)
    : '';
  const range = formatRange(min, max, 0);
  const best = formatOddsWithDecimal(bestValue, bestDecimal);
  const prob = formatProbShift(probShift);
  const deltaSection = delta ? ` (delta ${delta})` : '';
  const bestSection = best !== '—' ? ` | Best ${best}` : '';
  return (
    `<div><strong>${label}</strong>: ${openStr} -> ${closeStr}${deltaSection}${prob}</div>` +
    `<div class="muted">Range ${range}${bestSection}</div>`
  );
}

function formatMoneylineSummary(game) {
  return (
    buildMoneylineRow(
      game.homeTeam || 'Home',
      game.homeMoneylineOpen,
      game.homeMoneylineClose,
      game.homeMoneylineMin,
      game.homeMoneylineMax,
      game.homeProbabilityShift,
      game.bestHomeMoneyline,
      game.bestHomeMoneylineDecimal
    ) +
    buildMoneylineRow(
      game.awayTeam || 'Away',
      game.awayMoneylineOpen,
      game.awayMoneylineClose,
      game.awayMoneylineMin,
      game.awayMoneylineMax,
      game.awayProbabilityShift,
      game.bestAwayMoneyline,
      game.bestAwayMoneylineDecimal
    )
  );
}

function formatTotalSummary(game) {
  const open = formatNumber(game.totalOpen, 1);
  const close = formatNumber(game.totalClose, 1);
  const delta = formatSigned(game.totalMove, 1);
  const range = formatRange(game.totalMin, game.totalMax, 1);
  const deltaSection = delta ? ` (delta ${delta})` : '';
  const overOdds = `${formatOdds(game.totalOverOpen)} -> ${formatOdds(game.totalOverClose)}`;
  const underOdds = `${formatOdds(game.totalUnderOpen)} -> ${formatOdds(game.totalUnderClose)}`;
  return (
    `<div>Total ${open} -> ${close}${deltaSection}</div>` +
    `<div class="muted">Range ${range}</div>` +
    `<div class="muted">Over ${overOdds} | Under ${underOdds}</div>`
  );
}

function formatSignals(signals) {
  if (!signals || !signals.length) return '<span class="muted">—</span>';
  return signals.map(sig => `<span class="signal-chip">${sig}</span>`).join('');
}

function formatEdgeSummary(game) {
  const clv = Number.isFinite(game.clv) ? formatSigned(game.clv, 1) : '—';
  const arb = Number.isFinite(game.arbProfit) ? `${game.arbProfit.toFixed(2)}%` : '—';
  const mlShift = Number.isFinite(game.moneylineSteam) ? `${game.moneylineSteam.toFixed(1)} pp` : '—';
  const volatility = Number.isFinite(game.volatilityScore) ? game.volatilityScore.toFixed(1) : '—';
  return (
    `<div>CLV ${clv}</div>` +
    `<div>Arb ${arb}</div>` +
    `<div>ML shift ${mlShift}</div>` +
    `<div>Volatility ${volatility}</div>`
  );
}

function formatMatchupCell(game) {
  const matchup = `${game.awayTeam || '—'} @ ${game.homeTeam || '—'}`;
  const scoreReady = Number.isFinite(game.awayScore) && Number.isFinite(game.homeScore);
  const scoreLine = scoreReady ? `<div class="muted">Final ${game.awayScore}-${game.homeScore}</div>` : '';
  const tags = [
    game.lineProvider,
    game.seasonType,
    game.playoffGame ? 'Playoff' : null,
    game.neutralVenue ? 'Neutral site' : null
  ].filter(Boolean).join(' | ');
  const tagsLine = tags ? `<div class="muted">${tags}</div>` : '';
  const notesLine = game.notes ? `<div class="muted">${game.notes}</div>` : '';
  return (
    `<div><strong>${matchup}</strong></div>` +
    scoreLine +
    tagsLine +
    notesLine
  );
}

// Render the NFL advanced table into the DOM
function renderNflAdvancedTable(games) {
  const tbody = document.getElementById('nfl-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!Array.isArray(games) || !games.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">No NFL games available for this view.</td></tr>';
    return;
  }
  games.forEach(game => {
    const tr = document.createElement('tr');
    const date = (game.startDate || '').split('T')[0] || '—';
    tr.innerHTML = `
      <td>${game.season ?? '—'}</td>
      <td>${game.week ?? '—'}</td>
      <td>${date}</td>
      <td>${formatMatchupCell(game)}</td>
      <td>${formatSpreadSummary(game)}</td>
      <td>${formatMoneylineSummary(game)}</td>
      <td>${formatTotalSummary(game)}</td>
      <td>${formatSignals(game.signals)}</td>
      <td>${formatEdgeSummary(game)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Render the entire NFL Advanced tab when NFL data is active
function renderNflAdvancedTab() {
  if (CURRENT_SPORT !== 'nfl') return;
  const games = ALL_GAMES.filter(g => g.sport === 'nfl');
  const metrics = computeNFLMetrics(games);
  renderNflAdvancedTable(metrics);
}

const _origRenderAllTabs = typeof renderAllTabs === 'function' ? renderAllTabs : null;
function renderAllTabsWrapper() {
  if (_origRenderAllTabs) _origRenderAllTabs();
  renderNflAdvancedTab();
}
if (typeof renderAllTabs !== 'undefined') {
  renderAllTabs = renderAllTabsWrapper;
} else {
  renderAllTabs = renderAllTabsWrapper;
}
