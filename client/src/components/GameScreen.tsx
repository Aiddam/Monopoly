import { AnimatePresence, motion } from 'framer-motion';
import {
  Ambulance,
  ArrowLeftRight,
  BadgeDollarSign,
  BadgePercent,
  Building,
  Building2,
  Castle,
  Check,
  ChevronsDown,
  Clock3,
  CircleHelp,
  Crown,
  Dice5,
  Factory,
  Flag,
  Hammer,
  HandCoins,
  Handshake,
  HeartCrack,
  Home,
  Hotel,
  Landmark,
  Layers,
  Lock,
  LockOpen,
  LogOut,
  MapPinned,
  MessageCircleHeart,
  Mountain,
  RotateCcw,
  Sailboat,
  ShieldAlert,
  Sigma,
  SmilePlus,
  Trash2,
  TrendingUp,
  Trees,
  UsersRound,
  Volume2,
  VolumeX,
  Waves,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CSSProperties, Dispatch, FormEvent, SetStateAction } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { boardTiles, getTile, isPropertyTile } from '../data/board';
import { cityEventDefinitions, getCityEventDefinition } from '../data/cityEvents';
import { money } from '../engine/economy';
import {
  AUCTION_BID_INCREMENT,
  calculateRent,
  getBankLoanLimit,
  getBankLoanRepaymentAmount,
  getBankDepositInfo,
  getBankDepositPayout,
  getBankRentForCount,
  getDistrictCreationCost,
  getEffectiveBuildingRefund,
  getEffectiveFineAmount,
  getEffectiveHouseCost,
  getEffectiveMortgageValue,
  getEffectivePropertyPrice,
  getEffectiveUnmortgageCost,
} from '../engine/gameEngine';
import type {
  CityTile,
  ActiveLoan,
  CityEventId,
  DistrictPath,
  GameState,
  MoneyHistoryPoint,
  PendingCityEvent,
  Player,
  PropertyTile,
  LoanOffer,
  RentServiceOffer,
  TradeOffer,
} from '../engine/types';
import { useGameStore, type EmoteEvent } from '../store/useGameStore';
import { DiceRoller } from './DiceRoller';
import { PlayerFigurine } from './PlayerFigurine';

const TURN_SECONDS = 180;
const AUTO_CONTINUE_MS = 1300;
const CARD_REVEAL_MS = 3600;
const DICE_ROLL_ANIMATION_MS = 4200;
const PAWN_STEP_ANIMATION_MS = 220;
const MORTGAGE_GRACE_TURNS = 10;
const LOG_TIME_FORMATTER = new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' });
const CASINO_MAX_BET = money(600);
const CASINO_DEFAULT_BET = money(100);
const CASINO_SEGMENTS = [
  { multiplier: 0, weight: 2, color: '#991b1b' },
  { multiplier: 4, weight: 1, color: '#4338ca' },
  { multiplier: 1, weight: 1.5, color: '#0f766e' },
  { multiplier: 6, weight: 1, color: '#0369a1' },
  { multiplier: 2, weight: 1, color: '#15803d' },
  { multiplier: 5, weight: 1, color: '#be123c' },
  { multiplier: 3, weight: 1, color: '#ca8a04' },
] as const;
const CASINO_TOTAL_WEIGHT = CASINO_SEGMENTS.reduce((sum, segment) => sum + segment.weight, 0);
const CASINO_WHEEL_SEGMENTS = CASINO_SEGMENTS.reduce<
  Array<(typeof CASINO_SEGMENTS)[number] & { startAngle: number; endAngle: number; centerAngle: number }>
>((segments, segment) => {
  const startAngle = segments.at(-1)?.endAngle ?? 0;
  const endAngle = startAngle + (segment.weight / CASINO_TOTAL_WEIGHT) * 360;
  return [...segments, { ...segment, startAngle, endAngle, centerAngle: startAngle + (endAngle - startAngle) / 2 }];
}, []);
const CASINO_MULTIPLIERS = [0, 1, 2, 3, 4, 5, 6] as const;
const CASINO_WHEEL_BACKGROUND = `radial-gradient(circle at 50% 42%, rgba(255, 255, 255, 0.16), transparent 0 7%, transparent 8%),
  radial-gradient(circle at center, rgba(2, 6, 23, 0.98) 0 20%, transparent 21%),
  conic-gradient(from 0deg, ${CASINO_WHEEL_SEGMENTS.map(
    (segment) => `${segment.color} ${segment.startAngle.toFixed(2)}deg ${segment.endAngle.toFixed(2)}deg`,
  ).join(', ')})`;
const CASINO_SPIN_MS = 5400;
const CASINO_RESULT_HOLD_MS = 850;
const JAIL_FINE = money(100);
const BUILDING_ANIMATION_MS = 2600;
const DISTRICT_PATH_ANIMATION_MS = 3400;
const AUCTION_WIN_ANIMATION_MS = 3000;
const MORTGAGE_ANIMATION_MS = 2800;
const LOAN_OFFER_ANIMATION_MS = 3100;
const UNO_REVERSE_ANIMATION_MS = 3200;
const CITY_EVENT_REVEAL_MS = 5200;
const SOUND_STORAGE_KEY = 'monopoly-sound-enabled';
const EMOTE_COOLDOWN_LIMIT = 2;
const UNO_REVERSE_CARD_IMAGE = '/assets/cards/uno-reverse.png';
const UNO_REVERSE_CARD_ID = 13;
const UNO_REVERSE_SPARK_INDICES = Array.from({ length: 10 }, (_, index) => index);
const EMOTE_COOLDOWN_WINDOW_MS = 30_000;
const EMOTE_AUDIO_GAIN = 5.0;
type EmoteOption = {
  id: string;
  label: string;
  Icon: LucideIcon;
  color: string;
  audioSrc?: string;
  gain?: number;
};
type WorkspaceTab = 'cards' | 'trade' | 'credits' | 'chart';
type GameSoundKind =
  | 'auction'
  | 'bid'
  | 'build'
  | 'card'
  | 'casino'
  | 'cash'
  | 'demolish'
  | 'dice'
  | 'hotel'
  | 'jail'
  | 'loss'
  | 'purchase'
  | 'rent'
  | 'trade'
  | 'turn'
  | 'turn-alert'
  | 'win';
type TradeDraft = {
  targetId: string;
  offerMoney: number;
  requestMoney: number;
  offerProperties: number[];
  requestProperties: number[];
  offerRentServices: RentServiceOffer[];
  requestRentServices: RentServiceOffer[];
};
type TradeDraftUpdater = Dispatch<SetStateAction<TradeDraft | undefined>>;
type LoanDraft = {
  mode: 'lend' | 'borrow';
  partnerId: string;
  principal: number;
  totalRepayment: number;
  durationTurns: number;
  collateralTileIds: number[];
};
type TradeTileState = 'offer' | 'request' | 'offer-selected' | 'request-selected' | 'disabled';
type CityArtKind = 'capital' | 'castle' | 'civic' | 'coast' | 'forest' | 'industrial' | 'mountain' | 'river' | 'urban';
type BuildingAnimationEvent = {
  id: string;
  tileId: number;
  kind: 'build' | 'demolish';
  fromHouses: number;
  toHouses: number;
  color: string;
};
type DistrictPathAnimationEvent = {
  id: string;
  group: string;
  path: DistrictPath;
  ownerName: string;
  color: string;
  tileIds: number[];
  tileNames: string[];
};
type AuctionWinAnimationEvent = {
  id: string;
  tileId: number;
  playerName: string;
  amount: number;
  color: string;
};
type MortgageAnimationEvent = {
  id: string;
  tileId: number;
  kind: 'mortgage' | 'redeem' | 'released';
  tileName: string;
  color: string;
};
type LoanOfferAnimationEvent = {
  id: string;
  kind: 'accepted' | 'declined';
  lenderName: string;
  borrowerName: string;
  lenderColor: string;
  borrowerColor: string;
  principal: number;
  totalRepayment: number;
};
type UnoReverseAnimationEvent = {
  id: string;
  fromName: string;
  toName: string;
  fromColor: string;
  toColor: string;
  tileName: string;
  amount: number;
};

const EMOTE_OPTIONS: EmoteOption[] = [
  { id: 'halepa', label: 'Халепа', Icon: CircleHelp, color: '#38bdf8', audioSrc: '/assets/emotes/halepa.mp3', gain: EMOTE_AUDIO_GAIN },
  { id: 'unlucky', label: 'Un-un-un-un-un-unlucky', Icon: ShieldAlert, color: '#fb923c', audioSrc: '/assets/emotes/unlucky.mp3', gain: EMOTE_AUDIO_GAIN },
  { id: 'i-feel-nothing', label: 'I feel nothing', Icon: HeartCrack, color: '#f472b6', audioSrc: '/assets/emotes/i-feel-nothing.mp3', gain: EMOTE_AUDIO_GAIN },
  { id: 'ready-catch-you', label: '准备好了吗，要来抓你咯', Icon: BadgeDollarSign, color: '#34d399', audioSrc: '/assets/emotes/ready-catch-you.mp3', gain: EMOTE_AUDIO_GAIN },
  { id: 'dai-deneg', label: 'Дай денег', Icon: HandCoins, color: '#facc15', audioSrc: '/assets/emotes/dai-deneg.m4a', gain: 0.45 },
  { id: 'bagata-simya', label: "Я не з такої сім'ї, я з богатої", Icon: Crown, color: '#f59e0b', audioSrc: '/assets/emotes/ya-ne-z-takoyi-simyi-ya-z-bogatoyi.mp3', gain: EMOTE_AUDIO_GAIN },
  { id: 'yippiee', label: 'Yippiee!', Icon: Dice5, color: '#a78bfa', audioSrc: '/assets/emotes/yippiee.mp3', gain: EMOTE_AUDIO_GAIN },
  { id: 'absolute-cinema', label: 'Absolute cinema', Icon: MessageCircleHeart, color: '#fb7185', audioSrc: '/assets/emotes/absolute-cinema.mp3', gain: EMOTE_AUDIO_GAIN },
  { id: 'sigma-moment', label: 'Sigma moment', Icon: Sigma, color: '#f472b6', audioSrc: '/assets/emotes/sigma-moment.mp3', gain: EMOTE_AUDIO_GAIN },
  { id: 'call-an-ambulance', label: 'Oh, call an ambulance', Icon: Ambulance, color: '#fbbf24', audioSrc: '/assets/emotes/call-an-ambulance.mp3', gain: EMOTE_AUDIO_GAIN },
  { id: 'ks-ks-chk-pk-a', label: 'Кс-кс-чк-чк-пк-пк-а!', Icon: Flag, color: '#60a5fa', audioSrc: '/assets/emotes/ks-ks-chk-pk-a.mp3', gain: EMOTE_AUDIO_GAIN },
  { id: 'ay-que-buena-jugada', label: '¡Ay, ay ay! ¡Qué buena jugada', Icon: TrendingUp, color: '#22c55e', audioSrc: '/assets/emotes/ay-que-buena-jugada.mp3', gain: EMOTE_AUDIO_GAIN },
  { id: 'a-dui-dui-dui', label: '啊对对对，啊对对对', Icon: BadgePercent, color: '#f97316', audioSrc: '/assets/emotes/a-dui-dui-dui.mp3', gain: EMOTE_AUDIO_GAIN },
  { id: 'penis', label: 'Пеніс', Icon: SmilePlus, color: '#e879f9', audioSrc: '/assets/emotes/penis.m4a', gain: EMOTE_AUDIO_GAIN },
];
const EMOTE_OPTION_MAP = new Map(EMOTE_OPTIONS.map((option) => [option.id, option]));

const DISTRICT_PATH_OPTIONS: Array<{
  path: DistrictPath;
  label: string;
  shortLabel: string;
  effect: string;
  Icon: LucideIcon;
}> = [
  {
    path: 'tourist',
    label: 'Туристичний район',
    shortLabel: 'Турист',
    effect: 'Оренда і будівництво працюють як зараз.',
    Icon: MapPinned,
  },
  {
    path: 'oldTown',
    label: 'Старе місто',
    shortLabel: 'Старе',
    effect: 'Нижча оренда, а перехожі сплачують за прохід старим районом.',
    Icon: Landmark,
  },
  {
    path: 'residential',
    label: 'Спальний район',
    shortLabel: 'Спальний',
    effect: 'Дешевше будувати, нижча оренда і швидший розвиток району.',
    Icon: Home,
  },
];

const DISTRICT_PATH_VIEW = new Map(DISTRICT_PATH_OPTIONS.map((option) => [option.path, option]));
const DISTRICT_RENT_DIVISOR = 2;
const RESIDENTIAL_DISTRICT_RENT_DIVISOR = 1.8;

const CITY_TILE_ART: Record<string, CityArtKind> = {
  pavlohrad: 'industrial',
  ternivka: 'industrial',
  kropyvnytskyi: 'civic',
  cherkasy: 'river',
  zhytomyr: 'forest',
  sumy: 'forest',
  poltava: 'civic',
  chernihiv: 'castle',
  khmelnytskyi: 'urban',
  rivne: 'forest',
  lutsk: 'castle',
  zaporizhzhia: 'industrial',
  mykolaiv: 'coast',
  vinnytsia: 'river',
  dnipro: 'river',
  kharkiv: 'urban',
  odesa: 'coast',
  'ivano-frankivsk': 'mountain',
  uzhhorod: 'mountain',
  chernivtsi: 'castle',
  lviv: 'castle',
  kyiv: 'capital',
};

