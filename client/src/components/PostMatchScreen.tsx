import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRightLeft,
  BadgePercent,
  BarChart3,
  Building2,
  CircleHelp,
  Coins,
  Crown,
  Landmark,
  Trophy,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chanceCards, communityCards } from '../data/cards';
import { getTile, isPropertyTile } from '../data/board';
import { buildMatchSummary } from '../engine/gameEngine';
import type {
  GameState,
  Player,
  PlayerMatchStats,
  PostMatchAward,
  PostMatchPlayerSummary,
  PostMatchPropertySummary,
  PostMatchSummary,
  PostMatchTransferSummary,
  TransferStatSource,
} from '../engine/types';
import { ROLE_DEFINITIONS } from '../engine/roles';
import { PlayerFigurine } from './PlayerFigurine';

type PostMatchTab = 'ceremony' | 'overview' | 'players' | 'properties' | 'cards' | 'transfers';

const TABS: Array<{ id: PostMatchTab; label: string }> = [
  { id: 'ceremony', label: 'Церемонія' },
  { id: 'overview', label: 'Огляд' },
  { id: 'players', label: 'Гравці' },
  { id: 'properties', label: 'Майно' },
  { id: 'cards', label: 'Картки' },
  { id: 'transfers', label: 'Перекази' },
];

const MONEY_AWARDS = new Set(['finalCash', 'taxPayer', 'casinoWinner', 'rentCollector', 'loanMagnet']);
const CEREMONY_INTRO_MS = 5200;
const CEREMONY_AWARD_MS = 14500;
const MAX_CEREMONY_PLAYERS = 6;
const CEREMONY_SCAN_ROUNDS = 2;
const CEREMONY_SCAN_SLOT_MS = 560;
const CEREMONY_BLACKOUT_MS = 1100;
const CEREMONY_WINNER_TEXT_DELAY_MS = 1800;
const CEREMONY_SPARKS = Array.from({ length: 14 }, (_, index) => index);
const CEREMONY_SCAN_SPOTLIGHTS = Array.from({ length: MAX_CEREMONY_PLAYERS }, (_, index) => index);

type AwardStagePhase = 'idle' | 'scan' | 'blackout' | 'reveal';

const getStagePlayerOpacity = (
  phase: AwardStagePhase,
  isScanLit: boolean,
  isSpotlit: boolean,
  isBankrupt: boolean,
): number => {
  if (phase === 'blackout') return 0.04;
  if (phase === 'scan') return isScanLit ? 0.95 : 0.16;
  if (phase === 'reveal') return isSpotlit ? 1 : 0.14;
  return isBankrupt ? 0.72 : 1;
};

const getCenteredStageSlot = (playerIndex: number, playerCount: number): number => {
  const visibleCount = Math.max(1, Math.min(MAX_CEREMONY_PLAYERS, playerCount));
  const firstSlot = Math.floor((MAX_CEREMONY_PLAYERS - visibleCount) / 2);
  return Math.min(MAX_CEREMONY_PLAYERS - 1, firstSlot + playerIndex);
};

const getAwardWinnerCaption = (game: GameState, award: PostMatchAward): string => {
  const names = formatAwardWinners(game, award);
  return award.winnerIds.length > 1 ? `${names} перемогли номінацію` : `${names} переміг номінацію`;
};