export const GameScreen = () => {
  const { game, localPlayerId, room, dispatch, leaveRoom, emotes, sendEmote } = useGameStore();
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab | undefined>();
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | undefined>();
  const [tradeDraft, setTradeDraft] = useState<TradeDraft | undefined>();
  const [adminOpen, setAdminOpen] = useState(false);
  const [emoteWheelOpen, setEmoteWheelOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() =>
    typeof window === 'undefined' ? true : window.localStorage.getItem(SOUND_STORAGE_KEY) !== 'off',
  );
  const [emoteSentAt, setEmoteSentAt] = useState<number[]>([]);
  const [emoteCooldownNow, setEmoteCooldownNow] = useState(() => Date.now());
  const [emoteCooldownNudge, setEmoteCooldownNudge] = useState(0);
  const emoteSentAtRef = useRef<number[]>([]);
  if (!game) return null;

  const currentPlayer = game.players.find((player) => player.id === game.currentPlayerId)!;
  const localId = localPlayerId ?? game.currentPlayerId;
  const localPlayer = game.players.find((player) => player.id === localId) ?? currentPlayer;
  const isLocalTurn = currentPlayer.id === localId || !room;
  const orderRollPlayer = room ? localPlayer : currentPlayer;
  const canLocalRollForOrder =
    game.phase === 'orderRoll' &&
    !orderRollPlayer.isBankrupt &&
    !game.turnOrderRolls?.[orderRollPlayer.id];
  const tradePartners = game.players.filter((player) => player.id !== localPlayer.id && !player.isBankrupt);
  const hasPendingTrade = game.tradeOffers.some((offer) => offer.status === 'pending');
  const activeTradeOffer = game.tradeOffers.find(
    (offer) =>
      offer.status === 'pending' &&
      (!room || offer.fromPlayerId === localPlayer.id || offer.toPlayerId === localPlayer.id),
  );
  const activeLoanOffer = (game.loanOffers ?? []).find(
    (offer) =>
      offer.status === 'pending' &&
      (!room || offer.lenderId === localPlayer.id || offer.borrowerId === localPlayer.id),
  );
  const incomingTrade = game.tradeOffers.find(
    (offer) => offer.status === 'pending' && (!room || offer.toPlayerId === localPlayer.id),
  );
  const incomingLoanOffer = (game.loanOffers ?? []).find(
    (offer) => offer.status === 'pending' && (!room || isLoanOfferResponder(offer, localPlayer.id)),
  );
  const rollingKey = game.diceRollId || game.turn * 10 + game.dice[0] + game.dice[1];
  const secondsLeft = useTurnTimer(game, isLocalTurn, dispatch);
  const hasDoubleRoll = Boolean(game.lastDice && isDoubleDiceRoll(game.lastDice) && game.doublesInRow > 0);
  const shouldAnimateDiceRoll =
    game.phase !== 'orderRoll' || !room || game.lastOrderRollPlayerId === localPlayer.id;
  const isDiceRolling = useDiceRollAnimation(game, shouldAnimateDiceRoll);
  const { displayPositions, isAnimating: isPawnAnimating } = useAnimatedPositions(game);
  const isBoardBusy = isDiceRolling || isPawnAnimating;
  const isHost = !room || Boolean(room.players.find((player) => player.id === localPlayerId)?.isHost);
  const canAdvanceTurn = isHost || isLocalTurn;
  const canUseAdmin = Boolean(room?.testMode);
  const activePlayers = game.players.filter((player) => !player.isBankrupt);
  const summaryVoteCount = activePlayers.filter((player) => Boolean(game.summaryVotes?.[player.id])).length;
  const summaryVoter = room ? localPlayer : currentPlayer;
  const hasRequestedSummary = room
    ? Boolean(game.summaryVotes?.[summaryVoter.id])
    : activePlayers.every((player) => Boolean(game.summaryVotes?.[player.id]));
  const canRequestSummary = activePlayers.length > 1 && !summaryVoter.isBankrupt && game.phase !== 'finished' && !hasRequestedSummary;
  const recentEmoteSentAt = emoteSentAt.filter((sentAt) => emoteCooldownNow - sentAt < EMOTE_COOLDOWN_WINDOW_MS);
  const emoteCooldownRemainingMs =
    recentEmoteSentAt.length >= EMOTE_COOLDOWN_LIMIT
      ? Math.max(0, EMOTE_COOLDOWN_WINDOW_MS - (emoteCooldownNow - recentEmoteSentAt[0]))
      : 0;
  const emoteCooldownSeconds = Math.ceil(emoteCooldownRemainingMs / 1000);
  const isEmoteCooldownActive = emoteCooldownRemainingMs > 0;
  const emoteCooldownProgress = isEmoteCooldownActive
    ? emoteCooldownRemainingMs / EMOTE_COOLDOWN_WINDOW_MS
    : 0;
  useAutoContinueTurn(game, canAdvanceTurn, dispatch, isBoardBusy);
  useGameSounds(game, soundEnabled, localPlayer.id, Boolean(room));
  useEmoteSounds(emotes, soundEnabled, localPlayer.id);

  const toggleSound = () => {
    setSoundEnabled((enabled) => {
      const next = !enabled;
      window.localStorage.setItem(SOUND_STORAGE_KEY, next ? 'on' : 'off');
      return next;
    });
  };

  const toggleEmoteWheel = () => setEmoteWheelOpen((open) => !open);

  const handleSelectEmote = (emoteId: string) => {
    const now = Date.now();
    const recent = emoteSentAtRef.current.filter((sentAt) => now - sentAt < EMOTE_COOLDOWN_WINDOW_MS);
    if (recent.length >= EMOTE_COOLDOWN_LIMIT) {
      emoteSentAtRef.current = recent;
      setEmoteSentAt(recent);
      setEmoteCooldownNow(now);
      setEmoteCooldownNudge((nudge) => nudge + 1);
      return;
    }

    const next = [...recent, now];
    emoteSentAtRef.current = next;
    setEmoteSentAt(next);
    setEmoteCooldownNow(now);
    if (soundEnabled) void playEmoteAudio(emoteId);
    sendEmote(emoteId);
    setEmoteWheelOpen(false);
  };

  const handleBlockedEmote = () => {
    setEmoteCooldownNow(Date.now());
    setEmoteCooldownNudge((nudge) => nudge + 1);
  };

  const requestSummary = () => {
    if (room) {
      dispatch({ type: 'request_summary', playerId: summaryVoter.id });
      return;
    }
    activePlayers.forEach((player) => {
      if (!game.summaryVotes?.[player.id]) dispatch({ type: 'request_summary', playerId: player.id });
    });
  };

  const handleStartTradeDraft = (_player: Player, partners: Player[]) => {
    setTradeDraft({
      targetId: partners[0]?.id ?? '',
      offerMoney: 0,
      requestMoney: 0,
      offerProperties: [],
      requestProperties: [],
      offerRentServices: [],
      requestRentServices: [],
    });
    setWorkspaceTab(undefined);
    setSelectedPropertyId(undefined);
  };

  const handleSelectProperty = (tileId: number) => {
    if (tradeDraft) {
      setTradeDraft((draft) => (draft ? toggleTradeDraftTile(game, localPlayer.id, draft, tileId) : draft));
      return;
    }

    setSelectedPropertyId(tileId);
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [game.id]);

  useEffect(() => {
    setEmoteWheelOpen(false);
    emoteSentAtRef.current = [];
    setEmoteSentAt([]);
    setEmoteCooldownNow(Date.now());
    setEmoteCooldownNudge(0);
  }, [game.id]);

  useEffect(() => {
    if (!isEmoteCooldownActive) return;
    const timer = window.setInterval(() => setEmoteCooldownNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [isEmoteCooldownActive]);

  useEffect(() => {
    const handleEmoteKey = (event: KeyboardEvent) => {
      const isEmoteKey = event.code === 'KeyG' || event.key.toLowerCase() === 'g';
      if (event.repeat || !isEmoteKey || isTextEditingTarget(event.target)) return;
      event.preventDefault();
      setEmoteWheelOpen((open) => !open);
    };

    window.addEventListener('keydown', handleEmoteKey);
    return () => window.removeEventListener('keydown', handleEmoteKey);
  }, []);

  useEffect(() => {
    if (!tradeDraft) return;
    const targetExists = tradePartners.some((partner) => partner.id === tradeDraft.targetId);
    if (!isLocalTurn || hasPendingTrade || !targetExists) {
      setTradeDraft(undefined);
    }
  }, [hasPendingTrade, isLocalTurn, tradeDraft, tradePartners]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (emoteWheelOpen) {
        setEmoteWheelOpen(false);
        return;
      }
      if (adminOpen) {
        setAdminOpen(false);
        return;
      }
      if (selectedPropertyId !== undefined) {
        setSelectedPropertyId(undefined);
        return;
      }
      if (tradeDraft) {
        setTradeDraft(undefined);
        return;
      }
      if (workspaceTab) {
        setWorkspaceTab(undefined);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [adminOpen, emoteWheelOpen, selectedPropertyId, tradeDraft, workspaceTab]);

  return (
    <section className="game-screen">
      <header className="top-bar">
        <div>
          <span className="room-pill">{room ? `Кімната ${room.code}` : 'Локальне демо'}</span>
          <h1>Українська Монополія</h1>
        </div>
        <div className="top-actions">
          {incomingTrade && (
            <button className="trade-badge" type="button" onClick={() => setWorkspaceTab('trade')}>
              <ArrowLeftRight size={15} />
              Активна угода
            </button>
          )}
          {incomingLoanOffer && (
            <button className="trade-badge" type="button" onClick={() => setWorkspaceTab('credits')}>
              <HandCoins size={15} />
              Кредит
            </button>
          )}
          {canUseAdmin && (
            <button className="trade-badge admin-badge" type="button" onClick={() => setAdminOpen(true)}>
              <ShieldAlert size={15} />
              Адмін
            </button>
          )}
          <button
            className={`trade-badge summary-badge ${hasRequestedSummary ? 'active' : ''}`}
            type="button"
            disabled={!canRequestSummary}
            title={
              hasRequestedSummary
                ? 'Ваш голос за підбиття підсумків уже враховано.'
                : summaryVoter.isBankrupt
                  ? 'Вибулі гравці не голосують за підбиття підсумків.'
                  : room
                    ? 'Проголосувати за завершення гри й підбиття підсумків.'
                    : 'Локальна гра: підтвердити підбиття підсумків за всіх активних гравців.'
            }
            onClick={requestSummary}
          >
            <Crown size={15} />
            Підсумки {summaryVoteCount}/{activePlayers.length}
          </button>
          <button
            className={`sound-toggle emote-toggle ${emoteWheelOpen ? 'enabled' : ''} ${
              isEmoteCooldownActive ? 'cooldown' : ''
            }`}
            type="button"
            style={
              {
                '--emote-cooldown-progress': `${emoteCooldownProgress * 360}deg`,
              } as CSSProperties
            }
            title="Емоції"
            onClick={toggleEmoteWheel}
          >
            <SmilePlus size={15} />
            {isEmoteCooldownActive && <span className="emote-cooldown-chip">{emoteCooldownSeconds}s</span>}
            Емоції
          </button>
          <button
            className={`sound-toggle ${soundEnabled ? 'enabled' : ''}`}
            type="button"
            title={soundEnabled ? 'Вимкнути звуки' : 'Увімкнути звуки'}
            onClick={toggleSound}
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            {soundEnabled ? 'Звук' : 'Тиша'}
          </button>
          <span className="turn-status-inline">
            {game.phase === 'orderRoll' ? 'Кидає за чергу' : 'Ходить'} {currentPlayer.name}
          </span>
          <span className="turn-pill">
            Коло {game.currentRound ?? 1} · Хід {game.turn}
          </span>
          <button className="ghost icon-text" onClick={() => void leaveRoom()}>
            <LogOut size={18} />
            Вийти
          </button>
        </div>
      </header>

      <div className="game-layout">
        <PlayerRail secondsLeft={secondsLeft} />
        <GameBoard
          game={game}
          displayPositions={displayPositions}
          isDiceRolling={isDiceRolling}
          rollingKey={rollingKey}
          isLocalTurn={isLocalTurn}
          canAdvanceTurn={canAdvanceTurn}
          orderRollPlayer={orderRollPlayer}
          canLocalRollForOrder={canLocalRollForOrder}
          isBoardBusy={isBoardBusy}
          hasDoubleRoll={hasDoubleRoll}
          dispatch={dispatch}
          onOpenWorkspace={setWorkspaceTab}
          onSelectProperty={handleSelectProperty}
          tradeDraft={tradeDraft}
          setTradeDraft={setTradeDraft}
          tradePlayer={localPlayer}
          tradePartners={tradePartners}
          tradePlayerId={localPlayer.id}
          activeTradeOffer={activeTradeOffer}
          activeTradeViewerId={activeTradeOffer && !room ? activeTradeOffer.toPlayerId : localPlayer.id}
          canRespondToActiveTrade={Boolean(activeTradeOffer && (activeTradeOffer.toPlayerId === localPlayer.id || !room))}
          activeLoanOffer={activeLoanOffer}
          activeLoanViewerId={activeLoanOffer && !room ? getLoanOfferResponderId(activeLoanOffer) : localPlayer.id}
          canRespondToActiveLoan={Boolean(activeLoanOffer && (isLoanOfferResponder(activeLoanOffer, localPlayer.id) || !room))}
          canResolveCasino={isHost}
        />
      </div>
      <EmoteBurstLayer game={game} emotes={emotes} />
      <AnimatePresence>
        {emoteWheelOpen && (
          <EmoteWheel
            onClose={() => setEmoteWheelOpen(false)}
            onSelect={handleSelectEmote}
            onCooldownBlocked={handleBlockedEmote}
            cooldownRemainingMs={emoteCooldownRemainingMs}
            cooldownProgress={emoteCooldownProgress}
            cooldownNudge={emoteCooldownNudge}
          />
        )}
      </AnimatePresence>
      {workspaceTab &&
        createPortal(
          <WorkspaceDrawer
            activeTab={workspaceTab}
            onTabChange={setWorkspaceTab}
            onClose={() => setWorkspaceTab(undefined)}
            onStartTrade={handleStartTradeDraft}
          />,
          document.body,
        )}
      {selectedPropertyId !== undefined &&
        createPortal(
          <CityModal
            game={game}
            tileId={selectedPropertyId}
            localPlayerId={localPlayerId}
            preferLocalPlayer={Boolean(room)}
            onClose={() => setSelectedPropertyId(undefined)}
            dispatch={dispatch}
          />,
          document.body,
        )}
      {adminOpen &&
        canUseAdmin &&
        createPortal(
          <AdminPanel game={game} onClose={() => setAdminOpen(false)} dispatch={dispatch} />,
          document.body,
        )}
    </section>
  );
};

type EmoteWheelProps = {
  onClose: () => void;
  onSelect: (emoteId: string) => void;
  onCooldownBlocked: () => void;
  cooldownRemainingMs: number;
  cooldownProgress: number;
  cooldownNudge: number;
};

const EmoteWheel = ({
  onClose,
  onSelect,
  onCooldownBlocked,
  cooldownRemainingMs,
  cooldownProgress,
  cooldownNudge,
}: EmoteWheelProps) => {
  const isCooldown = cooldownRemainingMs > 0;
  const cooldownSeconds = Math.ceil(cooldownRemainingMs / 1000);

  return (
    <motion.div
      className="emote-wheel-backdrop"
      role="presentation"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={onClose}
    >
      <motion.div
        className={`emote-wheel ${isCooldown ? 'cooldown' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Емоції"
        style={
          {
            '--emote-cooldown-progress': `${cooldownProgress * 360}deg`,
          } as CSSProperties
        }
        initial={{ opacity: 0, scale: 0.88, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 10 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="emote-wheel-center" type="button" onClick={onClose} aria-label="Закрити емоції">
          <SmilePlus size={28} />
          <span>{isCooldown ? 'КД' : 'Емоції'}</span>
          {isCooldown && <strong key={cooldownNudge}>{cooldownSeconds}s</strong>}
        </button>
        {EMOTE_OPTIONS.map((option, index) => {
          const angle = (360 / EMOTE_OPTIONS.length) * index - 90;
          const Icon = option.Icon;
          return (
            <button
              className={`emote-wheel-option ${isCooldown ? 'cooldown-locked' : ''}`}
              type="button"
              aria-disabled={isCooldown}
              style={
                {
                  '--emote-angle': `${angle}deg`,
                  '--emote-angle-back': `${-angle}deg`,
                  '--emote-color': option.color,
                  '--emote-index': index,
                } as CSSProperties
              }
              onClick={() => {
                if (isCooldown) {
                  onCooldownBlocked();
                  return;
                }
                onSelect(option.id);
              }}
              key={option.id}
            >
              <Icon size={22} />
              <span>{option.label}</span>
            </button>
          );
        })}
      </motion.div>
    </motion.div>
  );
};

const EmoteBurstLayer = ({ game, emotes }: { game: GameState; emotes: EmoteEvent[] }) => {
  const visibleEmotes = emotes
    .map((emote) => {
      const player = game.players.find((candidate) => candidate.id === emote.playerId);
      const option = getEmoteOption(emote.emoteId);
      return player && !player.isBankrupt ? { emote, player, option } : undefined;
    })
    .filter((entry): entry is { emote: EmoteEvent; player: Player; option: EmoteOption } => Boolean(entry));

  if (visibleEmotes.length === 0) return null;

  return (
    <div className="emote-burst-layer" aria-live="polite">
      <AnimatePresence initial={false}>
        {visibleEmotes.map(({ emote, player, option }) => {
          const Icon = option.Icon;
          return (
            <motion.div
              className="emote-burst"
              style={
                {
                  '--player-color': player.color,
                  '--emote-color': option.color,
                } as CSSProperties
              }
              initial={{ opacity: 0, x: 24, scale: 0.92 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 18, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}
              key={emote.id}
            >
              <span className="emote-burst-icon">
                <Icon size={22} />
              </span>
              <span>{player.name}</span>
              <strong>{option.label}</strong>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

const AdminPanel = ({
  game,
  onClose,
  dispatch,
}: {
  game: GameState;
  onClose: () => void;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
}) => {
  const currentPlayer = game.players.find((player) => player.id === game.currentPlayerId)!;
  const [selectedTileId, setSelectedTileId] = useState(currentPlayer.position);
  const [selectedAdminPlayerId, setSelectedAdminPlayerId] = useState(currentPlayer.id);
  const [selectedCityEventId, setSelectedCityEventId] = useState<CityEventId>(cityEventDefinitions[0].id);
  const selectedTile = getTile(selectedTileId);
  const selectedAdminPlayer = game.players.find((player) => player.id === selectedAdminPlayerId) ?? currentPlayer;
  const selectedCityEvent = getCityEventDefinition(selectedCityEventId);
  const activePlayers = game.players.filter((player) => !player.isBankrupt);
  const selectedPlayerHasUnoReverse = (selectedAdminPlayer.unoReverseCards ?? 0) > 0;
  const canStartCityEvent =
    ['rolling', 'turnEnd', 'manage', 'trade'].includes(game.phase) &&
    !game.tradeOffers.some((offer) => offer.status === 'pending');
  const quickTiles = [20, 1, 7, 30, 0]
    .map((tileId) => getTile(tileId))
    .filter((tile, index, tiles) => tiles.findIndex((candidate) => candidate.id === tile.id) === index);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    dispatch({ type: 'admin_move_current_player', tileId: selectedTile.id });
    onClose();
  };

  const grantUnoReverse = () => {
    dispatch({ type: 'admin_grant_uno_reverse', playerId: selectedAdminPlayer.id });
  };

  const startCityEvent = () => {
    dispatch({ type: 'admin_start_city_event', cityEventId: selectedCityEvent.id });
    onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <motion.form
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow">Тест режим</p>
            <h2>Адмін-перенесення</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрити">
            <X size={18} />
          </button>
        </div>

        <div className="admin-current-player">
          <PlayerFigurine player={currentPlayer} />
          <div>
            <span>Поточний гравець</span>
            <strong>{currentPlayer.name}</strong>
          </div>
        </div>

        <label className="admin-field">
          Клітинка
          <select value={selectedTileId} onChange={(event) => setSelectedTileId(Number(event.target.value))}>
            {boardTiles.map((tile) => (
              <option value={tile.id} key={tile.id}>
                {tile.id}. {tile.name}
              </option>
            ))}
          </select>
        </label>

        <div className="admin-quick-grid">
          {quickTiles.map((tile) => (
            <button
              className={selectedTile.id === tile.id ? 'secondary compact active' : 'ghost compact'}
              type="button"
              onClick={() => setSelectedTileId(tile.id)}
              key={tile.id}
            >
              {tile.name}
            </button>
          ))}
        </div>

        <div className={`admin-tile-preview ${selectedTile.type}`}>
          <strong>{selectedTile.name}</strong>
          <span>
            Клітинка {selectedTile.id}
            {selectedTile.description ? ` · ${selectedTile.description}` : ''}
          </span>
        </div>

        <section className="admin-section">
          <div className="admin-section-head">
            <div>
              <p className="eyebrow">Картка</p>
              <h3>УНО РЕВЕРС</h3>
            </div>
            <img src={UNO_REVERSE_CARD_IMAGE} alt="" aria-hidden />
          </div>
          <label className="admin-field">
            Гравець
            <select value={selectedAdminPlayer.id} onChange={(event) => setSelectedAdminPlayerId(event.target.value)}>
              {activePlayers.map((player) => (
                <option value={player.id} key={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary compact"
            type="button"
            disabled={selectedPlayerHasUnoReverse}
            title={selectedPlayerHasUnoReverse ? 'У гравця вже є ця картка.' : undefined}
            onClick={grantUnoReverse}
          >
            <Layers size={16} />
            Видати УНО
          </button>
        </section>

        <section className="admin-section city-event-admin-section">
          <div className="admin-section-head">
            <div>
              <p className="eyebrow">Міська подія</p>
              <h3>{selectedCityEvent.title}</h3>
            </div>
            <CircleHelp size={20} />
          </div>
          <label className="admin-field">
            Подія
            <select
              value={selectedCityEvent.id}
              onChange={(event) => setSelectedCityEventId(event.target.value as CityEventId)}
            >
              {cityEventDefinitions.map((event) => (
                <option value={event.id} key={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
          </label>
          <p>{selectedCityEvent.text}</p>
          <button
            className="secondary compact"
            type="button"
            disabled={!canStartCityEvent}
            title={canStartCityEvent ? undefined : 'Завершіть активне рішення або угоду перед запуском події.'}
            onClick={startCityEvent}
          >
            <Flag size={16} />
            Запустити подію
          </button>
        </section>

        <div className="admin-actions">
          <button className="primary" type="submit">
            <ShieldAlert size={18} />
            Перенаправити
          </button>
          <button className="ghost" type="button" onClick={onClose}>
            Скасувати
          </button>
        </div>
      </motion.form>
    </div>
  );
};

const GameBoard = ({
  game,
  displayPositions,
  isDiceRolling,
  rollingKey,
  isLocalTurn,
  canAdvanceTurn,
  orderRollPlayer,
  canLocalRollForOrder,
  isBoardBusy,
  hasDoubleRoll,
  dispatch,
  onOpenWorkspace,
  onSelectProperty,
  tradeDraft,
  setTradeDraft,
  tradePlayer,
  tradePartners,
  tradePlayerId,
  activeTradeOffer,
  activeTradeViewerId,
  canRespondToActiveTrade,
  activeLoanOffer,
  activeLoanViewerId,
  canRespondToActiveLoan,
  canResolveCasino,
}: {
  game: GameState;
  displayPositions: Record<string, number>;
  isDiceRolling: boolean;
  rollingKey: number;
  isLocalTurn: boolean;
  canAdvanceTurn: boolean;
  orderRollPlayer: Player;
  canLocalRollForOrder: boolean;
  isBoardBusy: boolean;
  hasDoubleRoll: boolean;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
  onOpenWorkspace: (tab: WorkspaceTab) => void;
  onSelectProperty: (tileId: number) => void;
  tradeDraft?: TradeDraft;
  setTradeDraft: TradeDraftUpdater;
  tradePlayer: Player;
  tradePartners: Player[];
  tradePlayerId: string;
  activeTradeOffer?: TradeOffer;
  activeTradeViewerId: string;
  canRespondToActiveTrade: boolean;
  activeLoanOffer?: LoanOffer;
  activeLoanViewerId: string;
  canRespondToActiveLoan: boolean;
  canResolveCasino: boolean;
}) => {
  const currentPlayer = game.players.find((player) => player.id === game.currentPlayerId)!;
  const pendingTile = game.pendingPurchaseTileId !== undefined ? getTile(game.pendingPurchaseTileId) : undefined;
  const buildingEvents = useBuildingAnimationEvents(game);
  const districtPathEvents = useDistrictPathAnimationEvents(game);
  const auctionWinEvents = useAuctionWinAnimationEvents(game);
  const mortgageEvents = useMortgageAnimationEvents(game);
  const loanOfferEvents = useLoanOfferAnimationEvents(game);
  const unoReverseEvents = useUnoReverseAnimationEvents(game);
  const hasBuildingShock = buildingEvents.length > 0;
  const hasDistrictShock = districtPathEvents.length > 0;
  const hasHotelShock = buildingEvents.some((event) => event.kind === 'build' && event.toHouses >= 5);
  const shouldShowCasino = Boolean(game.pendingCasino && (isLocalTurn || game.pendingCasino.spinEndsAt));
  const isCardPaymentDecision = Boolean(
    game.pendingCard && game.phase === 'payment' && game.pendingPayment?.source === 'card',
  );
  const shouldLayerCardBehindDecision =
    !isCardPaymentDecision &&
    !isBoardBusy &&
    ((game.phase === 'awaitingJailDecision' && Boolean(game.pendingJail) && isLocalTurn) ||
      (game.phase === 'casino' && shouldShowCasino) ||
      (game.phase === 'bankDeposit' && Boolean(game.pendingBankDeposit) && isLocalTurn) ||
      (game.phase === 'awaitingPurchase' && Boolean(pendingTile && isPropertyTile(pendingTile)) && isLocalTurn) ||
      (game.phase === 'rent' && Boolean(game.pendingRent)) ||
      (game.phase === 'payment' && Boolean(game.pendingPayment)));
  const occupiedTileIds = useMemo(() => {
    const tileIds = new Set<number>();
    game.players.forEach((player) => {
      if (player.isBankrupt) return;
      tileIds.add(displayPositions[player.id] ?? player.position);
    });
    return tileIds;
  }, [displayPositions, game.players]);

  return (
    <section className="board-wrap">
      <div className={`board ${hasBuildingShock || hasDistrictShock ? 'building-shock' : ''} ${hasHotelShock ? 'hotel-shock' : ''}`}>
        <div className="board-center">
          <div className="board-status-pill" aria-live="polite">
            <Landmark size={34} />
          <span>{game.phase === 'orderRoll' ? 'Кидає за чергу' : 'Ходить'}</span>
          <strong>{currentPlayer.name}</strong>
        </div>
          <CityEventBanner game={game} />
          {game.phase === 'orderRoll' ? (
            <BoardTurnOrderPrompt
              game={game}
              orderRollPlayer={orderRollPlayer}
              canLocalRollForOrder={canLocalRollForOrder}
              dispatch={dispatch}
            />
          ) : game.phase === 'awaitingJailDecision' && game.pendingJail && isLocalTurn && !isBoardBusy ? (
            <BoardJailDecisionPrompt game={game} dispatch={dispatch} />
          ) : game.phase === 'rolling' && currentPlayer.jailTurns > 0 && isLocalTurn && !isBoardBusy ? (
            <BoardJailTurnPrompt game={game} dispatch={dispatch} />
          ) : game.phase === 'casino' && shouldShowCasino && !isBoardBusy ? (
            <BoardCasinoPrompt game={game} canControl={isLocalTurn} canResolve={canResolveCasino} dispatch={dispatch} />
          ) : game.phase === 'bankDeposit' && game.pendingBankDeposit && isLocalTurn && !isBoardBusy ? (
            <BoardBankDepositPrompt game={game} isLocalTurn={isLocalTurn} dispatch={dispatch} />
          ) : game.phase === 'awaitingPurchase' &&
          pendingTile &&
          isPropertyTile(pendingTile) &&
          isLocalTurn &&
          !isBoardBusy ? (
            <BoardPurchasePrompt game={game} tile={pendingTile} currentPlayer={currentPlayer} dispatch={dispatch} />
          ) : game.phase === 'rent' && game.pendingRent && !isBoardBusy ? (
            <BoardRentPrompt game={game} isLocalTurn={isLocalTurn} dispatch={dispatch} />
          ) : game.phase === 'payment' && game.pendingPayment && !isBoardBusy && !isCardPaymentDecision ? (
            <BoardPaymentPrompt game={game} isLocalTurn={isLocalTurn} dispatch={dispatch} />
          ) : tradeDraft ? (
            <BoardTradeBuilder
              game={game}
              player={tradePlayer}
              partners={tradePartners}
              draft={tradeDraft}
              setDraft={setTradeDraft}
              dispatch={dispatch}
            />
          ) : activeTradeOffer ? (
            <BoardActiveTrade
              game={game}
              offer={activeTradeOffer}
              tradePlayerId={activeTradeViewerId}
              canRespond={canRespondToActiveTrade}
              dispatch={dispatch}
            />
          ) : activeLoanOffer ? (
            <BoardActiveLoanOffer
              game={game}
              offer={activeLoanOffer}
              viewerId={activeLoanViewerId}
              canRespond={canRespondToActiveLoan}
              dispatch={dispatch}
            />
          ) : (
            <BoardLogFeed game={game} deferUpdates={isBoardBusy} />
          )}
          <BoardActionDock
            game={game}
            isDiceRolling={isDiceRolling}
            isLocalTurn={isLocalTurn}
            canAdvanceTurn={canAdvanceTurn}
            orderRollPlayer={orderRollPlayer}
            canLocalRollForOrder={canLocalRollForOrder}
            isBoardBusy={isBoardBusy}
          hasDoubleRoll={hasDoubleRoll}
          dispatch={dispatch}
          onOpenWorkspace={onOpenWorkspace}
          surrenderPlayer={tradePlayer}
        />
        </div>
        {boardTiles.map((tile) => (
          <TileCell
            tileId={tile.id}
            onSelectProperty={onSelectProperty}
            tradeDraft={tradeDraft}
            tradePlayerId={tradePlayerId}
            activeTradeOffer={activeTradeOffer}
            hasPawn={occupiedTileIds.has(tile.id)}
            key={tile.id}
          />
        ))}
        <DistrictPathAnimationLayer events={districtPathEvents} />
        <BuildingAnimationLayer events={buildingEvents} />
        <AuctionWinAnimationLayer events={auctionWinEvents} />
        <MortgageAnimationLayer events={mortgageEvents} />
        <LoanOfferAnimationLayer events={loanOfferEvents} />
        <UnoReverseAnimationLayer events={unoReverseEvents} />
        <BoardPawns game={game} displayPositions={displayPositions} />
        <DiceRollOverlay game={game} isRolling={isDiceRolling} rollingKey={rollingKey} />
        <AuctionOverlay game={game} />
        <CardDrawOverlay
          game={game}
          isLocalTurn={isLocalTurn}
          layerBehindDecision={shouldLayerCardBehindDecision}
          dispatch={dispatch}
        />
        <CityEventReveal event={game.pendingCityEvent} />
      </div>
    </section>
  );
};

const CityEventBanner = ({ game }: { game: GameState }) => {
  const [isTipOpen, setIsTipOpen] = useState(false);
  const activeEvents = game.activeCityEvents ?? [];
  const visibleEvent = game.pendingCityEvent ?? activeEvents[activeEvents.length - 1];
  const visibleEventDefinition = visibleEvent ? getCityEventDefinition(visibleEvent.id) : undefined;
  const pendingEvent = game.pendingCityEvent;
  const visibleEventTitle = pendingEvent?.secondary
    ? `${pendingEvent.title} + ${pendingEvent.secondary.title}`
    : pendingEvent?.title ?? visibleEventDefinition?.title;
  const visibleEventText = pendingEvent?.secondary
    ? `${pendingEvent.text} ${pendingEvent.secondary.text}`
    : pendingEvent?.text ?? visibleEventDefinition?.text;
  if (!visibleEventTitle && activeEvents.length === 0) return null;

  return (
    <motion.aside
      className={`city-event-banner${pendingEvent?.isDouble ? ' double' : ''}`}
      key={`${visibleEvent?.id ?? 'city-events'}-${pendingEvent?.secondary?.id ?? 'single'}-${pendingEvent?.round ?? 'active'}`}
      aria-live="polite"
      initial={{ opacity: 0, y: -10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      {visibleEventTitle && (
        <div className="city-event-card-area">
          <div className="city-event-main">
            <span>{pendingEvent?.isDouble ? 'Подвійна подія' : 'Подія міста'}</span>
            <strong>{visibleEventTitle}</strong>
            {visibleEventText && (
              <p
                className="city-event-summary"
                tabIndex={0}
                onBlur={() => setIsTipOpen(false)}
                onFocus={() => setIsTipOpen(true)}
                onMouseEnter={() => setIsTipOpen(true)}
                onMouseLeave={() => setIsTipOpen(false)}
              >
                {visibleEventText}
              </p>
            )}
          </div>
          <AnimatePresence>
            {visibleEventText && isTipOpen && (
              <motion.div
                className="city-event-tip"
                role="tooltip"
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.16 }}
              >
                <strong>{visibleEventTitle}</strong>
                <p>{visibleEventText}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
      {activeEvents.length > 0 && (
        <div className="city-event-chips" aria-label="Активні події міста">
          {activeEvents.map((event) => {
            const definition = getCityEventDefinition(event.id);
            return (
              <span key={event.id} title={definition.text}>
                {definition.title}: {event.remainingRounds} {formatRoundWord(event.remainingRounds)}
              </span>
            );
          })}
        </div>
      )}
    </motion.aside>
  );
};

const BoardActiveTrade = ({
  game,
  offer,
  tradePlayerId,
  canRespond,
  dispatch,
}: {
  game: GameState;
  offer: TradeOffer;
  tradePlayerId: string;
  canRespond: boolean;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
}) => {
  const viewer = game.players.find((player) => player.id === tradePlayerId) ?? game.players[0];
  const responsePlayerId = offer.toPlayerId;

  return (
    <motion.div
      className="board-active-trade"
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      <TradeOfferCard
        game={game}
        player={viewer}
        offer={offer}
        canRespond={canRespond}
        responsePlayerId={responsePlayerId}
        dispatch={dispatch}
        className="board-trade-card"
      />
    </motion.div>
  );
};

const BoardActiveLoanOffer = ({
  game,
  offer,
  viewerId,
  canRespond,
  dispatch,
}: {
  game: GameState;
  offer: LoanOffer;
  viewerId: string;
  canRespond: boolean;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
}) => (
  <motion.div
    className="board-active-trade board-active-loan"
    initial={{ opacity: 0, y: 10, scale: 0.98 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: 10, scale: 0.98 }}
    transition={{ type: 'spring', stiffness: 260, damping: 22 }}
  >
    <LoanOfferCard
      game={game}
      offer={offer}
      viewerId={viewerId}
      canRespond={canRespond}
      dispatch={dispatch}
    />
  </motion.div>
);

const BoardTurnOrderPrompt = ({
  game,
  orderRollPlayer,
  canLocalRollForOrder,
  dispatch,
}: {
  game: GameState;
  orderRollPlayer: Player;
  canLocalRollForOrder: boolean;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
}) => {
  const currentPlayer = game.players.find((player) => player.id === game.currentPlayerId)!;
  const rolls = game.turnOrderRolls ?? {};
  const rolledCount = Object.keys(rolls).length;
  const hasOrderRoll = Boolean(rolls[orderRollPlayer.id]);
  const orderButtonLabel = canLocalRollForOrder
    ? 'Кинути за чергу'
    : hasOrderRoll
      ? 'Очікуємо інших'
      : `Очікуємо ${currentPlayer.name}`;

  return (
    <div className="board-turn-order-prompt">
      <div className="turn-order-head">
        <span>Черга ходів</span>
        <strong>{currentPlayer.name} кидає кубики</strong>
        <p>
          {rolledCount}/{game.players.length} гравців вже кинули. Найбільша сума починає партію.
        </p>
      </div>

      <div className="turn-order-list">
        {game.players.map((player) => {
          const dice = rolls[player.id];
          const total = dice ? dice[0] + dice[1] : undefined;
          const isActive = player.id === currentPlayer.id;
          return (
            <div className={`turn-order-row ${isActive ? 'active' : ''}`} key={player.id}>
              <div className="turn-order-player">
                <PlayerFigurine player={player} />
                <span>{player.name}</span>
              </div>
              <strong>{dice ? `${dice[0]} + ${dice[1]} = ${total}` : isActive ? 'Кидає зараз' : 'Очікує'}</strong>
            </div>
          );
        })}
      </div>

      <button
        className="primary"
        disabled={!canLocalRollForOrder}
        onClick={() => dispatch({ type: 'roll_for_order', playerId: orderRollPlayer.id })}
      >
        <RotateCcw size={18} />
        {orderButtonLabel}
      </button>
    </div>
  );
};

const BoardJailDecisionPrompt = ({
  game,
  dispatch,
}: {
  game: GameState;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
}) => {
  const currentPlayer = game.players.find((player) => player.id === game.currentPlayerId)!;
  const jailFine = getEffectiveFineAmount(game, JAIL_FINE);
  const canPay = currentPlayer.money >= jailFine;

  return (
    <motion.article
      className="board-jail-prompt"
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      <div className="jail-prompt-head">
        <div>
          <p className="eyebrow">До вʼязниці</p>
          <h3>{currentPlayer.name}</h3>
        </div>
        <strong>{formatMoney(jailFine)}</strong>
      </div>
      <p>Можна сплатити штраф і лишитись на полі або вирушити у вʼязницю на 3 ходи без винагороди за Старт.</p>
      <div className="jail-actions">
        <button
          className="primary compact"
          type="button"
          disabled={!canPay}
          title={canPay ? undefined : 'Недостатньо грошей для штрафу.'}
          onClick={() => dispatch({ type: 'pay_jail_fine', playerId: currentPlayer.id })}
        >
          <HandCoins size={16} />
          Заплатити
        </button>
        <button
          className="secondary danger-soft compact"
          type="button"
          onClick={() => dispatch({ type: 'go_to_jail', playerId: currentPlayer.id })}
        >
          <ShieldAlert size={16} />
          У вʼязницю
        </button>
      </div>
    </motion.article>
  );
};

const BoardJailTurnPrompt = ({
  game,
  dispatch,
}: {
  game: GameState;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
}) => {
  const currentPlayer = game.players.find((player) => player.id === game.currentPlayerId)!;
  const hasExitCard = currentPlayer.jailCards > 0;
  const jailFine = getEffectiveFineAmount(game, JAIL_FINE);
  const canPay = hasExitCard || currentPlayer.money >= jailFine;
  const singleDieRolls = hasSingleDieCityEvent(game);

  return (
    <motion.article
      className="board-jail-prompt jail-turn"
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      <div className="jail-prompt-head">
        <div>
          <p className="eyebrow">Вʼязниця</p>
          <h3>{currentPlayer.name}</h3>
        </div>
        <strong>{currentPlayer.jailTurns}</strong>
      </div>
      <p>
        {singleDieRolls
          ? `Залишилось ходів: ${currentPlayer.jailTurns}. Через ремонт доріг зараз кидається 1 кубик, тому дубль не може вивести з тюрми.`
          : `Залишилось ходів: ${currentPlayer.jailTurns}. Сплатіть штраф або киньте кубики: дубль одразу виводить з тюрми і рухає пешку.`}
      </p>
      <div className="jail-actions">
        <button
          className="primary compact"
          type="button"
          disabled={!canPay}
          title={canPay ? undefined : 'Недостатньо грошей для штрафу.'}
          onClick={() => dispatch({ type: 'pay_bail', playerId: currentPlayer.id })}
        >
          <HandCoins size={16} />
          {hasExitCard ? 'Картка виходу' : `Сплатити ${formatMoney(jailFine)}`}
        </button>
        <button
          className="secondary compact"
          type="button"
          onClick={() => dispatch({ type: 'roll', playerId: currentPlayer.id })}
        >
          <RotateCcw size={16} />
          Кинути кубики
        </button>
      </div>
    </motion.article>
  );
};

const BoardCasinoPrompt = ({
  game,
  canControl,
  canResolve,
  dispatch,
}: {
  game: GameState;
  canControl: boolean;
  canResolve: boolean;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
}) => {
  const currentPlayer = game.players.find((player) => player.id === game.currentPlayerId)!;
  const pendingCasino = game.pendingCasino;
  const maxBet = Math.min(CASINO_MAX_BET, currentPlayer.money);
  const [bet, setBet] = useState(maxBet > 0 ? Math.min(CASINO_DEFAULT_BET, maxBet) : 0);
  const [rotation, setRotation] = useState(0);
  const [now, setNow] = useState(Date.now());
  const isSpinning = Boolean(pendingCasino?.spinEndsAt && now < pendingCasino.spinEndsAt);
  const spinComplete = Boolean(pendingCasino?.spinEndsAt && now >= pendingCasino.spinEndsAt);
  const revealedMultiplier = spinComplete ? pendingCasino?.multiplier : undefined;
  const lockedBet = pendingCasino?.amount ?? bet;

  useEffect(() => {
    setBet((value) => (maxBet > 0 ? Math.min(Math.max(1, value), maxBet) : 0));
  }, [maxBet]);

  useEffect(() => {
    setBet(maxBet > 0 ? Math.min(CASINO_DEFAULT_BET, maxBet) : 0);
    setRotation(0);
  }, [game.pendingCasino?.playerId, game.pendingCasino?.tileId, maxBet]);

  useEffect(() => {
    if (!pendingCasino?.spinEndsAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [pendingCasino?.spinEndsAt]);

  useEffect(() => {
    if (!pendingCasino?.spinStartedAt || pendingCasino.multiplier === undefined) return;
    const targetSegment = CASINO_WHEEL_SEGMENTS.find((segment) => segment.multiplier === pendingCasino.multiplier);
    const centerAngle = targetSegment?.centerAngle ?? 0;
    const seed = Math.abs(pendingCasino.spinSeed ?? 0);
    const extraTurns = 10 + (seed % 5);
    const targetRotation = extraTurns * 360 - centerAngle;
    setRotation(0);
    const frame = window.requestAnimationFrame(() => setRotation(targetRotation));
    return () => window.cancelAnimationFrame(frame);
  }, [pendingCasino?.multiplier, pendingCasino?.spinSeed, pendingCasino?.spinStartedAt]);

  useEffect(() => {
    if (!canResolve || !pendingCasino?.spinEndsAt || !spinComplete) return;
    if (pendingCasino.amount === undefined || pendingCasino.multiplier === undefined) return;
    const timer = window.setTimeout(() => {
      dispatch({
        type: 'casino_bet',
        playerId: pendingCasino.playerId,
        amount: pendingCasino.amount ?? 0,
        multiplier: pendingCasino.multiplier ?? 0,
      });
    }, CASINO_RESULT_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [canResolve, dispatch, pendingCasino, spinComplete]);

  const updateBet = (value: number) => {
    if (pendingCasino?.spinEndsAt) return;
    if (!Number.isFinite(value)) {
      setBet(maxBet > 0 ? 1 : 0);
      return;
    }
    setBet(maxBet > 0 ? Math.min(maxBet, Math.max(1, Math.floor(value))) : 0);
  };

  const handleSpin = () => {
    if (!canControl || pendingCasino?.spinEndsAt || maxBet <= 0) return;
    const normalizedBet = Math.min(maxBet, Math.max(1, Math.floor(bet)));
    const multiplier = pickCasinoMultiplier();
    setBet(normalizedBet);
    dispatch({
      type: 'start_casino_spin',
      playerId: currentPlayer.id,
      amount: normalizedBet,
      multiplier,
      spinSeed: Math.floor(Math.random() * 1_000_000),
    });
  };

  const projectedPayout = lockedBet * (revealedMultiplier ?? 0);
  const netWin = revealedMultiplier === undefined ? 0 : projectedPayout - lockedBet;
  const hasWin = netWin > 0;
  const resultLabel = revealedMultiplier === undefined ? (isSpinning ? '...' : 'x?') : `x${revealedMultiplier}`;
  const resultText =
    revealedMultiplier === undefined
      ? isSpinning
        ? 'Рулетка крутиться'
        : 'Оберіть ставку й крутіть'
      : `${resultLabel} = ${formatMoney(projectedPayout)}`;
  const controlsLocked = !canControl || Boolean(pendingCasino?.spinEndsAt);

  return (
    <motion.article
      className={`board-casino-prompt ${hasWin ? 'casino-win' : ''}`}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      <div className="casino-head">
        <div>
          <p className="eyebrow">Казино</p>
          <h3>Рулетка фортуни</h3>
        </div>
        <div className="casino-head-side">
          <div className="casino-jackpot">
            <span>Макс.</span>
            <strong>x6</strong>
          </div>
          <button
            className="secondary compact casino-skip-action"
            type="button"
            disabled={controlsLocked}
            onClick={() => dispatch({ type: 'skip_casino', playerId: currentPlayer.id })}
          >
            <X size={16} />
            Відмовитись
          </button>
        </div>
      </div>

      <div className="casino-body">
        <div className="casino-wheel-wrap" aria-label="Рулетка казино">
          <span className="casino-pointer" />
          <div
            className="casino-wheel"
            style={
              {
                transform: `rotate(${rotation}deg)`,
                '--casino-spin-ms': `${CASINO_SPIN_MS}ms`,
                '--casino-wheel-background': CASINO_WHEEL_BACKGROUND,
              } as CSSProperties
            }
          >
            {CASINO_WHEEL_SEGMENTS.map((segment) => (
              <span
                className={`${segment.multiplier === 0 ? 'zero' : ''} ${segment.weight > 1 ? 'wide' : ''}`}
                key={segment.multiplier}
                style={{ '--label-angle': `${segment.centerAngle}deg` } as CSSProperties}
              >
                x{segment.multiplier}
              </span>
            ))}
          </div>
          <div className="casino-wheel-core">
            <BadgeDollarSign size={18} />
            <strong>{resultLabel}</strong>
          </div>
          {hasWin && (
            <div className="casino-win-burst" aria-hidden>
              {Array.from({ length: 12 }, (_, index) => (
                <span key={index} />
              ))}
            </div>
          )}
        </div>

        <section className="casino-controls">
          <div className="casino-multiplier-row">
            {CASINO_MULTIPLIERS.map((multiplier) => (
              <span className={revealedMultiplier === multiplier ? 'active' : ''} key={multiplier}>
                x{multiplier}
              </span>
            ))}
          </div>

          <div className="casino-bet-row">
            <label>
              <span>Ставка</span>
              <div>
                <input
                  max={maxBet}
                  type="number"
                  value={pendingCasino?.amount ?? bet}
                  min={maxBet > 0 ? 1 : 0}
                  disabled={controlsLocked || maxBet <= 0}
                  onChange={(event) => updateBet(Number(event.target.value))}
                />
                <em>₴</em>
              </div>
            </label>
            <strong>макс. {formatMoney(maxBet)}</strong>
          </div>

          <input
            className="casino-bet-slider"
            min={maxBet > 0 ? 1 : 0}
            max={maxBet}
            type="range"
            value={pendingCasino?.amount ?? bet}
            disabled={controlsLocked || maxBet === 0}
            onChange={(event) => updateBet(Number(event.target.value))}
          />

          <div className="casino-result">
            <span>Можлива виплата</span>
            <strong>{resultText}</strong>
          </div>

          <div className="casino-actions">
            <button
              className="primary compact"
              type="button"
              disabled={controlsLocked || maxBet <= 0}
              title={maxBet <= 0 ? 'Недостатньо грошей для ставки.' : undefined}
              onClick={handleSpin}
            >
              <BadgeDollarSign size={16} />
              {isSpinning ? 'Крутиться...' : spinComplete ? 'Результат...' : 'Підтвердити ставку'}
            </button>
          </div>
        </section>
      </div>
    </motion.article>
  );
};

const pickCasinoMultiplier = () => {
  let roll = Math.random() * CASINO_TOTAL_WEIGHT;
  for (const segment of CASINO_SEGMENTS) {
    roll -= segment.weight;
    if (roll < 0) return segment.multiplier;
  }
  return CASINO_SEGMENTS[CASINO_SEGMENTS.length - 1].multiplier;
};

const SURRENDER_CHARGE_MS = 3200;
const SURRENDER_CHARGE_STEP_MS = 40;

const BoardRentPrompt = ({
  game,
  isLocalTurn,
  dispatch,
}: {
  game: GameState;
  isLocalTurn: boolean;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
}) => {
  const pendingRent = game.pendingRent;
  const [isSurrenderCharging, setIsSurrenderCharging] = useState(false);
  const [surrenderCharge, setSurrenderCharge] = useState(0);

  useEffect(() => {
    setIsSurrenderCharging(false);
    setSurrenderCharge(0);
  }, [pendingRent?.payerId, pendingRent?.tileId, pendingRent?.amount]);

  useEffect(() => {
    if (!isSurrenderCharging || surrenderCharge >= 100) return;
    const timer = window.setTimeout(() => {
      setSurrenderCharge((value) =>
        Math.min(100, value + (SURRENDER_CHARGE_STEP_MS / SURRENDER_CHARGE_MS) * 100),
      );
    }, SURRENDER_CHARGE_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [isSurrenderCharging, surrenderCharge]);

  if (!pendingRent) return null;

  const payer = game.players.find((player) => player.id === pendingRent.payerId);
  const owner = game.players.find((player) => player.id === pendingRent.ownerId);
  const tile = getTile(pendingRent.tileId);
  const canPay = Boolean(payer && payer.money >= pendingRent.amount);
  const depositBalance = payer ? getBankDepositPayout((game.bankDeposits ?? {})[payer.id]) : 0;
  const depositCoverage = Math.min(depositBalance, pendingRent.amount);
  const depositCashDue = Math.max(0, pendingRent.amount - depositCoverage);
  const canPayWithDeposit = Boolean(payer && depositCoverage > 0);
  const hasUnoReverseCard = Boolean(payer && (payer.unoReverseCards ?? 0) > 0);
  const canUseUnoReverse = Boolean(hasUnoReverseCard && payer && owner && owner.id !== payer.id);
  const surrenderArmed = surrenderCharge >= 100;
  const stopSurrenderCharge = () => {
    if (surrenderArmed) return;
    setIsSurrenderCharging(false);
    setSurrenderCharge(0);
  };
  const handleSurrender = () => {
    if (!isLocalTurn || !surrenderArmed) return;
    dispatch({ type: 'declare_bankruptcy', playerId: pendingRent.payerId });
  };

  return (
    <motion.article
      className="board-rent-prompt"
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      <div className="rent-prompt-head">
        <div>
          <p className="eyebrow">Оренда</p>
          <h3>{tile.name}</h3>
        </div>
        <strong>{formatMoney(pendingRent.amount)}</strong>
      </div>
      <p>
        {payer?.name ?? 'Гравець'} має сплатити {owner?.name ?? 'власнику'}.
      </p>
      {pendingRent.unoReverse && (
        <p className="rent-reverse-note">
          УНО РЕВЕРС активний: платіж перекинуто на {payer?.name ?? 'гравця'}.
        </p>
      )}
      {pendingRent.originalAmount && (
        <p className="rent-discount-note">
          Послуга оренди: {pendingRent.discountPercent}% знижки, замість {formatMoney(pendingRent.originalAmount)}.
        </p>
      )}
      {depositCoverage > 0 && (
        <p className="deposit-payment-note">
          Депозит покриє {formatMoney(depositCoverage)}.
          {depositCashDue > 0 ? ` Після цього залишиться сплатити ${formatMoney(depositCashDue)}.` : ' Платіж буде закрито повністю.'}
          {depositBalance - depositCoverage > 0 ? ` На депозиті залишиться ${formatMoney(depositBalance - depositCoverage)}.` : ''}
        </p>
      )}
      <div className="rent-actions">
        <button
          className="primary compact"
          disabled={!isLocalTurn || !canPay}
          title={canPay ? undefined : 'Недостатньо грошей для сплати оренди.'}
          onClick={() => dispatch({ type: 'pay_rent', playerId: pendingRent.payerId })}
        >
          <HandCoins size={16} />
          Заплатити
        </button>
        {depositCoverage > 0 && (
          <button
            className="secondary compact"
            disabled={!isLocalTurn || !canPayWithDeposit}
            title={canPayWithDeposit ? undefined : 'Немає активного депозиту для списання.'}
            onClick={() => dispatch({ type: 'pay_rent_with_deposit', playerId: pendingRent.payerId })}
          >
            <HandCoins size={16} />
            Депозит
          </button>
        )}
        {hasUnoReverseCard && (
          <button
            className="uno-reverse-button compact"
            disabled={!isLocalTurn || !canUseUnoReverse}
            title={canUseUnoReverse ? 'Перекинути платіж на власника.' : undefined}
            onClick={() => dispatch({ type: 'use_uno_reverse', playerId: pendingRent.payerId })}
          >
            <img src={UNO_REVERSE_CARD_IMAGE} alt="" aria-hidden />
            <span>УНО РЕВЕРС</span>
          </button>
        )}
        <button
          className={`surrender-button compact ${isSurrenderCharging ? 'charging' : ''} ${surrenderArmed ? 'armed' : ''}`}
          disabled={!isLocalTurn}
          aria-disabled={!isLocalTurn || !surrenderArmed}
          style={{ '--surrender-charge': `${surrenderCharge}%` } as CSSProperties}
          title="Наведіть і дочекайтесь заповнення. Після натискання ви програєте партію."
          onBlur={stopSurrenderCharge}
          onClick={handleSurrender}
          onFocus={() => setIsSurrenderCharging(true)}
          onPointerEnter={() => setIsSurrenderCharging(true)}
          onPointerLeave={stopSurrenderCharge}
        >
          <ShieldAlert size={16} />
          <span>Здатися</span>
        </button>
      </div>
      <p className="rent-warning">Після натискання “Здатися” ви програєте, а ваше майно повернеться в банк.</p>
    </motion.article>
  );
};

const BoardPaymentPrompt = ({
  game,
  isLocalTurn,
  dispatch,
}: {
  game: GameState;
  isLocalTurn: boolean;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
}) => (
  <PaymentDecisionPanel
    game={game}
    isLocalTurn={isLocalTurn}
    dispatch={dispatch}
    className="board-rent-prompt board-payment-prompt"
  />
);

const PaymentDecisionPanel = ({
  game,
  isLocalTurn,
  dispatch,
  className,
}: {
  game: GameState;
  isLocalTurn: boolean;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
  className: string;
}) => {
  const pendingPayment = game.pendingPayment;
  const [isSurrenderCharging, setIsSurrenderCharging] = useState(false);
  const [surrenderCharge, setSurrenderCharge] = useState(0);

  useEffect(() => {
    setIsSurrenderCharging(false);
    setSurrenderCharge(0);
  }, [pendingPayment?.payerId, pendingPayment?.amount, pendingPayment?.reason]);

  useEffect(() => {
    if (!isSurrenderCharging || surrenderCharge >= 100) return;
    const timer = window.setTimeout(() => {
      setSurrenderCharge((value) =>
        Math.min(100, value + (SURRENDER_CHARGE_STEP_MS / SURRENDER_CHARGE_MS) * 100),
      );
    }, SURRENDER_CHARGE_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [isSurrenderCharging, surrenderCharge]);

  if (!pendingPayment) return null;

  const payer = game.players.find((player) => player.id === pendingPayment.payerId);
  const recipientNames = (pendingPayment.recipients ?? [])
    .map((recipient) => game.players.find((player) => player.id === recipient.playerId)?.name)
    .filter(Boolean);
  const recipientTotal = (pendingPayment.recipients ?? []).reduce((sum, recipient) => sum + recipient.amount, 0);
  const paymentTarget =
    recipientNames.length > 0
      ? pendingPayment.source === 'loan' && recipientTotal < pendingPayment.amount
        ? `${recipientNames.join(', ')} і банку`
        : recipientNames.join(', ')
      : 'банку';
  const canPay = Boolean(payer && payer.money >= pendingPayment.amount);
  const depositBalance = payer ? getBankDepositPayout((game.bankDeposits ?? {})[payer.id]) : 0;
  const depositCoverage = Math.min(depositBalance, pendingPayment.amount);
  const depositCashDue = Math.max(0, pendingPayment.amount - depositCoverage);
  const canPayWithDeposit = Boolean(payer && depositCoverage > 0);
  const isLoanPayment = pendingPayment.source === 'loan' && Boolean(pendingPayment.loanPayments?.length);
  const loanMissBlocked = isLoanPayment && hasMandatoryLoanPayment(game, pendingPayment);
  const surrenderArmed = surrenderCharge >= 100;
  const stopSurrenderCharge = () => {
    if (surrenderArmed) return;
    setIsSurrenderCharging(false);
    setSurrenderCharge(0);
  };
  const handleSurrender = () => {
    if (!isLocalTurn || !surrenderArmed) return;
    dispatch({ type: 'declare_bankruptcy', playerId: pendingPayment.payerId });
  };

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      <div className="rent-prompt-head">
        <div>
          <p className="eyebrow">Платіж</p>
          <h3>{pendingPayment.reason}</h3>
        </div>
        <strong>{formatMoney(pendingPayment.amount)}</strong>
      </div>
      <p>
        {payer?.name ?? 'Гравець'} має сплатити {paymentTarget}.
      </p>
      {depositCoverage > 0 && (
        <p className="deposit-payment-note">
          Депозит покриє {formatMoney(depositCoverage)}.
          {depositCashDue > 0 ? ` Після цього залишиться сплатити ${formatMoney(depositCashDue)}.` : ' Платіж буде закрито повністю.'}
          {depositBalance - depositCoverage > 0 ? ` На депозиті залишиться ${formatMoney(depositBalance - depositCoverage)}.` : ''}
        </p>
      )}
      <div className="rent-actions">
        <button
          className="primary compact"
          disabled={!isLocalTurn || !canPay}
          title={canPay ? undefined : 'Недостатньо грошей для сплати.'}
          onClick={() => dispatch({ type: 'pay_payment', playerId: pendingPayment.payerId })}
        >
          <HandCoins size={16} />
          Сплатити
        </button>
        {depositCoverage > 0 && (
          <button
            className="secondary compact"
            disabled={!isLocalTurn || !canPayWithDeposit}
            title={canPayWithDeposit ? undefined : 'Немає активного депозиту для списання.'}
            onClick={() => dispatch({ type: 'pay_payment_with_deposit', playerId: pendingPayment.payerId })}
          >
            <HandCoins size={16} />
            Депозит
          </button>
        )}
        {isLoanPayment && (
          <button
            className="secondary compact"
            disabled={!isLocalTurn || loanMissBlocked}
            title={loanMissBlocked ? 'Цей кредит треба сплатити або здатися.' : 'Пропустити виплату і продовжити хід.'}
            onClick={() => dispatch({ type: 'miss_loan_payment', playerId: pendingPayment.payerId })}
          >
            <Clock3 size={16} />
            Пропустити
          </button>
        )}
        <button
          className={`surrender-button compact ${isSurrenderCharging ? 'charging' : ''} ${surrenderArmed ? 'armed' : ''}`}
          disabled={!isLocalTurn}
          aria-disabled={!isLocalTurn || !surrenderArmed}
          style={{ '--surrender-charge': `${surrenderCharge}%` } as CSSProperties}
          title="Наведіть і дочекайтесь заповнення. Після натискання ви програєте партію."
          onBlur={stopSurrenderCharge}
          onClick={handleSurrender}
          onFocus={() => setIsSurrenderCharging(true)}
          onPointerEnter={() => setIsSurrenderCharging(true)}
          onPointerLeave={stopSurrenderCharge}
        >
          <ShieldAlert size={16} />
          <span>Здатися</span>
        </button>
      </div>
      <p className="rent-warning">Після натискання “Здатися” ви програєте, а ваше майно повернеться в банк.</p>
    </motion.div>
  );
};

const BoardLogFeed = ({ game, deferUpdates }: { game: GameState; deferUpdates: boolean }) => {
  const [visibleLog, setVisibleLog] = useState(game.log);
  const entries = useMemo(() => [...visibleLog].reverse(), [visibleLog]);
  const latestEntryId = visibleLog[0]?.id ?? '';
  const shellRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [showJumpDown, setShowJumpDown] = useState(false);
  const [logTip, setLogTip] = useState<{ id: string; text: string; top: number }>();

  const updateScrollState = () => {
    const element = logRef.current;
    if (!element) return;
    const isNearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 18;
    stickToBottomRef.current = isNearBottom;
    setShowJumpDown(!isNearBottom);
  };

  const scrollToBottom = () => {
    const element = logRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
    stickToBottomRef.current = true;
    setShowJumpDown(false);
  };

  useEffect(() => {
    setVisibleLog(game.log);
  }, [game.id]);

  useEffect(() => {
    if (deferUpdates) return;
    setVisibleLog(game.log);
  }, [deferUpdates, game.log]);

  const showTip = (entry: GameState['log'][number], element: HTMLElement) => {
    const shell = shellRef.current;
    if (!shell) return;
    const shellRect = shell.getBoundingClientRect();
    const rowRect = element.getBoundingClientRect();
    setLogTip({ id: entry.id, text: entry.text, top: rowRect.top - shellRect.top - 8 });
  };

  useEffect(() => {
    const element = logRef.current;
    if (!element) return;
    const frame = window.requestAnimationFrame(() => {
      element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
      stickToBottomRef.current = true;
      setShowJumpDown(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [latestEntryId]);

  return (
    <div className="board-log-shell" ref={shellRef}>
      <div className="board-log-feed" aria-label="Журнал гри" ref={logRef} onScroll={updateScrollState}>
        {entries.map((entry) => (
          <p
            className={`board-log-line ${entry.tone ?? 'neutral'}`}
            key={entry.id}
            tabIndex={0}
            onBlur={() => setLogTip(undefined)}
            onFocus={(event) => showTip(entry, event.currentTarget)}
            onMouseEnter={(event) => showTip(entry, event.currentTarget)}
            onMouseLeave={() => setLogTip(undefined)}
          >
            <span>{entry.text}</span>
            <time>{entry.createdAt ? formatLogTime(entry.createdAt) : `Хід ${game.turn}`}</time>
          </p>
        ))}
      </div>
      {logTip && (
        <div className="log-tooltip" style={{ '--tip-top': `${logTip.top}px` } as CSSProperties}>
          {logTip.text}
        </div>
      )}
      {showJumpDown && (
        <button className="log-jump-down" type="button" onClick={scrollToBottom}>
          <ChevronsDown size={15} />
          Вниз
        </button>
      )}
    </div>
  );
};

const BoardActionDock = ({
  game,
  isDiceRolling,
  isLocalTurn,
  canAdvanceTurn,
  orderRollPlayer,
  canLocalRollForOrder,
  isBoardBusy,
  hasDoubleRoll,
  dispatch,
  onOpenWorkspace,
  surrenderPlayer,
}: {
  game: GameState;
  isDiceRolling: boolean;
  isLocalTurn: boolean;
  canAdvanceTurn: boolean;
  orderRollPlayer: Player;
  canLocalRollForOrder: boolean;
  isBoardBusy: boolean;
  hasDoubleRoll: boolean;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
  onOpenWorkspace: (tab: WorkspaceTab) => void;
  surrenderPlayer: Player;
}) => {
  const currentPlayer = game.players.find((player) => player.id === game.currentPlayerId)!;
  const pendingTile = game.pendingPurchaseTileId !== undefined ? getTile(game.pendingPurchaseTileId) : undefined;
  const pendingCardTile = game.pendingCardDraw ? getTile(game.pendingCardDraw.tileId) : undefined;
  const diceLabel = isDiceRolling ? '...' : formatDiceRoll(game.dice);
  const hasPendingTrade = game.tradeOffers.some((offer) => offer.status === 'pending');
  const isCurrentPlayerJailed = currentPlayer.jailTurns > 0;
  const [isSurrenderCharging, setIsSurrenderCharging] = useState(false);
  const [surrenderCharge, setSurrenderCharge] = useState(0);
  const surrenderArmed = surrenderCharge >= 100;
  const canSurrender = game.phase !== 'finished' && !surrenderPlayer.isBankrupt;

  useEffect(() => {
    setIsSurrenderCharging(false);
    setSurrenderCharge(0);
  }, [surrenderPlayer.id, game.phase]);

  useEffect(() => {
    if (!isSurrenderCharging || surrenderCharge >= 100) return;
    const timer = window.setTimeout(() => {
      setSurrenderCharge((value) =>
        Math.min(100, value + (SURRENDER_CHARGE_STEP_MS / SURRENDER_CHARGE_MS) * 100),
      );
    }, SURRENDER_CHARGE_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [isSurrenderCharging, surrenderCharge]);

  const stopSurrenderCharge = () => {
    if (surrenderArmed) return;
    setIsSurrenderCharging(false);
    setSurrenderCharge(0);
  };
  const handleSurrender = () => {
    if (!canSurrender || !surrenderArmed) return;
    dispatch({ type: 'declare_bankruptcy', playerId: surrenderPlayer.id });
  };

  return (
    <div className="board-action-dock">
      <div className="dock-dice" aria-label={formatDiceAria(game.dice)}>
        <DiceIcon />
        <div>
          <span>{visibleDiceValues(game.dice).length === 1 ? 'Кубик' : 'Кубики'}</span>
          <strong>{diceLabel}</strong>
        </div>
      </div>

      <div className="dock-primary-action">
        {game.phase === 'orderRoll' && (
          <button
            className="primary"
            disabled={!canLocalRollForOrder}
            onClick={() => dispatch({ type: 'roll_for_order', playerId: orderRollPlayer.id })}
          >
            <RotateCcw size={18} />
            Кинути за чергу
          </button>
        )}

        {game.phase === 'rolling' && !isCurrentPlayerJailed && (
          <button
            className="primary"
            disabled={!isLocalTurn || isBoardBusy || hasPendingTrade}
            title={hasPendingTrade ? 'Спочатку прийміть або відхиліть активну угоду.' : undefined}
            onClick={() => dispatch({ type: 'roll', playerId: currentPlayer.id })}
          >
            <RotateCcw size={18} />
            Кинути кубики
          </button>
        )}

        {game.phase === 'rolling' && isCurrentPlayerJailed && (
          <span className="dock-note">Вʼязниця: {currentPlayer.jailTurns} ход.</span>
        )}

        {game.phase === 'awaitingPurchase' && pendingTile && isPropertyTile(pendingTile) && (
          <span className="dock-note">Рішення щодо {pendingTile.name}</span>
        )}

        {game.phase === 'awaitingCard' && pendingCardTile && (
          <button
            className="primary"
            disabled={!isLocalTurn || isBoardBusy}
            onClick={() => dispatch({ type: 'draw_card', playerId: currentPlayer.id })}
          >
            <CircleHelp size={18} />
            Витягнути картку
          </button>
        )}

        {game.phase === 'auction' && <span className="dock-note">Аукціон триває</span>}

        {game.phase === 'casino' && <span className="dock-note">Рішення в казино</span>}

        {game.phase === 'bankDeposit' && game.pendingBankDeposit && (
          <span className="dock-note">Депозит {formatMoney(game.pendingBankDeposit.amount)}</span>
        )}

        {game.phase === 'awaitingJailDecision' && <span className="dock-note">Рішення щодо вʼязниці</span>}

        {game.phase === 'rent' && game.pendingRent && (
          <span className="dock-note">Оренда {formatMoney(game.pendingRent.amount)}</span>
        )}

        {game.phase === 'payment' && game.pendingPayment && (
          <span className="dock-note">Платіж {formatMoney(game.pendingPayment.amount)}</span>
        )}

        {game.phase === 'turnEnd' &&
          (hasDoubleRoll && !hasPendingTrade ? (
            <button
              className="primary"
              disabled={!isLocalTurn}
              onClick={() => dispatch({ type: 'continue_turn', playerId: currentPlayer.id })}
            >
              <RotateCcw size={18} />
              Кинути ще раз
            </button>
          ) : (
            <div className={`dock-note ${!hasPendingTrade ? 'dock-note-action' : ''}`}>
              <span>{hasPendingTrade ? 'Очікуємо відповідь на угоду' : 'Хід завершується автоматично'}</span>
              {!hasPendingTrade && canAdvanceTurn && (
                <button
                  className="ghost compact"
                  type="button"
                  disabled={isBoardBusy}
                  title={isBoardBusy ? 'Дочекайтесь завершення анімації.' : 'Продовжити хід вручну'}
                  onClick={() => dispatch({ type: 'continue_turn', playerId: currentPlayer.id })}
                >
                  Продовжити
                </button>
              )}
            </div>
          ))}

        {(game.phase === 'manage' || game.phase === 'trade') && (
          <button
            className="primary"
            disabled={!isLocalTurn || isBoardBusy || hasPendingTrade}
            title={hasPendingTrade ? 'Спочатку прийміть або відхиліть активну угоду.' : undefined}
            onClick={() => dispatch({ type: 'continue_turn', playerId: currentPlayer.id })}
          >
            Завершити хід
          </button>
        )}

        {game.phase === 'bankruptcy' && (
          <button className="danger" onClick={() => dispatch({ type: 'declare_bankruptcy', playerId: currentPlayer.id })}>
            Оголосити банкрутство
          </button>
        )}
      </div>

      <div className="dock-tools">
        <button className="dock-tool" type="button" onClick={() => onOpenWorkspace('cards')}>
          <Layers size={18} />
          Мої картки
        </button>
        <button className="dock-tool accent" type="button" onClick={() => onOpenWorkspace('trade')}>
          <ArrowLeftRight size={18} />
          Угода
        </button>
        <button
          className="dock-tool icon-only"
          type="button"
          title="Графік капіталу"
          aria-label="Відкрити графік капіталу"
          onClick={() => onOpenWorkspace('chart')}
        >
          <TrendingUp size={19} />
        </button>
      </div>

      <button
        className={`dock-tool dock-surrender surrender-button ${isSurrenderCharging ? 'charging' : ''} ${surrenderArmed ? 'armed' : ''}`}
        type="button"
        disabled={!canSurrender}
        aria-disabled={!canSurrender || !surrenderArmed}
        style={{ '--surrender-charge': `${surrenderCharge}%` } as CSSProperties}
        title={
          canSurrender
            ? `Здатися за ${surrenderPlayer.name}. Наведіть і дочекайтесь заповнення.`
            : 'Гравець уже вибув або партію завершено.'
        }
        onBlur={stopSurrenderCharge}
        onClick={handleSurrender}
        onFocus={() => setIsSurrenderCharging(true)}
        onPointerEnter={() => setIsSurrenderCharging(true)}
        onPointerLeave={stopSurrenderCharge}
      >
        <ShieldAlert size={17} />
        <span>Здатися</span>
      </button>

    </div>
  );
};

const DiceRollOverlay = ({ game, isRolling, rollingKey }: { game: GameState; isRolling: boolean; rollingKey: number }) => {
  const rollingPlayerId = game.phase === 'orderRoll' ? game.lastOrderRollPlayerId : game.currentPlayerId;
  const currentPlayer = game.players.find((player) => player.id === rollingPlayerId);
  const isSingleDieRoll = visibleDiceValues(game.dice).length === 1;

  return (
    <AnimatePresence>
      {isRolling && currentPlayer && (
        <motion.div
          className="dice-roll-overlay"
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -14, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        >
          <div className="dice-roll-card">
            <div className="dice-roll-heading">
              <PlayerFigurine player={currentPlayer} />
              <div>
                <span>{isSingleDieRoll ? 'Кидає кубик' : 'Кидає кубики'}</span>
                <strong>{currentPlayer.name}</strong>
              </div>
            </div>
            <DiceRoller dice={game.dice} rollingKey={rollingKey} active variant="hero" />
            <div className="dice-roll-trail" aria-hidden>
              <span />
              <span />
              <span />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const CardDrawOverlay = ({
  game,
  isLocalTurn,
  layerBehindDecision,
  dispatch,
}: {
  game: GameState;
  isLocalTurn: boolean;
  layerBehindDecision: boolean;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
}) => {
  const card = game.pendingCard;
  const receiver = game.players.find((player) => player.id === game.currentPlayerId);
  const isCardPaymentDecision = Boolean(card && game.phase === 'payment' && game.pendingPayment?.source === 'card');
  const isUnoReverseAcquire = Boolean(card?.deck === 'chance' && card.cardId === UNO_REVERSE_CARD_ID);

  return (
    <AnimatePresence>
      {card && (
        <motion.div
          className={`card-draw-overlay ${layerBehindDecision ? 'behind-decision' : ''} ${isCardPaymentDecision ? 'card-payment-active' : ''} ${isUnoReverseAcquire ? 'uno-reverse-acquire-active' : ''}`}
          key={`${card.deck}-${card.cardId}-${game.turn}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {isUnoReverseAcquire ? (
            <div className="uno-reverse-acquire-stage">
              <motion.div
                className="uno-reverse-acquire-aura"
                initial={{ opacity: 0, scale: 0.54, rotate: -18 }}
                animate={{ opacity: [0, 0.95, 0.7], scale: [0.54, 1.08, 1], rotate: 26 }}
                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                aria-hidden
              />
              <motion.div
                className="uno-reverse-acquire-rays"
                initial={{ opacity: 0, scale: 0.72, rotate: 0 }}
                animate={{ opacity: [0, 0.72, 0.36], scale: [0.72, 1.12, 1.22], rotate: 42 }}
                transition={{ duration: 1.6, delay: 0.08, ease: 'easeOut' }}
                aria-hidden
              />
              <motion.img
                className="uno-reverse-acquire-card"
                src={UNO_REVERSE_CARD_IMAGE}
                alt=""
                aria-hidden
                initial={{ y: 42, rotateZ: -14, rotateY: -180, scale: 0.46, opacity: 0 }}
                animate={{
                  y: [42, -18, 0],
                  rotateZ: [-14, 8, -3, 0],
                  rotateY: [-180, 180, 540, 720],
                  scale: [0.46, 1.22, 0.98, 1],
                  opacity: 1,
                }}
                transition={{ duration: 1.45, ease: [0.16, 1, 0.3, 1] }}
              />
              <div className="uno-reverse-acquire-sparks" aria-hidden>
                {UNO_REVERSE_SPARK_INDICES.map((index) => (
                  <motion.span
                    key={index}
                    initial={{ opacity: 0, scale: 0.3, x: 0, y: 0 }}
                    animate={{
                      opacity: [0, 1, 0],
                      scale: [0.3, 1, 0.5],
                      x: Math.cos((index / 10) * Math.PI * 2) * 118,
                      y: Math.sin((index / 10) * Math.PI * 2) * 88,
                    }}
                    transition={{ duration: 1.05, delay: 0.2 + index * 0.035, ease: 'easeOut' }}
                  />
                ))}
              </div>
              <motion.div
                className="uno-reverse-acquire-label"
                initial={{ y: 18, opacity: 0, scale: 0.96 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ duration: 0.26, delay: 0.78 }}
              >
                <strong>УНО РЕВЕРС</strong>
                {receiver && <span>{receiver.name}</span>}
              </motion.div>
            </div>
          ) : (
          <div className="card-draw-stage">
            <motion.div
              className={`card-deck ${card.deck}`}
              initial={{ y: -8, rotate: -4, scale: 0.96 }}
              animate={{ y: 0, rotate: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            >
              <span>{card.deck === 'chance' ? 'Шанс' : 'Громада'}</span>
            </motion.div>
            <motion.article
              className={`drawn-card ${card.deck}${isCardPaymentDecision ? ' with-payment' : ''}`}
              initial={{ x: -112, y: 22, rotate: -9, rotateY: 54, scale: 0.84, opacity: 0 }}
              animate={{ x: 0, y: 0, rotate: 0, rotateY: 0, scale: 1, opacity: 1 }}
              exit={{ y: -20, scale: 0.94, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 190, damping: 18, delay: 0.22 }}
            >
              <span className="card-chip">{card.deck === 'chance' ? 'Шанс' : 'Громада'}</span>
              <h3>{card.title}</h3>
              <p>{card.text}</p>
              {isCardPaymentDecision && (
                <PaymentDecisionPanel
                  game={game}
                  isLocalTurn={isLocalTurn}
                  dispatch={dispatch}
                  className="card-payment-inline"
                />
              )}
            </motion.article>
          </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const CityEventReveal = ({ event }: { event?: PendingCityEvent }) => {
  const [visibleEvent, setVisibleEvent] = useState<PendingCityEvent | undefined>();
  const eventKey = event ? `${event.id}:${event.secondary?.id ?? 'single'}:${event.round}` : '';
  const lastEventKeyRef = useRef(eventKey);

  useEffect(() => {
    if (!event || !eventKey) {
      lastEventKeyRef.current = '';
      setVisibleEvent(undefined);
      return;
    }
    if (eventKey === lastEventKeyRef.current) return;
    lastEventKeyRef.current = eventKey;
    setVisibleEvent(event);

    const timer = window.setTimeout(() => {
      setVisibleEvent((current) => (current?.id === event.id && current.round === event.round ? undefined : current));
    }, CITY_EVENT_REVEAL_MS);

    return () => window.clearTimeout(timer);
  }, [eventKey]);

  return (
    <AnimatePresence>
      {visibleEvent && (
        <motion.div
          className="city-event-reveal"
          key={`${visibleEvent.id}-${visibleEvent.round}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24 }}
          aria-live="assertive"
        >
          <motion.article
            className={`city-event-reveal-card${visibleEvent.isDouble ? ' double-city-event' : ''}`}
            initial={{ opacity: 0, y: 26, scale: 0.82 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -18, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 210, damping: 18 }}
          >
            <span className="city-event-reveal-glow" aria-hidden />
            <span className="city-event-reveal-sweep" aria-hidden />
            {visibleEvent.isDouble && <span className="city-event-double-orbit" aria-hidden />}
            <div>
              <span>{visibleEvent.isDouble ? 'Подвійна подія міста' : 'Подія міста'}</span>
              <strong>{visibleEvent.title}</strong>
              <p>{visibleEvent.text}</p>
              {visibleEvent.secondary && (
                <p className="city-event-secondary">
                  <b>{visibleEvent.secondary.title}</b>
                  {visibleEvent.secondary.text}
                </p>
              )}
            </div>
          </motion.article>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const AuctionOverlay = ({ game }: { game: GameState }) => {
  const { localPlayerId, room, dispatch } = useGameStore();
  const auction = game.auction;
  const [now, setNow] = useState(Date.now());
  const [demoBidderId, setDemoBidderId] = useState(localPlayerId ?? game.currentPlayerId);
  const [bidAmount, setBidAmount] = useState(auction?.minimumBid ?? 0);
  const resolveKey = auction ? `${game.id}:${auction.tileId}:${auction.endsAt}:${auction.highestBid}` : '';
  const resolvedRef = useRef('');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const players = game.players.filter((player) => !player.isBankrupt && player.jailTurns <= 0);
  const bidderId = room ? localPlayerId : demoBidderId;
  const bidder = players.find((player) => player.id === bidderId);
  const isHost = !room || Boolean(room.players.find((player) => player.id === localPlayerId)?.isHost);
  const secondsLeft = auction ? Math.max(0, Math.ceil((auction.endsAt - now) / 1000)) : 0;
  const nextMinimumBid = auction ? (auction.highestBid > 0 ? auction.highestBid + AUCTION_BID_INCREMENT : auction.minimumBid) : 0;

  useEffect(() => {
    if (!players.some((player) => player.id === demoBidderId)) {
      setDemoBidderId(players[0]?.id ?? '');
    }
  }, [demoBidderId, players]);

  useEffect(() => {
    if (!auction) return;
    setBidAmount((value) => Math.max(value, nextMinimumBid));
  }, [auction?.tileId, auction?.highestBid, auction?.minimumBid, nextMinimumBid]);

  useEffect(() => {
    if (!auction || secondsLeft > 0 || !isHost || resolvedRef.current === resolveKey) return;
    resolvedRef.current = resolveKey;
    dispatch({ type: 'resolve_auction' });
  }, [auction, dispatch, isHost, resolveKey, secondsLeft]);

  if (!auction) return null;

  const tile = getTile(auction.tileId);
  if (!isPropertyTile(tile)) return null;

  const highestBidder = auction.highestBidderId
    ? game.players.find((player) => player.id === auction.highestBidderId)
    : undefined;
  const maxBid = Math.max(auction.minimumBid, auction.highestBid, ...auction.bids.map((bid) => bid.amount));
  const bidDisabled =
    !bidder ||
    bidder.money < bidAmount ||
    bidAmount < nextMinimumBid ||
    auction.highestBidderId === bidder.id ||
    secondsLeft <= 0;

  const submitBid = (event: FormEvent) => {
    event.preventDefault();
    if (!bidder || bidDisabled) return;
    dispatch({ type: 'auction_bid', playerId: bidder.id, amount: bidAmount });
  };

  return (
    <AnimatePresence>
      <motion.div
        className="auction-overlay"
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
      >
        <div className="auction-head">
          <div>
            <p className="eyebrow">Аукціон</p>
            <h2>{tile.name}</h2>
          </div>
          <div className="auction-timer">
            <span>{secondsLeft}</span>
            <small>сек</small>
          </div>
        </div>

        <div className="auction-clock" aria-hidden>
          <span style={{ width: `${Math.max(0, Math.min(100, (secondsLeft / 15) * 100))}%` }} />
        </div>

        <div className="auction-summary">
          <div>
            <span>Мінімум</span>
            <strong>{formatMoney(auction.minimumBid)}</strong>
          </div>
          <div>
            <span>Лідер</span>
            <strong>{highestBidder ? highestBidder.name : 'Немає'}</strong>
          </div>
          <div>
            <span>Поточна ставка</span>
            <strong>{auction.highestBid > 0 ? formatMoney(auction.highestBid) : '0₴'}</strong>
          </div>
        </div>

        <form className="auction-bid-row" onSubmit={submitBid}>
          {!room && (
            <select value={demoBidderId} onChange={(event) => setDemoBidderId(event.target.value)}>
            {players.map((player) => (
                <option value={player.id} key={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
          )}
          <input
            type="number"
            min={nextMinimumBid}
            step={AUCTION_BID_INCREMENT}
            value={bidAmount}
            onChange={(event) => setBidAmount(Math.max(0, Number(event.target.value)))}
          />
          <button className="primary" type="submit" disabled={bidDisabled}>
            <BadgeDollarSign size={17} />
            Ставка
          </button>
        </form>

        <div className="auction-quick-actions">
          {[AUCTION_BID_INCREMENT, money(50), money(100)].map((increment) => (
            <button
              className="ghost compact"
              type="button"
              onClick={() => setBidAmount(Math.max(nextMinimumBid, auction.highestBid + increment))}
              key={increment}
            >
              +{increment}
            </button>
          ))}
        </div>

        <div className="auction-chart">
          {players.map((player) => {
            const playerBest = Math.max(0, ...auction.bids.filter((bid) => bid.playerId === player.id).map((bid) => bid.amount));
            const width = playerBest > 0 ? Math.max(8, (playerBest / maxBid) * 100) : 3;
            return (
              <div className={`auction-chart-row ${auction.highestBidderId === player.id ? 'leading' : ''}`} key={player.id}>
                <div className="auction-player-name">
                  <span style={{ background: player.color }} />
                  {player.name}
                </div>
                <div className="auction-bar">
                  <i style={{ width: `${width}%`, background: player.color }} />
                </div>
                <strong>{playerBest > 0 ? formatMoney(playerBest) : '-'}</strong>
              </div>
            );
          })}
        </div>

        <div className="auction-history">
          {players.length === 0 ? (
            <p>Усі активні гравці у вʼязниці, тому ставок немає.</p>
          ) : auction.bids.length === 0 ? (
            <p>Ставок ще немає. Гравці у вʼязниці не беруть участі.</p>
          ) : (
            auction.bids
              .slice(-2)
              .reverse()
              .map((bid) => {
                const player = game.players.find((candidate) => candidate.id === bid.playerId);
                return (
                  <p key={`${bid.playerId}-${bid.placedAt}-${bid.amount}`}>
                    <span style={{ background: player?.color ?? '#94a3b8' }} />
                    {player?.name ?? 'Гравець'} поставив {formatMoney(bid.amount)}
                  </p>
                );
              })
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

const TileCell = ({
  tileId,
  onSelectProperty,
  tradeDraft,
  tradePlayerId,
  activeTradeOffer,
  hasPawn,
}: {
  tileId: number;
  onSelectProperty: (tileId: number) => void;
  tradeDraft?: TradeDraft;
  tradePlayerId: string;
  activeTradeOffer?: TradeOffer;
  hasPawn: boolean;
}) => {
  const { game } = useGameStore();
  const tile = getTile(tileId);
  const position = boardPosition(tileId);
  const property = game?.properties[tileId];
  const owner = property?.ownerId ? game?.players.find((player) => player.id === property.ownerId) : undefined;
  const ownerNameMark = owner && game ? getOwnerNameMark(game.players, owner) : '';
  const isInspectable = isPropertyTile(tile);
  const rent = game && property?.ownerId && isPropertyTile(tile) ? calculateRent(game, tile, game.dice[0] + game.dice[1]) : undefined;
  const price = game && isPropertyTile(tile) ? getEffectivePropertyPrice(game, tile) : undefined;
  const mortgageTurnsLeft = game && property?.mortgaged ? getMortgageTurnsLeft(game, property) : undefined;
  const district = game && tile.type === 'city' ? game.districtPaths?.[tile.group] : undefined;
  const districtView = district ? getDistrictPathView(district.path) : undefined;
  const tradeState =
    game && isInspectable
      ? getTradeTileState(game, tile.id, tradePlayerId, tradeDraft) ?? getActiveTradeTileState(tile.id, activeTradeOffer)
      : undefined;

  return (
    <motion.article
      className={`tile tile-${position.side} ${tile.type} ${isInspectable ? 'inspectable' : ''} ${owner ? 'owned' : ''} ${property?.mortgaged ? 'mortgaged' : ''} ${district ? `district-${district.path}` : ''} ${tradeState ? `trade-${tradeState}` : ''} ${hasPawn ? 'occupied' : ''}`}
      role={isInspectable ? 'button' : undefined}
      tabIndex={isInspectable ? 0 : undefined}
      style={
        {
          left: `${position.left}%`,
          top: `${position.top}%`,
          width: `${position.width}%`,
          height: `${position.height}%`,
          '--owner-color': owner?.color ?? 'transparent',
          '--group-color': tile.type === 'city' ? tile.groupColor : 'rgba(148, 163, 184, 0.42)',
        } as CSSProperties
      }
      onClick={() => {
        if (isInspectable) onSelectProperty(tile.id);
      }}
      onKeyDown={(event) => {
        if (!isInspectable || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        onSelectProperty(tile.id);
      }}
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
    >
      <span className="tile-pawn-zone" aria-hidden />
      {tile.type === 'city' && (
        <>
          <CityTileArt tile={tile} />
          <span className="group-band" style={{ background: tile.groupColor }} />
        </>
      )}
      {tile.type === 'bank' && (
        <div className={`bank-art ${tile.bankKey}`}>
          <Building2 size={20} />
        </div>
      )}
      {tile.type !== 'city' && tile.type !== 'bank' && <TileIcon tile={tile} />}
      {owner && (
        <>
          <span className="owner-rail" aria-hidden />
          <span
            className={`owner-chip ${tile.type === 'bank' || tile.type === 'utility' ? 'service-owner-chip' : ''}`}
            title={`Власник: ${owner.name}`}
          >
            {ownerNameMark}
          </span>
        </>
      )}
      {districtView && (
        <span className={`district-tile-badge district-${district!.path}`} title={`${districtView.label}: ${districtView.effect}`}>
          {districtView.shortLabel}
        </span>
      )}
      {mortgageTurnsLeft !== undefined && (
        <>
          <span className="mortgage-lock-watermark" aria-hidden>
            <Lock size={24} />
          </span>
          <span
            className="mortgage-lock-badge"
            title={
            mortgageTurnsLeft > 0
              ? `Заставлено. Залишилось ${mortgageTurnsLeft} ${formatTurnWord(mortgageTurnsLeft)} власника.`
              : 'Заставлено. Місто скоро повернеться банку.'
            }
          >
            <Lock size={14} />
            {mortgageTurnsLeft}
          </span>
        </>
      )}
      <div className="tile-label">
        <div className="tile-name">{tile.name}</div>
        {isPropertyTile(tile) && (
          <div className="tile-price">
            {property?.mortgaged ? 'Заставлено' : owner ? formatMoney(rent ?? 0) : formatMoney(price ?? tile.price)}
          </div>
        )}
      </div>
      {owner && <span className="owner-dot" style={{ background: owner.color }} title={owner.name} />}
      {tile.type === 'city' && owner && property && property.houses > 0 && (
        <TileBuildings houses={property.houses} color={owner.color} />
      )}
    </motion.article>
  );
};

const CityTileArt = ({ tile }: { tile: CityTile }) => {
  const artKind = CITY_TILE_ART[tile.citySlug] ?? 'urban';
  const Icon = getCityTileIcon(artKind);

  return (
    <div className={`city-tile-art city-art-${artKind}`} aria-hidden>
      <span className="city-art-wash" />
      <span className="city-art-pattern" />
      <span className="city-art-skyline">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="city-art-icon">
        <Icon size={22} strokeWidth={2.35} />
      </span>
    </div>
  );
};

const getCityTileIcon = (artKind: CityArtKind) => {
  switch (artKind) {
    case 'capital':
      return Landmark;
    case 'castle':
      return Castle;
    case 'coast':
      return Sailboat;
    case 'forest':
      return Trees;
    case 'industrial':
      return Factory;
    case 'mountain':
      return Mountain;
    case 'river':
      return Waves;
    case 'civic':
      return MapPinned;
    default:
      return Building;
  }
};

const TileBuildings = ({ houses, color }: { houses: number; color: string }) => {
  const isHotel = houses >= 5;
  return (
    <div
      className={`tile-buildings ${isHotel ? 'hotel' : ''}`}
      style={{ '--building-color': color } as CSSProperties}
      title={isHotel ? 'Готель' : `${houses} буд.`}
      aria-hidden
    >
      {isHotel ? (
        <span className="tile-hotel" />
      ) : (
        Array.from({ length: houses }, (_, index) => <span className="tile-house" key={index} />)
      )}
    </div>
  );
};

const TileIcon = ({ tile }: { tile: ReturnType<typeof getTile> }) => {
  const iconProps = { size: 26, strokeWidth: 2.4 };
  switch (tile.type) {
    case 'go':
      return (
        <div className="tile-icon go-icon">
          <Flag {...iconProps} />
        </div>
      );
    case 'jail':
      return (
        <div className="tile-icon jail-icon">
          <Landmark {...iconProps} />
        </div>
      );
    case 'casino':
      return (
        <div className="tile-icon casino-icon">
          <BadgeDollarSign {...iconProps} />
        </div>
      );
    case 'goToJail':
      return (
        <div className="tile-icon danger-icon">
          <ShieldAlert {...iconProps} />
        </div>
      );
    case 'chance':
      return (
        <div className="tile-icon chance-icon">
          <CircleHelp {...iconProps} />
        </div>
      );
    case 'community':
      return (
        <div className="tile-icon community-icon">
          <UsersRound {...iconProps} />
        </div>
      );
    case 'tax':
      return (
        <div className="tile-icon tax-icon">
          <BadgePercent {...iconProps} />
        </div>
      );
    case 'utility':
      return (
        <div className={`tile-icon utility-icon ${tile.utilityKey}`}>
          <Layers {...iconProps} />
        </div>
      );
    default:
      return null;
  }
};

const BoardPawns = ({ game, displayPositions }: { game: GameState; displayPositions: Record<string, number> }) => {
  const groups = game.players.reduce<Record<number, Player[]>>((acc, player) => {
    if (player.isBankrupt) return acc;
    const position = displayPositions[player.id] ?? player.position;
    acc[position] = [...(acc[position] ?? []), player];
    return acc;
  }, {});

  return (
    <div className="board-pawns" aria-hidden>
      {Object.entries(groups).flatMap(([tileId, players]) =>
        players.map((player, index) => {
          const point = pawnPoint(Number(tileId), index, players.length);
          const baseScale = players.length > 4 ? 0.82 : 1;
          const isTurnStartPawn = game.phase === 'rolling' && player.id === game.currentPlayerId && !player.isBankrupt;
          return (
            <motion.div
              className={`board-pawn ${player.jailTurns > 0 ? 'jailed' : ''} ${isTurnStartPawn ? 'turn-start' : ''}`}
              data-player-id={player.id}
              data-jail-turns={player.jailTurns > 0 ? player.jailTurns : undefined}
              title={player.name}
              key={player.id}
              initial={false}
              animate={{ left: `${point.x}%`, top: `${point.y}%` }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              style={
                {
                  '--pawn-color': player.color,
                  '--pawn-scale': isTurnStartPawn ? baseScale * 1.28 : baseScale,
                  zIndex: 40 + index + (isTurnStartPawn ? 20 : 0),
                } as CSSProperties
              }
            >
              <PlayerFigurine player={player} />
            </motion.div>
          );
        }),
      )}
    </div>
  );
};

const DistrictPathAnimationLayer = ({ events }: { events: DistrictPathAnimationEvent[] }) => (
  <div className="district-path-animation-layer" aria-live="polite">
    <AnimatePresence>
      {events.map((event) => {
        const view = getDistrictPathView(event.path);
        const Icon = view.Icon;
        return (
          <motion.div
            className={`district-path-event district-${event.path}`}
            key={event.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ '--district-color': event.color } as CSSProperties}
          >
            {event.tileIds.map((tileId, index) => {
              const point = tileCenterPoint(tileId);
              return (
                <span
                  className="district-path-tile-pulse"
                  key={`${event.id}-${tileId}`}
                  style={
                    {
                      left: `${point.x}%`,
                      top: `${point.y}%`,
                      animationDelay: `${index * 130}ms`,
                    } as CSSProperties
                  }
                />
              );
            })}
            <motion.div
              className="district-path-card"
              initial={{ y: 24, scale: 0.82, rotateX: -18 }}
              animate={{ y: 0, scale: 1, rotateX: 0 }}
              exit={{ y: 12, scale: 0.92 }}
              transition={{ duration: 0.46, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="district-path-icon">
                <Icon size={24} />
              </span>
              <div>
                <strong>{view.label}</strong>
                <small>
                  {event.group} · {event.ownerName}
                </small>
              </div>
              <em>{event.tileNames.join(' · ')}</em>
            </motion.div>
          </motion.div>
        );
      })}
    </AnimatePresence>
  </div>
);

const BuildingAnimationLayer = ({ events }: { events: BuildingAnimationEvent[] }) => (
  <div className="building-animation-layer" aria-hidden>
    {events.map((event) => {
      const point = tileCenterPoint(event.tileId);
      const isHotel = event.toHouses >= 5 || event.fromHouses >= 5;
      const isHotelBuild = event.kind === 'build' && event.toHouses >= 5;
      return (
        <div
          className={`building-event ${event.kind} ${isHotel ? 'hotel' : ''} ${isHotelBuild ? 'hotel-build' : ''}`}
          key={event.id}
          style={
            {
              left: `${point.x}%`,
              top: `${point.y}%`,
              '--building-color': event.color,
            } as CSSProperties
          }
        >
          <span className="building-shadow" />
          <span className="building-wave" />
          <span className="building-wave secondary" />
          {isHotelBuild && <span className="hotel-flare" />}
          <span className="building-model">
            <span />
            <span />
            <span />
          </span>
          {event.kind === 'demolish' && (
            <span className="building-debris">
              <i />
              <i />
              <i />
              <i />
            </span>
          )}
        </div>
      );
    })}
  </div>
);

const AuctionWinAnimationLayer = ({ events }: { events: AuctionWinAnimationEvent[] }) => (
  <div className="auction-win-animation-layer" aria-hidden>
    {events.map((event) => {
      const point = tileCenterPoint(event.tileId);
      return (
        <div
          className="auction-win-event"
          key={event.id}
          style={
            {
              left: `${point.x}%`,
              top: `${point.y}%`,
              '--auction-winner-color': event.color,
            } as CSSProperties
          }
        >
          <span className="auction-win-ring" />
          <span className="auction-win-ring secondary" />
          <span className="auction-win-coins">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="auction-win-badge">
            <BadgeDollarSign size={18} />
            <span>
              <strong>{event.playerName}</strong>
              <small>{formatMoney(event.amount)}</small>
            </span>
          </span>
        </div>
      );
    })}
  </div>
);

const MortgageAnimationLayer = ({ events }: { events: MortgageAnimationEvent[] }) => (
  <div className="mortgage-animation-layer" aria-hidden>
    {events.map((event) => {
      const point = tileCenterPoint(event.tileId);
      const isMortgage = event.kind === 'mortgage';
      const isReleased = event.kind === 'released';
      const Icon = isMortgage ? Lock : LockOpen;
      return (
        <div
          className={`mortgage-event ${event.kind}`}
          key={event.id}
          style={
            {
              left: `${point.x}%`,
              top: `${point.y}%`,
              '--mortgage-event-color': event.color,
            } as CSSProperties
          }
        >
          <span className="mortgage-event-pulse" />
          <span className="mortgage-event-scan" />
          <span className="mortgage-event-stamp">
            <Icon size={20} />
            <span>
              <strong>{isMortgage ? 'Застава' : isReleased ? 'Нічийне' : 'Викуплено'}</strong>
              <small>{isReleased ? `${event.tileName} повернулось у банк` : event.tileName}</small>
            </span>
          </span>
        </div>
      );
    })}
  </div>
);

const LoanOfferAnimationLayer = ({ events }: { events: LoanOfferAnimationEvent[] }) => (
  <div className="loan-offer-animation-layer" aria-live="polite">
    <AnimatePresence>
      {events.map((event) => {
        const isAccepted = event.kind === 'accepted';
        return (
          <motion.div
            className={`loan-offer-event ${event.kind}`}
            key={event.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={
              {
                '--loan-lender-color': event.lenderColor,
                '--loan-borrower-color': event.borrowerColor,
              } as CSSProperties
            }
          >
            <motion.div
              className="loan-offer-burst"
              initial={{ scale: 0.38, opacity: 0 }}
              animate={{ scale: [0.38, 1.05, 1.28], opacity: [0, 0.68, 0] }}
              transition={{ duration: 1.15, delay: 0.18 }}
              aria-hidden
            />
            <motion.div
              className="loan-offer-card"
              initial={{ y: 30, scale: 0.74, rotateZ: isAccepted ? -5 : 5 }}
              animate={{
                y: [30, -8, 0],
                scale: [0.74, 1.08, 1],
                rotateZ: isAccepted ? [-5, 3, 0] : [5, -4, 3, 0],
              }}
              exit={{ y: 14, scale: 0.92, opacity: 0 }}
              transition={{ duration: isAccepted ? 0.62 : 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="loan-offer-icon">{isAccepted ? <Handshake size={30} /> : <X size={30} />}</span>
              <div>
                <strong>{isAccepted ? 'Кредит підтверджено' : 'Кредит відхилено'}</strong>
                <small>
                  {event.lenderName} · {event.borrowerName}
                </small>
              </div>
              <em>
                {formatMoney(event.principal)} → {formatMoney(event.totalRepayment)}
              </em>
            </motion.div>
          </motion.div>
        );
      })}
    </AnimatePresence>
  </div>
);

const UnoReverseAnimationLayer = ({ events }: { events: UnoReverseAnimationEvent[] }) => (
  <div className="uno-reverse-animation-layer" aria-live="polite">
    <AnimatePresence>
      {events.map((event) => (
        <motion.div
          className="uno-reverse-event"
          key={event.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className="uno-reverse-card-spin"
            initial={{ y: 40, scale: 0.42, rotateZ: -18, rotateY: -160 }}
            animate={{
              y: [40, -14, 0],
              scale: [0.42, 1.18, 1],
              rotateZ: [-18, 10, -4, 0],
              rotateY: [-160, 220, 540, 720],
            }}
            transition={{ duration: 1.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <img src={UNO_REVERSE_CARD_IMAGE} alt="" aria-hidden />
          </motion.div>
          <motion.div
            className="uno-reverse-burst"
            initial={{ scale: 0.42, opacity: 0 }}
            animate={{ scale: [0.42, 1.08, 1.3], opacity: [0, 0.75, 0] }}
            transition={{ duration: 1.1, delay: 0.26 }}
            aria-hidden
          />
          <motion.div
            className="uno-reverse-caption"
            initial={{ y: 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ duration: 0.28, delay: 0.52 }}
          >
            <strong>УНО РЕВЕРС</strong>
            <span>
              <i style={{ '--reverse-player-color': event.fromColor } as CSSProperties} />
              {event.fromName}
              <ArrowLeftRight size={15} />
              <i style={{ '--reverse-player-color': event.toColor } as CSSProperties} />
              {event.toName}
            </span>
            <small>
              {event.tileName} · {formatMoney(event.amount)}
            </small>
          </motion.div>
        </motion.div>
      ))}
    </AnimatePresence>
  </div>
);

const PlayerRail = ({ secondsLeft }: { secondsLeft: number }) => {
  const { game } = useGameStore();
  if (!game) return null;
  const isCompact = game.players.length > 4;
  const borrowerLoanSummary = new Map<string, { count: number; due: number }>();
  (game.loans ?? []).forEach((loan) => {
    if (loan.remainingDue <= 0) return;
    const current = borrowerLoanSummary.get(loan.borrowerId) ?? { count: 0, due: 0 };
    borrowerLoanSummary.set(loan.borrowerId, { count: current.count + 1, due: current.due + loan.remainingDue });
  });
  return (
    <section className={`panel players-panel ${isCompact ? 'compact-players' : ''}`}>
      <p className="eyebrow">Гравці</p>
      {game.players.map((player) => {
        const isActive = player.id === game.currentPlayerId;
        const isJailed = player.jailTurns > 0;
        const propertyCount = player.properties.length;
        const borrowedLoanSummary = borrowerLoanSummary.get(player.id);
        return (
          <article
            className={`player-row ${isActive ? 'active' : ''} ${isJailed ? 'jailed' : ''} ${player.isBankrupt ? 'bankrupt' : ''}`}
            key={player.id}
            style={{ '--player-color': player.isBankrupt ? '#64748b' : player.color } as CSSProperties}
          >
            <div className="player-avatar">
              <PlayerFigurine player={player} size="large" />
            </div>
            <div className="player-meta">
              <div className="player-name-line">
                <h3 title={player.name}>{player.name}</h3>
                {isActive && !player.isBankrupt && game.phase !== 'finished' && (
                  <span className="player-timer">{formatTimer(secondsLeft)}</span>
                )}
              </div>
              {(player.isBankrupt || isJailed) && (
                <div className="player-stat-line">
                  {player.isBankrupt && <span className="player-status-chip bankrupt">Вибув</span>}
                  {!player.isBankrupt && isJailed && <span className="player-status-chip jailed">Вʼязн. {player.jailTurns}</span>}
                </div>
              )}
            </div>
            <strong className="player-money">{formatMoney(player.money)}</strong>
            <span className="player-property-count player-property-badge" title={`${propertyCount} полів`}>
              <MapPinned size={12} />
              <strong>{propertyCount}</strong>
              <span className="player-property-unit">полів</span>
            </span>
            {!player.isBankrupt && borrowedLoanSummary && (
              <span className="player-status-chip credit player-loan-badge" title={`Непогашений кредит: ${formatMoney(borrowedLoanSummary.due)}`}>
                <HandCoins size={12} />
                <span className="player-loan-label">{borrowedLoanSummary.count > 1 ? `Кредит x${borrowedLoanSummary.count}` : 'Кредит'}</span>
              </span>
            )}
          </article>
        );
      })}
    </section>
  );
};

const WorkspaceDrawer = ({
  activeTab,
  onTabChange,
  onClose,
  onStartTrade,
}: {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  onClose: () => void;
  onStartTrade: (player: Player, partners: Player[]) => void;
}) => {
  const tabs: Array<{ id: WorkspaceTab; label: string; icon: typeof Layers }> = [
    { id: 'cards', label: 'Мої картки', icon: Layers },
    { id: 'trade', label: 'Угода', icon: ArrowLeftRight },
    { id: 'credits', label: 'Кредити', icon: HandCoins },
    { id: 'chart', label: 'Графік', icon: TrendingUp },
  ];
  const title =
    activeTab === 'cards'
      ? 'Мої картки'
      : activeTab === 'trade'
        ? 'Угода'
        : activeTab === 'credits'
          ? 'Кредити'
          : 'Графік капіталу';

  return (
    <div className="workspace-backdrop" role="presentation" onMouseDown={onClose}>
      <motion.aside
        className={`workspace-drawer ${activeTab === 'chart' ? 'chart-drawer' : ''}`}
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, x: 28, scale: 0.98 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 28, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-head">
          <div>
            <p className="eyebrow">Керування</p>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрити">
            <X size={18} />
          </button>
        </div>

        <div className="rail-tabs drawer-tabs" role="tablist" aria-label="Керування грою">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                className={`rail-tab ${activeTab === tab.id ? 'active' : ''}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            className="drawer-body"
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.16 }}
          >
            {activeTab === 'cards' ? (
              <ManagePanel />
            ) : activeTab === 'trade' ? (
              <TradePanel onStartTrade={onStartTrade} onOpenCredits={() => onTabChange('credits')} />
            ) : activeTab === 'credits' ? (
              <CreditsPanel onClose={onClose} />
            ) : (
              <MoneyChartPanel />
            )}
          </motion.div>
        </AnimatePresence>
      </motion.aside>
    </div>
  );
};

const MoneyChartPanel = () => {
  const { game } = useGameStore();
  const [hoveredIndex, setHoveredIndex] = useState<number | undefined>();
  const history = useMemo(() => (game ? getMoneyChartHistory(game) : []), [game]);

  if (!game) return null;

  const chartWidth = 620;
  const chartHeight = 280;
  const padding = { top: 20, right: 18, bottom: 34, left: 54 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  const values = history.flatMap((point) => game.players.map((player) => getChartWorth(point, player)));
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const valuePadding = rawMin === rawMax ? money(100) : Math.max(money(50), (rawMax - rawMin) * 0.12);
  const minMoney = rawMin < 0 ? rawMin - valuePadding : Math.max(0, rawMin - valuePadding);
  const maxMoney = rawMax + valuePadding;
  const range = Math.max(1, maxMoney - minMoney);
  const activeIndex = Math.min(hoveredIndex ?? history.length - 1, history.length - 1);
  const activePoint = history[activeIndex];
  const xForIndex = (index: number) =>
    padding.left + (history.length === 1 ? innerWidth / 2 : (index / (history.length - 1)) * innerWidth);
  const yForMoney = (amount: number) => padding.top + ((maxMoney - amount) / range) * innerHeight;
  const activeRows = [...game.players]
    .map((player) => ({
      player,
      amount: activePoint ? getChartWorth(activePoint, player) : player.money,
      cash: activePoint?.money[player.id] ?? player.money,
    }))
    .sort((left, right) => right.amount - left.amount);

  const makePath = (player: Player) =>
    history
      .map((point, index) => {
        const command = index === 0 ? 'M' : 'L';
        return `${command} ${xForIndex(index).toFixed(2)} ${yForMoney(getChartWorth(point, player)).toFixed(2)}`;
      })
      .join(' ');

  return (
    <div className="money-chart-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Статистика</p>
          <h3>Капітал по ходах</h3>
        </div>
        <strong>{history.length} точок</strong>
      </div>

      <div className="money-chart-card" onMouseLeave={() => setHoveredIndex(undefined)}>
        <svg className="money-chart-svg" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Графік капіталу гравців">
          {[0, 0.5, 1].map((step) => {
            const y = padding.top + innerHeight * step;
            const label = formatMoney(Math.round(maxMoney - range * step));
            return (
              <g key={step}>
                <line className="money-chart-grid" x1={padding.left} x2={chartWidth - padding.right} y1={y} y2={y} />
                <text className="money-chart-axis-label" x={padding.left - 10} y={y} textAnchor="end" dominantBaseline="middle">
                  {label}
                </text>
              </g>
            );
          })}

          {game.players.map((player) => (
            <path className="money-chart-line" d={makePath(player)} stroke={player.color} key={player.id} />
          ))}

          {activePoint && (
            <line
              className="money-chart-cursor"
              x1={xForIndex(activeIndex)}
              x2={xForIndex(activeIndex)}
              y1={padding.top}
              y2={chartHeight - padding.bottom}
            />
          )}

          {activePoint &&
            game.players.map((player) => (
              <circle
                className="money-chart-point"
                cx={xForIndex(activeIndex)}
                cy={yForMoney(getChartWorth(activePoint, player))}
                r="4.5"
                fill={player.color}
                key={player.id}
              />
            ))}

          {history.map((point, index) => {
            const step = history.length === 1 ? innerWidth : innerWidth / (history.length - 1);
            const x = history.length === 1 ? padding.left : Math.max(padding.left, xForIndex(index) - step / 2);
            const width = history.length === 1 ? innerWidth : Math.min(step, chartWidth - padding.right - x);
            return (
              <rect
                className="money-chart-hit"
                x={x}
                y={padding.top}
                width={width}
                height={innerHeight}
                onMouseEnter={() => setHoveredIndex(index)}
                onFocus={() => setHoveredIndex(index)}
                tabIndex={0}
                key={`${point.turn}-${point.round}-${index}`}
              />
            );
          })}

          <text className="money-chart-turn-label" x={padding.left} y={chartHeight - 8}>
            Хід {history[0]?.turn ?? game.turn}
          </text>
          <text className="money-chart-turn-label" x={chartWidth - padding.right} y={chartHeight - 8} textAnchor="end">
            Хід {history[history.length - 1]?.turn ?? game.turn}
          </text>
        </svg>
      </div>

      {activePoint && (
        <div className="money-chart-tooltip">
          <div className="money-chart-tooltip-head">
            <strong>Хід {activePoint.turn}</strong>
            <span>Раунд {activePoint.round}</span>
          </div>
          {activeRows.map(({ player, amount, cash }) => (
            <div className="money-chart-tooltip-row" title={`Готівка: ${formatMoney(cash)}`} key={player.id}>
              <span className="money-chart-dot" style={{ background: player.color }} />
              <span>{player.name}</span>
              <strong>{formatMoney(amount)}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="money-chart-legend">
        {game.players.map((player) => (
          <span key={player.id}>
            <i style={{ background: player.color }} />
            {player.name}
          </span>
        ))}
      </div>
    </div>
  );
};

const getMoneyChartHistory = (game: GameState): MoneyHistoryPoint[] => {
  const history = game.moneyHistory && game.moneyHistory.length > 0 ? game.moneyHistory : [createCurrentMoneyPoint(game)];
  const current = createCurrentMoneyPoint(game);
  const last = history[history.length - 1];
  const isSamePoint = last.turn === current.turn && last.round === current.round;

  if (isSamePoint) {
    return history.map((point, index) => (index === history.length - 1 ? { ...current, createdAt: point.createdAt } : point));
  }

  return [...history, current];
};

const createCurrentMoneyPoint = (game: GameState): MoneyHistoryPoint => ({
  turn: game.turn,
  round: game.currentRound ?? 1,
  createdAt: game.log[0]?.createdAt ?? 0,
  money: Object.fromEntries(game.players.map((player) => [player.id, player.money])),
  worth: Object.fromEntries(game.players.map((player) => [player.id, calculatePlayerChartWorth(game, player)])),
});

const getChartWorth = (point: MoneyHistoryPoint, player: Player): number =>
  point.worth?.[player.id] ?? point.money[player.id] ?? player.money;

const calculatePlayerChartWorth = (game: GameState, player: Player): number =>
  player.money +
  player.properties.reduce((sum, tileId) => {
    const tile = getTile(tileId);
    if (!isPropertyTile(tile)) return sum;
    const property = game.properties[tile.id];
    const buildingValue = tile.type === 'city' ? property.houses * tile.houseCost : 0;
    return sum + tile.price + buildingValue;
  }, 0);

const ManagePanel = () => {
  const { game, localPlayerId, room, dispatch } = useGameStore();
  const player = useMemo(() => (game ? panelPlayer(game, localPlayerId, Boolean(room)) : undefined), [game, localPlayerId, room]);
  const ownedTiles = useMemo(() => {
    if (!game || !player) return [];
    return player.properties.map((tileId) => getTile(tileId)).filter(isPropertyTile);
  }, [game, player]);

  if (!game || !player) return null;

  const cities = ownedTiles.filter((tile): tile is CityTile => tile.type === 'city');
  const banks = ownedTiles.filter((tile) => tile.type === 'bank');
  const utilities = ownedTiles.filter((tile) => tile.type === 'utility');
  const cityGroups = groupCities(cities);
  const activeBankDeposit = (game.bankDeposits ?? {})[player.id];
  const activeBankDepositInfo = getBankDepositInfo(game, player.id);

  return (
    <div className="cards-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Мої картки</p>
          <h3>{player.name}</h3>
        </div>
        <strong>{ownedTiles.length} майна</strong>
      </div>

      {player.jailCards > 0 && (
        <div className="bonus-card">
          <Landmark size={18} />
          <div>
            <strong>Картка виходу з вʼязниці</strong>
            <span>x{player.jailCards}</span>
          </div>
        </div>
      )}

      {(player.unoReverseCards ?? 0) > 0 && (
        <div className="bonus-card uno-reverse">
          <img src={UNO_REVERSE_CARD_IMAGE} alt="" aria-hidden />
          <div>
            <strong>УНО РЕВЕРС</strong>
            <span>x1</span>
          </div>
        </div>
      )}

      {(player.loanPayoffCards ?? 0) > 0 && (
        <div className="bonus-card loan-payoff">
          <BadgeDollarSign size={18} />
          <div>
            <strong>Кредитна амністія</strong>
            <span>x1</span>
          </div>
        </div>
      )}

      {activeBankDeposit && (
        <div className="bonus-card bank-deposit">
          <HandCoins size={18} />
          <div>
            <strong>Банківський депозит</strong>
            <span>
              Накопичено {formatMoney(activeBankDepositInfo.payout)} · ліміт {formatMoney(activeBankDepositInfo.maxPayout)}
            </span>
          </div>
        </div>
      )}

      {ownedTiles.length === 0 && <p className="muted empty-note">Купіть місто або банк, щоб тут зʼявились картки майна.</p>}

      {cityGroups.map((group) => {
        const ownsGroup = ownsAllCities(game, player.id, group.tiles);
        const district = game.districtPaths?.[group.name];
        const districtView = district ? getDistrictPathView(district.path) : undefined;
        return (
          <section className="asset-group" style={{ '--group-color': group.color } as CSSProperties} key={group.name}>
            <div className="asset-group-header">
              <span className="group-dot" />
              <div>
                <h4>{group.name}</h4>
                <p>
                  {districtView
                    ? districtView.label
                    : ownsGroup
                      ? 'Район треба створити перед будівництвом'
                      : 'Потрібна вся група для будівництва'}
                </p>
              </div>
            </div>
            <div className="asset-grid">
              {group.tiles.map((tile) => (
                <CityAssetCard game={game} player={player} tile={tile} dispatch={dispatch} key={tile.id} />
              ))}
            </div>
          </section>
        );
      })}

      {(banks.length > 0 || utilities.length > 0) && (
        <section className="asset-group neutral">
          <div className="asset-group-header">
            <span className="group-dot" />
            <div>
              <h4>Банки та сервіси</h4>
              <p>Оренда залежить від комплекту або кидка кубиків.</p>
            </div>
          </div>
          <div className="asset-grid">
            {[...banks, ...utilities].map((tile) => (
              <SimpleAssetCard game={game} player={player} tile={tile} dispatch={dispatch} key={tile.id} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

const CityAssetCard = ({
  game,
  player,
  tile,
  dispatch,
}: {
  game: GameState;
  player: Player;
  tile: CityTile;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
}) => {
  const property = game.properties[tile.id];
  const rent = calculateRent(game, tile, game.dice[0] + game.dice[1]);
  const houseCost = getEffectiveHouseCost(game, tile);
  const buildInfo = getBuildInfo(game, player, tile);
  const demolishInfo = getDemolishInfo(game, player, tile);
  const mortgageInfo = getMortgageInfo(game, player, tile);
  const district = game.districtPaths?.[tile.group];
  const districtView = district ? getDistrictPathView(district.path) : undefined;
  const DistrictIcon = districtView?.Icon;

  return (
    <article className={`asset-card city-asset ${property.mortgaged ? 'mortgaged' : ''}`}>
      <img src={tile.image} alt="" />
      <span className="asset-band" style={{ background: tile.groupColor }} />
      <div className="asset-card-body">
        <div>
          <h5>{tile.name}</h5>
          <p>Оренда {formatMoney(rent)}</p>
        </div>
        {districtView && DistrictIcon && (
          <div className={`district-mini-card district-${district!.path}`}>
            <DistrictIcon size={14} />
            <span>{districtView.label}</span>
          </div>
        )}
        <div className="asset-stats">
          <span title="Поточна забудова">
            {property.houses === 5 ? <Hotel size={14} /> : <Home size={14} />}
            {property.houses === 5 ? 'Готель' : `${property.houses} буд.`}
          </span>
          <span>Будинок {formatMoney(houseCost)}</span>
        </div>
        <CityRentTable
          tile={tile}
          currentHouses={property.houses}
          hasDistrict={ownsAllCities(game, player.id, getCityGroup(tile))}
          districtPath={district?.path}
          compact
        />
        <div className={`build-status ${buildInfo.canBuild ? 'ready' : 'blocked'}`}>{buildInfo.reason}</div>
        <div className="asset-actions city-asset-actions">
          <button
            className="primary compact"
            disabled={!buildInfo.canBuild}
            title={buildInfo.reason}
            onClick={() => dispatch({ type: 'build', playerId: player.id, tileId: tile.id })}
          >
            <Hammer size={15} />
            Будинок
          </button>
          <button
            className="secondary compact"
            disabled={!demolishInfo.canDemolish}
            title={demolishInfo.reason}
            onClick={() => dispatch({ type: 'sell_building', playerId: player.id, tileId: tile.id })}
          >
            <Trash2 size={15} />
            Знести
          </button>
          <button
            className="icon-button"
            disabled={mortgageInfo.disabled}
            title={mortgageInfo.reason}
            onClick={() => dispatch({ type: property.mortgaged ? 'unmortgage' : 'mortgage', playerId: player.id, tileId: tile.id })}
          >
            <BadgeDollarSign size={16} />
          </button>
        </div>
      </div>
    </article>
  );
};

const SimpleAssetCard = ({
  game,
  player,
  tile,
  dispatch,
}: {
  game: GameState;
  player: Player;
  tile: Exclude<PropertyTile, CityTile>;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
}) => {
  const property = game.properties[tile.id];
  const rent = calculateRent(game, tile, game.dice[0] + game.dice[1]);
  const mortgageValue = getEffectiveMortgageValue(game, tile);
  const mortgageInfo = getMortgageInfo(game, player, tile);
  const bankDepositInfo = tile.type === 'bank' ? getBankDepositInfo(game, player.id) : undefined;
  const activeBankDeposit = bankDepositInfo?.activeDeposit;

  return (
    <article className={`asset-card service-asset ${property.mortgaged ? 'mortgaged' : ''}`}>
      <div className={`service-icon ${tile.type === 'bank' ? tile.bankKey : tile.utilityKey}`}>
        {tile.type === 'bank' ? <Building2 size={20} /> : <Layers size={20} />}
      </div>
      <div className="asset-card-body">
        <div>
          <h5>{tile.name}</h5>
          <p>Оренда {formatMoney(rent)}</p>
        </div>
        <div className="asset-stats">
          <span>Застава {formatMoney(mortgageValue)}</span>
          <span>
            {activeBankDeposit
              ? `Депозит ${formatMoney(bankDepositInfo?.payout ?? 0)}`
              : property.mortgaged
                ? 'Заставлено'
                : 'Активне'}
          </span>
        </div>
        {activeBankDeposit && (
          <div className="bank-deposit-chip">
            <HandCoins size={14} />
            <span>
              {getBankDepositTurnCount(activeBankDeposit)} ход. · {formatMoney(bankDepositInfo?.payout ?? 0)}
            </span>
          </div>
        )}
        <div className={`asset-actions ${tile.type === 'bank' ? 'bank-asset-actions' : ''}`}>
          {tile.type === 'bank' && (
            <button
              className="primary compact"
              disabled={!bankDepositInfo?.canStart}
              title={bankDepositInfo?.disabledReason}
              onClick={() => dispatch({ type: 'start_bank_deposit', playerId: player.id })}
            >
              <HandCoins size={15} />
              Депозит
            </button>
          )}
          <button
            className="secondary compact"
            disabled={mortgageInfo.disabled}
            title={mortgageInfo.reason}
            onClick={() => dispatch({ type: property.mortgaged ? 'unmortgage' : 'mortgage', playerId: player.id, tileId: tile.id })}
          >
            <BadgeDollarSign size={15} />
            {property.mortgaged ? 'Викупити' : 'Застава'}
          </button>
        </div>
      </div>
    </article>
  );
};

const TradePanel = ({
  onStartTrade,
  onOpenCredits,
}: {
  onStartTrade: (player: Player, partners: Player[]) => void;
  onOpenCredits: () => void;
}) => {
  const { game, localPlayerId, room, dispatch } = useGameStore();
  const player = useMemo(() => (game ? panelPlayer(game, localPlayerId, Boolean(room)) : undefined), [game, localPlayerId, room]);
  const partners = useMemo(
    () => (game && player ? game.players.filter((candidate) => candidate.id !== player.id && !candidate.isBankrupt) : []),
    [game, player],
  );

  if (!game || !player) return null;

  const isCurrentPlayer = player.id === game.currentPlayerId;
  const hasPendingTrade = game.tradeOffers.some((offer) => offer.status === 'pending');
  const canCreateTrade = isCurrentPlayer && partners.length > 0 && !hasPendingTrade;
  const pendingOffers = game.tradeOffers.filter(
    (offer) =>
      offer.status === 'pending' &&
      (!room || offer.fromPlayerId === player.id || offer.toPlayerId === player.id),
  );
  const visibleServices = (game.rentServices ?? []).filter(
    (service) => service.ownerId === player.id || service.beneficiaryId === player.id,
  );
  const createDisabledReason = !isCurrentPlayer
    ? 'Створити угоду може тільки гравець, який зараз ходить.'
    : hasPendingTrade
      ? 'Спочатку адресат має прийняти або відхилити активну угоду.'
      : partners.length === 0
        ? 'Немає доступного адресата.'
        : '';

  return (
    <div className="trade-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Угода</p>
          <h3>Обмін майном</h3>
        </div>
        <div className="panel-actions">
          <button className="secondary compact" type="button" onClick={onOpenCredits}>
            <HandCoins size={16} />
            Кредити
          </button>
          <button
            className="primary compact"
            disabled={!canCreateTrade}
            title={createDisabledReason}
            onClick={() => onStartTrade(player, partners)}
          >
            <ArrowLeftRight size={16} />
            Створити
          </button>
        </div>
      </div>

      {pendingOffers.length === 0 && (
        <p className="muted empty-note">{createDisabledReason || 'Активних пропозицій немає.'}</p>
      )}
      {pendingOffers.map((offer) => (
        <TradeOfferCard
          game={game}
          player={player}
          offer={offer}
          canRespond={offer.toPlayerId === player.id || !room}
          responsePlayerId={offer.toPlayerId === player.id ? player.id : offer.toPlayerId}
          dispatch={dispatch}
          key={offer.id}
        />
      ))}

      {visibleServices.length > 0 && <RentServicesStatusPanel game={game} player={player} services={visibleServices} />}

    </div>
  );
};

const CreditsPanel = ({ onClose }: { onClose: () => void }) => {
  const { game, localPlayerId, room, dispatch } = useGameStore();
  const player = useMemo(() => (game ? panelPlayer(game, localPlayerId, Boolean(room)) : undefined), [game, localPlayerId, room]);
  const partners = useMemo(
    () => (game && player ? game.players.filter((candidate) => candidate.id !== player.id && !candidate.isBankrupt) : []),
    [game, player],
  );
  const [draft, setDraft] = useState<LoanDraft>(() => ({
    mode: 'lend',
    partnerId: '',
    principal: 200,
    totalRepayment: 240,
    durationTurns: 4,
    collateralTileIds: [],
  }));

  useEffect(() => {
    if (!partners.length) return;
    setDraft((current) => (partners.some((partner) => partner.id === current.partnerId) ? current : { ...current, partnerId: partners[0].id, collateralTileIds: [] }));
  }, [partners]);

  if (!game || !player) return null;

  const partner = partners.find((candidate) => candidate.id === draft.partnerId);
  const lender = draft.mode === 'lend' ? player : partner;
  const borrower = draft.mode === 'lend' ? partner : player;
  const isCurrentPlayer = player.id === game.currentPlayerId;
  const activeLoans = (game.loans ?? []).filter((loan) => loan.borrowerId === player.id || loan.lenderId === player.id);
  const pendingOffers = (game.loanOffers ?? []).filter(
    (offer) =>
      offer.status === 'pending' &&
      (!room || offer.borrowerId === player.id || offer.lenderId === player.id),
  );
  const collateralTiles = borrower
    ? borrower.properties
        .map((tileId) => getTile(tileId))
        .filter(isPropertyTile)
        .filter((tile) => canUseLoanCollateral(game, borrower.id, tile))
    : [];
  const draftCheck = validateLoanDraft(game, player, lender, borrower, draft);
  const bankLimit = getBankLoanLimit(game, player.id);
  const hasBankLoan = (game.loans ?? []).some((loan) => loan.kind === 'bank' && loan.borrowerId === player.id);
  const canTakeBankLoan = isCurrentPlayer && canTakeBankLoanInPhase(game, player.id) && !hasBankLoan && bankLimit >= 50;
  const bankAmounts = [50, 100, 200, 300, 400, 500].filter((amount) => amount <= bankLimit);

  const updateDraft = (patch: Partial<LoanDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const submitLoan = (event: FormEvent) => {
    event.preventDefault();
    if (!lender || !borrower || !draftCheck.valid) return;
    dispatch({
      type: 'propose_loan',
      offer: {
        lenderId: lender.id,
        borrowerId: borrower.id,
        proposerId: player.id,
        principal: draft.principal,
        totalRepayment: draft.totalRepayment,
        durationTurns: draft.durationTurns,
        collateralTileIds: draft.collateralTileIds,
      },
    });
    setDraft((current) => ({ ...current, collateralTileIds: [] }));
    onClose();
  };

  return (
    <div className="trade-panel credits-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Кредити</p>
          <h3>{player.name}</h3>
        </div>
        <strong>{activeLoans.length} активн.</strong>
      </div>

      <section className="rent-services-panel">
        <div className="rent-services-head">
          <HandCoins size={16} />
          <div>
            <strong>Банк-кредит</strong>
            <span>{hasBankLoan ? 'У вас вже є активний банківський кредит.' : `Ліміт банку ${formatMoney(bankLimit)}.`}</span>
          </div>
        </div>
        <div className="loan-option-grid">
          {bankAmounts.length === 0 && <p className="muted empty-note">Банк зараз не дає доступну суму.</p>}
          {bankAmounts.map((amount) => {
            const total = getBankLoanRepaymentAmount(amount);
            return (
              <button
                className="secondary compact"
                type="button"
                disabled={!canTakeBankLoan}
                title={!isCurrentPlayer ? 'Кредит можна взяти тільки у свій хід.' : hasBankLoan ? 'Спочатку закрийте активний банк-кредит.' : undefined}
                onClick={() => dispatch({ type: 'take_bank_loan', playerId: player.id, amount })}
                key={amount}
              >
                {formatMoney(amount)}
                <span>Повернути {formatMoney(total)}</span>
              </button>
            );
          })}
        </div>
      </section>

      <form className="loan-builder" onSubmit={submitLoan}>
        <div className="rent-services-head">
          <ArrowLeftRight size={16} />
          <div>
            <strong>{draft.mode === 'lend' ? 'Дати кредит гравцю' : 'Попросити кредит'}</strong>
            <span>Сума, строк, повернення і застава узгоджуються контрактом.</span>
          </div>
        </div>
        <div className="loan-mode-toggle" role="group" aria-label="Тип кредитної пропозиції">
          <button
            className={draft.mode === 'lend' ? 'active' : ''}
            type="button"
            onClick={() => updateDraft({ mode: 'lend', collateralTileIds: [] })}
          >
            Дати
          </button>
          <button
            className={draft.mode === 'borrow' ? 'active' : ''}
            type="button"
            onClick={() => updateDraft({ mode: 'borrow', collateralTileIds: [] })}
          >
            Попросити
          </button>
        </div>
        <div className="loan-builder-grid">
          <label>
            <span>{draft.mode === 'lend' ? 'Позичальник' : 'Кредитор'}</span>
            <select
              value={draft.partnerId}
              onChange={(event) => updateDraft({ partnerId: event.target.value, collateralTileIds: [] })}
              disabled={!isCurrentPlayer || partners.length === 0}
            >
              {partners.map((partner) => (
                <option value={partner.id} key={partner.id}>
                  {partner.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Сума</span>
            <MoneyInput value={draft.principal} onChange={(principal) => updateDraft({ principal })} />
          </label>
          <label>
            <span>Повернення</span>
            <MoneyInput value={draft.totalRepayment} onChange={(totalRepayment) => updateDraft({ totalRepayment })} />
          </label>
          <label>
            <span>Ходів</span>
            <input
              inputMode="numeric"
              type="text"
              value={draft.durationTurns}
              onChange={(event) => updateDraft({ durationTurns: Number(event.currentTarget.value.replace(/\D/g, '') || 0) })}
            />
          </label>
        </div>
        <div className="loan-collateral-grid">
          <span>Застава</span>
          {collateralTiles.length === 0 && <small>Немає доступного майна для застави.</small>}
          {collateralTiles.map((tile) => (
            <button
              className={`trade-selected-chip ${draft.collateralTileIds.includes(tile.id) ? 'selected' : ''}`}
              type="button"
              onClick={() => updateDraft({ collateralTileIds: toggleTile(draft.collateralTileIds, tile.id) })}
              key={tile.id}
            >
              {tile.name}
            </button>
          ))}
        </div>
        <div className={`trade-value-check ${draftCheck.valid ? 'ready' : 'blocked'}`}>
          <span>{draftCheck.message}</span>
          <strong>{partner ? `${formatMoney(draft.principal)} → ${formatMoney(draft.totalRepayment)}` : 'Немає адресата'}</strong>
        </div>
        <div className="board-trade-footer">
          <span className={draftCheck.valid ? 'ready' : 'blocked'}>{draftCheck.message}</span>
          <button className="primary compact" type="submit" disabled={!draftCheck.valid}>
            Надіслати
          </button>
        </div>
      </form>

      <section className="rent-services-panel">
        <div className="rent-services-head">
          <BadgePercent size={16} />
          <div>
            <strong>Активні кредити</strong>
            <span>Виплати списуються на початку власного ходу позичальника.</span>
          </div>
        </div>
        <div className="rent-services-list">
          {activeLoans.length === 0 && <p className="muted empty-note">Активних кредитів немає.</p>}
          {activeLoans.map((loan) => (
            <LoanStatusCard game={game} loan={loan} viewerId={player.id} dispatch={dispatch} key={loan.id} />
          ))}
        </div>
      </section>

      <section className="rent-services-panel">
        <div className="rent-services-head">
          <CircleHelp size={16} />
          <div>
            <strong>Пропозиції</strong>
            <span>Позичальник приймає або відхиляє контракт.</span>
          </div>
        </div>
        <div className="rent-services-list">
          {pendingOffers.length === 0 && <p className="muted empty-note">Активних кредитних пропозицій немає.</p>}
          {pendingOffers.map((offer) => (
            <LoanOfferCard
              game={game}
              offer={offer}
              viewerId={player.id}
              canRespond={isLoanOfferResponder(offer, player.id) || !room}
              dispatch={dispatch}
              key={offer.id}
            />
          ))}
        </div>
      </section>
    </div>
  );
};

const LoanStatusCard = ({
  game,
  loan,
  viewerId,
  dispatch,
}: {
  game: GameState;
  loan: ActiveLoan;
  viewerId: string;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
}) => {
  const borrower = game.players.find((player) => player.id === loan.borrowerId);
  const lender = loan.lenderId ? game.players.find((player) => player.id === loan.lenderId) : undefined;
  const incoming = loan.borrowerId === viewerId;
  const canUsePayoffCard =
    incoming &&
    (borrower?.loanPayoffCards ?? 0) > 0 &&
    game.currentPlayerId === viewerId &&
    canUseLoanPayoffCardInPhase(game, viewerId);
  return (
    <article className={incoming ? 'receiving' : 'giving'}>
      <strong>{incoming ? `Ви винні ${lender?.name ?? 'банку'}` : `${borrower?.name ?? 'Гравець'} винен вам`}</strong>
      <span>
        Залишилось {formatMoney(loan.remainingDue)} · наступна виплата {formatMoney(getLoanDisplayInstallment(loan))}
      </span>
      <small>
        {loan.remainingTurns} {formatTurnWord(loan.remainingTurns)} · прострочень {loan.missedPayments}
        {loan.collateralTileIds.length > 0 ? ` · застава: ${formatLoanCollateral(loan.collateralTileIds)}` : ''}
      </small>
      {incoming && (borrower?.loanPayoffCards ?? 0) > 0 && (
        <button
          className="secondary compact loan-payoff-button"
          type="button"
          disabled={!canUsePayoffCard}
          title={canUsePayoffCard ? 'Погасити цей кредит карткою.' : 'Картку можна використати лише у свій хід.'}
          onClick={() => dispatch({ type: 'use_loan_payoff_card', playerId: viewerId, loanId: loan.id })}
        >
          <BadgeDollarSign size={14} />
          Погасити карткою
        </button>
      )}
    </article>
  );
};

const LoanOfferCard = ({
  game,
  offer,
  viewerId,
  canRespond,
  dispatch,
}: {
  game: GameState;
  offer: LoanOffer;
  viewerId: string;
  canRespond: boolean;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
}) => {
  const lender = game.players.find((player) => player.id === offer.lenderId);
  const borrower = game.players.find((player) => player.id === offer.borrowerId);
  const responderId = getLoanOfferResponderId(offer);
  const responder = game.players.find((player) => player.id === responderId);
  const incoming = responderId === viewerId;
  const isRequest = (offer.proposerId ?? offer.lenderId) === offer.borrowerId;
  return (
    <article className="pending-trade">
      <div className="pending-trade-head">
        <strong>
          {incoming
            ? isRequest
              ? `${borrower?.name ?? 'Гравець'} просить кредит`
              : `${lender?.name ?? 'Гравець'} пропонує кредит`
            : `Очікуємо ${responder?.name ?? 'гравця'}`}
        </strong>
        <span>{offer.status}</span>
      </div>
      <div className="trade-summary-grid">
        <div>
          <small>Сума</small>
          <p>{formatMoney(offer.principal)}</p>
        </div>
        <div>
          <small>Повернення</small>
          <p>
            {formatMoney(offer.totalRepayment)} за {offer.durationTurns} {formatTurnWord(offer.durationTurns)}
          </p>
        </div>
      </div>
      {offer.collateralTileIds.length > 0 && <p className="muted">Застава: {formatLoanCollateral(offer.collateralTileIds)}</p>}
      {canRespond && (
        <div className="split-actions">
          <button className="primary compact" onClick={() => dispatch({ type: 'accept_loan', playerId: responderId, offerId: offer.id })}>
            <Check size={16} />
            Прийняти
          </button>
          <button className="secondary compact" onClick={() => dispatch({ type: 'decline_loan', playerId: responderId, offerId: offer.id })}>
            <X size={16} />
            Відхилити
          </button>
        </div>
      )}
    </article>
  );
};

const RentServicesStatusPanel = ({
  game,
  player,
  services,
}: {
  game: GameState;
  player: Player;
  services: GameState['rentServices'];
}) => (
  <section className="rent-services-panel">
    <div className="rent-services-head">
      <BadgePercent size={16} />
      <div>
        <strong>Активні послуги</strong>
        <span>Діють тільки протягом ходів отримувача.</span>
      </div>
    </div>
    <div className="rent-services-list">
      {services.map((service) => {
        const owner = game.players.find((candidate) => candidate.id === service.ownerId);
        const beneficiary = game.players.find((candidate) => candidate.id === service.beneficiaryId);
        const tile = getTile(service.tileId);
        const isBeneficiary = service.beneficiaryId === player.id;
        return (
          <article className={isBeneficiary ? 'receiving' : 'giving'} key={service.id}>
            <strong>{tile.name}</strong>
            <span>
              {isBeneficiary
                ? `${owner?.name ?? 'Власник'} дав вам ${formatRentServiceDiscount(service)}.`
                : `Ви дали ${beneficiary?.name ?? 'гравцю'} ${formatRentServiceDiscount(service)}.`}
            </span>
            <small>
              Залишилось {service.remainingTurns} {formatTurnWord(service.remainingTurns)} з {service.duration}{' '}
              {formatTurnWord(service.duration)} отримувача. Перезарядка до ходу {service.cooldownUntilTurn}.
            </small>
          </article>
        );
      })}
    </div>
  </section>
);

const TradeOfferCard = ({
  game,
  player,
  offer,
  canRespond,
  responsePlayerId,
  dispatch,
  className = '',
}: {
  game: GameState;
  player: Player;
  offer: TradeOffer;
  canRespond: boolean;
  responsePlayerId: string;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
  className?: string;
}) => {
  const from = game.players.find((candidate) => candidate.id === offer.fromPlayerId);
  const to = game.players.find((candidate) => candidate.id === offer.toPlayerId);
  const incoming = offer.toPlayerId === player.id;

  return (
    <article className={`pending-trade ${className}`}>
      <div className="pending-trade-head">
        <strong>
          {incoming
            ? `${from?.name ?? 'Гравець'} пропонує угоду`
            : canRespond
              ? `${to?.name ?? 'Адресат'} має відповісти`
              : `Очікуємо ${to?.name ?? 'гравця'}`}
        </strong>
        <span>{offer.status}</span>
      </div>
      <div className="trade-summary-grid">
        <div>
          <small>{from?.name ?? 'Автор'} віддає</small>
          <p>{formatTradeSide(offer.offerMoney, offer.offerProperties, offer.offerRentServices ?? [])}</p>
        </div>
        <div>
          <small>{to?.name ?? 'Адресат'} віддає</small>
          <p>{formatTradeSide(offer.requestMoney, offer.requestProperties, offer.requestRentServices ?? [])}</p>
        </div>
      </div>
      {canRespond && (
        <div className="split-actions">
          <button className="primary compact" onClick={() => dispatch({ type: 'accept_trade', playerId: responsePlayerId, offerId: offer.id })}>
            <Check size={16} />
            Прийняти
          </button>
          <button className="secondary compact" onClick={() => dispatch({ type: 'decline_trade', playerId: responsePlayerId, offerId: offer.id })}>
            <X size={16} />
            Відхилити
          </button>
        </div>
      )}
    </article>
  );
};

const BoardBankDepositPrompt = ({
  game,
  isLocalTurn,
  dispatch,
}: {
  game: GameState;
  isLocalTurn: boolean;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
}) => {
  const pendingDeposit = game.pendingBankDeposit;
  if (!pendingDeposit) return null;

  const tile = getTile(pendingDeposit.tileId);
  const depositInfo = getBankDepositInfo(game, pendingDeposit.playerId);
  const canDeposit = isLocalTurn && depositInfo.canStart;

  return (
    <motion.article
      className="board-rent-prompt board-bank-deposit-prompt"
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      <div className="rent-prompt-head">
        <div>
          <p className="eyebrow">Банківський депозит</p>
          <h3>{tile.name}</h3>
        </div>
        <strong>{formatMoney(pendingDeposit.amount)}</strong>
      </div>
      <p>
        Чи бажаєте ви внести депозит у розмірі {formatMoney(pendingDeposit.amount)}?
      </p>
      {!depositInfo.canStart && (
        <p className="purchase-status bad">
          {depositInfo.disabledReason} Можна підготувати гроші через заставу майна або продаж будинків.
        </p>
      )}
      <div className="rent-actions">
        <button
          className="primary compact"
          disabled={!canDeposit}
          title={depositInfo.disabledReason}
          onClick={() => dispatch({ type: 'start_bank_deposit', playerId: pendingDeposit.playerId })}
        >
          <HandCoins size={16} />
          Так
        </button>
        <button
          className="secondary compact"
          disabled={!isLocalTurn}
          onClick={() => dispatch({ type: 'decline_bank_deposit', playerId: pendingDeposit.playerId })}
        >
          <X size={16} />
          Ні
        </button>
      </div>
    </motion.article>
  );
};

const BoardPurchasePrompt = ({
  game,
  tile,
  currentPlayer,
  dispatch,
}: {
  game: GameState;
  tile: PropertyTile;
  currentPlayer: Player;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
}) => {
  const isCity = tile.type === 'city';
  const purchasePrice = getEffectivePropertyPrice(game, tile);
  const projectedRent = getProjectedRent(game, tile, currentPlayer.id);

  return (
    <motion.article
      className="board-purchase-prompt"
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
        <div className="modal-head">
          <div>
            <p className="eyebrow">Нічийне майно</p>
            <h2>{tile.name}</h2>
          </div>
          <div className="purchase-price">{formatMoney(purchasePrice)}</div>
        </div>

        <div className={`purchase-hero ${tile.type}`} style={isCity ? ({ '--group-color': tile.groupColor } as CSSProperties) : undefined}>
          {isCity && <img src={tile.image} alt="" />}
          {isCity && <span className="asset-band" />}
          {!isCity && (
            <div className={`purchase-icon ${tile.type === 'bank' ? tile.bankKey : tile.utilityKey}`}>
              {tile.type === 'bank' ? <Building2 size={34} /> : <Layers size={34} />}
            </div>
          )}
          <div className="purchase-hero-copy">
            <span>{currentPlayer.name} зупинився на полі</span>
            <strong>{tile.name}</strong>
          </div>
        </div>

        <div className="purchase-summary">
          <div>
            <span>Ціна</span>
            <strong>{formatMoney(purchasePrice)}</strong>
          </div>
          <div>
            <span>Застава</span>
            <strong>{formatMoney(tile.mortgage)}</strong>
          </div>
          <div>
            <span>Баланс гравця</span>
            <strong>{formatMoney(currentPlayer.money)}</strong>
          </div>
          <div>
            <span>Для інших</span>
            <strong>{formatMoney(projectedRent)}</strong>
          </div>
        </div>

        {currentPlayer.money < purchasePrice && (
          <p className="purchase-status bad">
            Недостатньо грошей для прямої купівлі. Закласти майно можна окремо, натиснувши на своє поле, або запустити аукціон.
          </p>
        )}

        <div className="purchase-actions">
          <button
            className="primary"
            disabled={currentPlayer.money < purchasePrice}
            onClick={() => dispatch({ type: 'buy', playerId: currentPlayer.id })}
          >
            <HandCoins size={18} />
            Купити
          </button>
          <button
            className="secondary"
            onClick={() => dispatch({ type: 'decline_buy', playerId: currentPlayer.id })}
          >
            <BadgeDollarSign size={18} />
            Аукціон
          </button>
        </div>
    </motion.article>
  );
};

const BoardTradeBuilder = ({
  game,
  player,
  partners,
  draft,
  setDraft,
  dispatch,
}: {
  game: GameState;
  player: Player;
  partners: Player[];
  draft: TradeDraft;
  setDraft: TradeDraftUpdater;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
}) => {
  const target = partners.find((candidate) => candidate.id === draft.targetId);
  const offerTiles = draft.offerProperties.map((tileId) => getTile(tileId)).filter(isPropertyTile);
  const requestTiles = draft.requestProperties.map((tileId) => getTile(tileId)).filter(isPropertyTile);
  const offerServiceTiles = player.properties.map((tileId) => getTile(tileId)).filter(isPropertyTile);
  const requestServiceTiles = target ? target.properties.map((tileId) => getTile(tileId)).filter(isPropertyTile) : [];
  const valueCheck = getTradeValueCheck(draft);
  const hasContent =
    draft.offerMoney > 0 ||
    draft.requestMoney > 0 ||
    draft.offerProperties.length > 0 ||
    draft.requestProperties.length > 0 ||
    draft.offerRentServices.length > 0 ||
    draft.requestRentServices.length > 0;
  const offerMoneyTooHigh = draft.offerMoney > player.money;
  const requestMoneyTooHigh = target ? draft.requestMoney > target.money : false;
  const canSubmit = Boolean(target) && hasContent && !offerMoneyTooHigh && !requestMoneyTooHigh && valueCheck.valid;

  useEffect(() => {
    if (partners.some((partner) => partner.id === draft.targetId)) return;
    setDraft((current) => {
      if (!current) return current;
      return { ...current, targetId: partners[0]?.id ?? '', requestProperties: [], requestRentServices: [] };
    });
  }, [draft.targetId, partners, setDraft]);

  const updateDraft = (patch: Partial<TradeDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const handleTargetChange = (targetId: string) => {
    setDraft((current) => {
      if (!current) return current;
      return { ...current, targetId, requestProperties: [], requestRentServices: [] };
    });
  };

  const closeDraft = () => setDraft(undefined);

  const submitTrade = (event: FormEvent) => {
    event.preventDefault();
    if (!target || !canSubmit) return;
    dispatch({
      type: 'propose_trade',
      offer: {
        fromPlayerId: player.id,
        toPlayerId: target.id,
        offerMoney: draft.offerMoney,
        requestMoney: draft.requestMoney,
        offerProperties: draft.offerProperties,
        requestProperties: draft.requestProperties,
        offerRentServices: draft.offerRentServices,
        requestRentServices: draft.requestRentServices,
      },
    });
    closeDraft();
  };

  const statusMessage = !hasContent
    ? 'Додайте гроші або майно'
    : offerMoneyTooHigh
      ? 'Недостатньо грошей у автора'
      : requestMoneyTooHigh
        ? 'Недостатньо грошей у адресата'
        : valueCheck.valid
          ? 'Пропозиція готова'
          : valueCheck.message;

  return (
    <motion.form
      className="board-trade-builder"
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      onSubmit={submitTrade}
    >
      <div className="board-trade-builder-head">
        <div>
          <p className="eyebrow">Нова угода</p>
          <h3>Обмін</h3>
        </div>
        <label className="board-trade-target">
          <span>З ким</span>
          <select value={draft.targetId} onChange={(event) => handleTargetChange(event.target.value)}>
            {partners.map((partner) => (
              <option value={partner.id} key={partner.id}>
                {partner.name}
              </option>
            ))}
          </select>
        </label>
        <button className="icon-button" type="button" onClick={closeDraft} aria-label="Закрити">
          <X size={18} />
        </button>
      </div>

      <div className="board-trade-sides">
        <TradeDraftSide
          title="Я віддаю"
          money={draft.offerMoney}
          moneyLimit={player.money}
          tiles={offerTiles}
          services={draft.offerRentServices}
          serviceTiles={offerServiceTiles}
          serviceOwnerId={player.id}
          serviceBeneficiaryId={target?.id ?? ''}
          game={game}
          selectedTileIds={draft.offerProperties}
          onMoneyChange={(offerMoney) => updateDraft({ offerMoney })}
          onToggleTile={(tileId) => updateDraft({ offerProperties: toggleTile(draft.offerProperties, tileId) })}
          onAddService={(service) => updateDraft({ offerRentServices: [...draft.offerRentServices, service] })}
          onRemoveService={(index) =>
            updateDraft({ offerRentServices: draft.offerRentServices.filter((_, candidateIndex) => candidateIndex !== index) })
          }
        />
        <TradeDraftSide
          title="Я прошу"
          money={draft.requestMoney}
          moneyLimit={target?.money ?? 0}
          tiles={requestTiles}
          services={draft.requestRentServices}
          serviceTiles={requestServiceTiles}
          serviceOwnerId={target?.id ?? ''}
          serviceBeneficiaryId={player.id}
          game={game}
          selectedTileIds={draft.requestProperties}
          onMoneyChange={(requestMoney) => updateDraft({ requestMoney })}
          onToggleTile={(tileId) => updateDraft({ requestProperties: toggleTile(draft.requestProperties, tileId) })}
          onAddService={(service) => updateDraft({ requestRentServices: [...draft.requestRentServices, service] })}
          onRemoveService={(index) =>
            updateDraft({ requestRentServices: draft.requestRentServices.filter((_, candidateIndex) => candidateIndex !== index) })
          }
        />
      </div>

      {(draft.offerProperties.length > 0 || draft.requestProperties.length > 0) && (
        <div className={`trade-value-check ${valueCheck.valid ? 'ready' : 'blocked'}`}>
          <span>
            Баланс: {formatMoney(valueCheck.offerValue)} / {formatMoney(valueCheck.requestValue)}
          </span>
          <strong>{valueCheck.message}</strong>
        </div>
      )}

      <div className="board-trade-footer">
        <span className={canSubmit ? 'ready' : 'blocked'}>{statusMessage}</span>
        <button className="primary compact" type="submit" disabled={!canSubmit}>
          Надіслати
        </button>
      </div>
    </motion.form>
  );
};

const TradeDraftSide = ({
  title,
  money,
  moneyLimit,
  tiles,
  services,
  serviceTiles,
  serviceOwnerId,
  serviceBeneficiaryId,
  game,
  selectedTileIds,
  onMoneyChange,
  onToggleTile,
  onAddService,
  onRemoveService,
}: {
  title: string;
  money: number;
  moneyLimit: number;
  tiles: PropertyTile[];
  services: RentServiceOffer[];
  serviceTiles: PropertyTile[];
  serviceOwnerId: string;
  serviceBeneficiaryId: string;
  game: GameState;
  selectedTileIds: number[];
  onMoneyChange: (money: number) => void;
  onToggleTile: (tileId: number) => void;
  onAddService: (service: RentServiceOffer) => void;
  onRemoveService: (index: number) => void;
}) => {
  const moneyTooHigh = money > moneyLimit;
  const [serviceTileId, setServiceTileId] = useState(serviceTiles[0]?.id ?? 0);
  const [serviceTurns, setServiceTurns] = useState(1);
  const [discountPercent, setDiscountPercent] = useState<50 | 100>(50);
  const selectedServiceTile = serviceTiles.find((tile) => tile.id === serviceTileId) ?? serviceTiles[0];
  const serviceBlockedReason =
    selectedServiceTile && selectedTileIds.includes(selectedServiceTile.id)
      ? 'Не можна одночасно передати майно і послугу на це поле.'
      : selectedServiceTile && serviceOwnerId && serviceBeneficiaryId
        ? getRentServiceBlockedReason(game, serviceOwnerId, serviceBeneficiaryId, selectedServiceTile.id)
      : 'Немає поля для послуги.';
  const canAddService =
    Boolean(selectedServiceTile && serviceOwnerId && serviceBeneficiaryId) &&
    !serviceBlockedReason &&
    !services.some((service) => service.tileId === selectedServiceTile?.id);

  useEffect(() => {
    if (serviceTiles.some((tile) => tile.id === serviceTileId)) return;
    setServiceTileId(serviceTiles[0]?.id ?? 0);
  }, [serviceTileId, serviceTiles]);

  const addService = () => {
    if (!selectedServiceTile || !canAddService) return;
    onAddService({
      tileId: selectedServiceTile.id,
      turns: serviceTurns,
      discountPercent,
    });
  };

  return (
    <section className="board-trade-side">
      <div className="board-trade-side-head">
        <h4>{title}</h4>
        <label className={`trade-money-field ${moneyTooHigh ? 'invalid' : ''}`}>
          <span>Гроші</span>
          <div>
            <MoneyInput value={money} onChange={onMoneyChange} />
            <em>₴</em>
          </div>
        </label>
      </div>
      <div className="trade-selected-list">
        {tiles.length === 0 && services.length === 0 && <span className="trade-empty-slot">Поки нічого</span>}
        {tiles.map((tile) => (
          <button className="trade-selected-chip" type="button" onClick={() => onToggleTile(tile.id)} key={tile.id}>
            {tile.name}
            <X size={13} />
          </button>
        ))}
        {services.map((service, index) => (
          <button className="trade-selected-chip service" type="button" onClick={() => onRemoveService(index)} key={`${service.tileId}-${index}`}>
            {formatRentServiceOffer(service)}
            <X size={13} />
          </button>
        ))}
      </div>
      {selectedTileIds.length > tiles.length && <p className="trade-side-note">Частину майна не можна додати до угоди.</p>}
      <div className="trade-service-builder">
        <span>Послуга</span>
        <div>
          <select value={selectedServiceTile?.id ?? 0} onChange={(event) => setServiceTileId(Number(event.target.value))}>
            {serviceTiles.length === 0 ? (
              <option value={0}>Немає полів</option>
            ) : (
              serviceTiles.map((tile) => (
                <option value={tile.id} key={tile.id}>
                  {tile.name}
                </option>
              ))
            )}
          </select>
          <select value={discountPercent} onChange={(event) => setDiscountPercent(Number(event.target.value) as 50 | 100)}>
            <option value={50}>50%</option>
            <option value={100}>0₴</option>
          </select>
          <select value={serviceTurns} onChange={(event) => setServiceTurns(Number(event.target.value))}>
            <option value={1}>1 хід</option>
            <option value={2}>2 ходи</option>
            <option value={3}>3 ходи</option>
          </select>
          <button className="ghost compact" type="button" disabled={!canAddService} title={serviceBlockedReason} onClick={addService}>
            Додати
          </button>
        </div>
      </div>
    </section>
  );
};

const MoneyInput = ({ value, onChange }: { value: number; onChange: (money: number) => void }) => (
  <input
    inputMode="numeric"
    pattern="[0-9]*"
    placeholder="0"
    type="text"
    value={value === 0 ? '' : String(value)}
    onChange={(event) => {
      const digits = event.currentTarget.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
      onChange(digits ? Number(digits) : 0);
    }}
  />
);

const CityRentTable = ({
  tile,
  currentHouses,
  hasDistrict = false,
  districtPath,
  compact = false,
}: {
  tile: CityTile;
  currentHouses?: number;
  hasDistrict?: boolean;
  districtPath?: DistrictPath;
  compact?: boolean;
}) => {
  const activeKey =
    currentHouses === undefined
      ? undefined
      : currentHouses === 0
        ? hasDistrict
          ? 'district'
          : 'base'
        : currentHouses === 5
          ? 'hotel'
          : `house-${currentHouses}`;
  const rows = getCityRentRows(tile, districtPath);

  return (
    <section className={`city-rent-table ${compact ? 'compact' : ''}`} aria-label={`Таблиця оренди ${tile.name}`}>
      <div className="city-rent-table-head">
        <h4>Оренда</h4>
        <span>{districtPath === 'oldTown' || districtPath === 'residential' ? 'Знижена оренда' : `Район: ${formatMoney(tile.rents[0] * 2)}`}</span>
      </div>
      <div className="city-rent-grid">
        {rows.map((row) => (
          <div className={`city-rent-item ${row.key === activeKey ? 'active' : ''}`} key={row.key}>
            <span>{row.label}</span>
            <strong>{formatMoney(row.amount)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
};

const getCityRentRows = (tile: CityTile, districtPath?: DistrictPath) => [
  { key: 'base', label: 'Без району', amount: tile.rents[0] },
  { key: 'district', label: 'Район', amount: getDistrictDisplayRent(tile.rents[0] * 2, districtPath) },
  { key: 'house-1', label: '1 буд.', amount: getDistrictDisplayRent(tile.rents[1], districtPath) },
  { key: 'house-2', label: '2 буд.', amount: getDistrictDisplayRent(tile.rents[2], districtPath) },
  { key: 'house-3', label: '3 буд.', amount: getDistrictDisplayRent(tile.rents[3], districtPath) },
  { key: 'house-4', label: '4 буд.', amount: getDistrictDisplayRent(tile.rents[4], districtPath) },
  { key: 'hotel', label: 'Готель', amount: getDistrictDisplayRent(tile.rents[5], districtPath) },
];

const getDistrictDisplayRent = (rent: number, districtPath?: DistrictPath) =>
  districtPath === 'oldTown' || districtPath === 'residential'
    ? Math.ceil(rent / getDistrictDisplayRentDivisor(districtPath))
    : rent;

const getDistrictDisplayRentDivisor = (districtPath: DistrictPath) => {
  if (districtPath === 'residential') return RESIDENTIAL_DISTRICT_RENT_DIVISOR;
  return DISTRICT_RENT_DIVISOR;
};

const CityModal = ({
  game,
  tileId,
  localPlayerId,
  preferLocalPlayer,
  onClose,
  dispatch,
}: {
  game: GameState;
  tileId: number;
  localPlayerId: string | undefined;
  preferLocalPlayer: boolean;
  onClose: () => void;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
}) => {
  const tile = getTile(tileId);
  if (!isPropertyTile(tile)) return null;

  const property = game.properties[tile.id];
  const manager = panelPlayer(game, localPlayerId, preferLocalPlayer);
  const owner = property.ownerId ? game.players.find((player) => player.id === property.ownerId) : undefined;
  const canManage = owner?.id === manager.id;
  const rent = calculateRent(game, tile, game.dice[0] + game.dice[1]);
  if (tile.type !== 'city') {
    return (
      <ServicePropertyModal
        game={game}
        tile={tile}
        manager={manager}
        owner={owner}
        canManage={canManage}
        rent={rent}
        onClose={onClose}
        dispatch={dispatch}
      />
    );
  }

  const group = getCityGroup(tile);
  const buildInfo = getBuildInfo(game, manager, tile);
  const demolishInfo = getDemolishInfo(game, manager, tile);
  const mortgageInfo = getMortgageInfo(game, manager, tile);
  const purchasePrice = getEffectivePropertyPrice(game, tile);
  const houseCost = getEffectiveHouseCost(game, tile);
  const unmortgageCost = getEffectiveUnmortgageCost(game, tile);
  const mortgageValue = getEffectiveMortgageValue(game, tile);
  const mortgageTurnsLeft = getMortgageTurnsLeft(game, property);
  const missingCities = group.filter((groupTile) => game.properties[groupTile.id]?.ownerId !== manager.id);
  const ownerHasDistrict = owner ? ownsAllCities(game, owner.id, group) : false;
  const district = game.districtPaths?.[tile.group];
  const districtView = district ? getDistrictPathView(district.path) : undefined;
  const DistrictIcon = districtView?.Icon;
  const districtCreationCost = getDistrictCreationCost(game, tile.group);
  const districtCreationInfo = getDistrictCreationInfo(game, manager, group, district?.path);

  const handleMortgage = () => {
    if (!canManage || mortgageInfo.disabled) return;
    dispatch({ type: property.mortgaged ? 'unmortgage' : 'mortgage', playerId: manager.id, tileId: tile.id });
  };

  const handleBuild = () => {
    if (!canManage || !buildInfo.canBuild) return;
    dispatch({ type: 'build', playerId: manager.id, tileId: tile.id });
  };

  const handleCreateDistrict = (path: DistrictPath) => {
    if (!canManage || districtCreationInfo.disabled) return;
    dispatch({ type: 'create_district', playerId: manager.id, group: tile.group, path });
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <motion.article
        className="city-modal"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
        style={{ '--group-color': tile.groupColor } as CSSProperties}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow">Місто</p>
            <h2>{tile.name}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрити">
            <X size={18} />
          </button>
        </div>

        <div className="city-modal-hero" style={{ '--group-color': tile.groupColor } as CSSProperties}>
          <img src={tile.image} alt="" />
          <span className="asset-band" />
          <div>
            <p>{owner ? `Власник: ${owner.name}` : 'Місто нічийне'}</p>
            <strong>{formatMoney(purchasePrice)}</strong>
          </div>
        </div>

        <div className={`city-owner-card ${owner ? 'owned' : 'empty'}`} style={{ '--owner-color': owner?.color ?? '#64748b' } as CSSProperties}>
          {owner ? <PlayerFigurine player={owner} /> : <Landmark size={24} />}
          <div>
            <span>Власник</span>
            <strong>{owner ? owner.name : 'Немає власника'}</strong>
          </div>
        </div>

        <div className="city-modal-grid">
          <section className="city-modal-section">
            <h3>Фінанси</h3>
            <dl className="city-stats">
              <div>
                <dt>Поточна оренда</dt>
                <dd>{formatMoney(rent)}</dd>
              </div>
              <div>
                <dt>Застава</dt>
                <dd>{formatMoney(mortgageValue)}</dd>
              </div>
              <div>
                <dt>Викуп</dt>
                <dd>{formatMoney(unmortgageCost)}</dd>
              </div>
              <div>
                <dt>Будинок</dt>
                <dd>{formatMoney(houseCost)}</dd>
              </div>
            </dl>

            <CityRentTable
              tile={tile}
              currentHouses={property.houses}
              hasDistrict={ownerHasDistrict}
              districtPath={district?.path}
            />

            {property.mortgaged && (
              <div className="mortgage-deadline">
                <strong>Заставлено</strong>
                <span>
                  {mortgageTurnsLeft > 0
                    ? `Залишилось ${mortgageTurnsLeft} ${formatTurnWord(mortgageTurnsLeft)} власника до повернення банку.`
                    : 'Після наступної перевірки місто повернеться банку.'}
                </span>
              </div>
            )}

            {canManage ? (
              <button className="secondary full" disabled={mortgageInfo.disabled} title={mortgageInfo.reason} onClick={handleMortgage}>
                <BadgeDollarSign size={16} />
                {property.mortgaged ? `Викупити за ${formatMoney(unmortgageCost)}` : `Закласти за ${formatMoney(mortgageValue)}`}
              </button>
            ) : (
              <p className="muted">
                {owner ? 'Керувати заставою може тільки власник міста.' : 'Купівля доступна, коли гравець зупиняється на цьому місті.'}
              </p>
            )}
          </section>

          <section className="city-modal-section">
            <h3>Будівництво</h3>
            {districtView && DistrictIcon ? (
              <div className={`district-summary-card district-${district!.path}`}>
                <DistrictIcon size={18} />
                <div>
                  <strong>{districtView.label}</strong>
                  <span>{districtView.effect}</span>
                </div>
              </div>
            ) : canManage && missingCities.length === 0 ? (
              <div className="district-create-panel">
                <div className="district-create-head">
                  <div>
                    <strong>Оберіть шлях району</strong>
                    <span>Створення коштує {formatMoney(districtCreationCost)} і не змінюється.</span>
                  </div>
                </div>
                <div className="district-path-options">
                  {DISTRICT_PATH_OPTIONS.map((option) => {
                    const Icon = option.Icon;
                    return (
                      <button
                        className={`district-path-option district-${option.path}`}
                        disabled={districtCreationInfo.disabled}
                        title={districtCreationInfo.reason}
                        onClick={() => handleCreateDistrict(option.path)}
                        type="button"
                        key={option.path}
                      >
                        <Icon size={17} />
                        <span>
                          <strong>{option.label}</strong>
                          <small>{option.effect}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <p className={`build-status ${buildInfo.canBuild && canManage ? 'ready' : 'blocked'}`}>
              {canManage ? buildInfo.reason : 'Будувати може тільки власник повної кольорової групи.'}
            </p>
            {missingCities.length > 0 ? (
              <p className="rule-note">
                Для будівництва {manager.name} ще потрібно: {missingCities.map((groupTile) => groupTile.name).join(', ')}.
              </p>
            ) : (
              <p className="rule-note">Уся група зібрана. Будинки треба піднімати рівномірно по всіх містах групи.</p>
            )}
            <div className="city-group-list">
              {group.map((groupTile) => {
                const groupProperty = game.properties[groupTile.id];
                const groupOwner = groupProperty.ownerId
                  ? game.players.find((player) => player.id === groupProperty.ownerId)
                  : undefined;
                const isMissing = groupProperty.ownerId !== manager.id;
                return (
                  <article
                    className={`city-group-item ${groupTile.id === tile.id ? 'current' : ''} ${isMissing ? 'missing' : ''}`}
                    key={groupTile.id}
                  >
                    <span className="group-stripe" style={{ background: groupTile.groupColor }} />
                    <div>
                      <strong>{groupTile.name}</strong>
                      <small>{groupOwner ? groupOwner.name : 'Нічийне'}</small>
                    </div>
                    <em>{groupProperty.houses === 5 ? 'Готель' : `${groupProperty.houses} буд.`}</em>
                  </article>
                );
              })}
            </div>
            <div className="building-actions">
              <button className="primary full" disabled={!canManage || !buildInfo.canBuild} title={buildInfo.reason} onClick={handleBuild}>
                <Hammer size={16} />
                Побудувати рівень
              </button>
              <button
                className="secondary full"
                disabled={!canManage || !demolishInfo.canDemolish}
                title={demolishInfo.reason}
                onClick={() => dispatch({ type: 'sell_building', playerId: manager.id, tileId: tile.id })}
              >
                <Trash2 size={16} />
                Знести рівень
              </button>
            </div>
          </section>
        </div>
      </motion.article>
    </div>
  );
};

const ServicePropertyModal = ({
  game,
  tile,
  manager,
  owner,
  canManage,
  rent,
  onClose,
  dispatch,
}: {
  game: GameState;
  tile: Exclude<PropertyTile, CityTile>;
  manager: Player;
  owner: Player | undefined;
  canManage: boolean;
  rent: number;
  onClose: () => void;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
}) => {
  const property = game.properties[tile.id];
  const mortgageInfo = getMortgageInfo(game, manager, tile);
  const purchasePrice = getEffectivePropertyPrice(game, tile);
  const unmortgageCost = getEffectiveUnmortgageCost(game, tile);
  const mortgageValue = getEffectiveMortgageValue(game, tile);
  const ownedSameTypeCount = owner
    ? owner.properties.map((tileId) => getTile(tileId)).filter((ownedTile) => ownedTile.type === tile.type).length
    : 0;
  const serviceLabel = tile.type === 'bank' ? 'Банк' : 'Сервіс';
  const bankDepositInfo = tile.type === 'bank' ? getBankDepositInfo(game, manager.id) : undefined;

  const handleMortgage = () => {
    if (!canManage || mortgageInfo.disabled) return;
    dispatch({ type: property.mortgaged ? 'unmortgage' : 'mortgage', playerId: manager.id, tileId: tile.id });
  };

  const handleBankDeposit = () => {
    if (!canManage || !bankDepositInfo?.canStart) return;
    dispatch({ type: 'start_bank_deposit', playerId: manager.id });
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <motion.article
        className="city-modal service-modal"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow">{serviceLabel}</p>
            <h2>{tile.name}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрити">
            <X size={18} />
          </button>
        </div>

        <div className={`service-modal-hero ${tile.type === 'bank' ? tile.bankKey : tile.utilityKey}`}>
          <div className={`purchase-icon ${tile.type === 'bank' ? tile.bankKey : tile.utilityKey}`}>
            {tile.type === 'bank' ? <Building2 size={34} /> : <Layers size={34} />}
          </div>
          <div>
            <p>{owner ? `Власник: ${owner.name}` : `${serviceLabel} нічийний`}</p>
            <strong>{formatMoney(purchasePrice)}</strong>
          </div>
        </div>

        <div className={`city-owner-card ${owner ? 'owned' : 'empty'}`} style={{ '--owner-color': owner?.color ?? '#64748b' } as CSSProperties}>
          {owner ? <PlayerFigurine player={owner} /> : <Building2 size={24} />}
          <div>
            <span>Власник</span>
            <strong>{owner ? owner.name : 'Немає власника'}</strong>
          </div>
        </div>

        <section className="city-modal-section">
          <h3>Оренда</h3>
          <dl className="city-stats">
            <div>
              <dt>Для інших</dt>
              <dd>{property.mortgaged ? '0₴' : formatMoney(rent)}</dd>
            </div>
            <div>
              <dt>{tile.type === 'bank' ? 'Банків у власника' : 'Сервісів у власника'}</dt>
              <dd>{owner ? ownedSameTypeCount : 0}</dd>
            </div>
            <div>
              <dt>Застава</dt>
              <dd>{formatMoney(mortgageValue)}</dd>
            </div>
            <div>
              <dt>Викуп</dt>
              <dd>{formatMoney(unmortgageCost)}</dd>
            </div>
          </dl>

          {tile.type === 'bank' ? (
            <div className="bank-rent-table">
              {[1, 2, 3, 4].map((bankCount) => (
                <span className={ownedSameTypeCount === bankCount ? 'active' : ''} key={bankCount}>
                  {bankCount} банк: {formatMoney(getBankRentForCount(bankCount))}
                </span>
              ))}
            </div>
          ) : (
            <p className="rule-note">
              Оренда сервісу залежить від кидка: один сервіс бере x4 від суми кубиків, два сервіси - x10.
            </p>
          )}

          {tile.type === 'bank' && bankDepositInfo && owner?.id === manager.id && (
            <div className="bank-deposit-panel">
              <div>
                <strong>Банківський депозит</strong>
                <span>
                  {bankDepositInfo.activeDeposit
                    ? `${getBankDepositTurnCount(bankDepositInfo.activeDeposit)} ${formatTurnWord(getBankDepositTurnCount(bankDepositInfo.activeDeposit))} · накопичено ${formatMoney(bankDepositInfo.payout)} з ${formatMoney(bankDepositInfo.maxPayout)}`
                    : bankDepositInfo.canStart
                      ? `Доступний внесок ${formatMoney(bankDepositInfo.amount)}`
                      : bankDepositInfo.bankCount >= 2
                        ? 'Доступно після зупинки на своєму банку'
                      : 'Потрібно мінімум 2 банки'}
                </span>
              </div>
              <button
                className="primary compact"
                disabled={!canManage || !bankDepositInfo.canStart}
                title={bankDepositInfo.disabledReason}
                onClick={handleBankDeposit}
              >
                <HandCoins size={15} />
                Депозит
              </button>
            </div>
          )}

          {canManage ? (
            <button className="secondary full" disabled={mortgageInfo.disabled} title={mortgageInfo.reason} onClick={handleMortgage}>
              <BadgeDollarSign size={16} />
              {property.mortgaged ? `Викупити за ${formatMoney(unmortgageCost)}` : `Закласти за ${formatMoney(mortgageValue)}`}
            </button>
          ) : (
            <p className="muted">{owner ? 'Керувати заставою може тільки власник.' : 'Купівля доступна, коли гравець зупиняється на цьому полі.'}</p>
          )}
        </section>
      </motion.article>
    </div>
  );
};

const panelPlayer = (game: GameState, localPlayerId: string | undefined, preferLocalPlayer: boolean): Player =>
  (preferLocalPlayer ? game.players.find((player) => player.id === localPlayerId) : undefined) ??
  game.players.find((player) => player.id === game.currentPlayerId) ??
  game.players[0];

const groupCities = (cities: CityTile[]) => {
  const groups = new Map<string, CityTile[]>();
  cities.forEach((tile) => groups.set(tile.group, [...(groups.get(tile.group) ?? []), tile]));
  return Array.from(groups.entries()).map(([name, tiles]) => ({ name, color: tiles[0].groupColor, tiles }));
};

const ownsAllCities = (game: GameState, playerId: string, tiles: CityTile[]) =>
  tiles.length > 0 && getCityGroup(tiles[0]).every((tile) => game.properties[tile.id]?.ownerId === playerId);

const getCityGroup = (tile: CityTile): CityTile[] =>
  boardTiles.filter((candidate): candidate is CityTile => candidate.type === 'city' && candidate.group === tile.group);

const getDistrictPathView = (path: DistrictPath) => DISTRICT_PATH_VIEW.get(path) ?? DISTRICT_PATH_OPTIONS[0];

const getDistrictCreationInfo = (
  game: GameState,
  player: Player,
  group: CityTile[],
  currentPath?: DistrictPath,
) => {
  if (currentPath) return { disabled: true, reason: 'Район уже створено і його не можна змінити.' };
  if (game.currentPlayerId !== player.id) return { disabled: true, reason: 'Район можна створити тільки під час власного ходу.' };
  if (game.phase !== 'rolling') return { disabled: true, reason: 'Район створюється до кидка кубиків.' };
  if (player.jailTurns > 0) return { disabled: true, reason: 'У вʼязниці не можна створювати район.' };
  if (hasBuildingBlockedCityEvent(game)) return { disabled: true, reason: 'Будівництво заборонене через подію міста.' };
  if (!group.every((groupTile) => game.properties[groupTile.id]?.ownerId === player.id)) {
    return { disabled: true, reason: 'Потрібна повна кольорова група.' };
  }
  const groupName = group[0]?.group;
  if (!groupName) return { disabled: true, reason: 'Групу міст не знайдено.' };
  const cost = getDistrictCreationCost(game, groupName);
  if (player.money < cost) return { disabled: true, reason: `Потрібно ${formatMoney(cost)} для створення району.` };
  return { disabled: false, reason: `Створити район за ${formatMoney(cost)}.` };
};

const getBuildInfo = (game: GameState, player: Player, tile: CityTile) => {
  const property = game.properties[tile.id];
  const group = getCityGroup(tile);
  const houseCost = getEffectiveHouseCost(game, tile);
  if (game.currentPlayerId !== player.id) {
    return { canBuild: false, reason: 'Будувати можна лише під час власного ходу.' };
  }
  if (game.phase !== 'rolling') {
    return { canBuild: false, reason: 'Будувати можна лише до кидка кубиків.' };
  }
  if (player.jailTurns > 0) {
    return { canBuild: false, reason: 'У вʼязниці не можна будувати будинки.' };
  }
  if (hasBuildingBlockedCityEvent(game)) {
    return { canBuild: false, reason: 'Будівництво заборонене через подію міста.' };
  }
  if (!group.every((groupTile) => game.properties[groupTile.id]?.ownerId === player.id)) {
    return { canBuild: false, reason: 'Потрібна вся кольорова група.' };
  }
  const district = game.districtPaths?.[tile.group];
  if (!district || district.ownerId !== player.id) {
    return { canBuild: false, reason: 'Спочатку створіть район для цієї групи.' };
  }
  if (property.mortgaged) return { canBuild: false, reason: 'Спочатку викупіть заставу.' };
  const buildTracker =
    game.buildsThisRoll ??
    (game.builtThisRoll
      ? { playerId: game.builtThisRoll.playerId, diceRollId: game.builtThisRoll.diceRollId, group: tile.group, count: 1 }
      : undefined);
  if (buildTracker?.playerId === player.id && buildTracker.diceRollId === game.diceRollId) {
    const isResidentialSlot =
      district.path === 'residential' && buildTracker.group === tile.group && buildTracker.count < 2;
    if (!isResidentialSlot) {
      return {
        canBuild: false,
        reason:
          district.path === 'residential'
            ? 'Спальний район дозволяє тільки 2 будівництва за цей кидок у цьому районі.'
            : 'За цей кидок уже побудовано один будинок.',
      };
    }
  }
  if (property.houses >= 5) return { canBuild: false, reason: 'Максимум: готель уже збудовано.' };
  if (player.money < houseCost) return { canBuild: false, reason: `Недостатньо грошей: треба ${formatMoney(houseCost)}.` };

  const minHouses = Math.min(...group.map((groupTile) => game.properties[groupTile.id].houses));
  if (property.houses > minHouses) return { canBuild: false, reason: 'Треба будувати рівномірно по групі.' };

  return { canBuild: true, reason: 'Можна будувати.' };
};

const canUseEmergencyMoneyManagement = (game: GameState, playerId: string): boolean =>
  game.phase === 'rolling' ||
  game.phase === 'awaitingPurchase' ||
  (game.phase === 'rent' && game.pendingRent?.payerId === playerId) ||
  (game.phase === 'payment' && game.pendingPayment?.payerId === playerId) ||
  (game.phase === 'bankDeposit' && game.pendingBankDeposit?.playerId === playerId);

const getDemolishInfo = (game: GameState, player: Player, tile: CityTile) => {
  const property = game.properties[tile.id];
  if (property.ownerId !== player.id) return { canDemolish: false, reason: 'Зносити може тільки власник.' };
  if (game.currentPlayerId !== player.id) {
    return { canDemolish: false, reason: 'Зносити можна лише під час власного ходу.' };
  }
  if (!canUseEmergencyMoneyManagement(game, player.id)) {
    return { canDemolish: false, reason: 'Зносити можна до кидка або під час платежу/купівлі.' };
  }
  if (property.mortgaged) return { canDemolish: false, reason: 'Заставлене місто не можна змінювати.' };
  if (property.houses <= 0) return { canDemolish: false, reason: 'У місті немає будівель.' };

  const group = getCityGroup(tile);
  const nextCounts = group.map((groupTile) =>
    groupTile.id === tile.id ? property.houses - 1 : game.properties[groupTile.id].houses,
  );
  if (Math.max(...nextCounts) - Math.min(...nextCounts) > 1) {
    return { canDemolish: false, reason: 'Зносити треба рівномірно по групі.' };
  }

  return { canDemolish: true, reason: `Знести і повернути ${formatMoney(getEffectiveBuildingRefund(game, tile))}.` };
};

const getMortgageInfo = (game: GameState, player: Player, tile: PropertyTile) => {
  const property = game.properties[tile.id];
  if (game.currentPlayerId !== player.id) return { disabled: true, reason: 'Застава доступна лише під час власного ходу.' };
  if (!canUseEmergencyMoneyManagement(game, player.id)) {
    return { disabled: true, reason: 'Застава доступна до кидка або під час платежу/купівлі.' };
  }
  if (property.houses > 0) return { disabled: true, reason: 'Спочатку продайте будинки.' };
  if (!property.mortgaged && (game.loans ?? []).some((loan) => loan.collateralTileIds.includes(tile.id))) {
    return { disabled: true, reason: 'Майно вже є заставою кредиту.' };
  }
  const mortgageValue = getEffectiveMortgageValue(game, tile);
  if (!property.mortgaged) return { disabled: false, reason: `Отримати ${formatMoney(mortgageValue)} застави.` };
  if (game.phase !== 'rolling') {
    return { disabled: true, reason: 'Викуп застави доступний тільки до кидка кубиків.' };
  }

  const cost = getEffectiveUnmortgageCost(game, tile);
  if (player.money < cost) return { disabled: true, reason: `Для викупу треба ${formatMoney(cost)}.` };
  return { disabled: false, reason: `Викупити за ${formatMoney(cost)}.` };
};

const formatTradeSide = (money: number, tileIds: number[], services: RentServiceOffer[] = []) => {
  const parts = [
    ...(money > 0 ? [formatMoney(money)] : []),
    ...tileIds.map((tileId) => getTile(tileId).name),
    ...services.map((service) => formatRentServiceOffer(service)),
  ];
  return parts.length > 0 ? parts.join(', ') : 'Нічого';
};

const formatRentServiceOffer = (service: RentServiceOffer) =>
  `${getTile(service.tileId).name}: ${formatRentServiceDiscount(service)} на ${service.turns} ${formatTurnWord(
    service.turns,
  )} отримувача; перезарядка ${service.turns * 2} ${formatTurnWord(service.turns * 2)}.`;

const formatRentServiceDiscount = (service: RentServiceOffer) =>
  service.discountPercent === 100 ? 'без оренди' : '50% оренди';

const getTradeValueCheck = (draft: TradeDraft) => {
  const offerValue = draft.offerMoney + draft.offerProperties.reduce((sum, tileId) => sum + getPropertyPrice(tileId), 0);
  const requestValue = draft.requestMoney + draft.requestProperties.reduce((sum, tileId) => sum + getPropertyPrice(tileId), 0);
  const hasProperties = draft.offerProperties.length > 0 || draft.requestProperties.length > 0;
  if (!hasProperties) return { valid: true, offerValue, requestValue, message: 'Послуги оцінюються довільно' };
  if (requestValue <= 0) {
    return { valid: false, offerValue, requestValue, message: 'Майно має мати цінність з обох сторін' };
  }
  const maximum = Math.floor(requestValue * 3);
  if (offerValue > maximum) {
    return { valid: false, offerValue, requestValue, message: `Максимум ${formatMoney(maximum)}` };
  }
  return { valid: true, offerValue, requestValue, message: 'Баланс угоди в межах правил' };
};

const validateLoanDraft = (
  game: GameState,
  proposer: Player,
  lender: Player | undefined,
  borrower: Player | undefined,
  draft: LoanDraft,
) => {
  if (game.currentPlayerId !== proposer.id) return { valid: false, message: 'Кредит можна запропонувати тільки у свій хід.' };
  if (!canTakeBankLoanInPhase(game, proposer.id)) {
    return { valid: false, message: 'Кредит гравцю можна запропонувати тільки без активного рішення.' };
  }
  if (!lender || !borrower) return { valid: false, message: draft.mode === 'lend' ? 'Оберіть позичальника.' : 'Оберіть кредитора.' };
  if (lender.id === borrower.id) return { valid: false, message: 'Кредит потребує двох різних гравців.' };
  if (lender.money < draft.principal) return { valid: false, message: 'Кредитору не вистачає грошей.' };
  if (draft.principal < 50 || draft.principal > 800) return { valid: false, message: 'Сума має бути 50-800₴.' };
  if (draft.durationTurns < 2 || draft.durationTurns > 10) return { valid: false, message: 'Строк має бути 2-10 ходів.' };
  if (draft.totalRepayment < draft.principal || draft.totalRepayment > Math.floor(draft.principal * 1.8)) {
    return { valid: false, message: 'Повернення має бути 100-180% суми.' };
  }
  const activeBorrowed = (game.loans ?? []).filter((loan) => loan.kind === 'player' && loan.borrowerId === borrower.id).length;
  if (activeBorrowed >= 3) return { valid: false, message: 'Позичальник уже має 3 кредити від гравців.' };
  const collateralValue = draft.collateralTileIds.reduce((sum, tileId) => {
    const tile = getTile(tileId);
    return isPropertyTile(tile) ? sum + getEffectiveMortgageValue(game, tile) : sum;
  }, 0);
  if (collateralValue > Math.floor(draft.totalRepayment * 2)) return { valid: false, message: 'Застава занадто велика.' };
  return { valid: true, message: draft.mode === 'lend' ? 'Кредит готовий до відправки.' : 'Запит на кредит готовий.' };
};

const getLoanOfferResponderId = (offer: Pick<LoanOffer, 'lenderId' | 'borrowerId' | 'proposerId'>): string =>
  (offer.proposerId ?? offer.lenderId) === offer.borrowerId ? offer.lenderId : offer.borrowerId;

const isLoanOfferResponder = (offer: Pick<LoanOffer, 'lenderId' | 'borrowerId' | 'proposerId'>, playerId: string): boolean =>
  getLoanOfferResponderId(offer) === playerId;

const canUseLoanCollateral = (game: GameState, borrowerId: string, tile: PropertyTile): boolean => {
  const property = game.properties[tile.id];
  const usedCollateral = new Set((game.loans ?? []).flatMap((loan) => loan.collateralTileIds));
  return property.ownerId === borrowerId && !property.mortgaged && property.houses === 0 && !usedCollateral.has(tile.id);
};

const canTakeBankLoanInPhase = (game: GameState, playerId: string): boolean =>
  ['rolling', 'manage', 'trade', 'turnEnd'].includes(game.phase) ||
  (game.phase === 'payment' && game.pendingPayment?.payerId === playerId) ||
  (game.phase === 'rent' && game.pendingRent?.payerId === playerId) ||
  game.phase === 'awaitingPurchase' ||
  (game.phase === 'bankDeposit' && game.pendingBankDeposit?.playerId === playerId) ||
  (game.phase === 'casino' && game.pendingCasino?.playerId === playerId && !game.pendingCasino.spinEndsAt);

const canUseLoanPayoffCardInPhase = canTakeBankLoanInPhase;

const formatLoanCollateral = (tileIds: number[]): string =>
  tileIds
    .map((tileId) => getTile(tileId))
    .filter(isPropertyTile)
    .map((tile) => tile.name)
    .join(', ');

const getLoanDisplayInstallment = (loan: ActiveLoan): number =>
  Math.min(
    loan.remainingDue,
    (loan.deferredDue ?? 0) +
      (getLoanEffectiveRemainingTurns(loan) <= 1
        ? Math.max(0, loan.remainingDue - (loan.deferredDue ?? 0))
        : Math.min(Math.max(0, loan.remainingDue - (loan.deferredDue ?? 0)), loan.installmentAmount)),
  );

const getLoanEffectiveRemainingTurns = (loan: ActiveLoan): number =>
  Math.max(1, loan.remainingTurns - (loan.deferredTurns ?? 0));

const hasMandatoryLoanPayment = (game: GameState, payment: NonNullable<GameState['pendingPayment']>): boolean => {
  const dueLoanIds = new Set((payment.loanPayments ?? []).map((loanPayment) => loanPayment.loanId));
  return (game.loans ?? []).some(
    (loan) =>
      dueLoanIds.has(loan.id) &&
      (loan.kind === 'bank' ? loan.missedPayments > 0 : getLoanEffectiveRemainingTurns(loan) <= 1),
  );
};

const getPropertyPrice = (tileId: number) => {
  const tile = getTile(tileId);
  return isPropertyTile(tile) ? tile.price : 0;
};

const getRentServiceBlockedReason = (
  game: GameState,
  ownerId: string,
  beneficiaryId: string,
  tileId: number,
): string => {
  const property = game.properties[tileId];
  if (property?.ownerId !== ownerId) return 'Послугу може дати тільки власник поля.';
  const active = (game.rentServices ?? []).some(
    (service) =>
      service.ownerId === ownerId &&
      service.beneficiaryId === beneficiaryId &&
      service.tileId === tileId &&
      service.remainingTurns > 0,
  );
  if (active) return 'Послуга на це поле вже активна.';
  const cooldownUntil = (game.rentServiceCooldowns ?? {})[`${ownerId}:${beneficiaryId}:${tileId}`] ?? 0;
  if (cooldownUntil > game.turn) return `Перезарядка до ходу ${cooldownUntil}.`;
  return '';
};

const toggleTile = (tileIds: number[], tileId: number) =>
  tileIds.includes(tileId) ? tileIds.filter((candidate) => candidate !== tileId) : [...tileIds, tileId];

const getTradeTileState = (
  game: GameState,
  tileId: number,
  playerId: string,
  draft: TradeDraft | undefined,
): TradeTileState | undefined => {
  if (!draft) return undefined;
  const tile = getTile(tileId);
  if (!isPropertyTile(tile)) return undefined;
  const property = game.properties[tileId];
  const usedCollateral = (game.loans ?? []).some((loan) => loan.collateralTileIds.includes(tileId));
  if (!property.ownerId || property.houses > 0 || usedCollateral) return 'disabled';
  if (property.ownerId === playerId) {
    return draft.offerProperties.includes(tileId) ? 'offer-selected' : 'offer';
  }
  if (property.ownerId === draft.targetId) {
    return draft.requestProperties.includes(tileId) ? 'request-selected' : 'request';
  }
  return 'disabled';
};

const getActiveTradeTileState = (tileId: number, offer: TradeOffer | undefined): TradeTileState | undefined => {
  if (!offer) return undefined;
  if (offer.offerProperties.includes(tileId)) return 'offer-selected';
  if (offer.requestProperties.includes(tileId)) return 'request-selected';
  return undefined;
};

const toggleTradeDraftTile = (game: GameState, playerId: string, draft: TradeDraft, tileId: number): TradeDraft => {
  const state = getTradeTileState(game, tileId, playerId, draft);
  if (state === 'offer' || state === 'offer-selected') {
    return { ...draft, offerProperties: toggleTile(draft.offerProperties, tileId) };
  }
  if (state === 'request' || state === 'request-selected') {
    return { ...draft, requestProperties: toggleTile(draft.requestProperties, tileId) };
  }
  return draft;
};

const getProjectedRent = (game: GameState, tile: PropertyTile, playerId: string) => {
  const next: GameState = {
    ...game,
    properties: {
      ...game.properties,
      [tile.id]: {
        ...game.properties[tile.id],
        ownerId: playerId,
        mortgaged: false,
        mortgagedAtTurn: undefined,
        mortgageTurnsLeft: undefined,
      },
    },
    players: game.players.map((player) =>
      player.id === playerId ? { ...player, properties: Array.from(new Set([...player.properties, tile.id])) } : player,
    ),
  };

  return calculateRent(next, tile, game.dice[0] + game.dice[1]);
};

const visibleDiceValues = (dice: [number, number]) => {
  const values = dice.filter((value) => value > 0);
  return values.length > 0 ? values : [1];
};

const formatDiceRoll = (dice: [number, number]) => visibleDiceValues(dice).join(' + ');

const formatDiceAria = (dice: [number, number]) => {
  const values = visibleDiceValues(dice);
  return values.length === 1 ? `Кубик: ${values[0]}` : `Кубики: ${values[0]} і ${values[1]}`;
};

const isDoubleDiceRoll = (dice: [number, number]) => dice[1] > 0 && dice[0] === dice[1];

const hasSingleDieCityEvent = (game: GameState) =>
  (game.activeCityEvents ?? []).some((event) => getCityEventDefinition(event.id).effects.singleDieRolls);

const hasBuildingBlockedCityEvent = (game: GameState) =>
  (game.activeCityEvents ?? []).some((event) => getCityEventDefinition(event.id).effects.buildingBlocked);

const formatMoney = (amount: number) => `${amount}₴`;

const getBankDepositTurnCount = (deposit: { turns?: number; steps?: number }) => Math.max(0, deposit.turns ?? deposit.steps ?? 0);

const getOwnerNameMark = (players: Player[], owner: Player): string => {
  const normalizedPrefix = getNameLetters(owner.name, 2).toLocaleLowerCase('uk-UA');
  const hasDuplicatePrefix = players.some(
    (player) => player.id !== owner.id && getNameLetters(player.name, 2).toLocaleLowerCase('uk-UA') === normalizedPrefix,
  );
  return getNameLetters(owner.name, hasDuplicatePrefix ? 3 : 2).toLocaleUpperCase('uk-UA');
};

const getNameLetters = (name: string, count: number): string => {
  const letters = Array.from(name.trim().replace(/\s+/g, ''));
  return letters.slice(0, count).join('') || '?';
};

const formatTurnWord = (turns: number) => (turns === 1 ? 'хід' : turns >= 2 && turns <= 4 ? 'ходи' : 'ходів');

const formatRoundWord = (rounds: number) =>
  rounds === 1 ? 'раунд' : rounds >= 2 && rounds <= 4 ? 'раунди' : 'раундів';

const getMortgageTurnsLeft = (game: GameState, property: { mortgagedAtTurn?: number; mortgageTurnsLeft?: number }) => {
  if (property.mortgageTurnsLeft !== undefined) return property.mortgageTurnsLeft;
  const elapsed = property.mortgagedAtTurn === undefined ? 0 : game.turn - property.mortgagedAtTurn;
  return Math.max(0, MORTGAGE_GRACE_TURNS - elapsed);
};

const useBuildingAnimationEvents = (game: GameState) => {
  const [events, setEvents] = useState<BuildingAnimationEvent[]>([]);
  const previousSnapshotRef = useRef(createBuildingSnapshot(game));
  const timersRef = useRef<number[]>([]);
  const buildingKey = boardTiles
    .filter((tile): tile is CityTile => tile.type === 'city')
    .map((tile) => {
      const property = game.properties[tile.id];
      return `${tile.id}:${property.houses}:${property.ownerId ?? ''}`;
    })
    .join('|');

  useEffect(() => {
    previousSnapshotRef.current = createBuildingSnapshot(game);
    setEvents([]);
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, [game.id]);

  useEffect(() => {
    const previousSnapshot = previousSnapshotRef.current;
    const nextSnapshot = createBuildingSnapshot(game);
    const nextEvents: BuildingAnimationEvent[] = [];

    Object.entries(nextSnapshot).forEach(([tileIdText, next]) => {
      const tileId = Number(tileIdText);
      const previous = previousSnapshot[tileId] ?? { houses: 0, ownerId: next.ownerId };
      if (previous.houses === next.houses) return;

      const ownerId = next.ownerId ?? previous.ownerId;
      const owner = ownerId ? game.players.find((player) => player.id === ownerId) : undefined;
      nextEvents.push({
        id: crypto.randomUUID(),
        tileId,
        kind: next.houses > previous.houses ? 'build' : 'demolish',
        fromHouses: previous.houses,
        toHouses: next.houses,
        color: owner?.color ?? '#f8c24e',
      });
    });

    previousSnapshotRef.current = nextSnapshot;
    if (nextEvents.length === 0) return;

    setEvents((current) => [...current, ...nextEvents].slice(-8));
    nextEvents.forEach((event) => {
      const timer = window.setTimeout(() => {
        setEvents((current) => current.filter((candidate) => candidate.id !== event.id));
      }, BUILDING_ANIMATION_MS);
      timersRef.current.push(timer);
    });
  }, [buildingKey, game]);

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  return events;
};

const createBuildingSnapshot = (game: GameState): Record<number, { houses: number; ownerId?: string }> =>
  Object.fromEntries(
    boardTiles
      .filter((tile): tile is CityTile => tile.type === 'city')
      .map((tile) => [tile.id, { houses: game.properties[tile.id].houses, ownerId: game.properties[tile.id].ownerId }]),
  );

const useDistrictPathAnimationEvents = (game: GameState) => {
  const [events, setEvents] = useState<DistrictPathAnimationEvent[]>([]);
  const previousSnapshotRef = useRef(createDistrictPathSnapshot(game));
  const timersRef = useRef<number[]>([]);
  const districtKey = Object.entries(game.districtPaths ?? {})
    .map(([group, district]) => `${group}:${district.ownerId}:${district.path}:${district.createdAtTurn}`)
    .sort()
    .join('|');

  useEffect(() => {
    previousSnapshotRef.current = createDistrictPathSnapshot(game);
    setEvents([]);
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, [game.id]);

  useEffect(() => {
    const previousSnapshot = previousSnapshotRef.current;
    const nextSnapshot = createDistrictPathSnapshot(game);
    const nextEvents: DistrictPathAnimationEvent[] = [];

    Object.entries(nextSnapshot).forEach(([group, district]) => {
      const previous = previousSnapshot[group];
      if (previous?.path === district.path && previous.ownerId === district.ownerId && previous.createdAtTurn === district.createdAtTurn) {
        return;
      }
      const groupTiles = boardTiles.filter((tile): tile is CityTile => tile.type === 'city' && tile.group === group);
      const owner = game.players.find((player) => player.id === district.ownerId);
      nextEvents.push({
        id: crypto.randomUUID(),
        group,
        path: district.path,
        ownerName: owner?.name ?? 'Гравець',
        color: groupTiles[0]?.groupColor ?? owner?.color ?? '#f8c24e',
        tileIds: groupTiles.map((tile) => tile.id),
        tileNames: groupTiles.map((tile) => tile.name),
      });
    });

    previousSnapshotRef.current = nextSnapshot;
    if (nextEvents.length === 0) return;

    setEvents((current) => [...current, ...nextEvents].slice(-4));
    nextEvents.forEach((event) => {
      const timer = window.setTimeout(() => {
        setEvents((current) => current.filter((candidate) => candidate.id !== event.id));
      }, DISTRICT_PATH_ANIMATION_MS);
      timersRef.current.push(timer);
    });
  }, [districtKey, game]);

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  return events;
};

const createDistrictPathSnapshot = (game: GameState) => game.districtPaths ?? {};

const useAuctionWinAnimationEvents = (game: GameState) => {
  const [events, setEvents] = useState<AuctionWinAnimationEvent[]>([]);
  const previousSnapshotRef = useRef(createAuctionWinSnapshot(game));
  const timersRef = useRef<number[]>([]);
  const auctionWinKey = [
    boardTiles
      .filter(isPropertyTile)
      .map((tile) => `${tile.id}:${game.properties[tile.id].ownerId ?? ''}`)
      .join('|'),
    game.auction
      ? `${game.auction.tileId}:${game.auction.startedAt}:${game.auction.highestBidderId ?? ''}:${game.auction.highestBid}`
      : 'none',
  ].join('::');

  useEffect(() => {
    previousSnapshotRef.current = createAuctionWinSnapshot(game);
    setEvents([]);
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, [game.id]);

  useEffect(() => {
    const previousSnapshot = previousSnapshotRef.current;
    const nextSnapshot = createAuctionWinSnapshot(game);
    previousSnapshotRef.current = nextSnapshot;

    const completedAuction = previousSnapshot.auction;
    if (!completedAuction?.highestBidderId) return;
    if (nextSnapshot.auction?.startedAt === completedAuction.startedAt) return;

    const previousOwnerId = previousSnapshot.owners[completedAuction.tileId];
    const nextOwnerId = nextSnapshot.owners[completedAuction.tileId];
    if (previousOwnerId === nextOwnerId || nextOwnerId !== completedAuction.highestBidderId) return;

    const winner = game.players.find((player) => player.id === completedAuction.highestBidderId);
    const event: AuctionWinAnimationEvent = {
      id: crypto.randomUUID(),
      tileId: completedAuction.tileId,
      playerName: winner?.name ?? getTile(completedAuction.tileId).name,
      amount: completedAuction.highestBid,
      color: winner?.color ?? '#f8c24e',
    };

    setEvents((current) => [...current, event].slice(-4));
    const timer = window.setTimeout(() => {
      setEvents((current) => current.filter((candidate) => candidate.id !== event.id));
    }, AUCTION_WIN_ANIMATION_MS);
    timersRef.current.push(timer);
  }, [auctionWinKey, game]);

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  return events;
};

const createAuctionWinSnapshot = (game: GameState) => ({
  owners: Object.fromEntries(
    boardTiles.filter(isPropertyTile).map((tile) => [tile.id, game.properties[tile.id].ownerId]),
  ) as Record<number, string | undefined>,
  auction: game.auction
    ? {
        tileId: game.auction.tileId,
        startedAt: game.auction.startedAt,
        highestBid: game.auction.highestBid,
        highestBidderId: game.auction.highestBidderId,
      }
    : undefined,
});

const useMortgageAnimationEvents = (game: GameState) => {
  const [events, setEvents] = useState<MortgageAnimationEvent[]>([]);
  const previousSnapshotRef = useRef(createMortgageSnapshot(game));
  const timersRef = useRef<number[]>([]);
  const mortgageKey = boardTiles
    .filter(isPropertyTile)
    .map((tile) => {
      const property = game.properties[tile.id];
      return `${tile.id}:${property.ownerId ?? ''}:${property.mortgaged ? '1' : '0'}`;
    })
    .join('|');

  useEffect(() => {
    previousSnapshotRef.current = createMortgageSnapshot(game);
    setEvents([]);
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, [game.id]);

  useEffect(() => {
    const previousSnapshot = previousSnapshotRef.current;
    const nextSnapshot = createMortgageSnapshot(game);
    const nextEvents: MortgageAnimationEvent[] = [];

    Object.entries(nextSnapshot).forEach(([tileIdText, next]) => {
      const tileId = Number(tileIdText);
      const previous = previousSnapshot[tileId];
      if (!previous || previous.mortgaged === next.mortgaged) return;

      const isMortgage = !previous.mortgaged && next.mortgaged;
      const isRedeem = previous.mortgaged && !next.mortgaged && previous.ownerId === next.ownerId && Boolean(next.ownerId);
      const isReleased = previous.mortgaged && !next.mortgaged && Boolean(previous.ownerId) && !next.ownerId;
      if (!isMortgage && !isRedeem && !isReleased) return;

      const tile = getTile(tileId);
      if (!isPropertyTile(tile)) return;
      const ownerId = next.ownerId ?? previous.ownerId;
      const owner = ownerId ? game.players.find((player) => player.id === ownerId) : undefined;
      nextEvents.push({
        id: crypto.randomUUID(),
        tileId,
        kind: isMortgage ? 'mortgage' : isReleased ? 'released' : 'redeem',
        tileName: tile.name,
        color: isReleased ? '#94a3b8' : owner?.color ?? (tile.type === 'city' ? tile.groupColor : '#f8c24e'),
      });
    });

    previousSnapshotRef.current = nextSnapshot;
    if (nextEvents.length === 0) return;

    setEvents((current) => [...current, ...nextEvents].slice(-6));
    nextEvents.forEach((event) => {
      const timer = window.setTimeout(() => {
        setEvents((current) => current.filter((candidate) => candidate.id !== event.id));
      }, MORTGAGE_ANIMATION_MS);
      timersRef.current.push(timer);
    });
  }, [mortgageKey, game]);

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  return events;
};

const createMortgageSnapshot = (game: GameState): Record<number, { mortgaged: boolean; ownerId?: string }> =>
  Object.fromEntries(
    boardTiles.filter(isPropertyTile).map((tile) => {
      const property = game.properties[tile.id];
      return [tile.id, { mortgaged: property.mortgaged, ownerId: property.ownerId }];
    }),
  );

const useLoanOfferAnimationEvents = (game: GameState) => {
  const [events, setEvents] = useState<LoanOfferAnimationEvent[]>([]);
  const previousSnapshotRef = useRef(createLoanOfferResolutionSnapshot(game));
  const timersRef = useRef<number[]>([]);
  const loanOfferKey = (game.loanOffers ?? [])
    .map((offer) => `${offer.id}:${offer.status}`)
    .sort()
    .join('|');

  useEffect(() => {
    previousSnapshotRef.current = createLoanOfferResolutionSnapshot(game);
    setEvents([]);
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, [game.id]);

  useEffect(() => {
    const previousSnapshot = previousSnapshotRef.current;
    const nextSnapshot = createLoanOfferResolutionSnapshot(game);
    const nextEvents: LoanOfferAnimationEvent[] = [];

    (game.loanOffers ?? []).forEach((offer) => {
      const previousStatus = previousSnapshot[offer.id]?.status;
      if (previousStatus !== 'pending' || (offer.status !== 'accepted' && offer.status !== 'declined')) return;
      const lender = game.players.find((player) => player.id === offer.lenderId);
      const borrower = game.players.find((player) => player.id === offer.borrowerId);
      nextEvents.push({
        id: crypto.randomUUID(),
        kind: offer.status,
        lenderName: lender?.name ?? 'Кредитор',
        borrowerName: borrower?.name ?? 'Позичальник',
        lenderColor: lender?.color ?? '#38bdf8',
        borrowerColor: borrower?.color ?? '#f8c24e',
        principal: offer.principal,
        totalRepayment: offer.totalRepayment,
      });
    });

    previousSnapshotRef.current = nextSnapshot;
    if (nextEvents.length === 0) return;

    setEvents((current) => [...current, ...nextEvents].slice(-4));
    nextEvents.forEach((event) => {
      const timer = window.setTimeout(() => {
        setEvents((current) => current.filter((candidate) => candidate.id !== event.id));
      }, LOAN_OFFER_ANIMATION_MS);
      timersRef.current.push(timer);
    });
  }, [loanOfferKey, game]);

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  return events;
};

const createLoanOfferResolutionSnapshot = (game: GameState): Record<string, { status: LoanOffer['status'] }> =>
  Object.fromEntries((game.loanOffers ?? []).map((offer) => [offer.id, { status: offer.status }]));

const useUnoReverseAnimationEvents = (game: GameState) => {
  const [events, setEvents] = useState<UnoReverseAnimationEvent[]>([]);
  const lastEventIdRef = useRef(game.pendingRent?.unoReverse?.eventId ?? '');
  const timersRef = useRef<number[]>([]);
  const reverseEventId = game.pendingRent?.unoReverse?.eventId ?? '';

  useEffect(() => {
    lastEventIdRef.current = game.pendingRent?.unoReverse?.eventId ?? '';
    setEvents([]);
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, [game.id]);

  useEffect(() => {
    const reverse = game.pendingRent?.unoReverse;
    if (!reverse || reverse.eventId === lastEventIdRef.current) return;
    lastEventIdRef.current = reverse.eventId;

    const from = game.players.find((player) => player.id === reverse.fromPlayerId);
    const to = game.players.find((player) => player.id === reverse.toPlayerId);
    const tile = getTile(game.pendingRent.tileId);
    const event: UnoReverseAnimationEvent = {
      id: reverse.eventId,
      fromName: from?.name ?? 'Гравець',
      toName: to?.name ?? 'Гравець',
      fromColor: from?.color ?? '#22c55e',
      toColor: to?.color ?? '#38bdf8',
      tileName: tile.name,
      amount: game.pendingRent.amount,
    };

    setEvents((current) => [...current, event].slice(-3));
    const timer = window.setTimeout(() => {
      setEvents((current) => current.filter((candidate) => candidate.id !== event.id));
    }, UNO_REVERSE_ANIMATION_MS);
    timersRef.current.push(timer);
  }, [game, reverseEventId]);

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  return events;
};

let emoteAudioContext: AudioContext | undefined;
const emoteAudioBuffers = new Map<string, Promise<AudioBuffer>>();

type SoundSnapshot = {
  auctionBidCount: number;
  cityEventKey: string;
  casinoSpinKey: string;
  currentPlayerId: string;
  diceRollId: number;
  gameId: string;
  logId: string;
  pendingCardKey: string;
  pendingTradeCount: number;
  phase: GameState['phase'];
  resolvedTradeCount: number;
  unoReverseKey: string;
};

const useGameSounds = (game: GameState, enabled: boolean, localPlayerId: string, isOnlineRoom: boolean) => {
  const audioRef = useRef<AudioContext | undefined>(undefined);
  const snapshotRef = useRef<SoundSnapshot | undefined>(undefined);
  const buildingSnapshotRef = useRef(createSoundBuildingSnapshot(game));

  const getAudioContext = (create = true) => {
    if (typeof window === 'undefined') return undefined;
    const audioWindow = window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const AudioContextConstructor = window.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextConstructor) return undefined;
    if (!audioRef.current && create) audioRef.current = new AudioContextConstructor();
    return audioRef.current;
  };

  useEffect(() => {
    if (!enabled) return;
    const unlockAudio = () => {
      const context = getAudioContext(true);
      if (context?.state === 'suspended') void context.resume().catch(() => undefined);
    };

    window.addEventListener('pointerdown', unlockAudio, true);
    window.addEventListener('keydown', unlockAudio, true);
    return () => {
      window.removeEventListener('pointerdown', unlockAudio, true);
      window.removeEventListener('keydown', unlockAudio, true);
    };
  }, [enabled]);

  useEffect(
    () => () => {
      void audioRef.current?.close();
    },
    [],
  );

  useEffect(() => {
    const nextSnapshot = createGameSoundSnapshot(game);
    const previousSnapshot = snapshotRef.current;
    const nextBuildings = createSoundBuildingSnapshot(game);
    const previousBuildings = buildingSnapshotRef.current;
    snapshotRef.current = nextSnapshot;
    buildingSnapshotRef.current = nextBuildings;

    if (!previousSnapshot || previousSnapshot.gameId !== game.id || !enabled) return;

    const sounds: GameSoundKind[] = [];
    if (nextSnapshot.diceRollId > previousSnapshot.diceRollId) sounds.push('dice');
    const shouldSignalTurn =
      nextSnapshot.phase === 'rolling' &&
      (nextSnapshot.currentPlayerId !== previousSnapshot.currentPlayerId || previousSnapshot.phase !== 'rolling');
    if (shouldSignalTurn) {
      sounds.push(!isOnlineRoom || nextSnapshot.currentPlayerId === localPlayerId ? 'turn-alert' : 'turn');
    }
    if (nextSnapshot.pendingCardKey && nextSnapshot.pendingCardKey !== previousSnapshot.pendingCardKey) sounds.push('card');
    if (nextSnapshot.unoReverseKey && nextSnapshot.unoReverseKey !== previousSnapshot.unoReverseKey) sounds.push('card');
    if (nextSnapshot.cityEventKey && nextSnapshot.cityEventKey !== previousSnapshot.cityEventKey) sounds.push('card');
    if (nextSnapshot.casinoSpinKey && nextSnapshot.casinoSpinKey !== previousSnapshot.casinoSpinKey) sounds.push('casino');
    if (nextSnapshot.auctionBidCount > previousSnapshot.auctionBidCount) sounds.push('bid');
    if (nextSnapshot.pendingTradeCount > previousSnapshot.pendingTradeCount) sounds.push('trade');
    if (nextSnapshot.resolvedTradeCount > previousSnapshot.resolvedTradeCount) sounds.push('trade');

    if (nextSnapshot.phase !== previousSnapshot.phase) {
      if (nextSnapshot.phase === 'auction') sounds.push('auction');
      if (nextSnapshot.phase === 'awaitingPurchase') sounds.push('purchase');
      if (nextSnapshot.phase === 'rent') sounds.push('rent');
      if (nextSnapshot.phase === 'payment') sounds.push('loss');
      if (nextSnapshot.phase === 'awaitingJailDecision') sounds.push('jail');
      if (nextSnapshot.phase === 'casino') sounds.push('casino');
    }

    Object.entries(nextBuildings).forEach(([tileId, houses]) => {
      const previousHouses = previousBuildings[Number(tileId)] ?? houses;
      if (houses > previousHouses) sounds.push(houses >= 5 ? 'hotel' : 'build');
      if (houses < previousHouses) sounds.push('demolish');
    });

    const newestLog = game.log[0];
    if (newestLog && newestLog.id !== previousSnapshot.logId) {
      const text = newestLog.text.toLowerCase();
      if (text.includes('виграє') || text.includes('виплата')) sounds.push('win');
      else if (text.includes('купує')) sounds.push('purchase');
      else if (text.includes('отримує')) sounds.push('cash');
      else if (text.includes('сплачує') || text.includes('втрачає') || text.includes('програє')) sounds.push('loss');
    }

    const context = getAudioContext(false);
    if (!context || context.state !== 'running') return;
    uniqueSounds(sounds)
      .slice(0, 4)
      .forEach((sound, index) => playGameSound(context, sound, index * 80));
  }, [enabled, game, isOnlineRoom, localPlayerId]);
};

const useEmoteSounds = (emotes: EmoteEvent[], enabled: boolean, localPlayerId: string) => {
  const playedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;
    const unlockAudio = () => {
      const context = getEmoteAudioContext(true);
      if (context?.state === 'suspended') void context.resume().catch(() => undefined);
    };

    window.addEventListener('pointerdown', unlockAudio, true);
    window.addEventListener('keydown', unlockAudio, true);
    return () => {
      window.removeEventListener('pointerdown', unlockAudio, true);
      window.removeEventListener('keydown', unlockAudio, true);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const context = getEmoteAudioContext(false);
    if (!context || context.state !== 'running') return;

    emotes.forEach((emote) => {
      if (playedRef.current.has(emote.id)) return;
      playedRef.current.add(emote.id);
      if (emote.playerId === localPlayerId) return;
      const option = getEmoteOption(emote.emoteId);
      if (!option.audioSrc) return;
      void playEmoteSound(context, emoteAudioBuffers, option.audioSrc, option.gain ?? 1);
    });
  }, [emotes, enabled, localPlayerId]);
};

const playEmoteAudio = (emoteId: string) => {
  const option = getEmoteOption(emoteId);
  if (!option.audioSrc) return;
  const context = getEmoteAudioContext();
  if (!context) return;
  void playEmoteSound(context, emoteAudioBuffers, option.audioSrc, option.gain ?? 1);
};

const getEmoteAudioContext = (create = true) => {
  if (typeof window === 'undefined') return undefined;
  const audioWindow = window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const AudioContextConstructor = window.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextConstructor) return undefined;
  if (!emoteAudioContext && create) emoteAudioContext = new AudioContextConstructor();
  return emoteAudioContext;
};

const playEmoteSound = async (
  context: AudioContext,
  buffers: Map<string, Promise<AudioBuffer>>,
  audioSrc: string,
  gainValue: number,
) => {
  try {
    const ready = await resumeAudioContext(context);
    if (!ready) return;
    const buffer = await loadAudioBuffer(context, buffers, audioSrc);
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(gainValue, context.currentTime);
    source.connect(gain);
    gain.connect(context.destination);
    source.start();
  } catch {
    // Missing custom emote audio should never block the visual emote.
  }
};

const resumeAudioContext = async (context: AudioContext): Promise<boolean> => {
  if (context.state === 'closed') return false;
  if (context.state === 'suspended') {
    await context.resume();
  }
  return context.state === 'running';
};

const loadAudioBuffer = (
  context: AudioContext,
  buffers: Map<string, Promise<AudioBuffer>>,
  audioSrc: string,
): Promise<AudioBuffer> => {
  let buffer = buffers.get(audioSrc);
  if (!buffer) {
    buffer = fetch(audioSrc)
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load ${audioSrc}`);
        return response.arrayBuffer();
      })
      .then((arrayBuffer) => context.decodeAudioData(arrayBuffer));
    buffers.set(audioSrc, buffer);
  }
  return buffer;
};

const createGameSoundSnapshot = (game: GameState): SoundSnapshot => ({
  auctionBidCount: game.auction?.bids.length ?? 0,
  cityEventKey: game.pendingCityEvent
    ? `${game.pendingCityEvent.id}:${game.pendingCityEvent.secondary?.id ?? 'single'}:${game.pendingCityEvent.round}`
    : '',
  casinoSpinKey: game.pendingCasino?.spinStartedAt ? `${game.pendingCasino.playerId}:${game.pendingCasino.spinStartedAt}` : '',
  currentPlayerId: game.currentPlayerId,
  diceRollId: game.diceRollId ?? 0,
  gameId: game.id,
  logId: game.log[0]?.id ?? '',
  pendingCardKey: game.pendingCard ? `${game.pendingCard.deck}:${game.pendingCard.cardId}:${game.turn}` : '',
  pendingTradeCount: game.tradeOffers.filter((offer) => offer.status === 'pending').length,
  phase: game.phase,
  resolvedTradeCount: game.tradeOffers.filter((offer) => offer.status === 'accepted' || offer.status === 'declined').length,
  unoReverseKey: game.pendingRent?.unoReverse?.eventId ?? '',
});

const createSoundBuildingSnapshot = (game: GameState): Record<number, number> =>
  Object.fromEntries(
    boardTiles.filter((tile): tile is CityTile => tile.type === 'city').map((tile) => [tile.id, game.properties[tile.id].houses]),
  );

const uniqueSounds = (sounds: GameSoundKind[]) => {
  const seen = new Set<GameSoundKind>();
  return sounds.filter((sound) => {
    if (seen.has(sound)) return false;
    seen.add(sound);
    return true;
  });
};

const playGameSound = (context: AudioContext, sound: GameSoundKind, delayMs = 0) => {
  switch (sound) {
    case 'auction':
      playTone(context, 880, 0.1, 'triangle', 0.055, delayMs);
      playTone(context, 660, 0.16, 'triangle', 0.045, delayMs + 110);
      break;
    case 'bid':
      playTone(context, 540, 0.08, 'square', 0.035, delayMs);
      playTone(context, 720, 0.08, 'triangle', 0.035, delayMs + 70);
      break;
    case 'build':
      playNoise(context, 0.16, 0.045, 180, delayMs);
      playTone(context, 220, 0.18, 'sawtooth', 0.04, delayMs + 40);
      break;
    case 'hotel':
      playNoise(context, 0.24, 0.055, 140, delayMs);
      [330, 494, 659, 880].forEach((frequency, index) => playTone(context, frequency, 0.13, 'triangle', 0.04, delayMs + index * 70));
      break;
    case 'card':
      [620, 830, 1040].forEach((frequency, index) => playTone(context, frequency, 0.09, 'sine', 0.034, delayMs + index * 55));
      break;
    case 'casino':
      playNoise(context, 0.18, 0.032, 900, delayMs);
      [392, 523, 784].forEach((frequency, index) => playTone(context, frequency, 0.11, 'triangle', 0.035, delayMs + index * 75));
      break;
    case 'cash':
      playTone(context, 1046, 0.08, 'triangle', 0.038, delayMs);
      playTone(context, 1318, 0.1, 'triangle', 0.032, delayMs + 70);
      break;
    case 'demolish':
      playNoise(context, 0.26, 0.05, 120, delayMs);
      playTone(context, 180, 0.18, 'sawtooth', 0.035, delayMs + 80);
      break;
    case 'dice':
      playNoise(context, 0.28, 0.048, 1150, delayMs);
      playTone(context, 170, 0.08, 'square', 0.024, delayMs + 70);
      playTone(context, 230, 0.07, 'square', 0.02, delayMs + 150);
      break;
    case 'jail':
      playTone(context, 196, 0.22, 'sawtooth', 0.044, delayMs);
      playTone(context, 147, 0.24, 'sawtooth', 0.036, delayMs + 130);
      break;
    case 'loss':
    case 'rent':
      playTone(context, 330, 0.12, 'triangle', 0.038, delayMs);
      playTone(context, 220, 0.18, 'triangle', 0.034, delayMs + 95);
      break;
    case 'purchase':
      [392, 523, 659].forEach((frequency, index) => playTone(context, frequency, 0.11, 'triangle', 0.04, delayMs + index * 70));
      break;
    case 'trade':
      playTone(context, 440, 0.08, 'sine', 0.032, delayMs);
      playTone(context, 660, 0.1, 'sine', 0.032, delayMs + 85);
      break;
    case 'turn':
      playTone(context, 480, 0.08, 'sine', 0.026, delayMs);
      break;
    case 'turn-alert':
      playTone(context, 660, 0.09, 'sine', 0.052, delayMs);
      playTone(context, 880, 0.11, 'triangle', 0.048, delayMs + 75);
      break;
    case 'win':
      [523, 659, 784, 1046].forEach((frequency, index) => playTone(context, frequency, 0.1, 'triangle', 0.04, delayMs + index * 60));
      break;
  }
};

const playTone = (
  context: AudioContext,
  frequency: number,
  duration: number,
  type: OscillatorType,
  volume: number,
  delayMs = 0,
) => {
  const start = context.currentTime + delayMs / 1000;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
};

const playNoise = (context: AudioContext, duration: number, volume: number, filterFrequency: number, delayMs = 0) => {
  const start = context.currentTime + delayMs / 1000;
  const frameCount = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const output = buffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) {
    const fade = 1 - index / frameCount;
    output[index] = (Math.random() * 2 - 1) * fade;
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer;
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(filterFrequency, start);
  filter.Q.setValueAtTime(0.9, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  source.start(start);
  source.stop(start + duration + 0.02);
};

const useTurnTimer = (
  game: GameState,
  isLocalTurn: boolean,
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'],
) => {
  const timerPhaseKey = getTurnTimerPhaseKey(game);
  const turnKey = `${game.id}:${game.turn}:${game.currentPlayerId}:${timerPhaseKey}`;
  const [timerState, setTimerState] = useState(() => ({ secondsLeft: TURN_SECONDS, turnKey }));
  const secondsLeft = timerState.turnKey === turnKey ? timerState.secondsLeft : TURN_SECONDS;
  const expiredRef = useRef('');

  useEffect(() => {
    setTimerState({ secondsLeft: TURN_SECONDS, turnKey });
    expiredRef.current = '';
  }, [turnKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTimerState((state) =>
        state.turnKey === turnKey ? { ...state, secondsLeft: Math.max(0, state.secondsLeft - 1) } : state,
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, [turnKey]);

  useEffect(() => {
    if (timerState.turnKey !== turnKey) return;
    if (secondsLeft > 0 || expiredRef.current === turnKey || !isLocalTurn) return;

    const dispatchTimerAction = (action: Parameters<typeof dispatch>[0]) => {
      expiredRef.current = turnKey;
      dispatch(action);
    };

    if (game.phase === 'orderRoll') {
      dispatchTimerAction({ type: 'roll_for_order', playerId: game.currentPlayerId });
      return;
    }

    if (game.phase === 'rolling') {
      if (game.tradeOffers.some((offer) => offer.status === 'pending')) return;
      dispatchTimerAction({ type: 'roll', playerId: game.currentPlayerId });
      return;
    }

    if (game.phase === 'awaitingPurchase') {
      dispatchTimerAction({ type: 'decline_buy', playerId: game.currentPlayerId });
      return;
    }

    if (game.phase === 'awaitingCard') {
      dispatchTimerAction({ type: 'draw_card', playerId: game.currentPlayerId });
      return;
    }

    if (game.phase === 'casino') {
      if (game.pendingCasino?.spinEndsAt) return;
      dispatchTimerAction({ type: 'skip_casino', playerId: game.currentPlayerId });
      return;
    }

    if (game.phase === 'bankDeposit' && game.pendingBankDeposit) {
      dispatchTimerAction({ type: 'decline_bank_deposit', playerId: game.pendingBankDeposit.playerId });
      return;
    }

    if (game.phase === 'awaitingJailDecision') {
      dispatchTimerAction({ type: 'go_to_jail', playerId: game.currentPlayerId });
      return;
    }

    if ((game.phase === 'turnEnd' || game.phase === 'manage' || game.phase === 'trade') && !game.tradeOffers.some((offer) => offer.status === 'pending')) {
      dispatchTimerAction({ type: 'continue_turn', playerId: game.currentPlayerId });
    }
  }, [dispatch, game, isLocalTurn, secondsLeft, timerState.turnKey, turnKey]);

  return secondsLeft;
};

const getTurnTimerPhaseKey = (game: GameState): string => {
  switch (game.phase) {
    case 'awaitingPurchase':
      return `${game.phase}:${game.pendingPurchaseTileId ?? 'none'}`;
    case 'awaitingCard':
      return `${game.phase}:${game.pendingCardDraw?.deck ?? 'none'}:${game.pendingCardDraw?.tileId ?? 'none'}`;
    case 'awaitingJailDecision':
      return `${game.phase}:${game.pendingJail?.playerId ?? 'none'}:${game.pendingJail?.tileId ?? 'none'}`;
    case 'casino':
      return `${game.phase}:${game.pendingCasino?.playerId ?? 'none'}:${game.pendingCasino?.tileId ?? 'none'}:${game.pendingCasino?.spinStartedAt ?? 'ready'}`;
    case 'bankDeposit':
      return `${game.phase}:${game.pendingBankDeposit?.playerId ?? 'none'}:${game.pendingBankDeposit?.tileId ?? 'none'}`;
    case 'payment':
      return `${game.phase}:${game.pendingPayment?.payerId ?? 'none'}:${game.pendingPayment?.amount ?? 0}:${game.pendingPayment?.source ?? 'none'}`;
    case 'rent':
      return `${game.phase}:${game.pendingRent?.payerId ?? 'none'}:${game.pendingRent?.ownerId ?? 'none'}:${game.pendingRent?.tileId ?? 'none'}`;
    default:
      return game.phase;
  }
};

const useAutoContinueTurn = (
  game: GameState,
  canAutoContinue: boolean,
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'],
  isBoardBusy: boolean,
) => {
  const autoKey = `${game.id}:${game.turn}:${game.currentPlayerId}:${game.phase}:${game.lastDice?.join('-') ?? 'no-roll'}:${game.pendingCard?.cardId ?? 'no-card'}`;
  const sentRef = useRef('');
  const jailSentRef = useRef('');
  const currentPlayer = game.players.find((player) => player.id === game.currentPlayerId);
  const hasPendingTrade = game.tradeOffers.some((offer) => offer.status === 'pending');
  const isJailRollEnd = Boolean(
    game.phase === 'turnEnd' &&
      currentPlayer?.position === 10 &&
      game.lastDice &&
      !isDoubleDiceRoll(game.lastDice) &&
      game.diceRollId > 0,
  );

  useEffect(() => {
    if (!canAutoContinue || !isJailRollEnd || hasPendingTrade || jailSentRef.current === autoKey) return;
    jailSentRef.current = autoKey;
    const timer = window.setTimeout(() => {
      dispatch({ type: 'continue_turn', playerId: game.currentPlayerId });
    }, DICE_ROLL_ANIMATION_MS + 450);

    return () => window.clearTimeout(timer);
  }, [autoKey, canAutoContinue, dispatch, game.currentPlayerId, hasPendingTrade, isJailRollEnd]);

  useEffect(() => {
    if (
      !canAutoContinue ||
      game.phase !== 'turnEnd' ||
      isJailRollEnd ||
      isBoardBusy ||
      hasPendingTrade ||
      sentRef.current === autoKey
    ) {
      return;
    }
    sentRef.current = autoKey;

    const hasDoubleRoll = Boolean(game.lastDice && game.lastDice[0] === game.lastDice[1] && game.doublesInRow > 0);
    const delay = game.pendingCard ? CARD_REVEAL_MS : hasDoubleRoll ? 900 : AUTO_CONTINUE_MS;
    const timer = window.setTimeout(() => {
      dispatch({ type: 'continue_turn', playerId: game.currentPlayerId });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [autoKey, canAutoContinue, dispatch, game, hasPendingTrade, isBoardBusy, isJailRollEnd]);
};

const useDiceRollAnimation = (game: GameState, enabled = true) => {
  const [activeRollId, setActiveRollId] = useState<number | undefined>();
  const lastRollIdRef = useRef(game.diceRollId ?? 0);

  useEffect(() => {
    lastRollIdRef.current = game.diceRollId ?? 0;
    setActiveRollId(undefined);
  }, [game.id]);

  useEffect(() => {
    const rollId = game.diceRollId ?? 0;
    if (rollId === 0 || rollId === lastRollIdRef.current) return;

    lastRollIdRef.current = rollId;
    if (!enabled) {
      setActiveRollId(undefined);
      return;
    }

    setActiveRollId(rollId);
    const timer = window.setTimeout(() => {
      setActiveRollId((current) => (current === rollId ? undefined : current));
    }, DICE_ROLL_ANIMATION_MS);

    return () => window.clearTimeout(timer);
  }, [enabled, game.diceRollId]);

  return activeRollId === (game.diceRollId ?? 0);
};

const useAnimatedPositions = (game: GameState) => {
  const positionKey = game.players.map((player) => `${player.id}:${player.position}`).join('|');
  const targetPositions = useMemo(
    () => Object.fromEntries(game.players.map((player) => [player.id, player.position])),
    [positionKey],
  );
  const initialPositions = useMemo(
    () => Object.fromEntries(game.players.map((player) => [player.id, player.position])),
    [game.id],
  );
  const [displayPositions, setDisplayPositions] = useState<Record<string, number>>(initialPositions);
  const [isAnimating, setIsAnimating] = useState(false);
  const positionsRef = useRef<Record<string, number>>(initialPositions);
  const previousRollIdRef = useRef(game.diceRollId ?? 0);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    positionsRef.current = initialPositions;
    previousRollIdRef.current = game.diceRollId ?? 0;
    setDisplayPositions(initialPositions);
    setIsAnimating(false);
  }, [initialPositions]);

  useEffect(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    let maxDelay = 0;
    let hasMovement = false;
    const rollId = game.diceRollId ?? 0;
    const shouldWaitForDice = rollId > 0 && rollId !== previousRollIdRef.current;
    const movementStartDelay = shouldWaitForDice ? DICE_ROLL_ANIMATION_MS : 0;
    previousRollIdRef.current = rollId;

    Object.entries(targetPositions).forEach(([playerId, target]) => {
      const current = positionsRef.current[playerId] ?? target;
      if (current === target) {
        positionsRef.current[playerId] = target;
        return;
      }

      buildForwardPath(current, target).forEach((position, index) => {
        hasMovement = true;
        const delay = movementStartDelay + (index + 1) * PAWN_STEP_ANIMATION_MS;
        maxDelay = Math.max(maxDelay, delay);
        const timer = window.setTimeout(() => {
          positionsRef.current = { ...positionsRef.current, [playerId]: position };
          setDisplayPositions(positionsRef.current);
        }, delay);
        timersRef.current.push(timer);
      });
    });

    setIsAnimating(hasMovement);
    if (hasMovement) {
      const timer = window.setTimeout(() => setIsAnimating(false), maxDelay + 60);
      timersRef.current.push(timer);
    }

    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];
    };
  }, [game.diceRollId, targetPositions]);

  const hasPendingMovement = Object.entries(targetPositions).some(
    ([playerId, position]) => (displayPositions[playerId] ?? position) !== position,
  );
  return { displayPositions, isAnimating: isAnimating || hasPendingMovement };
};

const buildForwardPath = (from: number, to: number) => {
  const path: number[] = [];
  let cursor = from;
  while (cursor !== to && path.length < boardTiles.length) {
    cursor = (cursor + 1) % boardTiles.length;
    path.push(cursor);
  }
  return path;
};

const BOARD_EDGE_X = 12;
const BOARD_EDGE_Y = 18;
const BOARD_MIDDLE_TILE_W = (100 - BOARD_EDGE_X * 2) / 9;
const BOARD_MIDDLE_TILE_H = (100 - BOARD_EDGE_Y * 2) / 9;

const boardPosition = (id: number) => {
  if (id === 0) return { side: 'bottom', left: 100 - BOARD_EDGE_X, top: 100 - BOARD_EDGE_Y, width: BOARD_EDGE_X, height: BOARD_EDGE_Y };
  if (id > 0 && id < 10) {
    return {
      side: 'bottom',
      left: BOARD_EDGE_X + (9 - id) * BOARD_MIDDLE_TILE_W,
      top: 100 - BOARD_EDGE_Y,
      width: BOARD_MIDDLE_TILE_W,
      height: BOARD_EDGE_Y,
    };
  }
  if (id === 10) return { side: 'bottom', left: 0, top: 100 - BOARD_EDGE_Y, width: BOARD_EDGE_X, height: BOARD_EDGE_Y };
  if (id > 10 && id < 20) {
    return {
      side: 'left',
      left: 0,
      top: BOARD_EDGE_Y + (19 - id) * BOARD_MIDDLE_TILE_H,
      width: BOARD_EDGE_X,
      height: BOARD_MIDDLE_TILE_H,
    };
  }
  if (id === 20) return { side: 'top', left: 0, top: 0, width: BOARD_EDGE_X, height: BOARD_EDGE_Y };
  if (id > 20 && id < 30) {
    return {
      side: 'top',
      left: BOARD_EDGE_X + (id - 21) * BOARD_MIDDLE_TILE_W,
      top: 0,
      width: BOARD_MIDDLE_TILE_W,
      height: BOARD_EDGE_Y,
    };
  }
  if (id === 30) return { side: 'top', left: 100 - BOARD_EDGE_X, top: 0, width: BOARD_EDGE_X, height: BOARD_EDGE_Y };
  return {
    side: 'right',
    left: 100 - BOARD_EDGE_X,
    top: BOARD_EDGE_Y + (id - 31) * BOARD_MIDDLE_TILE_H,
    width: BOARD_EDGE_X,
    height: BOARD_MIDDLE_TILE_H,
  };
};

const pawnPoint = (tileId: number, index: number, total: number) => {
  const position = boardPosition(tileId);
  const base = pawnBasePoint(position);
  const offsets = pawnOffsets(total, position)[index] ?? { x: 0, y: 0 };

  return { x: base.x + offsets.x, y: base.y + offsets.y };
};

const pawnBasePoint = (position: ReturnType<typeof boardPosition>) => {
  if (position.side === 'bottom') return { x: position.left + position.width / 2, y: position.top + position.height * 0.37 };
  if (position.side === 'top') return { x: position.left + position.width / 2, y: position.top + position.height * 0.63 };
  if (position.side === 'left') return { x: position.left + position.width * 0.62, y: position.top + position.height / 2 };
  return { x: position.left + position.width * 0.38, y: position.top + position.height / 2 };
};

const tileCenterPoint = (tileId: number) => {
  const position = boardPosition(tileId);
  return {
    x: position.left + position.width / 2,
    y: position.top + position.height / 2,
  };
};

const pawnOffsets = (total: number, position: ReturnType<typeof boardPosition>) => {
  const isHorizontal = position.side === 'top' || position.side === 'bottom';
  const stepX = isHorizontal ? Math.min(position.width * 0.24, 2.05) : Math.min(position.width * 0.085, 1.05);
  const stepY = isHorizontal ? Math.min(position.height * 0.085, 1.25) : Math.min(position.height * 0.24, 1.58);
  const make = (x: number, y: number) => ({ x: x * stepX, y: y * stepY });

  if (total <= 1) return [make(0, 0)];
  if (total === 2) return [make(-0.62, 0), make(0.62, 0)];
  if (total === 3) return [make(-0.72, 0.62), make(0.72, 0.62), make(0, -0.72)];
  if (total === 5) {
    return [
      make(-1, 0.72),
      make(0, 0.72),
      make(1, 0.72),
      make(-0.58, -0.72),
      make(0.58, -0.72),
    ];
  }
  if (total >= 6) {
    return [
      make(-1, 0.72),
      make(0, 0.72),
      make(1, 0.72),
      make(-1, -0.72),
      make(0, -0.72),
      make(1, -0.72),
    ];
  }
  return [
    make(-0.7, 0.72),
    make(0.7, 0.72),
    make(-0.7, -0.72),
    make(0.7, -0.72),
  ];
};

const getEmoteOption = (emoteId: string): EmoteOption => EMOTE_OPTION_MAP.get(emoteId) ?? EMOTE_OPTIONS[0];

const isTextEditingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
};

const formatTimer = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const formatLogTime = (timestamp: number) => LOG_TIME_FORMATTER.format(timestamp);

const DiceIcon = () => (
  <div className="dice-icon" aria-hidden>
    <span />
    <span />
    <span />
    <span />
  </div>
);