export const PostMatchScreen = ({ game, onLeave }: { game: GameState; onLeave: () => void }) => {
  const [activeTab, setActiveTab] = useState<PostMatchTab>('ceremony');
  const [ceremonyComplete, setCeremonyComplete] = useState(false);
  const summary = useMemo<PostMatchSummary>(
    () => game.postMatch ?? buildMatchSummary(game, game.winnerId ? 'survivor' : 'summary'),
    [game],
  );
  const winnerNames = summary.winnerIds.map((playerId) => playerById(game, playerId)?.name).filter(Boolean).join(', ');
  const reasonText =
    summary.reason === 'role' && game.roleWin
      ? `Рольова перемога: ${ROLE_DEFINITIONS[game.roleWin.roleId].title}`
      : summary.reason === 'survivor'
        ? 'Перемога через вибування суперників'
        : 'Гравці завершили гру через підбиття підсумків';
  const handleCeremonyComplete = useCallback(() => setCeremonyComplete(true), []);
  const openStats = useCallback(() => {
    setCeremonyComplete(true);
    setActiveTab('overview');
  }, []);

  return (
    <motion.section
      className={`postmatch-screen ${ceremonyComplete ? 'ceremony-complete' : 'ceremony-locked'}`}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
    >
      {ceremonyComplete && (
        <>
      <header className="postmatch-header">
        <div>
          <p className="eyebrow">Партія завершена</p>
          <h1>{winnerNames || 'Фінальний подіум'}</h1>
          <span>{reasonText}</span>
        </div>
        <button className="ghost icon-text" type="button" onClick={onLeave}>
          На головний екран
        </button>
      </header>

      <div className="postmatch-tabs" role="tablist" aria-label="Післяматчеві підсумки">
        {TABS.map((tab) => (
          <button
            className={activeTab === tab.id ? 'active' : ''}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
        </>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          className="postmatch-body"
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {activeTab === 'ceremony' && (
            <CeremonyPanel game={game} summary={summary} onComplete={handleCeremonyComplete} onOpenStats={openStats} />
          )}
          {activeTab === 'overview' && <OverviewPanel game={game} summary={summary} />}
          {activeTab === 'players' && <PlayersStatsPanel game={game} summary={summary} />}
          {activeTab === 'properties' && <PropertiesStatsPanel game={game} summary={summary} />}
          {activeTab === 'cards' && <CardsStatsPanel summary={summary} />}
          {activeTab === 'transfers' && <TransfersStatsPanel game={game} summary={summary} />}
        </motion.div>
      </AnimatePresence>
    </motion.section>
  );
};

const CeremonyPanel = ({
  game,
  summary,
  onComplete,
  onOpenStats,
}: {
  game: GameState;
  summary: PostMatchSummary;
  onComplete: () => void;
  onOpenStats: () => void;
}) => {
  const [awardIndex, setAwardIndex] = useState(-1);
  const [awardPhase, setAwardPhase] = useState<AwardStagePhase>('idle');
  const [scanStep, setScanStep] = useState(0);
  const [showWinnerCaption, setShowWinnerCaption] = useState(false);
  const [manualRevealHold, setManualRevealHold] = useState(false);
  const scanTimerRef = useRef<number | undefined>(undefined);
  const blackoutTimerRef = useRef<number | undefined>(undefined);
  const revealTimerRef = useRef<number | undefined>(undefined);
  const award = awardIndex >= 0 ? summary.awards[awardIndex] : undefined;
  const hasAward = Boolean(award);
  const isIntro = awardIndex < 0;
  const isFinal = awardIndex >= summary.awards.length;
  const showAwardReveal = awardPhase === 'reveal';
  const scanDurationMs = MAX_CEREMONY_PLAYERS * CEREMONY_SCAN_ROUNDS * CEREMONY_SCAN_SLOT_MS;
  const activeScanSpotlight = awardPhase === 'scan' ? scanStep % MAX_CEREMONY_PLAYERS : -1;
  const spotlightIds = new Set(showAwardReveal ? award?.winnerIds ?? [] : []);
  const progress = isIntro ? 0 : isFinal ? 100 : ((awardIndex + 1) / summary.awards.length) * 100;
  const clearAwardTimers = useCallback(() => {
    if (scanTimerRef.current !== undefined) window.clearInterval(scanTimerRef.current);
    if (blackoutTimerRef.current !== undefined) window.clearTimeout(blackoutTimerRef.current);
    if (revealTimerRef.current !== undefined) window.clearTimeout(revealTimerRef.current);
    scanTimerRef.current = undefined;
    blackoutTimerRef.current = undefined;
    revealTimerRef.current = undefined;
  }, []);

  useEffect(() => {
    clearAwardTimers();
    if (!hasAward || isFinal) {
      setAwardPhase('idle');
      setScanStep(0);
      setShowWinnerCaption(false);
      setManualRevealHold(false);
      return;
    }

    setAwardPhase('scan');
    setScanStep(0);
    setManualRevealHold(false);
    const totalScanSteps = MAX_CEREMONY_PLAYERS * CEREMONY_SCAN_ROUNDS;
    scanTimerRef.current = window.setInterval(
      () => setScanStep((step) => Math.min(step + 1, totalScanSteps - 1)),
      CEREMONY_SCAN_SLOT_MS,
    );
    blackoutTimerRef.current = window.setTimeout(() => {
      if (scanTimerRef.current !== undefined) window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = undefined;
      setAwardPhase('blackout');
    }, scanDurationMs);
    revealTimerRef.current = window.setTimeout(() => setAwardPhase('reveal'), scanDurationMs + CEREMONY_BLACKOUT_MS);
    return clearAwardTimers;
  }, [clearAwardTimers, hasAward, award?.id, awardIndex, isFinal, scanDurationMs]);

  useEffect(() => {
    if (awardPhase !== 'reveal' || !award?.id) {
      setShowWinnerCaption(false);
      return;
    }

    setShowWinnerCaption(false);
    const captionTimer = window.setTimeout(() => setShowWinnerCaption(true), CEREMONY_WINNER_TEXT_DELAY_MS);
    return () => window.clearTimeout(captionTimer);
  }, [awardPhase, award?.id]);

  useEffect(() => {
    if (isFinal || manualRevealHold) return;
    const timer = window.setTimeout(
      () => setAwardIndex((index) => Math.min(summary.awards.length, index + 1)),
      isIntro ? CEREMONY_INTRO_MS : CEREMONY_AWARD_MS,
    );
    return () => window.clearTimeout(timer);
  }, [isFinal, isIntro, manualRevealHold, awardIndex, summary.awards.length]);

  useEffect(() => {
    if (isFinal) onComplete();
  }, [isFinal, onComplete]);

  const revealCurrentAwardNow = useCallback(() => {
    if (!award) return;
    clearAwardTimers();
    setAwardPhase('reveal');
    setScanStep(MAX_CEREMONY_PLAYERS * CEREMONY_SCAN_ROUNDS - 1);
    setShowWinnerCaption(true);
    setManualRevealHold(true);
  }, [award, clearAwardTimers]);

  const advanceAward = useCallback(() => {
    clearAwardTimers();
    setShowWinnerCaption(false);
    setManualRevealHold(false);
    setAwardIndex((index) => Math.min(summary.awards.length, index + 1));
  }, [clearAwardTimers, summary.awards.length]);

  const handleNextCeremonyStep = useCallback(() => {
    if (isFinal) {
      clearAwardTimers();
      setAwardPhase('idle');
      setScanStep(0);
      setShowWinnerCaption(false);
      setManualRevealHold(false);
      setAwardIndex(-1);
      return;
    }

    if (isIntro) {
      advanceAward();
      return;
    }

    if (!showWinnerCaption) {
      revealCurrentAwardNow();
      return;
    }

    advanceAward();
  }, [advanceAward, clearAwardTimers, isFinal, isIntro, revealCurrentAwardNow, showWinnerCaption]);

  return (
    <div className="ceremony-panel">
      <div
        className={`award-stage ${award && !isFinal ? 'lights-down' : ''} ${award ? `award-${awardPhase}` : ''} ${isIntro ? 'intro' : ''} ${isFinal ? 'finale' : ''}`}
      >
        <div className="stage-rig" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <div className="stage-curtains" aria-hidden />
        {isIntro && (
          <div className="opening-curtain" aria-hidden>
            <span className="curtain-panel curtain-left" />
            <span className="curtain-panel curtain-right" />
            <span className="curtain-valance" />
            <span className="stage-haze" />
          </div>
        )}
        {award && awardPhase === 'scan' && (
          <div className="scan-spotlights" aria-hidden>
            {CEREMONY_SCAN_SPOTLIGHTS.map((spotlight) => (
              <span className={activeScanSpotlight === spotlight ? 'active' : ''} key={spotlight} />
            ))}
          </div>
        )}
        {award && awardPhase === 'blackout' && <div className="stage-blackout" aria-hidden />}
        {isFinal ? (
          <Podium game={game} summary={summary} />
        ) : (
        <div className="stage-platform">
          {game.players.map((player, index) => {
            const isSpotlit = spotlightIds.has(player.id);
            const stageSlot = getCenteredStageSlot(index, game.players.length);
            const isScanLit = awardPhase === 'scan' && stageSlot === activeScanSpotlight;
            return (
              <motion.div
                className={`stage-player ${isIntro ? 'intro-player' : ''} ${isSpotlit ? 'spotlight' : ''} ${isScanLit ? 'scan-lit' : ''} ${player.isBankrupt ? 'bankrupt' : ''}`}
                style={{ '--stage-index': index, gridColumn: `${stageSlot + 1}` } as CSSProperties}
                key={`${player.id}-${award?.id ?? 'intro'}-${isFinal ? 'final' : 'award'}`}
                initial={{
                  opacity: 0,
                  x: isIntro ? (stageSlot < 3 ? -74 : 74) : 0,
                  y: isIntro ? 94 : 54,
                  scale: isIntro ? 0.7 : 0.82,
                  rotate: isIntro ? (stageSlot < 3 ? -8 : 8) : -3,
                }}
                animate={{
                  opacity: getStagePlayerOpacity(awardPhase, isScanLit, isSpotlit, player.isBankrupt),
                  x: 0,
                  y: isSpotlit ? -12 : 0,
                  scale: isSpotlit ? 1.16 : 1,
                  rotate: isSpotlit ? 0 : index % 2 === 0 ? -1 : 1,
                }}
                transition={{
                  delay: isIntro ? 1.55 + index * 0.18 : index * 0.08,
                  type: 'spring',
                  stiffness: isIntro ? 130 : 180,
                  damping: isIntro ? 17 : 15,
                }}
              >
              <div className="stage-beam" />
              <div className="stage-light" />
              <AnimatePresence>
                {isSpotlit && (
                  <motion.div
                    className="falling-crown"
                    initial={{ opacity: 0, y: -220, scale: 0.58, rotate: 0 }}
                    animate={{ opacity: 1, y: -24, scale: 1.08, rotate: 0 }}
                    exit={{ opacity: 0, y: -42 }}
                    transition={{ delay: 0.14, duration: 1.55, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <Crown size={34} />
                  </motion.div>
                )}
              </AnimatePresence>
              {isSpotlit && (
                <div className="crown-burst" aria-hidden>
                  {CEREMONY_SPARKS.map((spark) => (
                    <span style={{ '--spark-index': spark } as CSSProperties} key={spark} />
                  ))}
                </div>
              )}
              <PlayerFigurine player={player} size="large" />
              <strong>{player.name}</strong>
              </motion.div>
            );
          })}
        </div>
        )}
        <AnimatePresence>
          {award && showWinnerCaption && (
            <motion.div
              className="winner-caption"
              key={`${award.id}-winner-caption`}
              initial={{ opacity: 0, y: 24, scale: 0.84 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -14, scale: 0.96 }}
              transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
            >
              <span>{getAwardWinnerCaption(game, award)}</span>
              <strong>{award.title}</strong>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="stage-footer" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      </div>

      <motion.div
        className={`award-card ${award && !isFinal ? 'award-live' : ''}`}
        key={award?.id ?? (isIntro ? 'intro' : 'final')}
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28 }}
      >
        {isIntro ? (
          <>
            <p className="eyebrow">Церемонія нагородження</p>
            <h2>Гравці виходять на сцену</h2>
            <p>Зараз почнуться номінації. Корони падатимуть автоматично.</p>
          </>
        ) : isFinal ? (
          <>
            <p className="eyebrow">Фінальний подіум</p>
            <h2>Корони підраховано</h2>
            <p>Місця визначені за кількістю корон. Однакова кількість означає спільне місце.</p>
          </>
        ) : award ? (
          <>
            <p className="eyebrow">Номінація {awardIndex + 1}/{summary.awards.length}</p>
            <h2>{award.title}</h2>
            <p>{award.description}</p>
            {showAwardReveal && <strong>{formatAwardWinners(game, award)} · {formatAwardResult(award)}</strong>}
          </>
        ) : null}
        <div className="ceremony-progress" aria-hidden>
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="award-actions">
          <button className="secondary compact" type="button" disabled={isIntro} onClick={() => setAwardIndex((index) => Math.max(-1, index - 1))}>
            Назад
          </button>
          <button className="ghost compact" type="button" onClick={onOpenStats}>
            До статистики
          </button>
          <button className="primary compact" type="button" onClick={handleNextCeremonyStep}>
            {isFinal ? 'Повторити церемонію' : 'Далі'}
          </button>
        </div>
      </motion.div>

    </div>
  );
};

const Podium = ({ game, summary }: { game: GameState; summary: PostMatchSummary }) => (
  <div className="final-podium" role="list" aria-label="Final player podium">
    {summary.players.map((entry, index) => {
      const player = playerById(game, entry.playerId);
      if (!player) return null;
      const isFirstPlace = entry.rank === 1;
      return (
        <div
          className={`podium-place rank-${Math.min(entry.rank, 4)} ${isFirstPlace ? 'winner' : ''}`}
          key={entry.playerId}
          role="listitem"
          style={
            {
              '--podium-height': `${getPodiumHeight(entry.rank)}px`,
              '--podium-delay': `${index * 95}ms`,
            } as CSSProperties
          }
        >
          <div className="podium-player-wrap">
            {isFirstPlace && (
              <div className="podium-winner-crown" aria-hidden>
                <Crown size={34} />
              </div>
            )}
            <PlayerFigurine player={player} size="large" />
          </div>
          <div className="podium-block">
            <span>#{entry.rank}</span>
            <strong>{player.name}</strong>
            <small>{entry.crowns} {formatCrownWord(entry.crowns)}</small>
          </div>
        </div>
      );
    })}
  </div>
);

const getPodiumHeight = (rank: number): number => {
  if (rank === 1) return 172;
  if (rank === 2) return 136;
  if (rank === 3) return 112;
  return Math.max(72, 104 - rank * 6);
};

const OverviewPanel = ({ game, summary }: { game: GameState; summary: PostMatchSummary }) => {
  const totalTaxes = sumPlayers(game, (player) => game.matchStats?.players[player.id]?.taxesPaid ?? 0);
  const totalRent = sumPlayers(game, (player) => game.matchStats?.players[player.id]?.rentReceived ?? 0);
  const totalCasino = sumPlayers(game, (player) => game.matchStats?.players[player.id]?.casinoNet ?? 0);
  const totalBuilds = sumPlayers(game, (player) => game.matchStats?.players[player.id]?.buildingsBuilt ?? 0);
  const totalCrowns = getTotalAwardCrowns(summary.awards);
  const championEntry = summary.players[0];
  const champion = championEntry ? playerById(game, championEntry.playerId) : undefined;
  const winnerTitle = summary.winnerIds.map((id) => playerById(game, id)?.name).filter(Boolean).join(', ') || champion?.name || 'Фінальний подіум';
  const highlightCards = buildMatchHighlights(game, summary);

  return (
    <div className="overview-layout">
      <section className="postmatch-hero-card">
        <div className="champion-card">
          <span className="rank-chip rank-1">#1</span>
          <div className="champion-figurine">{champion && <PlayerFigurine player={champion} size="large" />}</div>
          <div>
            <p className="eyebrow">Переможець партії</p>
            <h2>{winnerTitle}</h2>
            <p>
              {championEntry
                ? `${championEntry.crowns} ${formatCrownWord(championEntry.crowns)} · статки ${formatMoney(championEntry.totalWorth)}`
                : 'Підсумок партії готовий до перегляду.'}
            </p>
          </div>
        </div>
        <div className="match-metrics">
          <MetricCard Icon={Crown} label="Корон роздано" value={String(totalCrowns)} />
          <MetricCard Icon={BadgePercent} label="Податки" value={formatMoney(totalTaxes)} />
          <MetricCard Icon={Landmark} label="Оренда" value={formatMoney(totalRent)} />
          <MetricCard Icon={CircleHelp} label="Казино net" value={formatSignedMoney(totalCasino)} />
          <MetricCard Icon={Building2} label="Будівництво" value={String(totalBuilds)} />
        </div>
      </section>

      <div className="postmatch-highlights" aria-label="Найцікавіші моменти матчу">
        {highlightCards.map((card) => (
          <StoryCard key={card.label} {...card} />
        ))}
      </div>

      <section className="postmatch-section wide">
        <h2>Табло гравців</h2>
        <div className="scoreboard-list">
          {summary.players.map((entry) => (
            <PlayerScoreRow game={game} entry={entry} maxWorth={Math.max(...summary.players.map((player) => player.totalWorth), 1)} key={entry.playerId} />
          ))}
        </div>
      </section>

      <section className="postmatch-section wide">
        <h2>Номінації</h2>
        <div className="award-list">
          {summary.awards.map((award) => (
            <article key={award.id}>
              <Crown size={18} />
              <div>
                <strong>{award.title}</strong>
                <span>{formatAwardWinners(game, award)} · {formatAwardResult(award)}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};

const PlayersStatsPanel = ({ game, summary }: { game: GameState; summary: PostMatchSummary }) => {
  const maxWorth = Math.max(...summary.players.map((entry) => entry.totalWorth), 1);
  const maxRent = Math.max(...summary.players.map((entry) => game.matchStats?.players[entry.playerId]?.rentReceived ?? 0), 1);
  const maxCards = Math.max(...summary.players.map((entry) => game.matchStats?.players[entry.playerId]?.cardsDrawn ?? 0), 1);
  const maxTaxes = Math.max(...summary.players.map((entry) => game.matchStats?.players[entry.playerId]?.taxesPaid ?? 0), 1);

  return (
    <div className="player-stats-grid">
      {summary.players.map((entry) => {
      const player = playerById(game, entry.playerId);
      const stats = game.matchStats?.players[entry.playerId];
      if (!player) return null;
      return (
        <article className="player-stat-card" style={{ '--player-color': player.color } as CSSProperties} key={entry.playerId}>
          <div className="player-card-header">
            <span className={`rank-chip rank-${Math.min(entry.rank, 4)}`}>#{entry.rank}</span>
            <PlayerFigurine player={player} size="large" />
            <div>
              <h2>{player.name}</h2>
              <span className="player-story-pill">{getPlayerStory(entry, stats)}</span>
            </div>
          </div>
          <div className="player-worth-line">
            <div>
              <span>Загальні статки</span>
              <strong>{formatMoney(entry.totalWorth)}</strong>
            </div>
            <div>
              <span>Корони</span>
              <strong>{entry.crowns}</strong>
            </div>
          </div>
          <StatBar label="Статки" value={entry.totalWorth} max={maxWorth} display={formatMoney(entry.totalWorth)} />
          <StatBar label="Оренда" value={stats?.rentReceived ?? 0} max={maxRent} display={formatMoney(stats?.rentReceived ?? 0)} />
          <StatBar label="Картки" value={stats?.cardsDrawn ?? 0} max={maxCards} display={String(stats?.cardsDrawn ?? 0)} />
          <StatBar label="Податки" value={stats?.taxesPaid ?? 0} max={maxTaxes} display={formatMoney(stats?.taxesPaid ?? 0)} />
          <div className="mini-stat-grid">
            <MiniStat label="Гроші" value={formatMoney(entry.finalMoney)} />
            <MiniStat label="Майно" value={String(entry.propertyCount)} />
            <MiniStat label="Будівлі" value={String(stats?.buildingsBuilt ?? 0)} />
            <MiniStat label="Казино" value={formatSignedMoney(stats?.casinoNet ?? 0)} tone={(stats?.casinoNet ?? 0) >= 0 ? 'good' : 'bad'} />
          </div>
        </article>
      );
      })}
    </div>
  );
};

const PropertiesStatsPanel = ({ game, summary }: { game: GameState; summary: PostMatchSummary }) => {
  const sortedProperties = [...summary.properties].sort((left, right) => right.net - left.net || right.income - left.income);
  const bestProperty = sortedProperties[0];
  const costliestProperty = [...summary.properties].sort((left, right) => right.spend - left.spend)[0];
  const bankOwnedCount = summary.properties.filter((property) => !property.ownerId).length;

  return (
    <div className="properties-layout">
      <div className="property-summary-strip">
        <PropertyInsight title="Найприбутковіше" property={bestProperty} game={game} value={bestProperty ? formatMoney(bestProperty.net) : '-'} />
        <PropertyInsight title="Найбільші вкладення" property={costliestProperty} game={game} value={costliestProperty ? formatMoney(costliestProperty.spend) : '-'} />
        <article className="story-card">
          <Building2 size={20} />
          <span>Майно банку</span>
          <strong>{bankOwnedCount}</strong>
          <p>Клітинок залишилося без фінального власника.</p>
        </article>
      </div>

      <div className="property-card-grid">
        {sortedProperties.map((property) => {
      const tile = getTile(property.tileId);
      const owner = property.ownerId ? playerById(game, property.ownerId) : undefined;
      return (
        <article className="property-stat-card" key={property.tileId}>
          <div className="property-card-head">
            <div>
              <span>{property.group ?? (isPropertyTile(tile) ? tile.type : '-')}</span>
              <h2>{tile.name}</h2>
            </div>
            <strong className={property.net >= 0 ? 'good-stat' : 'bad-stat'}>{formatMoney(property.net)}</strong>
          </div>
          <div className="property-owner-row">
            {owner ? <PlayerFigurine player={owner} /> : <Landmark size={22} />}
            <span>{owner?.name ?? 'Банк'}</span>
          </div>
          <div className="property-value-grid">
            <MiniStat label="Прибуток" value={formatMoney(property.income)} tone="good" />
            <MiniStat label="Витрати" value={formatMoney(property.spend)} />
          </div>
        </article>
      );
        })}
      </div>
    </div>
  );
};

const CardsStatsPanel = ({ summary }: { summary: PostMatchSummary }) => (
  <div className="cards-stats-grid">
    <CardList title="Шанс" cards={summary.chanceCards} deck="chance" />
    <CardList title="Громада" cards={summary.communityCards} deck="community" />
  </div>
);

const CardList = ({ title, cards, deck }: { title: string; cards: Array<{ cardId: number; count: number }>; deck: 'chance' | 'community' }) => {
  const definitions = deck === 'chance' ? chanceCards : communityCards;
  const total = cards.reduce((sum, card) => sum + card.count, 0);
  return (
    <section className="postmatch-section card-deck-panel">
      <div className="deck-heading">
        <h2>{title}</h2>
        <strong>{total}</strong>
      </div>
      {cards.length === 0 ? (
        <p>Картки цієї колоди не відкривалися.</p>
      ) : (
        cards.map((card) => {
          const definition = definitions.find((candidate) => candidate.id === card.cardId);
          return (
            <article className="card-stat-row" key={card.cardId}>
              <CircleHelp size={18} />
              <span>{definition?.title ?? `Картка ${card.cardId}`}</span>
              <strong>{card.count}</strong>
            </article>
          );
        })
      )}
    </section>
  );
};

const TransfersStatsPanel = ({ game, summary }: { game: GameState; summary: PostMatchSummary }) => (
  <div className="transfer-layout">
    <div className="transfer-summary-strip">
      <MetricCard Icon={ArrowRightLeft} label="Переказів" value={String(summary.transfers.length)} />
      <MetricCard Icon={Coins} label="Грошей між гравцями" value={formatMoney(summary.transfers.reduce((sum, transfer) => sum + transfer.amount, 0))} />
      <MetricCard Icon={Trophy} label="Найбільший переказ" value={summary.transfers[0] ? formatMoney(summary.transfers[0].amount) : '-'} />
    </div>
    {summary.transfers.length === 0 ? (
      <div className="empty-stat">Переказів між гравцями ще не було.</div>
    ) : (
      <div className="transfer-flow-list">
        {summary.transfers.map((transfer) => (
          <TransferFlowCard game={game} transfer={transfer} key={`${transfer.fromPlayerId}:${transfer.toPlayerId}`} />
        ))}
      </div>
    )}
  </div>
);

const MetricCard = ({ Icon, label, value }: { Icon: LucideIcon; label: string; value: string }) => (
  <article className="postmatch-metric">
    <Icon size={20} />
    <span>{label}</span>
    <strong>{value}</strong>
  </article>
);

const StoryCard = ({ Icon, label, value, detail }: { Icon: LucideIcon; label: string; value: string; detail: string }) => (
  <article className="story-card">
    <Icon size={20} />
    <span>{label}</span>
    <strong>{value}</strong>
    <p>{detail}</p>
  </article>
);

const PlayerScoreRow = ({ game, entry, maxWorth }: { game: GameState; entry: PostMatchPlayerSummary; maxWorth: number }) => {
  const player = playerById(game, entry.playerId);
  if (!player) return null;
  return (
    <article className="scoreboard-row" style={{ '--player-color': player.color, '--score-width': `${percent(entry.totalWorth, maxWorth)}%` } as CSSProperties}>
      <div className="scoreboard-player">
        <span className={`rank-chip rank-${Math.min(entry.rank, 4)}`}>#{entry.rank}</span>
        <PlayerFigurine player={player} />
        <strong>{player.name}</strong>
      </div>
      <div className="scoreboard-meter" aria-hidden>
        <span />
      </div>
      <div className="scoreboard-values">
        <strong>{entry.crowns} {formatCrownWord(entry.crowns)}</strong>
        <span>{formatMoney(entry.totalWorth)}</span>
      </div>
    </article>
  );
};

const StatBar = ({ label, value, max, display }: { label: string; value: number; max: number; display: string }) => (
  <div className="stat-bar-row">
    <span>{label}</span>
    <div aria-hidden>
      <i style={{ width: `${percent(value, max)}%` }} />
    </div>
    <strong>{display}</strong>
  </div>
);

const MiniStat = ({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) => (
  <div className={`mini-stat ${tone ? `tone-${tone}` : ''}`}>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const PropertyInsight = ({
  title,
  property,
  game,
  value,
}: {
  title: string;
  property?: PostMatchPropertySummary;
  game: GameState;
  value: string;
}) => {
  const tile = property ? getTile(property.tileId) : undefined;
  const owner = property?.ownerId ? playerById(game, property.ownerId) : undefined;
  return (
    <article className="story-card">
      <Landmark size={20} />
      <span>{title}</span>
      <strong>{tile?.name ?? '-'}</strong>
      <p>{owner?.name ?? 'Банк'} · {value}</p>
    </article>
  );
};

const TransferFlowCard = ({ game, transfer }: { game: GameState; transfer: PostMatchTransferSummary }) => {
  const fromPlayer = playerById(game, transfer.fromPlayerId);
  const toPlayer = playerById(game, transfer.toPlayerId);
  return (
    <article className="transfer-flow-card">
      <div className="transfer-player">
        {fromPlayer && <PlayerFigurine player={fromPlayer} />}
        <span>{fromPlayer?.name ?? transfer.fromPlayerId}</span>
      </div>
      <div className="transfer-amount">
        <ArrowRightLeft size={18} />
        <strong>{formatMoney(transfer.amount)}</strong>
      </div>
      <div className="transfer-player to">
        {toPlayer && <PlayerFigurine player={toPlayer} />}
        <span>{toPlayer?.name ?? transfer.toPlayerId}</span>
      </div>
      <TransferSourceChips bySource={transfer.bySource} />
    </article>
  );
};

const TransferSourceChips = ({ bySource }: { bySource: Partial<Record<TransferStatSource, number>> }) => {
  const sources = Object.entries(bySource).filter(([, amount]) => (amount ?? 0) > 0);
  if (sources.length === 0) return <div className="source-chip-list"><span>інше</span></div>;
  return (
    <div className="source-chip-list">
      {sources.map(([source, amount]) => (
        <span key={source}>{TRANSFER_SOURCE_LABELS[source as TransferStatSource] ?? source}: {formatMoney(amount ?? 0)}</span>
      ))}
    </div>
  );
};

const buildMatchHighlights = (
  game: GameState,
  summary: PostMatchSummary,
): Array<{ Icon: LucideIcon; label: string; value: string; detail: string }> => {
  const bestProperty = [...summary.properties].sort((left, right) => right.net - left.net || right.income - left.income)[0];
  const biggestTransfer = summary.transfers[0];
  const mostDrawnCard = getMostDrawnCard(summary);
  const topAward = summary.awards[0];

  return [
    {
      Icon: Trophy,
      label: 'Головна номінація',
      value: topAward?.title ?? 'Немає номінацій',
      detail: topAward ? `${formatAwardWinners(game, topAward)} · ${formatAwardResult(topAward)}` : 'Партія завершилась без додаткових нагород.',
    },
    {
      Icon: Landmark,
      label: 'Майно матчу',
      value: bestProperty ? getTile(bestProperty.tileId).name : '-',
      detail: bestProperty ? `Net ${formatMoney(bestProperty.net)} · прибуток ${formatMoney(bestProperty.income)}` : 'Майно ще не принесло статистики.',
    },
    {
      Icon: ArrowRightLeft,
      label: 'Найбільший потік',
      value: biggestTransfer ? formatMoney(biggestTransfer.amount) : '-',
      detail: biggestTransfer
        ? `${playerById(game, biggestTransfer.fromPlayerId)?.name ?? biggestTransfer.fromPlayerId} → ${playerById(game, biggestTransfer.toPlayerId)?.name ?? biggestTransfer.toPlayerId}`
        : 'Гравці не переказували гроші одне одному.',
    },
    {
      Icon: BarChart3,
      label: 'Картка вечора',
      value: mostDrawnCard?.title ?? '-',
      detail: mostDrawnCard ? `${mostDrawnCard.count} раз(и) з колоди “${mostDrawnCard.deck}”` : 'Картки ще не відкривалися.',
    },
  ];
};

const getMostDrawnCard = (summary: PostMatchSummary): { title: string; count: number; deck: string } | undefined => {
  const cards = [
    ...summary.chanceCards.map((card) => ({
      title: chanceCards.find((definition) => definition.id === card.cardId)?.title ?? `Картка ${card.cardId}`,
      count: card.count,
      deck: 'Шанс',
    })),
    ...summary.communityCards.map((card) => ({
      title: communityCards.find((definition) => definition.id === card.cardId)?.title ?? `Картка ${card.cardId}`,
      count: card.count,
      deck: 'Громада',
    })),
  ];
  return cards.sort((left, right) => right.count - left.count || left.title.localeCompare(right.title))[0];
};

const getPlayerStory = (entry: PostMatchPlayerSummary, stats: PlayerMatchStats | undefined): string => {
  const normalized = stats ?? {
    purchases: 0,
    auctionWins: 0,
    purchaseSpend: 0,
    mortgageReceived: 0,
    unmortgageSpend: 0,
    buildingsBuilt: 0,
    hotelsBuilt: 0,
    buildingSpend: 0,
    buildingRefund: 0,
    districtsCreated: 0,
    districtSpend: 0,
    rentPaid: 0,
    rentReceived: 0,
    taxesPaid: 0,
    bankPaid: 0,
    casinoBets: 0,
    casinoGrossWon: 0,
    casinoLost: 0,
    casinoNet: 0,
    chanceDraws: 0,
    communityDraws: 0,
    cardsDrawn: 0,
    bankLoansTaken: 0,
    playerLoansTaken: 0,
    loanPrincipalTaken: 0,
    loanPrincipalGiven: 0,
    loanPaid: 0,
    loanReceived: 0,
    tradesAccepted: 0,
    summaryVotes: 0,
  };
  const stories = [
    { label: 'Рантьє', value: normalized.rentReceived },
    { label: 'Забудовник', value: normalized.buildingsBuilt * 120 },
    { label: 'Майстер карток', value: normalized.cardsDrawn * 80 },
    { label: 'Азартний гравець', value: Math.max(0, normalized.casinoNet) },
    { label: 'Переговорник', value: normalized.tradesAccepted * 160 },
    { label: 'Кредитний стратег', value: normalized.loanPrincipalTaken },
    { label: 'Колекціонер майна', value: entry.propertyCount * 90 },
  ].sort((left, right) => right.value - left.value);
  return stories[0]?.value > 0 ? stories[0].label : 'Спокійна стратегія';
};

const playerById = (game: GameState, playerId: string): Player | undefined =>
  game.players.find((player) => player.id === playerId);

const sumPlayers = (game: GameState, getValue: (player: Player) => number): number =>
  game.players.reduce((sum, player) => sum + getValue(player), 0);

const formatAwardWinners = (game: GameState, award: PostMatchAward): string =>
  award.winnerIds.map((playerId) => playerById(game, playerId)?.name ?? playerId).join(', ') || 'без переможця';

const formatAwardValue = (award: PostMatchAward): string =>
  MONEY_AWARDS.has(award.id) ? formatMoney(award.value) : String(award.value);

const getAwardCrownValue = (award: PostMatchAward): number => (award.crown ? award.crownValue ?? 1 : 0);

const getTotalAwardCrowns = (awards: PostMatchAward[]): number =>
  awards.reduce((sum, award) => sum + getAwardCrownValue(award) * award.winnerIds.length, 0);

const formatAwardResult = (award: PostMatchAward): string => {
  const crownValue = getAwardCrownValue(award);
  const crownBonus = crownValue > 1 ? ` · +${crownValue} ${formatCrownWord(crownValue)}` : '';
  return `${formatAwardValue(award)}${crownBonus}`;
};

const TRANSFER_SOURCE_LABELS: Record<TransferStatSource, string> = {
  rent: 'оренда',
  movement: 'рух',
  card: 'картка',
  loan: 'кредит',
  trade: 'угода',
  bankruptcy: 'банкрутство',
  loanPayoff: 'амністія',
  other: 'інше',
};

const formatMoney = (amount: number) => `${amount}₴`;

const formatSignedMoney = (amount: number): string => (amount > 0 ? `+${formatMoney(amount)}` : formatMoney(amount));

const percent = (value: number, max: number): number => Math.max(4, Math.min(100, Math.round((Math.max(0, value) / Math.max(1, max)) * 100)));

const formatCrownWord = (count: number) =>
  count === 1 ? 'корона' : count >= 2 && count <= 4 ? 'корони' : 'корон';
