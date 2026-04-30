import { boardTiles, cityTiles, getTile, isPropertyTile, propertyTiles } from '../data/board';
import { chanceCards, communityCards } from '../data/cards';
import { CITY_EVENT_ROUND_INTERVAL, cityEventDefinitions, getCityEventDefinition } from '../data/cityEvents';
import type {
  ActiveCityEvent,
  ActiveLoan,
  ActiveRentService,
  BankDepositState,
  CardDeck,
  CityEventDefinition,
  CityEventId,
  CityTile,
  DistrictPath,
  GameAction,
  GameFinishReason,
  GameState,
  LogEntry,
  LoanOffer,
  MatchStats,
  MoneyHistoryPoint,
  PendingPayment,
  Player,
  PlayerMatchStats,
  PlayerRoleState,
  PostMatchAward,
  PostMatchAwardId,
  DistrictMatchStats,
  PostMatchPropertySummary,
  PostMatchSummary,
  PostMatchTransferSummary,
  PropertyMatchStats,
  PropertyState,
  PropertyTile,
  RentServiceOffer,
  RoleId,
  TransferStatSource,
  TradeOffer,
} from './types';
import { money } from './economy';
import { getStartReward } from './startRewards';
import { getLateGameFineMultiplier, getLateGamePriceMultiplier } from './difficulty';
import {
  BANKER_BANK_CARD_WEIGHT_MULTIPLIER,
  BANKER_RENT_MULTIPLIER,
  BANKER_STARTING_BANK_TILE_ID,
  BANKER_WIN_BANKS,
  BANKER_WIN_DEPOSIT_PAYOUT,
  BUILDER_BUILDING_REFUND_MULTIPLIER,
  BUILDER_HOUSE_COST_MULTIPLIER,
  BUILDER_REMOTE_PURCHASE_MULTIPLIER,
  BUILDER_WIN_DISTRICTS,
  CASINO_CHANCE_CARD_ID,
  COLLECTOR_GROUP_BONUS,
  COLLECTOR_WIN_NET_WORTH,
  COLLECTOR_WIN_PROPERTIES,
  DEFAULT_TRADE_VALUE_MULTIPLIER,
  GAMBLER_CASINO_CARD_WEIGHT_MULTIPLIER,
  GAMBLER_CASINO_ZERO_WEIGHT_MULTIPLIER,
  GAMBLER_OPENING_CASINO_MULTIPLIERS,
  GAMBLER_STARTING_CASH,
  GAMBLER_STARTING_CASINO_TILE_ID,
  GAMBLER_WIN_CASH,
  LAWYER_FINE_DISCOUNT,
  LAWYER_RENT_DISCOUNT,
  LAWYER_TOTAL_PROTECTIONS,
  LAWYER_WIN_SAVED,
  MAYOR_CHOOSE_EVENT_INTERVAL,
  MAYOR_CITY_EVENT_CHOICE_COUNT,
  MAYOR_WIN_EVENT_INCOME,
  NEAREST_BANK_CHANCE_CARD_ID,
  REALTOR_BUILD_COST_MULTIPLIER,
  REALTOR_STARTING_CITY_COUNT,
  REALTOR_TRADE_VALUE_MULTIPLIER,
  REALTOR_WIN_PROFIT,
  ROLE_DEFINITIONS,
  ROLE_IDS,
} from './roles';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const PLAYER_TOKENS = ['⚓', '✦', '◆', '●', '▲', '■'];
export const PLAYER_COLORS = ['#f8c24e', '#43b3ff', '#f0645f', '#3ccf91', '#a78bfa', '#fb923c'];
const STARTING_MONEY = money(1700);
const MORTGAGE_GRACE_TURNS = 10;
const UNMORTGAGE_INTEREST_MULTIPLIER = 1.05;
const AUCTION_DURATION_MS = 15_000;
export const AUCTION_BID_INCREMENT = money(10);
const TRADE_MONEY_INCREMENT = money(50);
const CASINO_MAX_BET = money(600);
const CASINO_MAX_MULTIPLIER = 6;
const CASINO_SPIN_DURATION_MS = 5_400;
const JAIL_FINE = money(100);
const JAIL_TURNS = 3;
const UNO_REVERSE_CARD_ID = 13;
const UNO_REVERSE_CARD_DECK_COPIES = 4;
const UNO_REVERSE_CARD_LIMIT = 1;
const LOAN_PAYOFF_CARD_ID = 14;
const LOAN_PAYOFF_CARD_LIMIT = 1;
const COMMUNISM_COMMUNITY_CARD_ID = 12;
const COMMUNISM_RICH_CASH_WEIGHT_MULTIPLIER = 3;
const COMMUNISM_LOW_CASH_WEIGHT_MULTIPLIER = 0.35;
const STEP_FEE_CITY_EVENT_ID: CityEventId = 'paid-roads';
const ROAD_REPAIR_CITY_EVENT_ID: CityEventId = 'road-repair';
const CITY_EVENT_DOUBLE_CHANCE = 0.18;
const STEP_FEE_SECOND_SINGLE_DIE_CHANCE = 0.65;
const STEP_FEE_CITY_EVENT_EXTRA_DECK_COPIES = 1;
const RESIDENTIAL_BUILD_LIMIT_PER_ROLL = 2;
const RESIDENTIAL_HOUSE_COST_MULTIPLIER = 0.45;
const RESIDENTIAL_DISTRICT_RENT_DIVISOR = 1.8;
const DISTRICT_RENT_DIVISOR = 2.35;
const GREEN_DISTRICT_BUILDING_RENT_DIVISOR = 4;
const GOLD_DISTRICT_BUILDING_RENT_DIVISOR = 3.5;
const OLD_TOWN_PASS_THROUGH_DIVISOR = 3.5;
const GREEN_DISTRICT_RENT_GROUPS = new Set(['Зелена']);
const GOLD_DISTRICT_RENT_GROUPS = new Set(['Золота']);
const BANK_DEPOSIT_MIN_BANKS = 2;
const BANK_DEPOSIT_TURN_RATE = 0.1;
const BANK_DEPOSIT_MAX_PAYOUT = money(650);
const BANK_RENT_BY_COUNT = [0, money(38), money(75), money(150), money(300)] as const;
const PLAYER_LOAN_MIN_PRINCIPAL = money(50);
const PLAYER_LOAN_MAX_PRINCIPAL = money(800);
const PLAYER_LOAN_MIN_DURATION = 2;
const PLAYER_LOAN_MAX_DURATION = 10;
const PLAYER_LOAN_MAX_REPAYMENT_MULTIPLIER = 1.8;
const PLAYER_LOAN_MAX_ACTIVE_AS_BORROWER = 3;
const PLAYER_LOAN_MAX_COLLATERAL_MULTIPLIER = 2;
const BANK_LOAN_MIN_AMOUNT = money(50);
const BANK_LOAN_MAX_AMOUNT = money(500);
const BANK_LOAN_WORTH_MULTIPLIER = 0.3;
const BANK_LOAN_DURATION = 10;
const BANK_LOAN_REPAYMENT_MULTIPLIER = 1.3;
const PLAYER_LOAN_LATE_FEE = 0.1;
const BANK_LOAN_LATE_FEE = 0.2;
const PLAYER_LOAN_BANKRUPTCY_PAYOUT_RATE = 0.6;
const OLD_TOWN_PASS_THROUGH_MESSAGES: Record<string, string> = {
  pavlohrad: 'Ви проминули старі промислові квартали Павлограда.',
  ternivka: 'Ви пройшли повз тихі вулички Тернівки.',
  kropyvnytskyi: 'Ви побачили історичний центр Кропивницького.',
  cherkasy: 'Ви пройшли черкаською набережною.',
  zhytomyr: 'Ви проминули старі квартали Житомира.',
  sumy: 'Ви прогулялись затишними вулицями Сум.',
  poltava: 'Ви пройшли повз полтавські історичні будинки.',
  chernihiv: 'Ви побачили стародавні пагорби Чернігова.',
  khmelnytskyi: 'Ви проминули центр Хмельницького.',
  rivne: 'Ви пройшли повз старі дворики Рівного.',
  lutsk: 'Ви побачили вежі старого Луцька.',
  zaporizhzhia: 'Ви проминули козацькі місця Запоріжжя.',
  mykolaiv: 'Ви пройшли повз корабельні вулиці Миколаєва.',
  vinnytsia: 'Ви прогулялись вечірньою Вінницею.',
  dnipro: 'Ви побачили дніпровські краєвиди.',
  kharkiv: 'Ви проминули широкі проспекти Харкова.',
  odesa: 'Ви пройшли одеськими старими двориками.',
  'ivano-frankivsk': 'Ви насолодились камеральним центром Франківська.',
  uzhhorod: 'Ви пройшли повз ужгородські сакури.',
  chernivtsi: 'Ви побачили архітектуру старих Чернівців.',
  lviv: 'Ви прогулялись бруківкою старого Львова.',
  kyiv: 'Ви насолодились вечірнім Києвом.',
};

interface CreateInitialGameOptions {
  determineTurnOrder?: boolean;
  rolesEnabled?: boolean;
  roleOrder?: RoleId[];
}

export const createInitialGame = (
  playerNames: string[],
  id: string = crypto.randomUUID(),
  options: CreateInitialGameOptions = {},
): GameState => {
  if (playerNames.length < MIN_PLAYERS || playerNames.length > MAX_PLAYERS) {
    throw new Error(`Гра підтримує ${MIN_PLAYERS}-${MAX_PLAYERS} гравців.`);
  }

  const players: Player[] = playerNames.map((name, index) => ({
    id: `p${index + 1}`,
    name,
    token: PLAYER_TOKENS[index],
    color: PLAYER_COLORS[index],
    money: STARTING_MONEY,
    position: 0,
    properties: [],
    jailTurns: 0,
    jailCards: 0,
    unoReverseCards: 0,
    loanPayoffCards: 0,
    isBankrupt: false,
  }));

  let properties: GameState['properties'] = Object.fromEntries(
    propertyTiles.map((tile) => [
      tile.id,
      { houses: 0, mortgaged: false, mortgagedAtTurn: undefined, mortgageTurnsLeft: undefined },
    ]),
  );
  let assignedPlayers: Player[] = players;
  let roleState: GameState['roleState'];
  const rolesEnabled = options.rolesEnabled ?? true;
  if (rolesEnabled && !options.determineTurnOrder) {
    const assigned = assignRolesAndStartingBenefits(players, properties, options.roleOrder);
    assignedPlayers = assigned.players;
    properties = assigned.properties;
    roleState = assigned.roleState;
  }
  const moneyHistory = createMoneyHistorySnapshot({
    players: assignedPlayers,
    turn: 1,
    currentRound: 1,
    properties,
  });

  const initial: GameState = {
    id,
    players: assignedPlayers,
    currentPlayerId: assignedPlayers[0].id,
    turn: 1,
    currentRound: 1,
    phase: options.determineTurnOrder ? 'orderRoll' : 'rolling',
    properties,
    chanceDeck: createCardDeck(chanceCards),
    communityDeck: createCardDeck(communityCards),
    discardChance: [],
    discardCommunity: [],
    cityEventDeck: createCityEventDeck(),
    cityEventDiscard: [],
    activeCityEvents: [],
    districtPaths: {},
    tradeOffers: [],
    loanOffers: [],
    loans: [],
    rentServices: [],
    rentServiceCooldowns: {},
    bankDeposits: {},
    rolesEnabled,
    roleState,
    summaryVotes: {},
    matchStats: createInitialMatchStats(assignedPlayers),
    dice: [1, 1],
    diceRollId: 0,
    doublesInRow: 0,
    moneyHistory: [moneyHistory],
    turnOrderRolls: options.determineTurnOrder ? {} : undefined,
    pendingRoleOrder: rolesEnabled && options.determineTurnOrder ? options.roleOrder : undefined,
    log: [
      log(
        options.determineTurnOrder
          ? 'Партія створена. Кидайте кубики, щоб визначити чергу ходів.'
          : 'Партія створена. Кидайте кубики.',
        'good',
      ),
    ],
  };

  return openGamblerOpeningCasinoIfNeeded(initial);
};

const createDefaultRoleState = (): PlayerRoleState => ({
  realtorProfit: 0,
  lawyerSaved: 0,
  lawyerProtectionsLeft: LAWYER_TOTAL_PROTECTIONS,
  collectorBonusReceived: 0,
  gamblerOpeningSpinDone: false,
  gamblerOpeningSingleDieRollPending: false,
  builderRemotePurchaseUsed: false,
  builderAuctionUsed: false,
  builderSpecialActionRound: 0,
  mayorCityEventsSeen: 0,
  mayorEventIncome: 0,
});

const getRoleAssignmentOrder = (count: number, roleOrder?: RoleId[]): RoleId[] => {
  const seen = new Set<RoleId>();
  const preferred = (roleOrder ?? []).filter((roleId) => {
    if (!ROLE_IDS.includes(roleId) || seen.has(roleId)) return false;
    seen.add(roleId);
    return true;
  });
  const remaining = shuffle(ROLE_IDS.filter((roleId) => !seen.has(roleId)));
  return [...preferred, ...remaining].slice(0, count);
};

const assignRolesAndStartingBenefits = (
  players: Player[],
  properties: GameState['properties'],
  roleOrder?: RoleId[],
): { players: Player[]; properties: GameState['properties']; roleState: Record<string, PlayerRoleState> } => {
  const roles = getRoleAssignmentOrder(players.length, roleOrder);
  let nextPlayers: Player[] = players.map((player, index) => ({ ...player, roleId: roles[index] }));
  let nextProperties: GameState['properties'] = { ...properties };
  const roleState: Record<string, PlayerRoleState> = Object.fromEntries(
    nextPlayers.map((player) => [player.id, createDefaultRoleState()]),
  );

  nextPlayers.forEach((player) => {
    if (player.roleId === 'gambler') {
      nextPlayers = nextPlayers.map((candidate) =>
        candidate.id === player.id
          ? { ...candidate, money: money(GAMBLER_STARTING_CASH), position: GAMBLER_STARTING_CASINO_TILE_ID }
          : candidate,
      );
    }
    if (player.roleId === 'banker') {
      const granted = grantStartingProperty(nextPlayers, nextProperties, player.id, BANKER_STARTING_BANK_TILE_ID);
      nextPlayers = granted.players;
      nextProperties = granted.properties;
    }
    if (player.roleId === 'realtor') {
      const startingCityIds = pickRealtorStartingCityIds(nextProperties);
      startingCityIds.forEach((tileId) => {
        const granted = grantStartingProperty(nextPlayers, nextProperties, player.id, tileId);
        nextPlayers = granted.players;
        nextProperties = granted.properties;
      });
    }
  });

  return { players: nextPlayers, properties: nextProperties, roleState };
};

const grantStartingProperty = (
  players: Player[],
  properties: GameState['properties'],
  playerId: string,
  tileId: number,
): { players: Player[]; properties: GameState['properties'] } => {
  const property = properties[tileId];
  if (!property || property.ownerId) return { players, properties };
  return {
    properties: {
      ...properties,
      [tileId]: { ...property, ownerId: playerId },
    },
    players: players.map((player) =>
      player.id === playerId && !player.properties.includes(tileId)
        ? { ...player, properties: [...player.properties, tileId] }
        : player,
    ),
  };
};

const pickRealtorStartingCityIds = (properties: GameState['properties']): number[] => {
  const pickedGroups = new Set<string>();
  const picked: number[] = [];
  shuffle(cityTiles).forEach((tile) => {
    if (picked.length >= REALTOR_STARTING_CITY_COUNT) return;
    if (properties[tile.id]?.ownerId || pickedGroups.has(tile.group)) return;
    pickedGroups.add(tile.group);
    picked.push(tile.id);
  });
  return picked;
};

export const reduceGame = (state: GameState, action: GameAction): GameState => {
  let next: GameState;

  switch (action.type) {
    case 'roll_for_order':
      next = rollForTurnOrder(state, action.playerId, action.dice ?? randomDice());
      break;
    case 'roll':
      next = rollDice(state, action.playerId, action.dice ?? randomDice(getRollDiceCount(state)));
      break;
    case 'buy':
      next = buyPendingProperty(state, action.playerId);
      break;
    case 'decline_buy':
      next = startAuction(state, action.playerId);
      break;
    case 'draw_card':
      next = drawPendingCard(state, action.playerId);
      break;
    case 'auction_bid':
      next = auctionBid(state, action.playerId, action.amount);
      break;
    case 'auction_pass':
      next = auctionPass(state, action.playerId);
      break;
    case 'resolve_auction':
      next = resolveAuction(state);
      break;
    case 'builder_buy_property':
      next = builderBuyUnownedProperty(state, action.playerId, action.tileId);
      break;
    case 'builder_start_auction':
      next = builderStartUnownedAuction(state, action.playerId, action.tileId);
      break;
    case 'choose_city_event':
      next = chooseMayorCityEvent(state, action.playerId, action.cityEventId);
      break;
    case 'skip_casino':
      next = skipCasino(state, action.playerId);
      break;
    case 'start_casino_spin':
      next = startCasinoSpin(state, action.playerId, action.amount, action.multiplier, action.spinSeed);
      break;
    case 'casino_bet':
      next = casinoBet(state, action.playerId, action.amount, action.multiplier);
      break;
    case 'pay_jail_fine':
      next = payJailFine(state, action.playerId);
      break;
    case 'go_to_jail':
      next = goToJailFromDecision(state, action.playerId);
      break;
    case 'start_bank_deposit':
      next = startBankDeposit(state, action.playerId);
      break;
    case 'decline_bank_deposit':
      next = declineBankDeposit(state, action.playerId);
      break;
    case 'create_district':
      next = createDistrictPath(state, action.playerId, action.group, action.path);
      break;
    case 'build':
      next = buildOnCity(state, action.playerId, action.tileId);
      break;
    case 'sell_building':
      next = sellBuilding(state, action.playerId, action.tileId);
      break;
    case 'mortgage':
      next = mortgageProperty(state, action.playerId, action.tileId);
      break;
    case 'unmortgage':
      next = unmortgageProperty(state, action.playerId, action.tileId);
      break;
    case 'propose_trade':
      next = proposeTrade(state, action.offer);
      break;
    case 'accept_trade':
      next = acceptTrade(state, action.playerId, action.offerId);
      break;
    case 'decline_trade':
      next = updateTradeStatus(state, action.playerId, action.offerId, 'declined');
      break;
    case 'propose_loan':
      next = proposeLoan(state, action.offer);
      break;
    case 'accept_loan':
      next = acceptLoan(state, action.playerId, action.offerId);
      break;
    case 'decline_loan':
      next = updateLoanOfferStatus(state, action.playerId, action.offerId, 'declined');
      break;
    case 'take_bank_loan':
      next = takeBankLoan(state, action.playerId, action.amount);
      break;
    case 'miss_loan_payment':
      next = missLoanPayment(state, action.playerId);
      break;
    case 'use_loan_payoff_card':
      next = useLoanPayoffCard(state, action.playerId, action.loanId);
      break;
    case 'pay_rent':
      next = payRent(state, action.playerId);
      break;
    case 'pay_rent_with_deposit':
      next = payRent(state, action.playerId, { useBankDeposit: true });
      break;
    case 'use_uno_reverse':
      next = useUnoReverse(state, action.playerId);
      break;
    case 'pay_payment':
      next = payPendingPayment(state, action.playerId);
      break;
    case 'pay_payment_with_deposit':
      next = payPendingPayment(state, action.playerId, { useBankDeposit: true });
      break;
    case 'use_lawyer_payment_protection':
      next = useLawyerPaymentProtection(state, action.playerId);
      break;
    case 'use_lawyer_rent_protection':
      next = useLawyerRentProtection(state, action.playerId);
      break;
    case 'pay_bail':
      next = payBail(state, action.playerId);
      break;
    case 'admin_move_current_player':
      next = adminMoveCurrentPlayer(state, action.tileId);
      break;
    case 'admin_grant_uno_reverse':
      next = adminGrantUnoReverse(state, action.playerId);
      break;
    case 'admin_start_city_event':
      next = adminStartCityEvent(state, action.cityEventId);
      break;
    case 'request_summary':
      next = requestSummary(state, action.playerId);
      break;
    case 'end_turn':
      next = endTurn(state, action.playerId);
      break;
    case 'continue_turn':
      next = continueTurn(state, action.playerId);
      break;
    case 'declare_bankruptcy':
      next = declareBankruptcy(state, action.playerId);
      break;
    default:
      next = state;
  }

  const normalized = normalizeRoleState(normalizeLoans(normalizeBankDeposits(normalizeDistrictPaths(next))));
  const withStats = recordMatchStats(state, normalized, action);
  const completed = maybeFinalizeGame(withStats, action);
  return recordMoneyHistory(state, completed);
};

const MONEY_HISTORY_LIMIT = 240;

const createMoneyHistorySnapshot = (
  state: Pick<GameState, 'players' | 'turn' | 'currentRound' | 'properties'> & Partial<Pick<GameState, 'bankDeposits' | 'loans'>>,
): MoneyHistoryPoint => ({
  turn: state.turn,
  round: state.currentRound ?? 1,
  createdAt: Date.now(),
  money: Object.fromEntries(state.players.map((player) => [player.id, player.money])),
  worth: Object.fromEntries(state.players.map((player) => [player.id, calculatePlayerWorth(state, player)])),
});

const hasSameMoneySnapshot = (left: MoneyHistoryPoint, right: MoneyHistoryPoint): boolean => {
  const ids = new Set([...Object.keys(left.money), ...Object.keys(right.money)]);
  return [...ids].every((id) => left.money[id] === right.money[id] && left.worth?.[id] === right.worth?.[id]);
};

const recordMoneyHistory = (previous: GameState, next: GameState): GameState => {
  const previousHistory =
    previous.moneyHistory && previous.moneyHistory.length > 0
      ? previous.moneyHistory
      : [createMoneyHistorySnapshot(previous)];
  const snapshot = createMoneyHistorySnapshot(next);
  const last = previousHistory[previousHistory.length - 1];
  const isSameTurnPoint = last.turn === snapshot.turn && last.round === snapshot.round;

  let moneyHistory: MoneyHistoryPoint[];
  if (isSameTurnPoint) {
    moneyHistory = hasSameMoneySnapshot(last, snapshot)
      ? previousHistory
      : [...previousHistory.slice(0, -1), snapshot];
  } else {
    moneyHistory = [...previousHistory, snapshot];
  }

  if (moneyHistory.length > MONEY_HISTORY_LIMIT) {
    moneyHistory = moneyHistory.slice(moneyHistory.length - MONEY_HISTORY_LIMIT);
  }

  return next.moneyHistory === moneyHistory ? next : { ...next, moneyHistory };
};

const createEmptyPlayerStats = (): PlayerMatchStats => ({
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
});

const createInitialPropertyStats = (tileId: number): PropertyMatchStats => ({
  tileId,
  purchaseSpendByPlayer: {},
  rentPaidByPlayer: {},
  rentReceivedByPlayer: {},
  buildingSpendByPlayer: {},
  buildingRefundByPlayer: {},
  mortgageReceivedByPlayer: {},
  unmortgageSpendByPlayer: {},
});

const createInitialDistrictStats = (group: string): DistrictMatchStats => ({
  group,
  createdByPlayer: {},
  spendByPlayer: {},
  rentReceivedByPlayer: {},
  rentPaidByPlayer: {},
});

const createInitialMatchStats = (players: Player[]): MatchStats => ({
  players: Object.fromEntries(players.map((player) => [player.id, createEmptyPlayerStats()])),
  properties: Object.fromEntries(propertyTiles.map((tile) => [tile.id, createInitialPropertyStats(tile.id)])),
  districts: {},
  transfers: {},
  transfersBySource: {},
  chanceDrawCounts: {},
  communityDrawCounts: {},
});

const normalizePlayerStats = (stats: Partial<PlayerMatchStats> | undefined): PlayerMatchStats => ({
  ...createEmptyPlayerStats(),
  ...(stats ?? {}),
});

const cloneMatchStats = (state: GameState): MatchStats => {
  const source = state.matchStats ?? createInitialMatchStats(state.players);
  const players = Object.fromEntries(
    Object.entries(source.players ?? {}).map(([playerId, stats]) => [playerId, normalizePlayerStats(stats)]),
  ) as Record<string, PlayerMatchStats>;
  state.players.forEach((player) => {
    players[player.id] = normalizePlayerStats(players[player.id]);
  });

  return {
    players,
    properties: Object.fromEntries(
      Object.entries(source.properties ?? {}).map(([tileId, stats]) => [
        Number(tileId),
        {
          ...createInitialPropertyStats(Number(tileId)),
          ...stats,
          purchaseSpendByPlayer: { ...(stats.purchaseSpendByPlayer ?? {}) },
          rentPaidByPlayer: { ...(stats.rentPaidByPlayer ?? {}) },
          rentReceivedByPlayer: { ...(stats.rentReceivedByPlayer ?? {}) },
          buildingSpendByPlayer: { ...(stats.buildingSpendByPlayer ?? {}) },
          buildingRefundByPlayer: { ...(stats.buildingRefundByPlayer ?? {}) },
          mortgageReceivedByPlayer: { ...(stats.mortgageReceivedByPlayer ?? {}) },
          unmortgageSpendByPlayer: { ...(stats.unmortgageSpendByPlayer ?? {}) },
        },
      ]),
    ),
    districts: Object.fromEntries(
      Object.entries(source.districts ?? {}).map(([group, stats]) => [
        group,
        {
          ...createInitialDistrictStats(group),
          ...stats,
          createdByPlayer: { ...(stats.createdByPlayer ?? {}) },
          spendByPlayer: { ...(stats.spendByPlayer ?? {}) },
          rentReceivedByPlayer: { ...(stats.rentReceivedByPlayer ?? {}) },
          rentPaidByPlayer: { ...(stats.rentPaidByPlayer ?? {}) },
        },
      ]),
    ),
    transfers: Object.fromEntries(
      Object.entries(source.transfers ?? {}).map(([fromId, recipients]) => [fromId, { ...recipients }]),
    ),
    transfersBySource: Object.fromEntries(
      Object.entries(source.transfersBySource ?? {}).map(([fromId, recipients]) => [
        fromId,
        Object.fromEntries(
          Object.entries(recipients).map(([toId, bySource]) => [toId, { ...bySource }]),
        ),
      ]),
    ),
    chanceDrawCounts: { ...(source.chanceDrawCounts ?? {}) },
    communityDrawCounts: { ...(source.communityDrawCounts ?? {}) },
  };
};

const addAmount = (record: Record<string, number> | Record<number, number>, key: string | number, amount: number) => {
  if (!Number.isFinite(amount) || amount <= 0) return;
  (record as Record<string, number>)[String(key)] = ((record as Record<string, number>)[String(key)] ?? 0) + amount;
};

const addPlayerStat = (stats: MatchStats, playerId: string, key: keyof PlayerMatchStats, amount: number) => {
  if (!Number.isFinite(amount) || amount <= 0) return;
  stats.players[playerId] = normalizePlayerStats(stats.players[playerId]);
  stats.players[playerId][key] += amount;
};

const propertyStatsFor = (stats: MatchStats, tileId: number): PropertyMatchStats => {
  stats.properties[tileId] = stats.properties[tileId] ?? createInitialPropertyStats(tileId);
  return stats.properties[tileId];
};

const districtStatsFor = (stats: MatchStats, group: string): DistrictMatchStats => {
  stats.districts[group] = stats.districts[group] ?? createInitialDistrictStats(group);
  return stats.districts[group];
};

const recordTransferStat = (
  stats: MatchStats,
  fromPlayerId: string,
  toPlayerId: string,
  amount: number,
  source: TransferStatSource,
) => {
  if (!Number.isFinite(amount) || amount <= 0 || fromPlayerId === toPlayerId) return;
  stats.transfers[fromPlayerId] = { ...(stats.transfers[fromPlayerId] ?? {}) };
  addAmount(stats.transfers[fromPlayerId], toPlayerId, amount);
  stats.transfersBySource[fromPlayerId] = { ...(stats.transfersBySource[fromPlayerId] ?? {}) };
  stats.transfersBySource[fromPlayerId][toPlayerId] = { ...(stats.transfersBySource[fromPlayerId][toPlayerId] ?? {}) };
  const bySource = stats.transfersBySource[fromPlayerId][toPlayerId];
  bySource[source] = (bySource[source] ?? 0) + amount;
};

const playerMoneyDelta = (previous: GameState, next: GameState, playerId: string): number => {
  const before = previous.players.find((player) => player.id === playerId)?.money ?? 0;
  const after = next.players.find((player) => player.id === playerId)?.money ?? before;
  return after - before;
};

const isSamePendingPaymentDecision = (before: PendingPayment, after: PendingPayment | undefined): boolean => {
  if (!after) return false;
  if (before.payerId !== after.payerId || before.source !== after.source || before.reason !== after.reason || before.tileId !== after.tileId) {
    return false;
  }
  const beforeLoanIds = (before.loanPayments ?? []).map((loanPayment) => loanPayment.loanId).sort();
  const afterLoanIds = (after.loanPayments ?? []).map((loanPayment) => loanPayment.loanId).sort();
  return beforeLoanIds.length === afterLoanIds.length && beforeLoanIds.every((loanId, index) => loanId === afterLoanIds[index]);
};

const getPaidRecipientAmounts = (
  before: Array<{ playerId: string; amount: number }> = [],
  after: Array<{ playerId: string; amount: number }> = [],
): Array<{ playerId: string; amount: number }> => {
  const remainingByPlayer = new Map(after.map((recipient) => [recipient.playerId, recipient.amount]));
  return before
    .map((recipient) => ({
      playerId: recipient.playerId,
      amount: Math.max(0, recipient.amount - (remainingByPlayer.get(recipient.playerId) ?? 0)),
    }))
    .filter((recipient) => recipient.amount > 0);
};

const recordPropertySpend = (
  stats: MatchStats,
  tileId: number,
  playerId: string,
  key: keyof Pick<
    PropertyMatchStats,
    'purchaseSpendByPlayer' | 'buildingSpendByPlayer' | 'buildingRefundByPlayer' | 'mortgageReceivedByPlayer' | 'unmortgageSpendByPlayer'
  >,
  amount: number,
) => {
  const property = propertyStatsFor(stats, tileId);
  addAmount(property[key], playerId, amount);
};

const paymentSourceToTransferSource = (source: PendingPayment['source']): TransferStatSource => {
  if (source === 'loan') return 'loan';
  if (source === 'card') return 'card';
  if (source === 'movement') return 'movement';
  return 'other';
};

const recordMatchStats = (previous: GameState, next: GameState, action: GameAction): GameState => {
  if (previous.phase === 'finished') return next;
  if (!shouldRecordStatsForAction(action)) return next;
  const stats = cloneMatchStats(previous);

  if (action.type === 'request_summary' && !previous.summaryVotes?.[action.playerId] && next.summaryVotes?.[action.playerId]) {
    addPlayerStat(stats, action.playerId, 'summaryVotes', 1);
  }

  if (action.type === 'draw_card' && previous.pendingCardDraw && next.pendingCard?.deck === previous.pendingCardDraw.deck) {
    const cardId = next.pendingCard.cardId;
    addPlayerStat(stats, action.playerId, 'cardsDrawn', 1);
    if (next.pendingCard.deck === 'chance') {
      addPlayerStat(stats, action.playerId, 'chanceDraws', 1);
      addAmount(stats.chanceDrawCounts, cardId, 1);
    } else {
      addPlayerStat(stats, action.playerId, 'communityDraws', 1);
      addAmount(stats.communityDrawCounts, cardId, 1);
    }
  }

  if (action.type === 'buy' && previous.pendingPurchaseTileId !== undefined) {
    const tile = getTile(previous.pendingPurchaseTileId);
    if (isPropertyTile(tile) && next.properties[tile.id]?.ownerId === action.playerId) {
      const spend = Math.max(0, -playerMoneyDelta(previous, next, action.playerId));
      addPlayerStat(stats, action.playerId, 'purchases', 1);
      addPlayerStat(stats, action.playerId, 'purchaseSpend', spend);
      recordPropertySpend(stats, tile.id, action.playerId, 'purchaseSpendByPlayer', spend);
    }
  }

  if (action.type === 'resolve_auction' && previous.auction?.highestBidderId) {
    const { tileId, highestBid, highestBidderId } = previous.auction;
    if (next.properties[tileId]?.ownerId === highestBidderId) {
      addPlayerStat(stats, highestBidderId, 'auctionWins', 1);
      addPlayerStat(stats, highestBidderId, 'purchases', 1);
      addPlayerStat(stats, highestBidderId, 'purchaseSpend', highestBid);
      recordPropertySpend(stats, tileId, highestBidderId, 'purchaseSpendByPlayer', highestBid);
    }
  }

  if (action.type === 'mortgage') {
    const before = previous.properties[action.tileId];
    const after = next.properties[action.tileId];
    if (before && after?.mortgaged && !before.mortgaged) {
      const amount = Math.max(0, playerMoneyDelta(previous, next, action.playerId));
      addPlayerStat(stats, action.playerId, 'mortgageReceived', amount);
      recordPropertySpend(stats, action.tileId, action.playerId, 'mortgageReceivedByPlayer', amount);
    }
  }

  if (action.type === 'unmortgage') {
    const before = previous.properties[action.tileId];
    const after = next.properties[action.tileId];
    if (before?.mortgaged && after && !after.mortgaged) {
      const amount = Math.max(0, -playerMoneyDelta(previous, next, action.playerId));
      addPlayerStat(stats, action.playerId, 'unmortgageSpend', amount);
      recordPropertySpend(stats, action.tileId, action.playerId, 'unmortgageSpendByPlayer', amount);
    }
  }

  if (action.type === 'build') {
    const before = previous.properties[action.tileId];
    const after = next.properties[action.tileId];
    if (before && after && after.houses > before.houses) {
      const amount = Math.max(0, -playerMoneyDelta(previous, next, action.playerId));
      addPlayerStat(stats, action.playerId, 'buildingsBuilt', after.houses - before.houses);
      if (after.houses >= 5 && before.houses < 5) addPlayerStat(stats, action.playerId, 'hotelsBuilt', 1);
      addPlayerStat(stats, action.playerId, 'buildingSpend', amount);
      recordPropertySpend(stats, action.tileId, action.playerId, 'buildingSpendByPlayer', amount);
    }
  }

  if (action.type === 'sell_building') {
    const before = previous.properties[action.tileId];
    const after = next.properties[action.tileId];
    if (before && after && after.houses < before.houses) {
      const amount = Math.max(0, playerMoneyDelta(previous, next, action.playerId));
      addPlayerStat(stats, action.playerId, 'buildingRefund', amount);
      recordPropertySpend(stats, action.tileId, action.playerId, 'buildingRefundByPlayer', amount);
    }
  }

  if (action.type === 'create_district' && !previous.districtPaths?.[action.group] && next.districtPaths?.[action.group]) {
    const amount = Math.max(0, -playerMoneyDelta(previous, next, action.playerId));
    const district = districtStatsFor(stats, action.group);
    addPlayerStat(stats, action.playerId, 'districtsCreated', 1);
    addPlayerStat(stats, action.playerId, 'districtSpend', amount);
    addAmount(district.createdByPlayer, action.playerId, 1);
    addAmount(district.spendByPlayer, action.playerId, amount);
  }

  if (
    (action.type === 'pay_rent' || action.type === 'pay_rent_with_deposit') &&
    previous.pendingRent?.payerId === action.playerId
  ) {
    const rent = previous.pendingRent;
    const remainingRent =
      next.pendingRent?.payerId === rent.payerId &&
      next.pendingRent.ownerId === rent.ownerId &&
      next.pendingRent.tileId === rent.tileId
        ? next.pendingRent.amount
        : 0;
    const amount = Math.max(0, rent.amount - remainingRent);
    addPlayerStat(stats, rent.payerId, 'rentPaid', amount);
    addPlayerStat(stats, rent.ownerId, 'rentReceived', amount);
    recordTransferStat(stats, rent.payerId, rent.ownerId, amount, 'rent');
    const tile = getTile(rent.tileId);
    const property = propertyStatsFor(stats, rent.tileId);
    addAmount(property.rentPaidByPlayer, rent.payerId, amount);
    addAmount(property.rentReceivedByPlayer, rent.ownerId, amount);
    if (tile.type === 'city') {
      const district = districtStatsFor(stats, tile.group);
      addAmount(district.rentPaidByPlayer, rent.payerId, amount);
      addAmount(district.rentReceivedByPlayer, rent.ownerId, amount);
    }
  }

  if (
    (action.type === 'pay_payment' || action.type === 'pay_payment_with_deposit') &&
    previous.pendingPayment?.payerId === action.playerId
  ) {
    const payment = previous.pendingPayment;
    const residualPayment = isSamePendingPaymentDecision(payment, next.pendingPayment) ? next.pendingPayment : undefined;
    const amount = Math.max(0, payment.amount - (residualPayment?.amount ?? 0));
    const paidRecipients = getPaidRecipientAmounts(payment.recipients, residualPayment?.recipients);
    const paidRecipientTotal = paidRecipients.reduce((sum, recipient) => sum + recipient.amount, 0);
    if (payment.source === 'tax') {
      addPlayerStat(stats, action.playerId, 'taxesPaid', amount);
      addPlayerStat(stats, action.playerId, 'bankPaid', amount);
    } else if (payment.source === 'loan') {
      addPlayerStat(stats, action.playerId, 'loanPaid', amount);
      if (paidRecipientTotal < amount) addPlayerStat(stats, action.playerId, 'bankPaid', amount - paidRecipientTotal);
    } else if (paidRecipientTotal < amount) {
      addPlayerStat(stats, action.playerId, 'bankPaid', amount - paidRecipientTotal);
    }

    paidRecipients.forEach((recipient) => {
      recordTransferStat(stats, action.playerId, recipient.playerId, recipient.amount, paymentSourceToTransferSource(payment.source));
      if (payment.source === 'loan') addPlayerStat(stats, recipient.playerId, 'loanReceived', recipient.amount);
    });
  }

  if (action.type === 'casino_bet') {
    const bet = Math.floor(action.amount);
    const net = bet * Math.floor(action.multiplier) - bet;
    addPlayerStat(stats, action.playerId, 'casinoBets', bet);
    if (net > 0) addPlayerStat(stats, action.playerId, 'casinoGrossWon', net);
    if (net < 0) addPlayerStat(stats, action.playerId, 'casinoLost', Math.abs(net));
    if (Number.isFinite(net)) stats.players[action.playerId].casinoNet += net;
  }

  if (action.type === 'accept_trade') {
    const offer = previous.tradeOffers.find((candidate) => candidate.id === action.offerId && candidate.status === 'pending');
    if (offer && next.tradeOffers.find((candidate) => candidate.id === action.offerId)?.status === 'accepted') {
      addPlayerStat(stats, offer.fromPlayerId, 'tradesAccepted', 1);
      addPlayerStat(stats, offer.toPlayerId, 'tradesAccepted', 1);
      recordTransferStat(stats, offer.fromPlayerId, offer.toPlayerId, offer.offerMoney, 'trade');
      recordTransferStat(stats, offer.toPlayerId, offer.fromPlayerId, offer.requestMoney, 'trade');
    }
  }

  if (action.type === 'accept_loan') {
    const offer = (previous.loanOffers ?? []).find((candidate) => candidate.id === action.offerId && candidate.status === 'pending');
    if (offer && (next.loanOffers ?? []).find((candidate) => candidate.id === action.offerId)?.status === 'accepted') {
      addPlayerStat(stats, offer.borrowerId, 'playerLoansTaken', 1);
      addPlayerStat(stats, offer.borrowerId, 'loanPrincipalTaken', offer.principal);
      addPlayerStat(stats, offer.lenderId, 'loanPrincipalGiven', offer.principal);
      recordTransferStat(stats, offer.lenderId, offer.borrowerId, offer.principal, 'loan');
    }
  }

  if (action.type === 'take_bank_loan') {
    const amount = Math.max(0, playerMoneyDelta(previous, next, action.playerId));
    addPlayerStat(stats, action.playerId, 'bankLoansTaken', 1);
    addPlayerStat(stats, action.playerId, 'loanPrincipalTaken', amount);
  }

  if (action.type === 'declare_bankruptcy') {
    next.players.forEach((player) => {
      const gained = playerMoneyDelta(previous, next, player.id);
      if (player.id !== action.playerId && gained > 0) {
        recordTransferStat(stats, action.playerId, player.id, gained, 'bankruptcy');
      }
    });
  }

  return { ...next, matchStats: stats };
};

const shouldRecordStatsForAction = (action: GameAction): boolean =>
  [
    'request_summary',
    'draw_card',
    'buy',
    'resolve_auction',
    'mortgage',
    'unmortgage',
    'build',
    'sell_building',
    'create_district',
    'pay_rent',
    'pay_rent_with_deposit',
    'pay_payment',
    'pay_payment_with_deposit',
    'casino_bet',
    'accept_trade',
    'accept_loan',
    'take_bank_loan',
    'declare_bankruptcy',
  ].includes(action.type);

const activePlayerIds = (state: GameState): string[] =>
  state.players.filter((player) => !player.isBankrupt).map((player) => player.id);

const requestSummary = (state: GameState, playerId: string): GameState => {
  if (state.phase === 'finished') return state;
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || player.isBankrupt) return state;
  if (state.summaryVotes?.[playerId]) return state;
  return {
    ...state,
    summaryVotes: { ...(state.summaryVotes ?? {}), [playerId]: Date.now() },
    log: appendLog(state, `${player.name} голосує за підбиття підсумків.`),
  };
};

export const maybeFinishBySummaryVotes = (state: GameState): GameState => {
  if (state.phase === 'finished') return state;
  const activeIds = activePlayerIds(state);
  if (activeIds.length <= 1) return state;
  if (!activeIds.every((playerId) => Boolean(state.summaryVotes?.[playerId]))) return state;
  return finishGame(state, 'summary');
};

const maybeFinishByRole = (state: GameState): GameState => {
  if (state.phase === 'finished' || state.roleWin || state.rolesEnabled === false) return state;
  const winner = state.players.find((player) => !player.isBankrupt && player.roleId && isRoleWinAchieved(state, player));
  if (!winner?.roleId) return state;
  const roleWin = {
    playerId: winner.id,
    roleId: winner.roleId,
    achievedAtTurn: state.turn,
    achievedAtRound: state.currentRound ?? 1,
    reason: getRoleWinReason(state, winner),
  };
  return finishGame(
    {
      ...state,
      roleWin,
      winnerId: winner.id,
      winnerIds: [winner.id],
      log: appendLog(state, `${winner.name} виконує умову ролі "${ROLE_DEFINITIONS[winner.roleId].title}" і перемагає.`, 'good'),
    },
    'role',
  );
};

const isRoleWinAchieved = (state: GameState, player: Player): boolean => {
  switch (player.roleId) {
    case 'gambler':
      return player.money >= GAMBLER_WIN_CASH;
    case 'builder':
      return getBuilderCompletedDistrictCount(state, player.id) >= BUILDER_WIN_DISTRICTS;
    case 'realtor':
      return getPlayerRoleState(state, player.id).realtorProfit >= REALTOR_WIN_PROFIT;
    case 'banker':
      return (
        ownedBankCount(state, player.id) >= BANKER_WIN_BANKS &&
        getBankDepositPayout((state.bankDeposits ?? {})[player.id]) >= BANKER_WIN_DEPOSIT_PAYOUT
      );
    case 'lawyer':
      return getPlayerRoleState(state, player.id).lawyerSaved >= LAWYER_WIN_SAVED;
    case 'collector':
      return (
        getCollectorUniqueRegionCount(state, player.id) >= COLLECTOR_WIN_PROPERTIES &&
        calculatePlayerWorth(state, player) >= COLLECTOR_WIN_NET_WORTH
      );
    case 'mayor':
      return getPlayerRoleState(state, player.id).mayorEventIncome >= MAYOR_WIN_EVENT_INCOME;
    default:
      return false;
  }
};

const getRoleWinReason = (state: GameState, player: Player): string => {
  switch (player.roleId) {
    case 'gambler':
      return `${player.name} накопичує ${player.money}₴ кешу.`;
    case 'builder':
      return `${player.name} завершує ${getBuilderCompletedDistrictCount(state, player.id)} райони з готелями.`;
    case 'realtor':
      return `${player.name} заробляє ${getPlayerRoleState(state, player.id).realtorProfit}₴ вигоди з угод.`;
    case 'banker':
      return `${player.name} має ${ownedBankCount(state, player.id)} банки і депозит ${getBankDepositPayout(
        (state.bankDeposits ?? {})[player.id],
      )}₴.`;
    case 'lawyer':
      return `${player.name} економить ${getPlayerRoleState(state, player.id).lawyerSaved}₴.`;
    case 'collector':
      return `${player.name} має ${getCollectorUniqueRegionCount(state, player.id)} унікальних районів і чисту вартість ${calculatePlayerWorth(
        state,
        player,
      )}₴.`;
    case 'mayor':
      return `${player.name} заробляє ${getPlayerRoleState(state, player.id).mayorEventIncome}₴ з міських подій.`;
    default:
      return 'Умова ролі виконана.';
  }
};

export interface RoleProgressItem {
  label: string;
  current: number;
  target: number;
  done: boolean;
  detail: string;
}

export const getRoleProgressItems = (state: GameState, playerId: string): RoleProgressItem[] => {
  const player = getPlayer(state, playerId);
  const roleState = getPlayerRoleState(state, playerId);
  switch (player.roleId) {
    case 'gambler':
      return [
        {
          label: 'Кеш на рахунку',
          current: player.money,
          target: GAMBLER_WIN_CASH,
          done: player.money >= GAMBLER_WIN_CASH,
          detail: `${player.money}/${GAMBLER_WIN_CASH}₴`,
        },
      ];
    case 'builder': {
      const completed = getBuilderCompletedDistrictCount(state, playerId);
      return [
        {
          label: 'Райони з готелями',
          current: completed,
          target: BUILDER_WIN_DISTRICTS,
          done: completed >= BUILDER_WIN_DISTRICTS,
          detail: `${completed}/${BUILDER_WIN_DISTRICTS}`,
        },
      ];
    }
    case 'realtor':
      return [
        {
          label: 'Прибуток з угод',
          current: roleState.realtorProfit,
          target: REALTOR_WIN_PROFIT,
          done: roleState.realtorProfit >= REALTOR_WIN_PROFIT,
          detail: `${roleState.realtorProfit}/${REALTOR_WIN_PROFIT}₴`,
        },
      ];
    case 'banker': {
      const bankCount = ownedBankCount(state, playerId);
      const depositPayout = getBankDepositPayout((state.bankDeposits ?? {})[playerId]);
      return [
        {
          label: 'Банки у власності',
          current: bankCount,
          target: BANKER_WIN_BANKS,
          done: bankCount >= BANKER_WIN_BANKS,
          detail: `${bankCount}/${BANKER_WIN_BANKS}`,
        },
        {
          label: 'Активний депозит',
          current: depositPayout,
          target: BANKER_WIN_DEPOSIT_PAYOUT,
          done: depositPayout >= BANKER_WIN_DEPOSIT_PAYOUT,
          detail: `${depositPayout}/${BANKER_WIN_DEPOSIT_PAYOUT}₴`,
        },
      ];
    }
    case 'lawyer':
      return [
        {
          label: 'Зекономлено',
          current: roleState.lawyerSaved,
          target: LAWYER_WIN_SAVED,
          done: roleState.lawyerSaved >= LAWYER_WIN_SAVED,
          detail: `${roleState.lawyerSaved}/${LAWYER_WIN_SAVED}₴`,
        },
        {
          label: 'Захисти доступні',
          current: roleState.lawyerProtectionsLeft,
          target: LAWYER_TOTAL_PROTECTIONS,
          done: roleState.lawyerProtectionsLeft > 0,
          detail: `${roleState.lawyerProtectionsLeft}/${LAWYER_TOTAL_PROTECTIONS}`,
        },
      ];
    case 'collector': {
      const regionCount = getCollectorUniqueRegionCount(state, playerId);
      const netWorth = calculatePlayerWorth(state, player);
      return [
        {
          label: 'Клітинки в унікальних районах',
          current: regionCount,
          target: COLLECTOR_WIN_PROPERTIES,
          done: regionCount >= COLLECTOR_WIN_PROPERTIES,
          detail: `${regionCount}/${COLLECTOR_WIN_PROPERTIES}`,
        },
        {
          label: 'Чиста вартість',
          current: Math.max(0, netWorth),
          target: COLLECTOR_WIN_NET_WORTH,
          done: netWorth >= COLLECTOR_WIN_NET_WORTH,
          detail: `${netWorth}/${COLLECTOR_WIN_NET_WORTH}₴`,
        },
        {
          label: 'Бонуси отримано',
          current: roleState.collectorBonusReceived,
          target: 0,
          done: roleState.collectorBonusReceived > 0,
          detail: `${roleState.collectorBonusReceived}₴`,
        },
      ];
    }
    case 'mayor': {
      const hasPendingChoice = state.pendingMayorCityEventChoice?.playerId === playerId;
      const choiceProgress = hasPendingChoice
        ? MAYOR_CHOOSE_EVENT_INTERVAL
        : roleState.mayorCityEventsSeen % MAYOR_CHOOSE_EVENT_INTERVAL;
      const eventsToChoice = hasPendingChoice ? 0 : MAYOR_CHOOSE_EVENT_INTERVAL - choiceProgress;
      return [
        {
          label: 'Дохід з подій',
          current: roleState.mayorEventIncome,
          target: MAYOR_WIN_EVENT_INCOME,
          done: roleState.mayorEventIncome >= MAYOR_WIN_EVENT_INCOME,
          detail: `${roleState.mayorEventIncome}/${MAYOR_WIN_EVENT_INCOME}₴`,
        },
        {
          label: 'До вибору події',
          current: choiceProgress,
          target: MAYOR_CHOOSE_EVENT_INTERVAL,
          done: hasPendingChoice,
          detail: hasPendingChoice ? 'Вибір зараз' : `${eventsToChoice} до вибору`,
        },
      ];
    }
    default:
      return [];
  }
};

const maybeFinalizeGame = (state: GameState, action: GameAction): GameState => {
  if (state.phase === 'finished' && !state.postMatch) return finishGame(state, 'survivor');
  const roleFinished = maybeFinishByRole(state);
  if (roleFinished.phase === 'finished') return roleFinished;
  const summaryFinished = maybeFinishBySummaryVotes(state);
  if (summaryFinished.phase === 'finished') return summaryFinished;
  if (action.type === 'declare_bankruptcy' || action.type === 'end_turn' || action.type === 'continue_turn') {
    if (state.phase === 'finished') return finishGame(state, 'survivor');
  }
  return state;
};

export const selectAwardIds = (game: GameState): PostMatchAwardId[] => {
  const mandatory: PostMatchAwardId[] = ['propertyCount', 'finalCash'];
  const optional: PostMatchAwardId[] = [
    'chanceMaster',
    'taxPayer',
    'casinoWinner',
    'builder',
    'rentCollector',
    'districtArchitect',
    'dealMaker',
    'loanMagnet',
  ];
  const shuffled = shuffleAwardIds(optional, hashString(`${game.id}:${game.players.length}:${game.turn}`));
  const selected = [...mandatory, ...shuffled.slice(0, 3)];
  return game.roleWin ? [...selected, 'roleVictory'] : selected;
};

const BONUS_AWARD_INDEX = 5;
const BONUS_AWARD_CROWN_VALUE = 5;

export const finishGame = (state: GameState, reason: GameFinishReason): GameState => {
  const finishedState = {
    ...state,
    phase: 'finished' as const,
    pendingPurchaseTileId: undefined,
    pendingRent: undefined,
    pendingPayment: undefined,
    pendingCasino: undefined,
    pendingBankDeposit: undefined,
    pendingJail: undefined,
    pendingCard: undefined,
    pendingCardDraw: undefined,
    pendingCityEvent: undefined,
    auction: undefined,
  };
  const postMatch = buildMatchSummary(finishedState, reason);
  return {
    ...finishedState,
    postMatch,
    winnerIds: postMatch.winnerIds,
    winnerId: postMatch.winnerIds[0] ?? state.winnerId,
  };
};

export const buildMatchSummary = (game: GameState, reason: GameFinishReason = game.postMatch?.reason ?? 'summary'): PostMatchSummary => {
  const selectedAwardIds = selectAwardIds(game);
  const selectedAwards = selectedAwardIds.map((awardId) => buildAward(game, awardId));
  const survivor = reason === 'survivor' ? game.players.find((player) => !player.isBankrupt) : undefined;
  const awards: PostMatchAward[] = withAwardCrownValues(
    survivor
      ? [
          ...selectedAwards,
          {
            id: 'lastSurvivor',
            title: 'Останній вижив',
            description: 'Фінальна нагорода за перемогу через вибування суперників.',
            winnerIds: [survivor.id],
            value: 1,
            crown: true,
          },
        ]
      : selectedAwards,
  );
  const crownCounts = countCrowns(game.players, awards);
  const players = buildPlayerSummaries(game, crownCounts);
  return {
    finishedAt: game.postMatch?.finishedAt ?? Date.now(),
    reason,
    selectedAwardIds,
    awards,
    players,
    properties: buildPropertySummaries(game),
    transfers: buildTransferSummaries(game),
    chanceCards: Object.entries(game.matchStats?.chanceDrawCounts ?? {})
      .map(([cardId, count]) => ({ cardId: Number(cardId), count }))
      .sort((left, right) => right.count - left.count || left.cardId - right.cardId),
    communityCards: Object.entries(game.matchStats?.communityDrawCounts ?? {})
      .map(([cardId, count]) => ({ cardId: Number(cardId), count }))
      .sort((left, right) => right.count - left.count || left.cardId - right.cardId),
    winnerIds:
      reason === 'role' && game.roleWin
        ? [game.roleWin.playerId]
        : players.filter((player) => player.rank === 1).map((player) => player.playerId),
  };
};

const withAwardCrownValues = (awards: PostMatchAward[]): PostMatchAward[] =>
  awards.map((award, index) => ({
    ...award,
    crownValue: award.crown ? (index === BONUS_AWARD_INDEX ? BONUS_AWARD_CROWN_VALUE : 1) : 0,
  }));

const AWARD_TEXT: Record<PostMatchAwardId, { title: string; description: string }> = {
  propertyCount: {
    title: 'Найбільше майна',
    description: 'Найбільша кількість фінальних карток майна.',
  },
  finalCash: {
    title: 'Найбільше грошей на рахунку',
    description: 'Найбільше готівки в кінці гри.',
  },
  chanceMaster: {
    title: 'Найбільше відкрито шансів',
    description: 'Найбільше відкритих карток “Шанс”.',
  },
  taxPayer: {
    title: 'Найкращий платник податків',
    description: 'Найбільше сплачено на податкових клітинках.',
  },
  casinoWinner: {
    title: 'Любитель казино',
    description: 'Найбільший чистий виграш у казино.',
  },
  builder: {
    title: 'Найкращий забудовник',
    description: 'Найбільше побудованих будинків і готелів.',
  },
  rentCollector: {
    title: 'Рантьє матчу',
    description: 'Найбільше отримано оренди від інших гравців.',
  },
  districtArchitect: {
    title: 'Архітектор районів',
    description: 'Найбільше створених районів.',
  },
  dealMaker: {
    title: 'Майстер угод',
    description: 'Найбільше прийнятих угод за участю гравця.',
  },
  loanMagnet: {
    title: 'Кредитний магнат',
    description: 'Найбільше залучено кредитних коштів.',
  },
  roleVictory: {
    title: 'Рольова перемога',
    description: 'Спеціальна номінація за виконану умову ролі.',
  },
  lastSurvivor: {
    title: 'Останній вижив',
    description: 'Фінальна нагорода за перемогу через вибування суперників.',
  },
};

const buildAward = (game: GameState, id: PostMatchAwardId): PostMatchAward => {
  if (id === 'roleVictory' && game.roleWin) {
    const definition = ROLE_DEFINITIONS[game.roleWin.roleId];
    return {
      id,
      title: definition.awardTitle,
      description: game.roleWin.reason,
      winnerIds: [game.roleWin.playerId],
      value: 1,
      crown: true,
    };
  }
  const values = game.players.map((player) => ({ playerId: player.id, value: getAwardMetric(game, id, player) }));
  const max = Math.max(...values.map((entry) => entry.value));
  const winnerIds = values.filter((entry) => entry.value === max).map((entry) => entry.playerId);
  return {
    id,
    title: AWARD_TEXT[id].title,
    description: AWARD_TEXT[id].description,
    winnerIds,
    value: max,
    crown: true,
  };
};

const getAwardMetric = (game: GameState, id: PostMatchAwardId, player: Player): number => {
  const stats = normalizePlayerStats(game.matchStats?.players?.[player.id]);
  switch (id) {
    case 'propertyCount':
      return player.properties.length;
    case 'finalCash':
      return player.money;
    case 'chanceMaster':
      return stats.chanceDraws;
    case 'taxPayer':
      return stats.taxesPaid;
    case 'casinoWinner':
      return stats.casinoGrossWon;
    case 'builder':
      return stats.buildingsBuilt;
    case 'rentCollector':
      return stats.rentReceived;
    case 'districtArchitect':
      return stats.districtsCreated;
    case 'dealMaker':
      return stats.tradesAccepted;
    case 'loanMagnet':
      return stats.loanPrincipalTaken;
    case 'roleVictory':
      return game.roleWin?.playerId === player.id ? 1 : 0;
    case 'lastSurvivor':
      return player.isBankrupt ? 0 : 1;
  }
};

const countCrowns = (players: Player[], awards: PostMatchAward[]): Record<string, number> => {
  const counts = Object.fromEntries(players.map((player) => [player.id, 0]));
  awards.forEach((award) => {
    if (!award.crown) return;
    award.winnerIds.forEach((playerId) => {
      counts[playerId] = (counts[playerId] ?? 0) + (award.crownValue ?? 1);
    });
  });
  return counts;
};

const buildPlayerSummaries = (game: GameState, crownCounts: Record<string, number>): PostMatchSummary['players'] => {
  const summaries = game.players
    .map((player) => {
      const propertyValue = player.properties.reduce((sum, tileId) => {
        const tile = getTile(tileId);
        if (!isPropertyTile(tile)) return sum;
        const property = game.properties[tile.id];
        return sum + tile.price + (tile.type === 'city' ? property.houses * tile.houseCost : 0);
      }, 0);
      return {
        playerId: player.id,
        finalMoney: player.money,
        propertyCount: player.properties.length,
        propertyValue,
        totalWorth: calculatePlayerWorth(game, player),
        crowns: crownCounts[player.id] ?? 0,
        rank: 1,
      };
    })
    .sort((left, right) => right.crowns - left.crowns || right.totalWorth - left.totalWorth || left.playerId.localeCompare(right.playerId));

  let previousCrowns: number | undefined;
  let currentRank = 0;
  return summaries.map((summary, index) => {
    if (summary.crowns !== previousCrowns) {
      currentRank = index + 1;
      previousCrowns = summary.crowns;
    }
    return { ...summary, rank: currentRank };
  });
};

const buildPropertySummaries = (game: GameState): PostMatchPropertySummary[] => {
  const stats = game.matchStats;
  return propertyTiles.map((tile) => {
    const propertyStats = stats?.properties?.[tile.id] ?? createInitialPropertyStats(tile.id);
    const income = sumRecord(propertyStats.rentReceivedByPlayer) + sumRecord(propertyStats.mortgageReceivedByPlayer) + sumRecord(propertyStats.buildingRefundByPlayer);
    const spend =
      sumRecord(propertyStats.purchaseSpendByPlayer) +
      sumRecord(propertyStats.buildingSpendByPlayer) +
      sumRecord(propertyStats.unmortgageSpendByPlayer);
    return {
      tileId: tile.id,
      ownerId: game.properties[tile.id]?.ownerId,
      group: tile.type === 'city' ? tile.group : undefined,
      income,
      spend,
      net: income - spend,
    };
  });
};

const buildTransferSummaries = (game: GameState): PostMatchTransferSummary[] => {
  const stats = game.matchStats;
  if (!stats) return [];
  return Object.entries(stats.transfers)
    .flatMap(([fromPlayerId, recipients]) =>
      Object.entries(recipients).map(([toPlayerId, amount]) => ({
        fromPlayerId,
        toPlayerId,
        amount,
        bySource: stats.transfersBySource[fromPlayerId]?.[toPlayerId] ?? {},
      })),
    )
    .sort((left, right) => right.amount - left.amount || left.fromPlayerId.localeCompare(right.fromPlayerId));
};

const sumRecord = (record: Record<string, number> | undefined): number =>
  Object.values(record ?? {}).reduce((sum, amount) => sum + amount, 0);

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const nextSeed = (seed: number): number => (Math.imul(seed, 1664525) + 1013904223) >>> 0;

const shuffleAwardIds = (ids: PostMatchAwardId[], initialSeed: number): PostMatchAwardId[] => {
  const shuffled = [...ids];
  let seed = initialSeed || 1;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    seed = nextSeed(seed);
    const swapIndex = seed % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
};

const calculatePlayerWorth = (
  state: Pick<GameState, 'properties'> & Partial<Pick<GameState, 'bankDeposits' | 'loans'>>,
  player: Player,
): number =>
  player.money +
  player.properties.reduce((sum, tileId) => {
    const tile = getTile(tileId);
    if (!isPropertyTile(tile)) return sum;
    const property = state.properties[tile.id];
    const buildingValue = tile.type === 'city' ? property.houses * tile.houseCost : 0;
    return sum + tile.price + buildingValue;
  }, 0) +
  getBankDepositPayout((state.bankDeposits ?? {})[player.id]) +
  getLoanNetWorth(state.loans ?? [], player.id);

export const calculateRent = (
  state: GameState,
  tile: PropertyTile,
  diceTotal = 0,
  options: { includeMayorEvents?: boolean } = {},
): number => {
  const ownerId = state.properties[tile.id]?.ownerId;
  if (!ownerId || state.properties[tile.id]?.mortgaged) return 0;

  let rent = 0;
  if (tile.type === 'bank') {
    rent = getBankRentForCount(ownedBankCount(state, ownerId));
    if (getPlayer(state, ownerId).roleId === 'banker') rent *= BANKER_RENT_MULTIPLIER;
  } else if (tile.type === 'utility') {
    const utilityCount = ownedProperties(state, ownerId).filter((owned) => owned.type === 'utility').length;
    rent = diceTotal * (utilityCount === 2 ? money(12) : money(6));
  } else {
    const houses = state.properties[tile.id].houses;
    const base = tile.rents[houses];
    const cityRent = houses === 0 && ownsFullGroup(state, ownerId, tile.group) ? base * 2 : base;
    rent = getDistrictAdjustedCityRent(state, tile, cityRent);
  }

  return ceilMoney(rent * getCityEventRentMultiplier(state, tile, options));
};

export const getEffectivePropertyPrice = (state: GameState, tile: PropertyTile): number =>
  ceilMoney(tile.price * getCityEventPropertyPriceMultiplier(state, tile) * getLateGamePriceMultiplier(state.turn));

const getEffectivePropertyPriceWithoutMayorEvents = (state: GameState, tile: PropertyTile): number =>
  ceilMoney(
    tile.price *
      getCityEventPropertyPriceMultiplier(state, tile, { includeMayorEvents: false }) *
      getLateGamePriceMultiplier(state.turn),
  );

export const getEffectiveHouseCost = (state: GameState, tile: CityTile): number => {
  return ceilMoney(
    tile.houseCost *
      getDistrictHouseCostMultiplier(state, tile) *
      getRoleHouseCostMultiplier(state, state.properties[tile.id]?.ownerId) *
      getCityEventHouseCostMultiplier(state, tile) *
      getLateGamePriceMultiplier(state.turn),
  );
};

const getRoleHouseCostMultiplier = (state: GameState, ownerId: string | undefined): number =>
  ownerId && getPlayer(state, ownerId).roleId === 'builder'
    ? BUILDER_HOUSE_COST_MULTIPLIER
    : ownerId && getPlayer(state, ownerId).roleId === 'realtor'
      ? REALTOR_BUILD_COST_MULTIPLIER
      : 1;

const getRealtorBuildCostMultiplier = (state: GameState, ownerId: string | undefined): number =>
  ownerId && getPlayer(state, ownerId).roleId === 'realtor' ? REALTOR_BUILD_COST_MULTIPLIER : 1;

export const getEffectiveBuildingRefund = (state: GameState, tile: CityTile): number => {
  const baseRefund = Math.floor(ceilMoney(tile.houseCost * getDistrictHouseCostMultiplier(state, tile)) / 2);
  const ownerId = state.properties[tile.id]?.ownerId;
  if (!ownerId || getPlayer(state, ownerId).roleId !== 'builder') return baseRefund;
  return Math.max(baseRefund, Math.floor(getEffectiveHouseCost(state, tile) * BUILDER_BUILDING_REFUND_MULTIPLIER));
};

export const getDistrictCreationCost = (state: GameState, group: string): number => {
  const groupTiles = cityGroup(group);
  if (groupTiles.length === 0) throw new Error('Unknown city group.');
  const ownerId = getCityGroupOwner(state, group);
  return Math.max(...groupTiles.map((tile) => getDistrictCreationHouseCost(state, tile, ownerId))) * 2;
};

export const getEffectiveMortgageValue = (state: GameState, tile: PropertyTile): number => {
  const district = tile.type === 'city' ? getDistrictPath(state, tile.group) : undefined;
  const baseMortgage =
    tile.type === 'city'
      ? tile.mortgage + (district ? getDistrictMortgageShare(state, tile.group, district) : 0)
      : tile.mortgage;

  return ceilMoney(baseMortgage * getCityEventPropertyPriceMultiplier(state, tile) * getLateGamePriceMultiplier(state.turn));
};

export const getEffectiveUnmortgageCost = (state: GameState, tile: PropertyTile): number =>
  ceilMoney(getEffectiveMortgageValue(state, tile) * UNMORTGAGE_INTEREST_MULTIPLIER);

export const getBankRentForCount = (bankCount: number): number =>
  BANK_RENT_BY_COUNT[Math.min(Math.max(0, Math.floor(bankCount)), BANK_RENT_BY_COUNT.length - 1)] ?? BANK_RENT_BY_COUNT[BANK_RENT_BY_COUNT.length - 1];

const getBankDepositTurnCount = (deposit: BankDepositState | undefined): number => Math.max(0, deposit?.turns ?? deposit?.steps ?? 0);

export const getBankDepositPayout = (deposit: BankDepositState | undefined): number =>
  deposit ? compoundBankDepositPayout(deposit.amount, getBankDepositTurnCount(deposit)) : 0;

export const getBankLoanRepaymentAmount = (amount: number): number =>
  ceilMoney(normalizeMoney(amount) * BANK_LOAN_REPAYMENT_MULTIPLIER);

const compoundBankDepositPayout = (amount: number, turns: number): number => {
  let payout = Math.min(BANK_DEPOSIT_MAX_PAYOUT, amount);
  for (let index = 0; index < turns; index += 1) {
    payout = Math.min(BANK_DEPOSIT_MAX_PAYOUT, ceilMoney(payout * (1 + BANK_DEPOSIT_TURN_RATE)));
  }
  return payout;
};

export const getBankDepositInfo = (state: GameState, playerId: string) => {
  const player = getPlayer(state, playerId);
  const bankCount = ownedBankCount(state, playerId);
  const amount = bankCount >= BANK_DEPOSIT_MIN_BANKS ? getBankRentForCount(bankCount) : 0;
  const activeDeposit = (state.bankDeposits ?? {})[playerId];
  const payout = getBankDepositPayout(activeDeposit);
  const isOnOwnBank = isPlayerOnOwnBank(state, playerId);
  const pendingDeposit = state.pendingBankDeposit?.playerId === playerId ? state.pendingBankDeposit : undefined;
  const depositAmount = pendingDeposit?.amount ?? amount;
  const canStart =
    state.currentPlayerId === playerId &&
    state.phase === 'bankDeposit' &&
    Boolean(pendingDeposit) &&
    !player.isBankrupt &&
    !activeDeposit &&
    isOnOwnBank &&
    bankCount >= BANK_DEPOSIT_MIN_BANKS &&
    depositAmount > 0 &&
    player.money >= depositAmount;
  const disabledReason = activeDeposit
    ? 'Депозит уже активний. Заберіть його, зупинившись на своєму банку.'
    : state.currentPlayerId !== playerId
      ? 'Депозит можна зробити тільки у свій хід.'
      : state.phase !== 'bankDeposit' || !pendingDeposit
        ? 'Депозит можна зробити тільки після зупинки на своєму банку.'
        : bankCount < BANK_DEPOSIT_MIN_BANKS
          ? 'Для депозиту потрібно мінімум 2 банки.'
          : !isOnOwnBank
            ? 'Депозит можна зробити тільки у своєму банку.'
            : player.money < depositAmount
              ? `Потрібно ${depositAmount}₴ для депозиту.`
              : `Зробити депозит ${depositAmount}₴.`;

  return {
    bankCount,
    amount: depositAmount,
    activeDeposit,
    payout,
    maxPayout: BANK_DEPOSIT_MAX_PAYOUT,
    canStart,
    canCollect: Boolean(activeDeposit && bankCount >= BANK_DEPOSIT_MIN_BANKS),
    disabledReason,
  };
};

const isPlayerOnOwnBank = (state: GameState, playerId: string): boolean => {
  const player = getPlayer(state, playerId);
  const tile = getTile(player.position);
  if (tile.type !== 'bank') return false;
  const property = state.properties[tile.id];
  return property?.ownerId === playerId && !property.mortgaged;
};

const ceilMoney = (value: number): number => Math.ceil(value - 1e-6);

const getDistrictPath = (state: GameState, group: string) => (state.districtPaths ?? {})[group];

const getDistrictCreationHouseCost = (state: GameState, tile: CityTile, ownerId: string | undefined): number =>
  ceilMoney(
    tile.houseCost *
      getRealtorBuildCostMultiplier(state, ownerId) *
      getCityEventHouseCostMultiplier(state, tile) *
      getLateGamePriceMultiplier(state.turn),
  );

const getDistrictMortgageShare = (
  state: GameState,
  group: string,
  district: { creationCost?: number },
): number => {
  const groupTiles = cityGroup(group);
  if (groupTiles.length === 0) return 0;
  const creationCost = district.creationCost ?? getDistrictCreationCost(state, group);
  return ceilMoney(creationCost / groupTiles.length / 2);
};

const getDistrictAdjustedCityRent = (state: GameState, tile: CityTile, baseRent: number): number => {
  const path = getDistrictPath(state, tile.group)?.path;
  if (isDistrictRentReduced(path)) return ceilMoney(baseRent / getDistrictRentDivisor(path));
  return baseRent;
};

const getDistrictHouseCostMultiplier = (state: GameState, tile: CityTile): number =>
  getDistrictPath(state, tile.group)?.path === 'residential' ? RESIDENTIAL_HOUSE_COST_MULTIPLIER : 1;

const isDistrictRentReduced = (path: DistrictPath | undefined): boolean => path === 'oldTown' || path === 'residential';

const getDistrictRentDivisor = (path: DistrictPath): number => {
  if (path === 'residential') return RESIDENTIAL_DISTRICT_RENT_DIVISOR;
  return DISTRICT_RENT_DIVISOR;
};

const getOldTownPassThroughDivisor = (state: GameState, tile: CityTile): number => {
  if (state.properties[tile.id].houses <= 0) return OLD_TOWN_PASS_THROUGH_DIVISOR;
  if (GOLD_DISTRICT_RENT_GROUPS.has(tile.group)) return GOLD_DISTRICT_BUILDING_RENT_DIVISOR;
  if (GREEN_DISTRICT_RENT_GROUPS.has(tile.group)) return GREEN_DISTRICT_BUILDING_RENT_DIVISOR;
  return DISTRICT_RENT_DIVISOR;
};

const districtPathLabel = (path: DistrictPath): string => {
  switch (path) {
    case 'tourist':
      return 'Туристичний район';
    case 'oldTown':
      return 'Старе місто';
    case 'residential':
      return 'Спальний район';
    default:
      return path;
  }
};

const findRentService = (
  state: GameState,
  ownerId: string,
  beneficiaryId: string,
  tileId: number,
): ActiveRentService | undefined =>
  (state.rentServices ?? []).find(
    (service) =>
      service.ownerId === ownerId &&
      service.beneficiaryId === beneficiaryId &&
      service.tileId === tileId &&
      service.remainingTurns > 0,
  );

const applyRentService = (rent: number, service: ActiveRentService | undefined): number => {
  if (!service) return rent;
  if (service.discountPercent === 100) return 0;
  return ceilMoney(rent / 2);
};

const getActiveCityEventDefinitions = (state: GameState): CityEventDefinition[] =>
  (state.activeCityEvents ?? []).map((event) => getCityEventDefinition(event.id));

const getActiveCityEventEntries = (state: GameState): Array<ActiveCityEvent & { definition: CityEventDefinition }> =>
  (state.activeCityEvents ?? []).map((event) => ({ ...event, definition: getCityEventDefinition(event.id) }));

const cityEventAffectsRent = (event: CityEventDefinition, tile: PropertyTile): boolean => {
  const effect = event.effects;
  if (!effect.rentMultiplier) return false;
  const matchesGroup = tile.type === 'city' && effect.rentGroups?.includes(tile.group);
  const matchesType = effect.rentPropertyTypes?.includes(tile.type);
  return Boolean(matchesGroup || matchesType);
};

const cityEventAffectsPropertyPrice = (event: CityEventDefinition, tile: PropertyTile): boolean => {
  const effect = event.effects;
  if (!effect.propertyPriceMultiplier) return false;
  return Boolean(effect.propertyPriceTypes?.includes(tile.type));
};

const getCityEventRentMultiplier = (
  state: GameState,
  tile: PropertyTile,
  options: { includeMayorEvents?: boolean } = {},
): number =>
  getActiveCityEventEntries(state).reduce((multiplier, event) => {
    if (options.includeMayorEvents === false && event.mayorId) return multiplier;
    const effect = event.definition.effects;
    return cityEventAffectsRent(event.definition, tile) ? multiplier * (effect.rentMultiplier ?? 1) : multiplier;
  }, 1);

const getCityEventPropertyPriceMultiplier = (
  state: GameState,
  tile: PropertyTile,
  options: { includeMayorEvents?: boolean } = {},
): number =>
  getActiveCityEventEntries(state).reduce((multiplier, event) => {
    if (options.includeMayorEvents === false && event.mayorId) return multiplier;
    const effect = event.definition.effects;
    return cityEventAffectsPropertyPrice(event.definition, tile) ? multiplier * (effect.propertyPriceMultiplier ?? 1) : multiplier;
  }, 1);

const getMayorRentEventId = (state: GameState, tile: PropertyTile): string | undefined =>
  getActiveCityEventEntries(state).find(
    (event) => event.mayorId && cityEventAffectsRent(event.definition, tile) && (event.definition.effects.rentMultiplier ?? 1) > 1,
  )?.mayorId;

const getMayorPropertyPriceEventId = (state: GameState, tile: PropertyTile): string | undefined =>
  getActiveCityEventEntries(state).find(
    (event) =>
      event.mayorId &&
      cityEventAffectsPropertyPrice(event.definition, tile) &&
      (event.definition.effects.propertyPriceMultiplier ?? 1) > 1,
  )?.mayorId;

const getMayorPropertyPriceIncome = (
  state: GameState,
  tile: PropertyTile,
  totalPrice: number,
): PendingPayment['mayorEventIncome'] | undefined => {
  const mayorId = getMayorPropertyPriceEventId(state, tile);
  if (!mayorId) return undefined;
  const basePrice = getEffectivePropertyPriceWithoutMayorEvents(state, tile);
  const amount = Math.max(0, totalPrice - basePrice);
  return amount > 0 ? { playerId: mayorId, amount } : undefined;
};

const getRentWithMayorEventSplit = (
  state: GameState,
  tile: PropertyTile,
  diceTotal: number,
  rentService: ActiveRentService | undefined,
): {
  amount: number;
  baseAmount: number;
  ownerAmount?: number;
  mayorEventIncome?: PendingPayment['mayorEventIncome'];
} => {
  const baseAmount = calculateRent(state, tile, diceTotal);
  const amount = applyRentService(baseAmount, rentService);
  const mayorId = getMayorRentEventId(state, tile);
  if (!mayorId) return { amount, baseAmount };
  const baseWithoutMayor = calculateRent(state, tile, diceTotal, { includeMayorEvents: false });
  const amountWithoutMayor = applyRentService(baseWithoutMayor, rentService);
  const mayorAmount = Math.max(0, amount - amountWithoutMayor);
  if (mayorAmount <= 0) return { amount, baseAmount };
  return {
    amount,
    baseAmount,
    ownerAmount: amount - mayorAmount,
    mayorEventIncome: { playerId: mayorId, amount: mayorAmount },
  };
};

const getCityEventHouseCostMultiplier = (state: GameState, tile: CityTile): number =>
  getActiveCityEventDefinitions(state).reduce((multiplier, event) => {
    const effect = event.effects;
    if (!effect.houseCostMultiplier) return multiplier;
    const matchesGroup = !effect.houseCostGroups || effect.houseCostGroups.includes(tile.group);
    return matchesGroup ? multiplier * effect.houseCostMultiplier : multiplier;
  }, 1);

const getCityEventFineMultiplier = (state: GameState): number =>
  getActiveCityEventDefinitions(state).reduce((multiplier, event) => multiplier * (event.effects.fineMultiplier ?? 1), 1);

const getCityEventStepFee = (state: GameState, steps: number): number => {
  if (steps <= 0) return 0;
  const feePerStep = getActiveCityEventEntries(state).reduce(
    (total, event) => total + (event.definition.effects.stepFeePerMove ?? 0),
    0,
  );
  return feePerStep > 0 ? ceilMoney(feePerStep * steps) : 0;
};

const getMayorStepFeeIncome = (state: GameState, steps: number): PendingPayment['mayorEventIncome'] | undefined => {
  if (steps <= 0) return undefined;
  const incomeByMayor = new Map<string, number>();
  getActiveCityEventEntries(state).forEach((event) => {
    const feePerMove = event.definition.effects.stepFeePerMove ?? 0;
    if (!event.mayorId || feePerMove <= 0) return;
    incomeByMayor.set(event.mayorId, (incomeByMayor.get(event.mayorId) ?? 0) + ceilMoney(feePerMove * steps));
  });
  const [entry] = incomeByMayor.entries();
  return entry ? { playerId: entry[0], amount: entry[1] } : undefined;
};

const hasSingleDieRolls = (state: GameState): boolean =>
  getActiveCityEventDefinitions(state).some((event) => event.effects.singleDieRolls);

const isBuildingBlockedByCityEvent = (state: GameState): boolean =>
  getActiveCityEventDefinitions(state).some((event) => event.effects.buildingBlocked);

const hasGamblerOpeningSingleDieRoll = (state: GameState): boolean => {
  const player = state.players.find((candidate) => candidate.id === state.currentPlayerId);
  return Boolean(player?.roleId === 'gambler' && getPlayerRoleState(state, player.id).gamblerOpeningSingleDieRollPending);
};

const getRollDiceCount = (state: GameState): 1 | 2 =>
  hasSingleDieRolls(state) || hasGamblerOpeningSingleDieRoll(state) ? 1 : 2;

const normalizeDiceForRoll = (state: GameState, dice: [number, number]): [number, number] =>
  getRollDiceCount(state) === 1 ? [dice[0], 0] : dice;

const isDoubleDice = (dice: [number, number] | undefined): boolean =>
  Boolean(dice && dice[1] > 0 && dice[0] === dice[1]);

const getBaseFineAmount = (state: GameState, amount: number): number =>
  ceilMoney(amount * getCityEventFineMultiplier(state) * getLateGameFineMultiplier(state.currentRound ?? state.turn));

export const getEffectiveFineAmount = (state: GameState, amount: number, playerId?: string): number => {
  const baseAmount = getBaseFineAmount(state, amount);
  return playerId && getPlayer(state, playerId).roleId === 'lawyer' ? ceilMoney(baseAmount * LAWYER_FINE_DISCOUNT) : baseAmount;
};

export const applyRoleFineDiscount = (
  state: GameState,
  playerId: string,
  amount: number,
): { state: GameState; amount: number; saved: number } => {
  const baseAmount = getBaseFineAmount(state, amount);
  const discountedAmount = getPlayer(state, playerId).roleId === 'lawyer' ? ceilMoney(baseAmount * LAWYER_FINE_DISCOUNT) : baseAmount;
  const saved = Math.max(0, baseAmount - discountedAmount);
  return { state: addRoleSavings(state, playerId, saved), amount: discountedAmount, saved };
};

export const diceRotationForValue = (value: number): [number, number, number] => {
  const rotations: Record<number, [number, number, number]> = {
    1: [0, 0, 0],
    2: [0, 0, Math.PI],
    3: [0, 0, -Math.PI / 2],
    4: [0, 0, Math.PI / 2],
    5: [Math.PI / 2, 0, 0],
    6: [-Math.PI / 2, 0, 0],
  };
  return rotations[value] ?? rotations[1];
};

const rollForTurnOrder = (state: GameState, playerId: string, dice: [number, number]): GameState => {
  if (state.phase !== 'orderRoll') throw new Error('Зараз не визначається черга ходів.');
  if (state.turnOrderRolls?.[playerId]) throw new Error('Гравець уже кинув кубики за чергу.');

  const rolls = { ...(state.turnOrderRolls ?? {}), [playerId]: dice };
  const player = getPlayer(state, playerId);
  if (player.isBankrupt) throw new Error('Гравець вибув.');
  const base: GameState = {
    ...state,
    dice,
    diceRollId: state.diceRollId + 1,
    lastDice: dice,
    lastOrderRollPlayerId: playerId,
    turnOrderRolls: rolls,
    log: appendLog(state, `${player.name} кидає ${dice[0] + dice[1]} за чергу ходів.`),
  };

  const nextPlayer = base.players.find((candidate) => !rolls[candidate.id] && !candidate.isBankrupt);
  if (nextPlayer) {
    return {
      ...base,
      currentPlayerId: nextPlayer.id,
    };
  }

  const originalIndex = new Map(base.players.map((candidate, index) => [candidate.id, index]));
  const orderedPlayers = [...base.players].sort((left, right) => {
    const leftDice = rolls[left.id] ?? [0, 0];
    const rightDice = rolls[right.id] ?? [0, 0];
    const leftTotal = leftDice[0] + leftDice[1];
    const rightTotal = rightDice[0] + rightDice[1];
    const leftHigh = Math.max(...leftDice);
    const rightHigh = Math.max(...rightDice);
    const leftLow = Math.min(...leftDice);
    const rightLow = Math.min(...rightDice);
    return (
      rightTotal - leftTotal ||
      rightHigh - leftHigh ||
      rightLow - leftLow ||
      (originalIndex.get(left.id) ?? 0) - (originalIndex.get(right.id) ?? 0)
    );
  });
  const orderText = orderedPlayers
    .map((candidate, index) => `${index + 1}. ${candidate.name} (${(rolls[candidate.id] ?? [0, 0]).join(' + ')})`)
    .join('; ');
  const roleAssignment =
    base.rolesEnabled === false
      ? { players: orderedPlayers, properties: base.properties, roleState: base.roleState }
      : assignRolesAndStartingBenefits(orderedPlayers, base.properties, base.pendingRoleOrder);
  const roleText =
    base.rolesEnabled === false
      ? ''
      : ` Ролі: ${roleAssignment.players
          .map((candidate) => `${candidate.name} - ${ROLE_DEFINITIONS[candidate.roleId!].title}`)
          .join('; ')}.`;

  return openGamblerOpeningCasinoIfNeeded({
    ...base,
    players: roleAssignment.players,
    properties: roleAssignment.properties,
    roleState: roleAssignment.roleState,
    currentPlayerId: roleAssignment.players[0].id,
    phase: 'rolling',
    turn: 1,
    currentRound: 1,
    doublesInRow: 0,
    builtThisRoll: undefined,
    buildsThisRoll: undefined,
    lastOrderRollPlayerId: playerId,
    pendingRoleOrder: undefined,
    log: appendLog(base, `Чергу визначено: ${orderText}. ${roleAssignment.players[0].name} починає партію.${roleText}`, 'good'),
  });
};

const rollDice = (state: GameState, playerId: string, dice: [number, number]): GameState => {
  assertCurrent(state, playerId);
  if (state.phase !== 'rolling') throw new Error('Зараз не можна кидати кубики.');
  if (hasPendingTrade(state)) throw new Error('Спочатку прийміть або відхиліть активну угоду.');

  const player = getPlayer(state, playerId);
  const usesOpeningSingleDieRoll = hasGamblerOpeningSingleDieRoll(state);
  const normalizedDice = normalizeDiceForRoll(state, dice);
  const isSingleDieRoll = normalizedDice[1] <= 0;
  const isDouble = isDoubleDice(normalizedDice);
  const isJailed = player.jailTurns > 0;
  const doublesInRow = isJailed ? 0 : isDouble ? state.doublesInRow + 1 : 0;
  let next: GameState = {
    ...state,
    dice: normalizedDice,
    diceRollId: state.diceRollId + 1,
    lastDice: normalizedDice,
    doublesInRow,
    builtThisRoll: undefined,
    buildsThisRoll: undefined,
  };
  if (usesOpeningSingleDieRoll) {
    next = updatePlayerRoleState(
      {
        ...next,
        log: appendLog(next, `${player.name} кидає один кубик після стартового x4 Азартного гравця.`),
      },
      playerId,
      (roleState) => ({ ...roleState, gamblerOpeningSingleDieRollPending: false }),
    );
  }

  if (isJailed && !isDouble) {
    const remainingTurns = Math.max(0, player.jailTurns - 1);
    return {
      ...next,
      phase: 'turnEnd',
      players: next.players.map((candidate) =>
        candidate.id === playerId ? { ...candidate, jailTurns: remainingTurns } : candidate,
      ),
      log: appendLog(
        next,
        isSingleDieRoll
          ? remainingTurns > 0
            ? `${player.name} кидає один кубик через ремонт доріг і лишається у вʼязниці (${remainingTurns} ход.).`
            : `${player.name} кидає один кубик через ремонт доріг і відсидів строк. Наступного ходу він вільний.`
          : remainingTurns > 0
            ? `${player.name} не викидає дубль і лишається у вʼязниці (${remainingTurns} ход.).`
            : `${player.name} не викидає дубль і відсидів строк. Наступного ходу він вільний.`,
      ),
    };
  }

  if (isJailed && isDouble) {
    next = {
      ...next,
      players: next.players.map((candidate) =>
        candidate.id === playerId ? { ...candidate, jailTurns: 0 } : candidate,
      ),
      log: appendLog(next, `${player.name} виходить з вʼязниці дублем.`),
    };
  }

  if (!isJailed && doublesInRow >= 3) {
    return sendToJail({ ...next, doublesInRow: 0 }, playerId, 'Три дублі поспіль. Гравець іде до вʼязниці.');
  }

  return movePlayer(next, playerId, normalizedDice[0] + normalizedDice[1]);
};

const getPlayerStartReward = (
  state: GameState,
  player: Player,
  nextPosition: number,
  isForwardMove: boolean,
): number => {
  return getStartReward(player.position, nextPosition, isForwardMove, state.turn, { roleId: player.roleId });
};

const movePlayer = (state: GameState, playerId: string, steps: number): GameState => {
  const player = getPlayer(state, playerId);
  const nextPosition = (player.position + steps) % boardTiles.length;
  const startReward = getPlayerStartReward(state, player, nextPosition, steps > 0);
  const startRewardText = startReward > 0 ? ` і отримує ${startReward}₴ за Старт` : '';
  let next: GameState = {
    ...state,
    players: state.players.map((candidate) =>
      candidate.id === playerId
        ? {
            ...candidate,
            position: nextPosition,
            money: candidate.money + startReward,
            jailTurns: 0,
          }
        : candidate,
    ),
    log: appendLog(state, `${player.name} рухається на ${steps} клітинок${startRewardText}.`),
  };
  next = addBankDepositTurn(next, playerId, steps);

  const stepFee = getCityEventStepFee(next, steps);
  const mayorStepFeeIncome = getMayorStepFeeIncome(next, steps);
  const oldTownTolls = getOldTownMovementTolls(next, playerId, player.position, nextPosition, steps);
  const oldTownTotal = oldTownTolls.reduce((sum, toll) => sum + toll.amount, 0);
  const movementPayment = stepFee + oldTownTotal;
  if (movementPayment > 0) {
    const stepReason = stepFee > 0 ? `Платні дороги: ${steps} ${formatStepWord(steps)}` : '';
    const tollReason =
      oldTownTolls.length > 0
        ? oldTownTolls
            .map(
              (toll) =>
                `Пройдено район "Старе місто". ${toll.message} Плата ${toll.amount}₴`,
            )
            .join('; ')
        : '';
    return createPendingPayment(next, {
      payerId: playerId,
      amount: movementPayment,
      reason: [stepReason, tollReason].filter(Boolean).join('; '),
      source: oldTownTolls.length > 0 ? 'movement' : 'cityEvent',
      recipients: [
        ...oldTownTolls.map((toll) => ({ playerId: toll.ownerId, amount: toll.amount })),
        ...(mayorStepFeeIncome ? [mayorStepFeeIncome] : []),
      ],
      mayorEventIncome: mayorStepFeeIncome,
      afterPayment: {
        type: 'resolveTile',
        playerId,
        diceTotal: steps,
      },
    });
  }

  return resolveTile(next, playerId, steps);
};

const addBankDepositTurn = (state: GameState, playerId: string, steps: number): GameState => {
  const deposit = (state.bankDeposits ?? {})[playerId];
  if (!deposit || steps <= 0) return state;
  return {
    ...state,
    bankDeposits: {
      ...(state.bankDeposits ?? {}),
      [playerId]: {
        playerId: deposit.playerId,
        amount: deposit.amount,
        turns: getBankDepositTurnCount(deposit) + 1,
        createdAtTurn: deposit.createdAtTurn,
        createdAtDiceRollId: deposit.createdAtDiceRollId,
      },
    },
  };
};

const getOldTownMovementTolls = (
  state: GameState,
  playerId: string,
  fromPosition: number,
  destinationPosition: number,
  steps: number,
): Array<{ group: string; ownerId: string; message: string; amount: number }> => {
  if (steps <= 1) return [];
  const destination = getTile(destinationPosition);
  const destinationGroup = destination.type === 'city' ? destination.group : undefined;
  const tolls = new Map<string, { group: string; ownerId: string; message: string; amount: number }>();

  for (let step = 1; step < steps; step += 1) {
    const tile = getTile((fromPosition + step) % boardTiles.length);
    if (tile.type !== 'city' || tile.group === destinationGroup) continue;

    const district = getDistrictPath(state, tile.group);
    if (district?.path !== 'oldTown' || district.ownerId === playerId) continue;
    if (!ownsFullGroup(state, district.ownerId, tile.group)) continue;

    const rent = calculateRent(state, tile, 0);
    if (rent <= 0) continue;
    const amount = ceilMoney(rent / getOldTownPassThroughDivisor(state, tile));
    const previous = tolls.get(tile.group);
    if (!previous || amount > previous.amount) {
      tolls.set(tile.group, {
        group: tile.group,
        ownerId: district.ownerId,
        message: getOldTownPassThroughMessage(tile),
        amount,
      });
    }
  }

  return Array.from(tolls.values());
};

const getOldTownPassThroughMessage = (tile: CityTile): string =>
  OLD_TOWN_PASS_THROUGH_MESSAGES[tile.citySlug] ?? `Ви пройшли повз ${tile.name}.`;

const resolveTile = (state: GameState, playerId: string, diceTotal: number): GameState => {
  const player = getPlayer(state, playerId);
  const tile = getTile(player.position);

  if (tile.type === 'goToJail') {
    const jailFine = getEffectiveFineAmount(state, JAIL_FINE, playerId);
    return {
      ...state,
      phase: 'awaitingJailDecision',
      pendingJail: { playerId, tileId: tile.id },
      log: appendLog(
        state,
        `${player.name} потрапляє на "До вʼязниці" і має вибрати: сплатити ${jailFine}₴ або піти у вʼязницю.`,
        'bad',
      ),
    };
  }

  if (tile.type === 'tax') {
    return createPendingPayment(state, {
      payerId: playerId,
      amount: tile.amount,
      reason: tile.name,
      tileId: tile.id,
      source: 'tax',
    });
  }

  if (tile.type === 'chance' || tile.type === 'community') {
    return {
      ...state,
      phase: 'awaitingCard',
      pendingCardDraw: { deck: tile.type, tileId: tile.id },
      pendingCard: undefined,
      log: appendLog(state, `${player.name} зупиняється на ${tile.name}. Перевірте удачу.`),
    };
  }

  if (tile.type === 'casino') {
    const maxBet = getCasinoMaxBet(player);
    return {
      ...state,
      phase: 'casino',
      pendingCasino: { playerId, tileId: tile.id },
      log: appendLog(state, `${player.name} зупиняється біля казино і може зробити ставку до ${maxBet}₴.`),
    };
  }

  if (isPropertyTile(tile)) {
    const property = state.properties[tile.id];
    if (!property.ownerId) {
      const price = getEffectivePropertyPrice(state, tile);
      return {
        ...state,
        phase: 'awaitingPurchase',
        pendingPurchaseTileId: tile.id,
        log: appendLog(state, `${player.name} може купити ${tile.name} за ${price}₴.`),
      };
    }

    if (tile.type === 'bank' && property.ownerId === playerId) {
      const depositResolution = resolveBankDepositOnOwnBank(state, playerId, tile.name);
      if (depositResolution) return depositResolution;
      const depositDecision = createBankDepositDecision(state, playerId, tile);
      if (depositDecision) return depositDecision;
    }

    if (property.ownerId !== playerId) {
      const rentService = findRentService(state, property.ownerId, playerId, tile.id);
      const rentSplit = getRentWithMayorEventSplit(state, tile, diceTotal, rentService);
      const { amount: rent, baseAmount: baseRent } = rentSplit;
      const owner = getPlayer(state, property.ownerId);
      if (rent <= 0) {
        return {
          ...state,
          phase: 'turnEnd',
          log: appendLog(
            state,
            rentService
              ? `${player.name} використовує послугу на ${tile.name}: оренда ${baseRent}₴ не стягується.`
              : `${player.name} зупиняється на ${tile.name}. Оренда не стягується.`,
          ),
        };
      }

      return {
        ...state,
        phase: 'rent',
        pendingRent: {
          payerId: playerId,
          ownerId: property.ownerId,
          tileId: tile.id,
          amount: rent,
          ownerAmount: rentSplit.ownerAmount,
          mayorEventIncome: rentSplit.mayorEventIncome,
          originalAmount: rentService ? baseRent : undefined,
          rentServiceId: rentService?.id,
          discountPercent: rentService?.discountPercent,
        },
        log: appendLog(
          state,
          rentService
            ? `${player.name} має сплатити ${rent}₴ замість ${baseRent}₴ оренди гравцю ${owner.name}.`
            : `${player.name} має сплатити ${rent}₴ оренди гравцю ${owner.name}.`,
          'bad',
        ),
      };
    }
  }

  return { ...state, phase: 'turnEnd', log: appendLog(state, `${player.name} зупиняється на ${tile.name}.`) };
};

const resolveBankDepositOnOwnBank = (state: GameState, playerId: string, bankName: string): GameState | undefined => {
  const deposit = (state.bankDeposits ?? {})[playerId];
  if (!deposit) return undefined;

  const player = getPlayer(state, playerId);
  const bankCount = ownedBankCount(state, playerId);
  if (bankCount < BANK_DEPOSIT_MIN_BANKS) {
    return {
      ...state,
      phase: 'turnEnd',
      log: appendLog(
        state,
        `${player.name} зупиняється на ${bankName}, але депозит заморожений: потрібно мінімум 2 банки, щоб забрати кошти.`,
      ),
    };
  }

  const payout = getBankDepositPayout(deposit);
  const depositTurns = getBankDepositTurnCount(deposit);
  const profit = payout - deposit.amount;
  const nextDeposits = { ...(state.bankDeposits ?? {}) };
  delete nextDeposits[playerId];

  return {
    ...state,
    phase: 'turnEnd',
    bankDeposits: nextDeposits,
    players: state.players.map((candidate) =>
      candidate.id === playerId ? { ...candidate, money: candidate.money + payout } : candidate,
    ),
    log: appendLog(
      state,
      `${player.name} забирає депозит у ${bankName}: ${deposit.amount}₴ + ${profit}₴ за ${depositTurns} ${formatTurnWord(depositTurns)}.`,
      'good',
    ),
  };
};

const createBankDepositDecision = (
  state: GameState,
  playerId: string,
  tile: Extract<PropertyTile, { type: 'bank' }>,
): GameState | undefined => {
  if ((state.bankDeposits ?? {})[playerId]) return undefined;
  if (state.properties[tile.id]?.mortgaged) return undefined;

  const player = getPlayer(state, playerId);
  const bankCount = ownedBankCount(state, playerId);
  if (bankCount < BANK_DEPOSIT_MIN_BANKS) return undefined;

  const amount = getBankRentForCount(bankCount);
  if (amount <= 0) return undefined;

  return {
    ...state,
    phase: 'bankDeposit',
    pendingBankDeposit: { playerId, tileId: tile.id, amount },
    log: appendLog(state, `${player.name} зупиняється у своєму банку ${tile.name} і може зробити депозит ${amount}₴.`, 'good'),
  };
};

const buyPendingProperty = (state: GameState, playerId: string): GameState => {
  assertCurrent(state, playerId);
  if (state.phase !== 'awaitingPurchase' || state.pendingPurchaseTileId === undefined) {
    throw new Error('Немає майна для купівлі.');
  }

  const tile = getTile(state.pendingPurchaseTileId);
  if (!isPropertyTile(tile)) throw new Error('Цю клітинку не можна купити.');
  const player = getPlayer(state, playerId);
  const price = getEffectivePropertyPrice(state, tile);
  const mayorIncome = getMayorPropertyPriceIncome(state, tile, price);
  if (player.money < price) throw new Error('Недостатньо грошей.');

  const bought: GameState = {
    ...state,
    phase: 'turnEnd',
    pendingPurchaseTileId: undefined,
    pendingCard: undefined,
    pendingCardDraw: undefined,
    properties: {
      ...state.properties,
      [tile.id]: {
        ...state.properties[tile.id],
        ownerId: playerId,
        mortgagedAtTurn: undefined,
        mortgageTurnsLeft: undefined,
      },
    },
    players: state.players.map((candidate) => {
      const pays = candidate.id === playerId ? price : 0;
      const receives = candidate.id === mayorIncome?.playerId ? mayorIncome.amount : 0;
      const properties = candidate.id === playerId ? [...candidate.properties, tile.id] : candidate.properties;
      return pays > 0 || receives > 0 || candidate.id === playerId
        ? { ...candidate, money: candidate.money - pays + receives, properties }
        : candidate;
    }),
    log: appendLog(
      state,
      mayorIncome
        ? `${player.name} купує ${tile.name} за ${price}₴. Націнка події ${mayorIncome.amount}₴ іде Меру.`
        : `${player.name} купує ${tile.name} за ${price}₴.`,
      'good',
    ),
  };
  return addMayorEventIncome(bought, mayorIncome?.playerId, mayorIncome?.amount ?? 0);
};

const startAuction = (state: GameState, playerId: string): GameState => {
  assertCurrent(state, playerId);
  if (state.pendingPurchaseTileId === undefined) throw new Error('Немає майна для аукціону.');
  const tileId = state.pendingPurchaseTileId;
  const tile = getTile(tileId);
  if (!isPropertyTile(tile)) throw new Error('Це поле не можна виставити на аукціон.');
  const player = getPlayer(state, playerId);
  const minimumBid = getEffectivePropertyPrice(state, tile);
  const now = Date.now();
  return {
    ...state,
    phase: 'auction',
    pendingPurchaseTileId: undefined,
    pendingCard: undefined,
    pendingCardDraw: undefined,
    auction: {
      tileId,
      source: 'purchase',
      startedAt: now,
      endsAt: now + AUCTION_DURATION_MS,
      minimumBid,
      highestBid: 0,
      bids: [],
    },
    log: appendLog(state, `${player.name} виставляє ${tile.name} на аукціон.`),
  };
};

const auctionBid = (state: GameState, playerId: string, amount: number): GameState => {
  if (state.phase !== 'auction' || !state.auction) throw new Error('Аукціон не активний.');
  const now = Date.now();
  if (now > state.auction.endsAt) throw new Error('Аукціон завершено.');
  const player = getPlayer(state, playerId);
  if (player.isBankrupt) throw new Error('Банкрут не може робити ставку.');
  if (player.jailTurns > 0) throw new Error('Гравець у вʼязниці не може брати участь в аукціоні.');
  if (state.auction.highestBidderId === playerId) throw new Error('Ваша ставка вже найвища.');
  const normalizedAmount = Math.floor(amount);
  const minimumBid =
    state.auction.highestBid > 0 ? state.auction.highestBid + AUCTION_BID_INCREMENT : state.auction.minimumBid;
  if (!Number.isFinite(normalizedAmount) || normalizedAmount < minimumBid) {
    throw new Error(`Мінімальна ставка ${minimumBid}₴.`);
  }
  if (player.money < normalizedAmount) throw new Error('Недостатньо грошей.');
  const placedAt = now;
  return {
    ...state,
    auction: {
      ...state.auction,
      highestBid: normalizedAmount,
      highestBidderId: playerId,
      endsAt: placedAt + AUCTION_DURATION_MS,
      bids: [...state.auction.bids, { playerId, amount: normalizedAmount, placedAt }],
    },
    log: appendLog(state, `${player.name} ставить ${normalizedAmount}₴ на аукціоні.`, 'good'),
  };
};

const auctionPass = (state: GameState, playerId: string): GameState => {
  if (state.phase !== 'auction' || !state.auction) throw new Error('Аукціон не активний.');
  const player = getPlayer(state, playerId);
  if (player.isBankrupt || player.jailTurns > 0) throw new Error('Гравець не може брати участь в аукціоні.');
  return {
    ...state,
    log: appendLog(state, `${player.name} не робить ставку на аукціоні.`),
  };
};

const resolveAuction = (state: GameState): GameState => {
  if (state.phase !== 'auction' || !state.auction) throw new Error('Аукціон не активний.');
  const auction = state.auction;
  if (Date.now() < auction.endsAt) throw new Error('Аукціон ще триває.');

  if (!auction.highestBidderId) {
    const resolved: GameState = {
      ...state,
      phase: auction.source === 'cityEvent' ? 'rolling' : 'turnEnd',
      auction: undefined,
      log: appendLog(state, `Аукціон за ${getTile(auction.tileId).name} завершено без покупця.`),
    };
    return auction.source === 'cityEvent' ? openTurnStartCasinoIfNeeded(resolved, resolved.currentPlayerId) : resolved;
  }

  const winner = getPlayer(state, auction.highestBidderId);
  let resolved: GameState = {
    ...state,
    phase: auction.source === 'cityEvent' ? 'rolling' : 'turnEnd',
    auction: undefined,
    properties: {
      ...state.properties,
      [auction.tileId]: {
        ...state.properties[auction.tileId],
        ownerId: winner.id,
        mortgagedAtTurn: undefined,
        mortgageTurnsLeft: undefined,
      },
    },
    players: state.players.map((player) => {
      const paysBid = player.id === winner.id;
      const receivesMayorIncome = auction.sourceMayorId === player.id;
      if (!paysBid && !receivesMayorIncome) return player;
      return {
        ...player,
        money: player.money - (paysBid ? auction.highestBid : 0) + (receivesMayorIncome ? auction.highestBid : 0),
        properties: paysBid ? [...player.properties, auction.tileId] : player.properties,
      };
    }),
    log: appendLog(state, `${winner.name} виграє аукціон за ${auction.highestBid}₴.`, 'good'),
  };

  if (auction.sourceMayorId) {
    resolved = addMayorEventIncome(resolved, auction.sourceMayorId, auction.highestBid);
  }

  return auction.source === 'cityEvent' ? openTurnStartCasinoIfNeeded(resolved, resolved.currentPlayerId) : resolved;
};

export const getBuilderRemotePurchaseCost = (state: GameState, tile: PropertyTile): number =>
  ceilMoney(getEffectivePropertyPrice(state, tile) * BUILDER_REMOTE_PURCHASE_MULTIPLIER);

const getBuilderSpecialActionRound = (state: Pick<GameState, 'currentRound'>): number => state.currentRound ?? 1;

const hasBuilderSpecialActionThisRound = (state: Pick<GameState, 'currentRound'>, roleState: PlayerRoleState): boolean =>
  roleState.builderSpecialActionRound === getBuilderSpecialActionRound(state);

const assertBuilderSpecialPropertyAction = (state: GameState, playerId: string, tileId: number): PropertyTile => {
  assertCurrent(state, playerId);
  if (state.phase !== 'rolling') throw new Error('Здібності Будівельника доступні тільки до кидка кубиків.');
  if (hasPendingTrade(state)) throw new Error('Спочатку прийміть або відхиліть активну угоду.');
  const player = getPlayer(state, playerId);
  if (player.roleId !== 'builder') throw new Error('Ця дія доступна тільки Будівельнику.');
  if (player.jailTurns > 0) throw new Error('У вʼязниці не можна використовувати здібності Будівельника.');
  const tile = getTile(tileId);
  if (!isPropertyTile(tile)) throw new Error('Обрати можна тільки майно.');
  if (state.properties[tile.id]?.ownerId) throw new Error('Майно вже має власника.');
  return tile;
};

const builderBuyUnownedProperty = (state: GameState, playerId: string, tileId: number): GameState => {
  const tile = assertBuilderSpecialPropertyAction(state, playerId, tileId);
  const roleState = getPlayerRoleState(state, playerId);
  if (roleState.builderRemotePurchaseUsed) throw new Error('Будівельник уже купував майно з будь-якої точки карти.');
  if (hasBuilderSpecialActionThisRound(state, roleState)) {
    throw new Error('Будівельник уже використав спецдію в цьому раунді.');
  }
  const player = getPlayer(state, playerId);
  const cost = getBuilderRemotePurchaseCost(state, tile);
  if (player.money < cost) throw new Error(`Для купівлі потрібно ${cost}₴.`);

  return updatePlayerRoleState(
    {
      ...state,
      properties: {
        ...state.properties,
        [tile.id]: { ...state.properties[tile.id], ownerId: playerId, mortgagedAtTurn: undefined, mortgageTurnsLeft: undefined },
      },
      players: state.players.map((candidate) =>
        candidate.id === playerId
          ? { ...candidate, money: candidate.money - cost, properties: [...candidate.properties, tile.id] }
          : candidate,
      ),
      log: appendLog(state, `${player.name} купує ${tile.name} як Будівельник за ${cost}₴.`, 'good'),
    },
    playerId,
    (current) => ({
      ...current,
      builderRemotePurchaseUsed: true,
      builderSpecialActionRound: getBuilderSpecialActionRound(state),
    }),
  );
};

const builderStartUnownedAuction = (state: GameState, playerId: string, tileId: number): GameState => {
  const tile = assertBuilderSpecialPropertyAction(state, playerId, tileId);
  const roleState = getPlayerRoleState(state, playerId);
  if (roleState.builderAuctionUsed) throw new Error('Будівельник уже запускав вільний аукціон.');
  if (hasBuilderSpecialActionThisRound(state, roleState)) {
    throw new Error('Будівельник уже використав спецдію в цьому раунді.');
  }
  const player = getPlayer(state, playerId);
  const minimumBid = getEffectivePropertyPrice(state, tile);
  const now = Date.now();

  return updatePlayerRoleState(
    {
      ...state,
      phase: 'auction',
      pendingPurchaseTileId: undefined,
      pendingCard: undefined,
      pendingCardDraw: undefined,
      auction: {
        tileId: tile.id,
        source: 'builder',
        startedAt: now,
        endsAt: now + AUCTION_DURATION_MS,
        minimumBid,
        highestBid: 0,
        bids: [],
      },
      log: appendLog(state, `${player.name} запускає аукціон Будівельника на ${tile.name}.`),
    },
    playerId,
    (current) => ({
      ...current,
      builderAuctionUsed: true,
      builderSpecialActionRound: getBuilderSpecialActionRound(state),
    }),
  );
};

const skipCasino = (state: GameState, playerId: string): GameState => {
  assertCurrent(state, playerId);
  if (state.phase !== 'casino' || state.pendingCasino?.playerId !== playerId) {
    throw new Error('Зараз немає рішення в казино.');
  }
  if (state.pendingCasino.spinEndsAt) throw new Error('Рулетка вже крутиться.');
  if (isGamblerOpeningCasino(state.pendingCasino)) {
    throw new Error('Стартову рулетку Азартного гравця не можна пропустити.');
  }
  if (isCityEventCasino(state.pendingCasino)) {
    throw new Error('Рулетку міської події не можна пропустити.');
  }

  const player = getPlayer(state, playerId);
  return {
    ...state,
    phase: 'turnEnd',
    pendingCasino: undefined,
    log: appendLog(state, `${player.name} відмовляється від казино.`),
  };
};

const startCasinoSpin = (
  state: GameState,
  playerId: string,
  amount: number,
  multiplier: number,
  spinSeed: number,
): GameState => {
  assertCurrent(state, playerId);
  if (state.phase !== 'casino' || state.pendingCasino?.playerId !== playerId) {
    throw new Error('Зараз немає активного казино.');
  }
  if (state.pendingCasino.spinEndsAt) throw new Error('Рулетка вже крутиться.');

  const player = getPlayer(state, playerId);
  const bet = normalizeCasinoBetForPending(state.pendingCasino, player, amount);
  const resultMultiplier = normalizeCasinoMultiplierForPending(state.pendingCasino, multiplier);
  const now = Date.now();
  return {
    ...state,
    pendingCasino: {
      ...state.pendingCasino,
      amount: bet,
      multiplier: resultMultiplier,
      spinSeed: Number.isFinite(spinSeed) ? Math.floor(spinSeed) : now,
      spinStartedAt: now,
      spinEndsAt: now + CASINO_SPIN_DURATION_MS,
    },
    log: appendLog(
      state,
      isGamblerOpeningCasino(state.pendingCasino)
        ? `${player.name} ставить весь стартовий баланс ${bet}₴ і запускає рулетку Азартного гравця.`
        : isCityEventCasino(state.pendingCasino)
          ? `${player.name} запускає обовʼязкову рулетку міської події зі ставкою ${bet}₴.`
        : `${player.name} ставить ${bet}₴ і запускає рулетку.`,
    ),
  };
};

const casinoBet = (state: GameState, playerId: string, amount: number, multiplier: number): GameState => {
  assertCurrent(state, playerId);
  if (state.phase !== 'casino' || state.pendingCasino?.playerId !== playerId) {
    throw new Error('Зараз немає активного казино.');
  }

  const player = getPlayer(state, playerId);
  const isOpeningSpin = isGamblerOpeningCasino(state.pendingCasino);
  const isCityEventSpin = isCityEventCasino(state.pendingCasino);
  const bet = normalizeCasinoBetForPending(state.pendingCasino, player, amount);
  const resultMultiplier = normalizeCasinoMultiplierForPending(state.pendingCasino, multiplier);
  if (state.pendingCasino.spinEndsAt && Date.now() < state.pendingCasino.spinEndsAt) {
    throw new Error('Рулетка ще крутиться.');
  }
  if (
    state.pendingCasino.amount !== undefined &&
    (state.pendingCasino.amount !== bet || state.pendingCasino.multiplier !== resultMultiplier)
  ) {
    throw new Error('Результат казино не збігається з активною прокруткою.');
  }

  const payout = bet * resultMultiplier;
  const net = payout - bet;
  const text =
    resultMultiplier === 0
      ? `${player.name} ставить ${bet}₴ у казино і програє ставку.`
      : `${player.name} ставить ${bet}₴ у казино: x${resultMultiplier}, виплата ${payout}₴.`;

  if (net < 0) {
    const afterCasino = completeCityEventCasinoSpin(state, playerId);
    const paymentState = createPendingPayment(
      {
        ...afterCasino,
        pendingCasino: undefined,
        log: appendLog(state, text, 'bad'),
      },
      {
        payerId: playerId,
        amount: Math.abs(net),
        reason: 'програш у казино',
        tileId: state.pendingCasino.tileId,
        source: 'casino',
        afterPayment: isCityEventSpin ? { type: 'resumeRolling', playerId } : undefined,
      },
    );
    return isOpeningSpin ? markGamblerOpeningSpinDone(paymentState, playerId, resultMultiplier) : paymentState;
  }

  const afterCasino = completeCityEventCasinoSpin(state, playerId);
  const nextPlayers = afterCasino.players.map((candidate) =>
    candidate.id === playerId ? { ...candidate, money: candidate.money + net } : candidate,
  );

  const resolved: GameState = {
    ...afterCasino,
    phase: isOpeningSpin || isCityEventSpin ? 'rolling' : 'turnEnd',
    pendingCasino: undefined,
    players: nextPlayers,
    log: appendLog(state, text, net > 0 ? 'good' : net < 0 ? 'bad' : 'neutral'),
  };

  const afterOpening = isOpeningSpin ? markGamblerOpeningSpinDone(resolved, playerId, resultMultiplier) : resolved;
  return isOpeningSpin ? openTurnStartCasinoIfNeeded(afterOpening, playerId) : afterOpening;
};

const isGamblerOpeningCasino = (pendingCasino: GameState['pendingCasino']): boolean =>
  pendingCasino?.forced === 'gamblerOpening';

const isCityEventCasino = (pendingCasino: GameState['pendingCasino']): boolean =>
  pendingCasino?.forced === 'cityEvent';

const normalizeCasinoBetForPending = (
  pendingCasino: GameState['pendingCasino'],
  player: Player,
  amount: number,
): number => (isGamblerOpeningCasino(pendingCasino) ? normalizeGamblerOpeningCasinoBet(player, amount) : normalizeCasinoBet(player, amount));

const normalizeGamblerOpeningCasinoBet = (player: Player, amount: number): number => {
  const bet = Math.floor(amount);
  const requiredBet = Math.floor(player.money);
  if (!Number.isFinite(bet) || requiredBet <= 0 || bet !== requiredBet) {
    throw new Error(`Стартова рулетка Азартного гравця вимагає ставку на весь баланс: ${requiredBet}₴.`);
  }
  return bet;
};

const normalizeCasinoBet = (player: Player, amount: number): number => {
  const bet = Math.floor(amount);
  const maxBet = getCasinoMaxBet(player);
  if (!Number.isFinite(bet) || bet <= 0 || bet > maxBet) {
    throw new Error(`Ставка має бути від 1 до ${maxBet}₴.`);
  }
  return bet;
};

export const getCasinoMaxBet = (player: Player): number =>
  Math.min(player.roleId === 'gambler' ? player.money : CASINO_MAX_BET, player.money);

export const getCasinoSegmentWeight = (player: Player, multiplier: number, baseWeight: number): number =>
  player.roleId === 'gambler' && multiplier === 0 ? baseWeight * GAMBLER_CASINO_ZERO_WEIGHT_MULTIPLIER : baseWeight;

const normalizeCasinoMultiplierForPending = (pendingCasino: GameState['pendingCasino'], multiplier: number): number => {
  const resultMultiplier = normalizeCasinoMultiplier(multiplier);
  if (isGamblerOpeningCasino(pendingCasino) && !GAMBLER_OPENING_CASINO_MULTIPLIERS.includes(resultMultiplier as 2 | 3 | 4)) {
    throw new Error('Стартова рулетка Азартного гравця має множник x2, x3 або x4.');
  }
  return resultMultiplier;
};

const normalizeCasinoMultiplier = (multiplier: number): number => {
  const resultMultiplier = Math.floor(multiplier);
  if (!Number.isFinite(resultMultiplier) || resultMultiplier < 0 || resultMultiplier > CASINO_MAX_MULTIPLIER) {
    throw new Error(`Множник казино має бути від x0 до x${CASINO_MAX_MULTIPLIER}.`);
  }
  return resultMultiplier;
};

const adminMoveCurrentPlayer = (state: GameState, tileId: number): GameState => {
  const tile = getTile(tileId);
  const player = getPlayer(state, state.currentPlayerId);
  if (player.isBankrupt) throw new Error('Банкрута не можна переносити.');

  const moved: GameState = {
    ...state,
    phase: 'rolling',
    pendingPurchaseTileId: undefined,
    pendingRent: undefined,
    pendingPayment: undefined,
    pendingCasino: undefined,
    pendingBankDeposit: undefined,
    pendingJail: undefined,
    pendingCard: undefined,
    pendingCardDraw: undefined,
    auction: undefined,
    players: state.players.map((candidate) =>
      candidate.id === player.id ? { ...candidate, position: tile.id, jailTurns: 0 } : candidate,
    ),
    log: appendLog(state, `Адмін переносить ${player.name} на ${tile.name}.`),
  };

  return resolveTile(moved, player.id, state.dice[0] + state.dice[1]);
};

const adminGrantUnoReverse = (state: GameState, playerId: string): GameState => {
  const player = getPlayer(state, playerId);
  if (player.isBankrupt) throw new Error('Банкруту не можна видати картку.');
  const alreadyHasCard = getUnoReverseCardCount(player) >= UNO_REVERSE_CARD_LIMIT;

  return {
    ...state,
    players: state.players.map((candidate) =>
      candidate.id === playerId ? { ...candidate, unoReverseCards: UNO_REVERSE_CARD_LIMIT } : candidate,
    ),
    log: appendLog(
      state,
      alreadyHasCard
        ? `${player.name} вже має картку УНО РЕВЕРС.`
        : `Адмін видає ${player.name} картку УНО РЕВЕРС.`,
      alreadyHasCard ? 'neutral' : 'good',
    ),
  };
};

const adminStartCityEvent = (state: GameState, cityEventId: CityEventId): GameState => {
  if (hasPendingTrade(state)) throw new Error('Спочатку завершіть активну угоду.');
  if (!['rolling', 'turnEnd', 'manage', 'trade'].includes(state.phase)) {
    throw new Error('Міську подію можна запустити, коли немає активного рішення гравця.');
  }

  const event = getCityEventDefinition(cityEventId);
  const drawn = drawCityEvent(
    {
      ...state,
      cityEventDeck: [event.id, ...(state.cityEventDeck ?? []).filter((candidate) => candidate !== event.id)],
    },
    { allowDouble: false },
  );
  return openTurnStartCasinoIfNeeded(drawn, drawn.currentPlayerId);
};

const payJailFine = (state: GameState, playerId: string): GameState => {
  assertCurrent(state, playerId);
  if (state.phase !== 'awaitingJailDecision' || state.pendingJail?.playerId !== playerId) {
    throw new Error('Зараз немає рішення щодо вʼязниці.');
  }

  const player = getPlayer(state, playerId);
  const fine = applyRoleFineDiscount(state, playerId, JAIL_FINE);
  const jailFine = fine.amount;
  if (player.money < jailFine) throw new Error('Недостатньо коштів для штрафу.');

  return {
    ...chargePlayer(fine.state, playerId, jailFine),
    phase: 'turnEnd',
    doublesInRow: 0,
    pendingJail: undefined,
    log: appendLog(state, `${player.name} сплачує ${jailFine}₴ і не йде у вʼязницю.`, 'bad'),
  };
};

const goToJailFromDecision = (state: GameState, playerId: string): GameState => {
  assertCurrent(state, playerId);
  if (state.phase !== 'awaitingJailDecision' || state.pendingJail?.playerId !== playerId) {
    throw new Error('Зараз немає рішення щодо вʼязниці.');
  }

  const player = getPlayer(state, playerId);
  return sendToJail(
    { ...state, pendingJail: undefined },
    playerId,
    `${player.name} вирушає у вʼязницю без винагороди за Старт.`,
  );
};

const startBankDeposit = (state: GameState, playerId: string): GameState => {
  assertCurrent(state, playerId);
  if (state.phase !== 'bankDeposit' || state.pendingBankDeposit?.playerId !== playerId) {
    throw new Error('Зараз немає рішення щодо банківського депозиту.');
  }
  const player = getPlayer(state, playerId);
  const pendingDeposit = state.pendingBankDeposit;
  if (!pendingDeposit || player.position !== pendingDeposit.tileId) throw new Error('Гравець уже не стоїть у банку для депозиту.');
  if (player.isBankrupt) throw new Error('Гравець вибув.');
  if ((state.bankDeposits ?? {})[playerId]) throw new Error('У гравця вже є активний депозит.');
  if (!isPlayerOnOwnBank(state, playerId)) throw new Error('Депозит можна зробити тільки у своєму банку.');

  const bankCount = ownedBankCount(state, playerId);
  if (bankCount < BANK_DEPOSIT_MIN_BANKS) throw new Error('Для депозиту потрібно мінімум 2 банки.');

  const amount = pendingDeposit.amount;
  if (amount <= 0) throw new Error('Немає доступної суми депозиту.');
  if (player.money < amount) throw new Error('Недостатньо грошей для депозиту.');

  return {
    ...state,
    phase: 'turnEnd',
    pendingBankDeposit: undefined,
    bankDeposits: {
      ...(state.bankDeposits ?? {}),
      [playerId]: {
        playerId,
        amount,
        turns: 0,
        createdAtTurn: state.turn,
        createdAtDiceRollId: state.diceRollId,
      },
    },
    players: state.players.map((candidate) =>
      candidate.id === playerId ? { ...candidate, money: candidate.money - amount } : candidate,
    ),
    log: appendLog(state, `${player.name} робить банківський депозит ${amount}₴.`, 'good'),
  };
};

const declineBankDeposit = (state: GameState, playerId: string): GameState => {
  assertCurrent(state, playerId);
  if (state.phase !== 'bankDeposit' || state.pendingBankDeposit?.playerId !== playerId) {
    throw new Error('Зараз немає рішення щодо банківського депозиту.');
  }
  const player = getPlayer(state, playerId);
  const tile = getTile(state.pendingBankDeposit.tileId);
  return {
    ...state,
    phase: 'turnEnd',
    pendingBankDeposit: undefined,
    log: appendLog(state, `${player.name} не робить депозит у ${tile.name}.`),
  };
};

const createDistrictPath = (state: GameState, playerId: string, group: string, path: DistrictPath): GameState => {
  assertCurrent(state, playerId);
  assertPropertyManagementPhase(state);
  const groupTiles = cityGroup(group);
  if (groupTiles.length === 0) throw new Error('Такої групи міст не існує.');
  if (!['tourist', 'oldTown', 'residential'].includes(path)) throw new Error('Невідомий тип району.');
  const player = getPlayer(state, playerId);
  if (player.jailTurns > 0) throw new Error('Гравець у в’язниці не може створювати район.');
  if (isBuildingBlockedByCityEvent(state)) throw new Error('Будівництво заборонене через подію міста.');
  if (!ownsFullGroup(state, playerId, group)) throw new Error('Потрібна повна група міст для створення району.');
  if (getDistrictPath(state, group)) throw new Error('Шлях району вже створено і його не можна змінити.');

  const cost = getDistrictCreationCost(state, group);
  if (player.money < cost) throw new Error('Недостатньо грошей для створення району.');

  return {
    ...state,
    districtPaths: {
      ...(state.districtPaths ?? {}),
      [group]: { ownerId: playerId, path, createdAtTurn: state.turn, creationCost: cost },
    },
    players: state.players.map((candidate) =>
      candidate.id === playerId ? { ...candidate, money: candidate.money - cost } : candidate,
    ),
    log: appendLog(state, `${player.name} створює "${districtPathLabel(path)}" у групі ${group} за ${cost}₴.`, 'good'),
  };
};

const buildOnCity = (state: GameState, playerId: string, tileId: number): GameState => {
  assertCurrent(state, playerId);
  assertPropertyManagementPhase(state);
  const tile = getTile(tileId);
  if (tile.type !== 'city') throw new Error('Будувати можна тільки в містах.');
  const property = state.properties[tileId];
  const player = getPlayer(state, playerId);
  if (player.jailTurns > 0) throw new Error('Гравець у вʼязниці не може будувати.');
  if (isBuildingBlockedByCityEvent(state)) throw new Error('Будівництво заборонене через подію міста.');
  if (property.ownerId !== playerId) throw new Error('Місто належить іншому гравцю.');
  if (isLoanCollateral(state, tileId)) throw new Error('Майно в заставі кредиту не можна змінювати.');
  if (!ownsFullGroup(state, playerId, tile.group)) throw new Error('Потрібна монополія групи.');
  const district = getDistrictPath(state, tile.group);
  if (!district || district.ownerId !== playerId) throw new Error('Спочатку створіть район для цієї групи.');
  if (!canBuildInDistrictThisRoll(state, playerId, tile.group, district.path)) {
    throw new Error('За один кидок можна побудувати лише один будинок.');
  }
  if (property.houses >= 5) throw new Error('Уже є готель.');
  const houseCost = getEffectiveHouseCost(state, tile);
  if (player.money < houseCost) throw new Error('Недостатньо грошей.');

  const groupTiles = cityGroup(tile.group);
  const minHouses = Math.min(...groupTiles.map((groupTile) => state.properties[groupTile.id].houses));
  if (property.houses > minHouses) throw new Error('Будувати треба рівномірно по групі.');

  return {
    ...state,
    phase: state.phase === 'rolling' ? 'rolling' : 'manage',
    properties: {
      ...state.properties,
      [tileId]: { ...property, houses: property.houses + 1 },
    },
    builtThisRoll: { playerId, diceRollId: state.diceRollId, tileId },
    buildsThisRoll: nextBuildsThisRoll(state, playerId, tile.group),
    players: state.players.map((candidate) =>
      candidate.id === playerId ? { ...candidate, money: candidate.money - houseCost } : candidate,
    ),
    log: appendLog(
      state,
      `${player.name} будує ${property.houses === 4 ? 'готель' : 'будинок'} у ${tile.name} за ${houseCost}₴.`,
      'good',
    ),
  };
};

const canBuildInDistrictThisRoll = (state: GameState, playerId: string, group: string, path: DistrictPath): boolean => {
  const tracker = state.buildsThisRoll;
  if (!tracker || tracker.playerId !== playerId || tracker.diceRollId !== state.diceRollId) return true;
  if (path !== 'residential') return false;
  return tracker.group === group && tracker.count < RESIDENTIAL_BUILD_LIMIT_PER_ROLL;
};

const nextBuildsThisRoll = (
  state: GameState,
  playerId: string,
  group: string,
): NonNullable<GameState['buildsThisRoll']> => {
  const tracker = state.buildsThisRoll;
  if (tracker?.playerId === playerId && tracker.diceRollId === state.diceRollId && tracker.group === group) {
    return { ...tracker, count: tracker.count + 1 };
  }
  return { playerId, diceRollId: state.diceRollId, group, count: 1 };
};

const sellBuilding = (state: GameState, playerId: string, tileId: number): GameState => {
  assertCurrent(state, playerId);
  assertEmergencyMoneyManagementPhase(state, playerId, 'Зносити будівлі можна до кидка або під час фінансового рішення.');
  const tile = getTile(tileId);
  if (tile.type !== 'city') throw new Error('Зносити будівлі можна тільки в містах.');
  const property = state.properties[tileId];
  const player = getPlayer(state, playerId);
  if (property.ownerId !== playerId) throw new Error('Місто належить іншому гравцю.');
  if (property.mortgaged) throw new Error('Заставлене місто не можна змінювати.');
  if (property.houses <= 0) throw new Error('У місті немає будівель.');

  const groupTiles = cityGroup(tile.group);
  const nextCounts = groupTiles.map((groupTile) =>
    groupTile.id === tileId ? property.houses - 1 : state.properties[groupTile.id].houses,
  );
  if (Math.max(...nextCounts) - Math.min(...nextCounts) > 1) {
    throw new Error('Зносити треба рівномірно по групі.');
  }

  const refund = getEffectiveBuildingRefund(state, tile);
  return {
    ...state,
    properties: {
      ...state.properties,
      [tileId]: { ...property, houses: property.houses - 1 },
    },
    players: state.players.map((candidate) =>
      candidate.id === playerId ? { ...candidate, money: candidate.money + refund } : candidate,
    ),
    log: appendLog(
      state,
      `${player.name} зносить ${property.houses === 5 ? 'готель' : 'будинок'} у ${tile.name} і отримує ${refund}₴.`,
    ),
  };
};

const mortgageProperty = (state: GameState, playerId: string, tileId: number): GameState => {
  assertCurrent(state, playerId);
  assertEmergencyMoneyManagementPhase(state, playerId, 'Заставляти майно можна до кидка або під час фінансового рішення.');
  const tile = getTile(tileId);
  if (!isPropertyTile(tile)) throw new Error('Це не майно.');
  const property = state.properties[tileId];
  if (property.ownerId !== playerId) throw new Error('Майно належить іншому гравцю.');
  if (property.houses > 0) throw new Error('Спочатку продайте будинки.');
  if (property.mortgaged) throw new Error('Майно вже заставлене.');
  if (isLoanCollateral(state, tileId)) throw new Error('Майно в заставі кредиту не можна заставити.');
  const mortgageValue = getEffectiveMortgageValue(state, tile);
  return {
    ...state,
    properties: {
      ...state.properties,
      [tileId]: {
        ...property,
        mortgaged: true,
        mortgagedAtTurn: state.turn,
        mortgageTurnsLeft: MORTGAGE_GRACE_TURNS,
      },
    },
    players: state.players.map((player) =>
      player.id === playerId ? { ...player, money: player.money + mortgageValue } : player,
    ),
    log: appendLog(state, `${getPlayer(state, playerId).name} заставляє ${tile.name} і отримує ${mortgageValue}₴.`),
  };
};

const unmortgageProperty = (state: GameState, playerId: string, tileId: number): GameState => {
  assertCurrent(state, playerId);
  assertPropertyManagementPhase(state);
  const tile = getTile(tileId);
  if (!isPropertyTile(tile)) throw new Error('Це не майно.');
  const property = state.properties[tileId];
  const cost = getEffectiveUnmortgageCost(state, tile);
  if (property.ownerId !== playerId) throw new Error('Майно належить іншому гравцю.');
  if (!property.mortgaged) throw new Error('Майно не заставлене.');
  if (getPlayer(state, playerId).money < cost) throw new Error('Недостатньо грошей.');
  return {
    ...state,
    properties: {
      ...state.properties,
      [tileId]: { ...property, mortgaged: false, mortgagedAtTurn: undefined, mortgageTurnsLeft: undefined },
    },
    players: state.players.map((player) =>
      player.id === playerId ? { ...player, money: player.money - cost } : player,
    ),
    log: appendLog(state, `${getPlayer(state, playerId).name} викуповує ${tile.name} за ${cost}₴.`),
  };
};

const proposeTrade = (state: GameState, offer: Omit<TradeOffer, 'id' | 'status'>): GameState => {
  const normalizedOffer = normalizeTradeOffer(offer);
  if (state.currentPlayerId !== normalizedOffer.fromPlayerId) {
    throw new Error('Створити угоду може тільки гравець, який зараз ходить.');
  }
  if (!['rolling', 'turnEnd', 'manage', 'trade'].includes(state.phase)) {
    throw new Error('Зараз не можна створити угоду.');
  }
  if (state.tradeOffers.some((candidate) => candidate.status === 'pending')) {
    throw new Error('Спочатку завершіть активну угоду.');
  }
  validateTradeOffer(state, normalizedOffer);
  const from = getPlayer(state, normalizedOffer.fromPlayerId);
  const to = getPlayer(state, normalizedOffer.toPlayerId);

  return {
    ...state,
    tradeOffers: [...state.tradeOffers, { ...normalizedOffer, id: crypto.randomUUID(), status: 'pending' }],
    log: appendLog(state, `${from.name} пропонує угоду ${to.name}: ${formatTradeOfferLog(normalizedOffer)}.`),
  };
};

const normalizeTradeOffer = (offer: Omit<TradeOffer, 'id' | 'status'>): Omit<TradeOffer, 'id' | 'status'> => ({
  ...offer,
  offerMoney: normalizeMoney(offer.offerMoney),
  requestMoney: normalizeMoney(offer.requestMoney),
  offerProperties: normalizePropertyIds(offer.offerProperties),
  requestProperties: normalizePropertyIds(offer.requestProperties),
  offerRentServices: normalizeRentServices(offer.offerRentServices ?? []),
  requestRentServices: normalizeRentServices(offer.requestRentServices ?? []),
});

const normalizeMoney = (amount: number): number => {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Сума угоди має бути невідʼємною.');
  }
  return Math.floor(amount);
};

const normalizePropertyIds = (tileIds: number[]): number[] =>
  tileIds.map((tileId) => {
    if (!Number.isInteger(tileId)) throw new Error('Некоректна картка майна.');
    return tileId;
  });

const normalizeRentServices = (services: RentServiceOffer[]): RentServiceOffer[] =>
  services.map((service) => {
    if (!Number.isInteger(service.tileId)) throw new Error('Некоректне поле послуги.');
    const turns = Math.floor(service.turns);
    if (!Number.isFinite(turns) || turns < 1 || turns > 3) {
      throw new Error('Послуга оренди може діяти від 1 до 3 ходів.');
    }
    if (service.discountPercent !== 50 && service.discountPercent !== 100) {
      throw new Error('Послуга оренди має бути 50% або 100%.');
    }
    return { tileId: service.tileId, turns, discountPercent: service.discountPercent };
  });

const validateTradeOffer = (state: GameState, offer: Omit<TradeOffer, 'id' | 'status'> | TradeOffer) => {
  normalizeMoney(offer.offerMoney);
  normalizeMoney(offer.requestMoney);
  normalizePropertyIds(offer.offerProperties);
  normalizePropertyIds(offer.requestProperties);
  const offerRentServices = normalizeRentServices(offer.offerRentServices ?? []);
  const requestRentServices = normalizeRentServices(offer.requestRentServices ?? []);

  const from = getPlayer(state, offer.fromPlayerId);
  const to = getPlayer(state, offer.toPlayerId);

  if (from.id === to.id) throw new Error('Не можна створити угоду самому собі.');
  if (from.isBankrupt || to.isBankrupt) throw new Error('Угоди доступні тільки активним гравцям.');
  if (from.money < offer.offerMoney) throw new Error('Автору угоди не вистачає грошей.');
  if (to.money < offer.requestMoney) throw new Error('Адресату угоди не вистачає грошей.');

  validateUniqueTradeProperties([...offer.offerProperties, ...offer.requestProperties]);
  validateTradeProperties(state, offer.offerProperties, from.id);
  validateTradeProperties(state, offer.requestProperties, to.id);
  validateTradeRentServices(state, offerRentServices, from.id, to.id, offer.offerProperties);
  validateTradeRentServices(state, requestRentServices, to.id, from.id, offer.requestProperties);
  validateTradeValueRange(state, {
    ...offer,
    offerRentServices,
    requestRentServices,
  });
};

const validateUniqueTradeProperties = (tileIds: number[]) => {
  const uniqueIds = new Set(tileIds);
  if (uniqueIds.size !== tileIds.length) throw new Error('Майно дублюється у пропозиції.');
};

const validateTradeProperties = (state: GameState, tileIds: number[], ownerId: string) => {
  tileIds.forEach((tileId) => {
    const tile = getTile(tileId);
    if (!isPropertyTile(tile)) throw new Error('Угода може містити тільки майно.');

    const property = state.properties[tileId];
    if (property.ownerId !== ownerId) throw new Error('Майно належить іншому гравцю.');
    if (property.houses > 0) throw new Error('Майно з будинками не можна додати до угоди.');
    if (isLoanCollateral(state, tileId)) throw new Error('Майно в заставі кредиту не можна додати до угоди.');
  });
};

const validateTradeRentServices = (
  state: GameState,
  services: RentServiceOffer[],
  ownerId: string,
  beneficiaryId: string,
  transferredTileIds: number[],
) => {
  const seen = new Set<number>();
  services.forEach((service) => {
    if (seen.has(service.tileId)) throw new Error('Послуга оренди дублюється.');
    seen.add(service.tileId);
    const tile = getTile(service.tileId);
    if (!isPropertyTile(tile)) throw new Error('Послугу оренди можна дати тільки на майно.');
    if (transferredTileIds.includes(service.tileId)) {
      throw new Error('Не можна одночасно передати майно і послугу на це саме поле.');
    }
    const property = state.properties[service.tileId];
    if (property.ownerId !== ownerId) throw new Error('Послугу оренди може дати тільки власник поля.');
    const cooldownKey = rentServiceCooldownKey(ownerId, beneficiaryId, service.tileId);
    const cooldownUntil = (state.rentServiceCooldowns ?? {})[cooldownKey] ?? 0;
    const hasActiveService = (state.rentServices ?? []).some(
      (candidate) =>
        candidate.ownerId === ownerId &&
        candidate.beneficiaryId === beneficiaryId &&
        candidate.tileId === service.tileId &&
        candidate.remainingTurns > 0,
    );
    if (hasActiveService || cooldownUntil > state.turn) {
      throw new Error(`Послуга на ${tile.name} ще перезаряджається.`);
    }
  });
};

const validateTradeValueRange = (state: GameState, offer: Omit<TradeOffer, 'id' | 'status'> | TradeOffer) => {
  const hasPricedProperty = offer.offerProperties.length > 0 || offer.requestProperties.length > 0;
  if (!hasPricedProperty) return;

  const offerValue = offer.offerMoney + tradePropertiesValue(offer.offerProperties);
  const requestValue = offer.requestMoney + tradePropertiesValue(offer.requestProperties);
  if (requestValue <= 0) {
    throw new Error('Обмін майном має мати цінність з обох сторін.');
  }

  if (offer.offerProperties.length > 0) {
    const saleMaximum = getTradePropertySaleLimit(state, offer.fromPlayerId, offerValue);
    if (requestValue > saleMaximum) {
      throw new Error(`Перепродаж майна занадто дорогий: максимум ${saleMaximum}₴.`);
    }
  }

  const maximum = Math.floor(requestValue * getTradeValueMultiplier(state, offer.fromPlayerId));
  if (offerValue > maximum) {
    throw new Error(`Пропозиція занадто велика: максимум ${maximum}₴ з урахуванням майна.`);
  }
};

export const getTradeValueMultiplier = (state: GameState, playerId: string): number =>
  getPlayer(state, playerId).roleId === 'realtor' ? REALTOR_TRADE_VALUE_MULTIPLIER : DEFAULT_TRADE_VALUE_MULTIPLIER;

export const getTradePropertySaleLimit = (state: GameState, playerId: string, propertyValue: number): number =>
  floorTradeMoney(propertyValue * getTradeValueMultiplier(state, playerId));

const floorTradeMoney = (amount: number): number =>
  Math.max(0, Math.floor(amount / TRADE_MONEY_INCREMENT) * TRADE_MONEY_INCREMENT);

const tradePropertiesValue = (tileIds: number[]): number =>
  tileIds.reduce((sum, tileId) => {
    const tile = getTile(tileId);
    return isPropertyTile(tile) ? sum + tile.price : sum;
  }, 0);

const acceptTrade = (state: GameState, playerId: string, offerId: string): GameState => {
  const offer = state.tradeOffers.find((candidate) => candidate.id === offerId);
  if (!offer || offer.status !== 'pending') throw new Error('Пропозиція не активна.');
  if (offer.toPlayerId !== playerId) throw new Error('Прийняти може тільки адресат.');

  validateTradeOffer(state, offer);

  let next = transfer(state, offer.fromPlayerId, offer.toPlayerId, offer.offerMoney);
  next = transfer(next, offer.toPlayerId, offer.fromPlayerId, offer.requestMoney);
  next = moveProperties(next, offer.fromPlayerId, offer.toPlayerId, offer.offerProperties);
  next = moveProperties(next, offer.toPlayerId, offer.fromPlayerId, offer.requestProperties);
  next = activateRentServices(next, offer.offerRentServices ?? [], offer.fromPlayerId, offer.toPlayerId);
  next = activateRentServices(next, offer.requestRentServices ?? [], offer.toPlayerId, offer.fromPlayerId);
  const from = getPlayer(state, offer.fromPlayerId);
  const to = getPlayer(state, offer.toPlayerId);
  const accepted: GameState = {
    ...next,
    phase: getTradeResolutionPhase(state),
    tradeOffers: next.tradeOffers.map((candidate) =>
      candidate.id === offerId ? { ...candidate, status: 'accepted' } : candidate,
    ),
    log: appendLog(next, `${to.name} приймає угоду ${from.name}: ${formatTradeOfferLog(offer)}.`, 'good'),
  };
  return recordRealtorTradeProfit(accepted, offer);
};

const recordRealtorTradeProfit = (state: GameState, offer: TradeOffer): GameState => {
  const offerValue = offer.offerMoney + tradePropertiesValue(offer.offerProperties);
  const requestValue = offer.requestMoney + tradePropertiesValue(offer.requestProperties);
  return state.players.reduce((next, player) => {
    if (player.roleId !== 'realtor') return next;
    const profit =
      player.id === offer.fromPlayerId
        ? Math.max(0, requestValue - offerValue)
        : player.id === offer.toPlayerId
          ? Math.max(0, offerValue - requestValue)
          : 0;
    if (profit <= 0) return next;
    return updatePlayerRoleState(next, player.id, (roleState) => ({
      ...roleState,
      realtorProfit: roleState.realtorProfit + profit,
    }));
  }, state);
};

const activateRentServices = (
  state: GameState,
  services: RentServiceOffer[],
  ownerId: string,
  beneficiaryId: string,
): GameState => {
  if (services.length === 0) return state;

  const activeServices = services.map((service) => ({
    ...service,
    id: crypto.randomUUID(),
    ownerId,
    beneficiaryId,
    remainingTurns: service.turns,
    duration: service.turns,
    cooldownUntilTurn: state.turn + service.turns * 2,
    createdAtTurn: state.turn,
  }));
  const cooldowns = Object.fromEntries(
    activeServices.map((service) => [
      rentServiceCooldownKey(ownerId, beneficiaryId, service.tileId),
      service.cooldownUntilTurn,
    ]),
  );

  return {
    ...state,
    rentServices: [...(state.rentServices ?? []), ...activeServices],
    rentServiceCooldowns: { ...(state.rentServiceCooldowns ?? {}), ...cooldowns },
  };
};

const updateTradeStatus = (
  state: GameState,
  playerId: string,
  offerId: string,
  status: TradeOffer['status'],
): GameState => {
  const offer = state.tradeOffers.find((candidate) => candidate.id === offerId);
  if (!offer || offer.toPlayerId !== playerId) throw new Error('Немає прав змінити пропозицію.');
  if (offer.status !== 'pending') throw new Error('Пропозиція вже завершена.');
  const from = getPlayer(state, offer.fromPlayerId);
  const to = getPlayer(state, offer.toPlayerId);
  return {
    ...state,
    phase: getTradeResolutionPhase(state),
    tradeOffers: state.tradeOffers.map((candidate) => (candidate.id === offerId ? { ...candidate, status } : candidate)),
    log: appendLog(state, `${to.name} відхиляє угоду ${from.name}: ${formatTradeOfferLog(offer)}.`),
  };
};

const getTradeResolutionPhase = (state: GameState): GameState['phase'] => (state.phase === 'trade' ? 'manage' : state.phase);

const proposeLoan = (state: GameState, offer: Omit<LoanOffer, 'id' | 'status' | 'createdAtTurn'>): GameState => {
  const proposerId = offer.proposerId ?? state.currentPlayerId;
  if (state.currentPlayerId !== proposerId || (proposerId !== offer.lenderId && proposerId !== offer.borrowerId)) {
    throw new Error('Кредит може запропонувати тільки учасник контракту, який зараз ходить.');
  }
  if (!canManageLoansInPhase(state, proposerId)) throw new Error('Зараз не можна створити кредит.');
  const normalized = normalizeLoanOffer(offer);
  validateLoanOffer(state, normalized);
  const lender = getPlayer(state, normalized.lenderId);
  const borrower = getPlayer(state, normalized.borrowerId);
  const proposer = getPlayer(state, proposerId);
  const isLoanRequest = proposerId === borrower.id;

  return {
    ...state,
    loanOffers: [
      ...(state.loanOffers ?? []),
      { ...normalized, proposerId, id: crypto.randomUUID(), status: 'pending', createdAtTurn: state.turn },
    ],
    log: appendLog(
      state,
      isLoanRequest
        ? `${proposer.name} просить кредит у ${lender.name}: ${normalized.principal}₴, повернення ${normalized.totalRepayment}₴ за ${normalized.durationTurns} ходів.`
        : `${lender.name} пропонує кредит ${borrower.name}: ${normalized.principal}₴, повернення ${normalized.totalRepayment}₴ за ${normalized.durationTurns} ходів.`,
    ),
  };
};

const acceptLoan = (state: GameState, playerId: string, offerId: string): GameState => {
  const offer = (state.loanOffers ?? []).find((candidate) => candidate.id === offerId);
  if (!offer || offer.status !== 'pending') throw new Error('Кредитна пропозиція не активна.');
  if (getLoanOfferResponderId(offer) !== playerId) throw new Error('Прийняти кредит може тільки адресат пропозиції.');
  const normalized = normalizeLoanOffer(offer);
  validateLoanOffer(state, normalized);

  const lender = getPlayer(state, offer.lenderId);
  const borrower = getPlayer(state, offer.borrowerId);
  const loan = createActiveLoanFromOffer(state, normalized);
  return {
    ...transfer(state, offer.lenderId, offer.borrowerId, offer.principal),
    loanOffers: (state.loanOffers ?? []).map((candidate) =>
      candidate.id === offerId ? { ...candidate, status: 'accepted' } : candidate,
    ),
    loans: [...(state.loans ?? []), loan],
    log: appendLog(
      state,
      `${borrower.name} приймає кредит від ${lender.name}: ${offer.principal}₴, повернення ${offer.totalRepayment}₴.`,
      'good',
    ),
  };
};

const updateLoanOfferStatus = (
  state: GameState,
  playerId: string,
  offerId: string,
  status: LoanOffer['status'],
): GameState => {
  const offer = (state.loanOffers ?? []).find((candidate) => candidate.id === offerId);
  if (!offer || offer.status !== 'pending') throw new Error('Кредитна пропозиція не активна.');
  if (offer.borrowerId !== playerId && offer.lenderId !== playerId) throw new Error('Немає прав змінити кредитну пропозицію.');
  const actor = getPlayer(state, playerId);
  return {
    ...state,
    loanOffers: (state.loanOffers ?? []).map((candidate) => (candidate.id === offerId ? { ...candidate, status } : candidate)),
    log: appendLog(state, `${actor.name} відхиляє кредитну пропозицію.`),
  };
};

const takeBankLoan = (state: GameState, playerId: string, amount: number): GameState => {
  assertLoanManagementPhase(state, playerId);
  const player = getPlayer(state, playerId);
  if (player.isBankrupt) throw new Error('Банкрут не може взяти кредит.');
  if ((state.loans ?? []).some((loan) => loan.kind === 'bank' && loan.borrowerId === playerId)) {
    throw new Error('У гравця вже є активний банківський кредит.');
  }
  const principal = normalizeMoney(amount);
  if (principal < BANK_LOAN_MIN_AMOUNT || principal > BANK_LOAN_MAX_AMOUNT) {
    throw new Error(`Банківський кредит має бути від ${BANK_LOAN_MIN_AMOUNT}₴ до ${BANK_LOAN_MAX_AMOUNT}₴.`);
  }
  const cap = getBankLoanLimit(state, playerId);
  if (principal > cap) throw new Error(`Банк може видати максимум ${cap}₴ цьому гравцю.`);
  const totalRepayment = getBankLoanRepaymentAmount(principal);
  const loan: ActiveLoan = {
    id: crypto.randomUUID(),
    kind: 'bank',
    borrowerId: playerId,
    principal,
    totalRepayment,
    remainingDue: totalRepayment,
    installmentAmount: ceilMoney(totalRepayment / BANK_LOAN_DURATION),
    remainingTurns: BANK_LOAN_DURATION,
    deferredDue: 0,
    deferredTurns: 0,
    missedPayments: 0,
    collateralTileIds: [],
    createdAtTurn: state.turn,
  };

  return {
    ...state,
    loans: [...(state.loans ?? []), loan],
    players: state.players.map((candidate) =>
      candidate.id === playerId ? { ...candidate, money: candidate.money + principal } : candidate,
    ),
    log: appendLog(state, `${player.name} бере кредит у банку ${principal}₴. Повернути треба ${totalRepayment}₴.`, 'good'),
  };
};

const normalizeLoanOffer = (
  offer: Omit<LoanOffer, 'id' | 'status' | 'createdAtTurn'> | LoanOffer,
): Omit<LoanOffer, 'id' | 'status' | 'createdAtTurn'> => ({
  lenderId: offer.lenderId,
  borrowerId: offer.borrowerId,
  proposerId: offer.proposerId,
  principal: normalizeMoney(offer.principal),
  totalRepayment: normalizeMoney(offer.totalRepayment),
  durationTurns: Math.floor(offer.durationTurns),
  collateralTileIds: normalizePropertyIds(offer.collateralTileIds ?? []),
});

const getLoanOfferResponderId = (offer: Pick<LoanOffer, 'lenderId' | 'borrowerId' | 'proposerId'>): string =>
  (offer.proposerId ?? offer.lenderId) === offer.borrowerId ? offer.lenderId : offer.borrowerId;

const validateLoanOffer = (state: GameState, offer: Omit<LoanOffer, 'id' | 'status' | 'createdAtTurn'> | LoanOffer) => {
  const lender = getPlayer(state, offer.lenderId);
  const borrower = getPlayer(state, offer.borrowerId);
  if (lender.id === borrower.id) throw new Error('Не можна видати кредит самому собі.');
  if (lender.isBankrupt || borrower.isBankrupt) throw new Error('Кредити доступні тільки активним гравцям.');
  if (offer.principal < PLAYER_LOAN_MIN_PRINCIPAL || offer.principal > PLAYER_LOAN_MAX_PRINCIPAL) {
    throw new Error(`Кредит між гравцями має бути від ${PLAYER_LOAN_MIN_PRINCIPAL}₴ до ${PLAYER_LOAN_MAX_PRINCIPAL}₴.`);
  }
  if (offer.durationTurns < PLAYER_LOAN_MIN_DURATION || offer.durationTurns > PLAYER_LOAN_MAX_DURATION) {
    throw new Error(`Строк кредиту має бути від ${PLAYER_LOAN_MIN_DURATION} до ${PLAYER_LOAN_MAX_DURATION} ходів.`);
  }
  if (offer.totalRepayment < offer.principal || offer.totalRepayment > Math.floor(offer.principal * PLAYER_LOAN_MAX_REPAYMENT_MULTIPLIER)) {
    throw new Error('Повернення має бути від 100% до 180% суми кредиту.');
  }
  if (lender.money < offer.principal) throw new Error('Кредитору не вистачає грошей.');
  const activeBorrowedLoans = (state.loans ?? []).filter((loan) => loan.kind === 'player' && loan.borrowerId === borrower.id);
  if (activeBorrowedLoans.length >= PLAYER_LOAN_MAX_ACTIVE_AS_BORROWER) {
    throw new Error(`Позичальник уже має ${PLAYER_LOAN_MAX_ACTIVE_AS_BORROWER} активні кредити від гравців.`);
  }
  validateLoanCollateral(state, borrower.id, offer.collateralTileIds ?? [], offer.totalRepayment);
};

const validateLoanCollateral = (state: GameState, borrowerId: string, tileIds: number[], totalRepayment: number) => {
  validateUniqueTradeProperties(tileIds);
  const lockedCollateral = getCollateralTileIdSet(state);
  const collateralValue = tileIds.reduce((sum, tileId) => {
    const tile = getTile(tileId);
    if (!isPropertyTile(tile)) throw new Error('Заставою може бути тільки майно.');
    const property = state.properties[tileId];
    if (property.ownerId !== borrowerId) throw new Error('Застава має належати позичальнику.');
    if (property.mortgaged) throw new Error('Заставлене майно не можна додати як заставу кредиту.');
    if (tile.type === 'city' && property.houses > 0) throw new Error('Місто з будинками не можна додати як заставу кредиту.');
    if (lockedCollateral.has(tileId)) throw new Error('Це майно вже використано як застава кредиту.');
    return sum + getEffectiveMortgageValue(state, tile);
  }, 0);
  if (collateralValue > Math.floor(totalRepayment * PLAYER_LOAN_MAX_COLLATERAL_MULTIPLIER)) {
    throw new Error('Застава занадто велика для цього кредиту.');
  }
};

const createActiveLoanFromOffer = (
  state: GameState,
  offer: Omit<LoanOffer, 'id' | 'status' | 'createdAtTurn'>,
): ActiveLoan => ({
  id: crypto.randomUUID(),
  kind: 'player',
  lenderId: offer.lenderId,
  borrowerId: offer.borrowerId,
  principal: offer.principal,
  totalRepayment: offer.totalRepayment,
  remainingDue: offer.totalRepayment,
  installmentAmount: ceilMoney(offer.totalRepayment / offer.durationTurns),
  remainingTurns: offer.durationTurns,
  deferredDue: 0,
  deferredTurns: 0,
  missedPayments: 0,
  collateralTileIds: offer.collateralTileIds,
  createdAtTurn: state.turn,
});

export const getBankLoanLimit = (state: GameState, playerId: string): number => {
  const player = getPlayer(state, playerId);
  if (player.isBankrupt) return 0;
  return Math.min(BANK_LOAN_MAX_AMOUNT, Math.floor(Math.max(0, calculatePlayerWorth(state, player)) * BANK_LOAN_WORTH_MULTIPLIER));
};

const createLoanPaymentIfDue = (state: GameState, playerId: string): GameState => {
  if (state.phase !== 'rolling') return state;
  const dueLoans = sortLoansForPayment((state.loans ?? []).filter((loan) => loan.borrowerId === playerId));
  if (dueLoans.length === 0) return state;
  const loanPayments = dueLoans.map((loan) => ({ loanId: loan.id, amount: getLoanInstallmentDue(loan) })).filter((payment) => payment.amount > 0);
  if (loanPayments.length === 0) return state;
  return createNextLoanPaymentFromQueue(state, playerId, loanPayments);
};

const createNextLoanPaymentFromQueue = (
  state: GameState,
  playerId: string,
  queue: Array<{ loanId: string; amount: number }>,
): GameState => {
  const [nextPayment, ...remainingQueue] = queue.filter((payment) => payment.amount > 0);
  if (!nextPayment) {
    return openTurnStartCasinoIfNeeded({ ...state, phase: 'rolling', pendingPayment: undefined }, playerId);
  }
  const loan = (state.loans ?? []).find((candidate) => candidate.id === nextPayment.loanId);
  if (!loan || loan.borrowerId !== playerId || loan.remainingDue <= 0) {
    return createNextLoanPaymentFromQueue(state, playerId, remainingQueue);
  }
  const amount = Math.min(nextPayment.amount, loan.remainingDue);
  const recipients = loan.kind === 'player' && loan.lenderId ? [{ playerId: loan.lenderId, amount }] : [];

  return createPendingPayment(state, {
    payerId: playerId,
    amount,
    reason: getLoanPaymentReason(state, loan),
    source: 'loan',
    recipients: mergeRecipients(recipients),
    loanPayments: [{ loanId: nextPayment.loanId, amount }],
    loanPaymentQueue: remainingQueue,
  });
};

const sortLoansForPayment = (loans: ActiveLoan[]): ActiveLoan[] =>
  [...loans].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'bank' ? -1 : 1;
    return left.createdAtTurn - right.createdAtTurn || left.id.localeCompare(right.id);
  });

const getLoanPaymentReason = (state: GameState, loan: ActiveLoan): string => {
  if (loan.kind === 'bank') return 'виплата за банківським кредитом';
  const lender = loan.lenderId ? state.players.find((player) => player.id === loan.lenderId) : undefined;
  return `виплата за кредитом від ${lender?.name ?? 'гравця'}`;
};

const getLoanInstallmentDue = (loan: ActiveLoan): number => {
  if (loan.remainingDue <= 0) return 0;
  const deferredDue = loan.deferredDue ?? 0;
  const scheduledDebt = Math.max(0, loan.remainingDue - deferredDue);
  const scheduledDue =
    getLoanEffectiveRemainingTurns(loan) <= 1 ? scheduledDebt : Math.min(scheduledDebt, loan.installmentAmount);
  return Math.min(loan.remainingDue, deferredDue + scheduledDue);
};

const getLoanEffectiveRemainingTurns = (loan: ActiveLoan): number =>
  Math.max(1, loan.remainingTurns - (loan.deferredTurns ?? 0));

interface BankDepositPaymentFunding {
  state: GameState;
  depositUsed: number;
  cashAmount: number;
  depositBefore: number;
  depositAfter: number;
}

const prepareBankDepositPayment = (
  state: GameState,
  playerId: string,
  amount: number,
  useBankDeposit = false,
): BankDepositPaymentFunding => {
  const normalizedAmount = Math.max(0, Math.floor(amount));
  if (!useBankDeposit) {
    return {
      state,
      depositUsed: 0,
      cashAmount: normalizedAmount,
      depositBefore: getBankDepositPayout((state.bankDeposits ?? {})[playerId]),
      depositAfter: getBankDepositPayout((state.bankDeposits ?? {})[playerId]),
    };
  }

  const deposit = (state.bankDeposits ?? {})[playerId];
  const depositBefore = getBankDepositPayout(deposit);
  if (!deposit || depositBefore <= 0) throw new Error('У гравця немає активного депозиту.');

  const depositUsed = Math.min(normalizedAmount, depositBefore);
  const depositAfter = Math.max(0, depositBefore - depositUsed);
  const bankDeposits = { ...(state.bankDeposits ?? {}) };
  if (depositAfter > 0) {
    bankDeposits[playerId] = {
      ...deposit,
      amount: depositAfter,
      turns: 0,
      steps: undefined,
      createdAtTurn: state.turn,
      createdAtDiceRollId: state.diceRollId,
    };
  } else {
    delete bankDeposits[playerId];
  }

  return {
    state: { ...state, bankDeposits },
    depositUsed,
    cashAmount: normalizedAmount - depositUsed,
    depositBefore,
    depositAfter,
  };
};

const formatBankDepositPaymentSuffix = (funding: Pick<BankDepositPaymentFunding, 'depositUsed' | 'cashAmount'>): string => {
  if (funding.depositUsed <= 0) return '';
  return funding.cashAmount > 0
    ? ` (${funding.depositUsed}₴ з депозиту, ${funding.cashAmount}₴ з балансу)`
    : ` (${funding.depositUsed}₴ з депозиту)`;
};

const splitPartialAmounts = <T extends { amount: number }>(
  entries: T[] | undefined,
  paidAmount: number,
): { paid: T[]; remaining: T[] } => {
  let remainingPaid = Math.max(0, paidAmount);
  const paid: T[] = [];
  const remaining: T[] = [];

  (entries ?? []).forEach((entry) => {
    if (entry.amount <= 0) return;
    const entryPaid = Math.min(entry.amount, remainingPaid);
    remainingPaid -= entryPaid;
    if (entryPaid > 0) paid.push({ ...entry, amount: entryPaid });
    const entryRemaining = entry.amount - entryPaid;
    if (entryRemaining > 0) remaining.push({ ...entry, amount: entryRemaining });
  });

  return { paid, remaining };
};

const applyPartialLoanPayment = (
  loans: ActiveLoan[],
  paidLoanPayments: Array<{ loanId: string; amount: number }>,
): ActiveLoan[] => {
  const paidByLoanId = new Map(paidLoanPayments.map((loanPayment) => [loanPayment.loanId, loanPayment.amount]));
  return loans
    .map((loan) => {
      const paid = paidByLoanId.get(loan.id) ?? 0;
      return paid > 0 ? { ...loan, remainingDue: Math.max(0, loan.remainingDue - paid) } : loan;
    })
    .filter((loan) => loan.remainingDue > 0);
};

const payLoanInstallmentPayment = (
  state: GameState,
  playerId: string,
  payment: NonNullable<GameState['pendingPayment']>,
  funding: Pick<BankDepositPaymentFunding, 'depositUsed' | 'cashAmount'> = { depositUsed: 0, cashAmount: payment.amount },
): GameState => {
  const recipientAmounts = new Map((payment.recipients ?? []).map((recipient) => [recipient.playerId, recipient.amount]));
  const paidLoans = new Map((payment.loanPayments ?? []).map((loanPayment) => [loanPayment.loanId, loanPayment.amount]));
  const remainingLoans = (state.loans ?? [])
    .map((loan) => {
      const paid = paidLoans.get(loan.id) ?? 0;
      if (paid <= 0) return loan;
      const remainingDue = Math.max(0, loan.remainingDue - paid);
      return {
        ...loan,
        remainingDue,
        remainingTurns: Math.max(0, loan.remainingTurns - 1 - (loan.deferredTurns ?? 0)),
        deferredDue: 0,
        deferredTurns: 0,
      };
    })
    .filter((loan) => loan.remainingDue > 0);

  const paid: GameState = {
    ...state,
    phase: 'rolling',
    pendingPayment: undefined,
    loans: remainingLoans,
    players: state.players.map((player) => {
      if (player.id === playerId) return { ...player, money: player.money - funding.cashAmount };
      const received = recipientAmounts.get(player.id) ?? 0;
      return received > 0 ? { ...player, money: player.money + received } : player;
    }),
    log: appendLog(
      state,
      `${getPlayer(state, playerId).name} сплачує ${payment.amount}₴ за кредитом${formatBankDepositPaymentSuffix(funding)}.`,
      'bad',
    ),
  };

  return createNextLoanPaymentFromQueue(paid, playerId, payment.loanPaymentQueue ?? []);
};

const missLoanPayment = (state: GameState, playerId: string): GameState => {
  assertCurrent(state, playerId);
  const payment = state.pendingPayment;
  if (state.phase !== 'payment' || payment?.source !== 'loan' || payment.payerId !== playerId || !payment.loanPayments?.length) {
    throw new Error('Зараз немає кредитного платежу до пропуску.');
  }
  const dueById = new Map(payment.loanPayments.map((loanPayment) => [loanPayment.loanId, loanPayment.amount]));
  const blockingLoan = (state.loans ?? []).find((loan) => dueById.has(loan.id) && !canMissLoanPaymentAgain(loan));
  if (blockingLoan) throw new Error('Цей кредит треба сплатити або здатися.');

  let next: GameState = { ...state, pendingPayment: undefined, phase: 'rolling' };
  const updatedLoans = (state.loans ?? []).map((loan) => {
    const missedAmount = dueById.get(loan.id);
    if (!missedAmount) return loan;
    const lateFee = ceilMoney(missedAmount * (loan.kind === 'bank' ? BANK_LOAN_LATE_FEE : PLAYER_LOAN_LATE_FEE));
    return {
      ...loan,
      missedPayments: loan.missedPayments + 1,
      remainingDue: loan.remainingDue + lateFee,
      deferredDue: (loan.deferredDue ?? 0) + missedAmount + lateFee,
      deferredTurns: (loan.deferredTurns ?? 0) + 1,
    };
  });
  next = {
    ...next,
    loans: updatedLoans,
    log: appendLog(next, `${getPlayer(state, playerId).name} пропускає виплату за кредитом. Наступна виплата стане дорожчою.`, 'bad'),
  };

  return createNextLoanPaymentFromQueue(next, playerId, payment.loanPaymentQueue ?? []);
};

const canMissLoanPaymentAgain = (loan: ActiveLoan): boolean =>
  loan.kind === 'player' ? getLoanEffectiveRemainingTurns(loan) > 1 : loan.missedPayments === 0;

const payRent = (state: GameState, playerId: string, options: { useBankDeposit?: boolean } = {}): GameState => {
  assertCurrent(state, playerId);
  const pendingRent = state.pendingRent;
  if (state.phase !== 'rent' || !pendingRent || pendingRent.payerId !== playerId) {
    throw new Error('Зараз немає оренди до сплати.');
  }

  const payer = getPlayer(state, playerId);
  const owner = getPlayer(state, pendingRent.ownerId);
  const tile = getTile(pendingRent.tileId);
  const funding = prepareBankDepositPayment(state, playerId, pendingRent.amount, options.useBankDeposit);
  if (options.useBankDeposit && funding.cashAmount > 0) {
    const splitRecipients = splitPartialAmounts(getPendingRentPaymentEntries(pendingRent), funding.depositUsed);
    const recipientAmounts = sumRecipientAmounts(splitRecipients.paid);
    const remainingRent = getPendingRentAfterPartialPayment(pendingRent, funding.cashAmount, splitRecipients.remaining);
    const mayorPaid = sumMayorRentEntries(splitRecipients.paid);
    return addMayorEventIncome(
      {
      ...funding.state,
      phase: 'rent',
      pendingRent: remainingRent,
      players: funding.state.players.map((player) => {
        const received = recipientAmounts.get(player.id) ?? 0;
        return received > 0 ? { ...player, money: player.money + received } : player;
      }),
      log: appendLog(
        state,
        `${payer.name} покриває ${funding.depositUsed}₴ оренди з депозиту за ${tile.name}. Залишилось сплатити ${funding.cashAmount}₴ гравцю ${owner.name}.`,
        'bad',
      ),
      },
      pendingRent.mayorEventIncome?.playerId,
      mayorPaid,
    );
  }
  if (payer.money < funding.cashAmount) throw new Error('Недостатньо грошей для сплати оренди.');

  const rentRecipientEntries = getPendingRentPaymentEntries(pendingRent);
  const recipientAmounts = sumRecipientAmounts(rentRecipientEntries);
  const mayorPaid = sumMayorRentEntries(rentRecipientEntries);
  const mayorRentNote = pendingRent.mayorEventIncome
    ? ` База власнику: ${pendingRent.ownerAmount ?? pendingRent.amount - pendingRent.mayorEventIncome.amount}₴, націнка Меру: ${pendingRent.mayorEventIncome.amount}₴.`
    : '';
  const paid: GameState = {
    ...funding.state,
    players: funding.state.players.map((player) => {
      const paidAmount = player.id === playerId ? funding.cashAmount : 0;
      const received = recipientAmounts.get(player.id) ?? 0;
      return paidAmount > 0 || received > 0 ? { ...player, money: player.money - paidAmount + received } : player;
    }),
    currentPlayerId: pendingRent.unoReverse?.originalTurnPlayerId ?? state.currentPlayerId,
    phase: 'turnEnd',
    pendingRent: undefined,
    log: appendLog(
      state,
      pendingRent.unoReverse
        ? `${payer.name} сплачує ${pendingRent.amount}₴ після УНО РЕВЕРС гравцю ${owner.name} за ${tile.name}${formatBankDepositPaymentSuffix(funding)}.${mayorRentNote}`
        : pendingRent.originalAmount
          ? `${payer.name} сплачує ${pendingRent.amount}₴ замість ${pendingRent.originalAmount}₴ оренди гравцю ${owner.name} за ${tile.name}${formatBankDepositPaymentSuffix(funding)}.${mayorRentNote}`
        : `${payer.name} сплачує ${pendingRent.amount}₴ оренди гравцю ${owner.name} за ${tile.name}${formatBankDepositPaymentSuffix(funding)}.${mayorRentNote}`,
      'bad',
    ),
  };
  return addMayorEventIncome(paid, pendingRent.mayorEventIncome?.playerId, mayorPaid);
};

const useLawyerRentProtection = (state: GameState, playerId: string): GameState => {
  assertCurrent(state, playerId);
  const pendingRent = state.pendingRent;
  if (state.phase !== 'rent' || !pendingRent || pendingRent.payerId !== playerId) {
    throw new Error('Зараз немає оренди для захисту Юриста.');
  }
  if (pendingRent.lawyerProtected) throw new Error('Захист Юриста вже застосовано до цієї оренди.');

  const charged = useLawyerProtectionCharge(state, playerId);
  const protectedAmount = ceilMoney(pendingRent.amount * (1 - LAWYER_RENT_DISCOUNT));
  const saved = Math.max(0, pendingRent.amount - protectedAmount);
  const next = addRoleSavings(charged, playerId, saved);
  const protectedSplit = getProtectedPendingRentSplit(pendingRent, protectedAmount);
  const payer = getPlayer(state, playerId);
  return {
    ...next,
    pendingRent: {
      ...pendingRent,
      amount: protectedAmount,
      ownerAmount: protectedSplit.ownerAmount,
      mayorEventIncome: protectedSplit.mayorEventIncome,
      originalAmount: pendingRent.originalAmount ?? pendingRent.amount,
      lawyerProtected: true,
    },
    log: appendLog(state, `${payer.name} застосовує захист Юриста: оренду зменшено на ${saved}₴.`, 'good'),
  };
};

const useLawyerPaymentProtection = (state: GameState, playerId: string): GameState => {
  assertCurrent(state, playerId);
  const payment = state.pendingPayment;
  if (state.phase !== 'payment' || !payment || payment.payerId !== playerId) {
    throw new Error('Зараз немає платежу для захисту Юриста.');
  }

  const charged = useLawyerProtectionCharge(state, playerId);
  const payer = getPlayer(state, playerId);
  if (payment.source === 'loan' && payment.loanPayments?.length) {
    if (!canLawyerProtectLoanPayment(state.loans ?? [], payment.loanPayments)) {
      throw new Error('Захист Юриста можна використати тільки для банківського кредиту.');
    }
    const loanProtection = applyLawyerLoanProtection(charged.loans ?? [], payment.loanPayments);
    const next = addRoleSavings({ ...charged, loans: loanProtection.loans }, playerId, loanProtection.saved);
    const protectedLoanState: GameState = {
      ...next,
      phase: 'rolling',
      pendingPayment: undefined,
      loans: loanProtection.loans,
      log: appendLog(
        state,
        `${payer.name} скасовує платіж банківського кредиту ${payment.amount}₴ через захист Юриста.`,
        'good',
      ),
    };
    return createNextLoanPaymentFromQueue(protectedLoanState, playerId, payment.loanPaymentQueue ?? []);
  }
  const next = addRoleSavings(charged, playerId, payment.amount);
  const protectedState: GameState = {
    ...next,
    phase: 'turnEnd',
    pendingPayment: undefined,
    log: appendLog(state, `${payer.name} скасовує платіж ${payment.amount}₴ через захист Юриста: ${payment.reason}.`, 'good'),
  };
  if (payment.afterPayment?.type === 'resolveTile') {
    return resolveTile(protectedState, payment.afterPayment.playerId, payment.afterPayment.diceTotal ?? 0);
  }
  if (payment.afterPayment?.type === 'resumeRolling') {
    return openTurnStartCasinoIfNeeded({ ...protectedState, phase: 'rolling' }, payment.afterPayment.playerId);
  }
  return protectedState;
};

const canLawyerProtectLoanPayment = (
  loans: ActiveLoan[],
  loanPayments: NonNullable<PendingPayment['loanPayments']>,
): boolean => {
  if (loanPayments.length === 0) return false;
  const loanById = new Map(loans.map((loan) => [loan.id, loan]));
  return loanPayments.every((loanPayment) => loanById.get(loanPayment.loanId)?.kind === 'bank');
};

const applyLawyerLoanProtection = (
  loans: ActiveLoan[],
  loanPayments: NonNullable<PendingPayment['loanPayments']>,
): { loans: ActiveLoan[]; saved: number } => {
  const dueById = new Map(loanPayments.map((loanPayment) => [loanPayment.loanId, loanPayment.amount]));
  let saved = 0;
  const protectedLoans = loans
    .map((loan) => {
      const due = dueById.get(loan.id) ?? 0;
      if (due <= 0) return loan;
      saved += due;
      return {
        ...loan,
        remainingDue: Math.max(0, loan.remainingDue - due),
        remainingTurns: Math.max(0, loan.remainingTurns - 1 - (loan.deferredTurns ?? 0)),
        deferredDue: 0,
        deferredTurns: 0,
      };
    })
    .filter((loan): loan is ActiveLoan => loan !== undefined && loan.remainingDue > 0);

  return { loans: protectedLoans, saved };
};

const useUnoReverse = (state: GameState, playerId: string): GameState => {
  assertCurrent(state, playerId);
  const pendingRent = state.pendingRent;
  if (state.phase !== 'rent' || !pendingRent || pendingRent.payerId !== playerId) {
    throw new Error('УНО РЕВЕРС можна використати лише під час власного рішення щодо оренди.');
  }

  const player = getPlayer(state, playerId);
  if (getUnoReverseCardCount(player) <= 0) throw new Error('У гравця немає картки УНО РЕВЕРС.');

  const target = getPlayer(state, pendingRent.ownerId);
  if (target.isBankrupt) throw new Error('УНО РЕВЕРС не можна спрямувати на гравця, який уже вибув.');

  const now = Date.now();
  const sequence = (pendingRent.unoReverse?.sequence ?? 0) + 1;
  const originalTurnPlayerId = pendingRent.unoReverse?.originalTurnPlayerId ?? playerId;

  return {
    ...state,
    currentPlayerId: target.id,
    pendingRent: {
      payerId: target.id,
      ownerId: playerId,
      tileId: pendingRent.tileId,
      amount: pendingRent.amount,
      ownerAmount: pendingRent.ownerAmount,
      mayorEventIncome: pendingRent.mayorEventIncome,
      originalAmount: pendingRent.originalAmount,
      rentServiceId: pendingRent.rentServiceId,
      discountPercent: pendingRent.discountPercent,
      lawyerProtected: pendingRent.lawyerProtected,
      unoReverse: {
        originalTurnPlayerId,
        eventId: `${state.id}:${state.turn}:${sequence}:${playerId}:${target.id}:${now}`,
        fromPlayerId: playerId,
        toPlayerId: target.id,
        usedAt: now,
        sequence,
      },
    },
    players: state.players.map((candidate) =>
      candidate.id === playerId
        ? { ...candidate, unoReverseCards: Math.max(0, getUnoReverseCardCount(candidate) - 1) }
        : candidate,
    ),
    log: appendLog(
      state,
      `${player.name} використовує УНО РЕВЕРС: тепер ${target.name} має сплатити ${pendingRent.amount}₴ гравцю ${player.name}.`,
      'good',
    ),
  };
};

const useLoanPayoffCard = (state: GameState, playerId: string, loanId: string): GameState => {
  assertLoanManagementPhase(state, playerId);
  const player = getPlayer(state, playerId);
  if (getLoanPayoffCardCount(player) <= 0) throw new Error('У гравця немає картки погашення кредиту.');
  const loan = (state.loans ?? []).find((candidate) => candidate.id === loanId);
  if (!loan || loan.borrowerId !== playerId) throw new Error('Можна погасити лише власний активний кредит.');

  const lender = loan.kind === 'player' && loan.lenderId ? getPlayer(state, loan.lenderId) : undefined;
  const isCurrentLoanPayment =
    state.phase === 'payment' &&
    state.pendingPayment?.source === 'loan' &&
    state.pendingPayment.payerId === playerId &&
    Boolean(state.pendingPayment.loanPayments?.some((loanPayment) => loanPayment.loanId === loanId));
  const filteredPendingPayment = filterLoanOutOfPendingPayment(state.pendingPayment, loanId);
  const nextLoanQueue = isCurrentLoanPayment ? filteredPendingPayment?.loanPaymentQueue ?? [] : [];
  const loans = (state.loans ?? []).filter((candidate) => candidate.id !== loanId);

  const next: GameState = {
    ...state,
    phase: isCurrentLoanPayment ? 'rolling' : state.phase,
    pendingPayment: isCurrentLoanPayment ? undefined : filteredPendingPayment,
    loans,
    players: state.players.map((candidate) => {
      if (candidate.id === playerId) {
        return { ...candidate, loanPayoffCards: Math.max(0, getLoanPayoffCardCount(candidate) - 1) };
      }
      if (lender && candidate.id === lender.id) return { ...candidate, money: candidate.money + loan.remainingDue };
      return candidate;
    }),
    log: appendLog(
      state,
      lender
        ? `${player.name} використовує картку погашення кредиту. Банк закриває борг ${loan.remainingDue}₴ перед ${lender.name}.`
        : `${player.name} використовує картку погашення кредиту і закриває банк-кредит ${loan.remainingDue}₴.`,
      'good',
    ),
  };

  return isCurrentLoanPayment ? createNextLoanPaymentFromQueue(next, playerId, nextLoanQueue) : next;
};

const filterLoanOutOfPendingPayment = (
  payment: GameState['pendingPayment'],
  loanId: string,
): GameState['pendingPayment'] => {
  if (payment?.source !== 'loan') return payment;
  const loanPayments = (payment.loanPayments ?? []).filter((loanPayment) => loanPayment.loanId !== loanId);
  const loanPaymentQueue = (payment.loanPaymentQueue ?? []).filter((loanPayment) => loanPayment.loanId !== loanId);
  return {
    ...payment,
    loanPayments,
    loanPaymentQueue,
  };
};

const payPendingPayment = (state: GameState, playerId: string, options: { useBankDeposit?: boolean } = {}): GameState => {
  assertCurrent(state, playerId);
  if (state.phase !== 'payment' || !state.pendingPayment || state.pendingPayment.payerId !== playerId) {
    throw new Error('Зараз немає платежу до сплати.');
  }

  const payment = state.pendingPayment;
  const payer = getPlayer(state, playerId);
  const funding = prepareBankDepositPayment(state, playerId, payment.amount, options.useBankDeposit);
  if (options.useBankDeposit && funding.cashAmount > 0) {
    const splitRecipients = splitPartialAmounts(payment.recipients, funding.depositUsed);
    const splitLoanPayments = splitPartialAmounts(payment.loanPayments, funding.depositUsed);
    const recipientAmounts = new Map(splitRecipients.paid.map((recipient) => [recipient.playerId, recipient.amount]));
    const mayorDepositIncome = splitMayorEventIncome(payment.mayorEventIncome, funding.depositUsed);

    return addMayorEventIncome(
      {
      ...funding.state,
      phase: 'payment',
      pendingPayment: {
        ...payment,
        amount: funding.cashAmount,
        recipients: splitRecipients.remaining,
        loanPayments: splitLoanPayments.remaining,
        mayorEventIncome: mayorDepositIncome.remaining,
      },
      loans:
        payment.source === 'loan'
          ? applyPartialLoanPayment(funding.state.loans ?? [], splitLoanPayments.paid)
          : funding.state.loans,
      players: funding.state.players.map((player) => {
        const received = recipientAmounts.get(player.id) ?? 0;
        return received > 0 ? { ...player, money: player.money + received } : player;
      }),
      log: appendLog(
        state,
        `${payer.name} покриває ${funding.depositUsed}₴ з депозиту: ${payment.reason}. Залишилось сплатити ${funding.cashAmount}₴.`,
        'bad',
      ),
      },
      mayorDepositIncome.paid?.playerId,
      mayorDepositIncome.paid?.amount ?? 0,
    );
  }
  if (payer.money < funding.cashAmount) throw new Error('Недостатньо грошей для сплати.');

  if (payment.source === 'loan' && payment.loanPayments?.length) {
    return payLoanInstallmentPayment(funding.state, playerId, payment, funding);
  }

  const stateAfterLawyerSavings = addPendingPaymentLawyerSavings(funding.state, payment);
  const recipientAmounts = new Map((payment.recipients ?? []).map((recipient) => [recipient.playerId, recipient.amount]));
  const paid: GameState = addMayorEventIncome(
    {
    ...stateAfterLawyerSavings,
    phase: 'turnEnd',
    pendingPayment: undefined,
    players: stateAfterLawyerSavings.players.map((player) => {
      const received = recipientAmounts.get(player.id) ?? 0;
      if (player.id !== playerId && received <= 0) return player;
      return { ...player, money: player.money - (player.id === playerId ? funding.cashAmount : 0) + received };
    }),
    log: appendLog(state, `${payer.name} сплачує ${payment.amount}₴${formatBankDepositPaymentSuffix(funding)}: ${payment.reason}.`, 'bad'),
    },
    payment.mayorEventIncome?.playerId,
    payment.mayorEventIncome?.amount ?? 0,
  );

  if (payment.afterPayment?.type === 'resolveTile') {
    return resolveTile(paid, payment.afterPayment.playerId, payment.afterPayment.diceTotal ?? 0);
  }
  if (payment.afterPayment?.type === 'resumeRolling') {
    return openTurnStartCasinoIfNeeded({ ...paid, phase: 'rolling' }, payment.afterPayment.playerId);
  }

  return paid;
};

const addPendingPaymentLawyerSavings = (state: GameState, payment: PendingPayment): GameState =>
  payment.lawyerDiscountSaved && payment.lawyerDiscountSaved > 0
    ? addRoleSavings(state, payment.payerId, payment.lawyerDiscountSaved)
    : state;

const payBail = (state: GameState, playerId: string): GameState => {
  assertCurrent(state, playerId);
  const player = getPlayer(state, playerId);
  if (player.jailTurns <= 0) throw new Error('Гравець не у вʼязниці.');
  const usesCard = player.jailCards > 0;
  const fine = usesCard
    ? { state, amount: getEffectiveFineAmount(state, JAIL_FINE, playerId) }
    : applyRoleFineDiscount(state, playerId, JAIL_FINE);
  const jailFine = fine.amount;
  if (player.money < jailFine && player.jailCards <= 0) throw new Error('Недостатньо коштів.');
  return {
    ...fine.state,
    phase: 'rolling',
    players: fine.state.players.map((candidate) =>
      candidate.id === playerId
        ? {
            ...candidate,
            jailTurns: 0,
            jailCards: Math.max(0, candidate.jailCards - 1),
            money: usesCard ? candidate.money : candidate.money - jailFine,
          }
        : candidate,
    ),
    log: appendLog(
      state,
      usesCard
        ? `${player.name} використовує картку виходу з вʼязниці і може кидати кубики.`
        : `${player.name} сплачує штраф ${jailFine}₴ і може кидати кубики.`,
      'good',
    ),
  };
};

const endTurn = (state: GameState, playerId: string): GameState => {
  assertCurrent(state, playerId);
  if (!['turnEnd', 'manage', 'trade'].includes(state.phase)) throw new Error('Хід ще не завершено.');
  if (hasPendingTrade(state)) throw new Error('Спочатку прийміть або відхиліть активну угоду.');
  const stateAfterServices = tickRentServicesForPlayer(state, playerId);
  const stateAfterMortgages = tickMortgagesForPlayer(stateAfterServices, playerId);
  const activePlayers = stateAfterMortgages.players.filter((player) => !player.isBankrupt);
  if (activePlayers.length <= 1) {
    return { ...stateAfterMortgages, phase: 'finished', winnerId: activePlayers[0]?.id };
  }
  const currentIndex = activePlayers.findIndex((player) => player.id === playerId);
  const nextIndex = (currentIndex + 1) % activePlayers.length;
  const nextPlayer = activePlayers[nextIndex];
  const startsNewRound = nextIndex === 0;
  const nextRound = startsNewRound ? (stateAfterMortgages.currentRound ?? 1) + 1 : stateAfterMortgages.currentRound ?? 1;
  const stateAfterCityEventTicks = startsNewRound
    ? tickCityEventsForNewRound({ ...stateAfterMortgages, currentRound: nextRound })
    : { ...stateAfterMortgages, currentRound: nextRound };
  const stateAfterRoundBonuses = startsNewRound ? applyCollectorRoundBonuses(stateAfterCityEventTicks) : stateAfterCityEventTicks;

  const next: GameState = {
    ...stateAfterRoundBonuses,
    cityEventDeck: stateAfterRoundBonuses.cityEventDeck ?? createCityEventDeck(),
    cityEventDiscard: stateAfterRoundBonuses.cityEventDiscard ?? [],
    activeCityEvents: stateAfterRoundBonuses.activeCityEvents ?? [],
    currentPlayerId: nextPlayer.id,
    currentRound: nextRound,
    turn: stateAfterRoundBonuses.turn + 1,
    phase: 'rolling',
    pendingRent: undefined,
    pendingPayment: undefined,
    pendingCasino: undefined,
    pendingBankDeposit: undefined,
    pendingJail: undefined,
    builtThisRoll: undefined,
    buildsThisRoll: undefined,
    pendingCard: undefined,
    pendingCardDraw: undefined,
    pendingMayorCityEventChoice: undefined,
    doublesInRow: 0,
    log: appendLog(stateAfterRoundBonuses, `Хід переходить до ${nextPlayer.name}.`),
  };

  const stateAfterRoundStart = startsNewRound && shouldDrawCityEvent(nextRound) ? startCityEventDraw(next) : next;
  return prepareTurnStart(stateAfterRoundStart, nextPlayer.id);
};

const shouldDrawCityEvent = (round: number): boolean => round > 1 && (round - 1) % CITY_EVENT_ROUND_INTERVAL === 0;

const startCityEventDraw = (state: GameState): GameState => {
  const mayor = state.players.find((player) => !player.isBankrupt && player.roleId === 'mayor');
  if (!mayor) return drawCityEvent(state);
  const nextEventNumber = getPlayerRoleState(state, mayor.id).mayorCityEventsSeen + 1;
  const counted = updatePlayerRoleState(state, mayor.id, (roleState) => ({
    ...roleState,
    mayorCityEventsSeen: nextEventNumber,
  }));
  if (nextEventNumber % MAYOR_CHOOSE_EVENT_INTERVAL !== 0) return drawCityEvent(counted);

  const options = getMayorCityEventChoiceOptions(counted);
  return {
    ...counted,
    phase: 'cityEventChoice',
    pendingMayorCityEventChoice: {
      playerId: mayor.id,
      options,
      round: counted.currentRound ?? 1,
      eventNumber: nextEventNumber,
    },
    log: appendLog(counted, `${mayor.name} як Мер обирає міську подію з 3 варіантів.`, 'good'),
  };
};

const applyCollectorRoundBonuses = (state: GameState): GameState => {
  let next = state;
  state.players.forEach((player) => {
    if (player.isBankrupt || player.roleId !== 'collector') return;
    const groupCount = getOwnedCityGroupCount(next, player.id);
    const bonus = groupCount * COLLECTOR_GROUP_BONUS;
    if (bonus <= 0) return;
    next = updatePlayerRoleState(
      {
        ...next,
        players: next.players.map((candidate) =>
          candidate.id === player.id ? { ...candidate, money: candidate.money + bonus } : candidate,
        ),
      },
      player.id,
      (roleState) => ({
        ...roleState,
        collectorBonusReceived: roleState.collectorBonusReceived + bonus,
      }),
    );
    next = {
      ...next,
      log: appendLog(next, `${player.name} отримує ${bonus}₴ бонусу Колекціонера за ${groupCount} районів.`, 'good'),
    };
  });
  return next;
};

const tickCityEventsForNewRound = (state: GameState): GameState => {
  const expiredEvents: ActiveCityEvent[] = [];
  const activeCityEvents = (state.activeCityEvents ?? [])
    .map((event) => {
      const remainingRounds = event.remainingRounds - 1;
      if (remainingRounds <= 0) expiredEvents.push(event);
      return { ...event, remainingRounds };
    })
    .filter((event) => event.remainingRounds > 0);
  const pendingCityEvent = getVisiblePendingCityEvent(state.pendingCityEvent, activeCityEvents);

  if (expiredEvents.length === 0) return { ...state, activeCityEvents, pendingCityEvent };

  const expiredNames = expiredEvents.map((event) => getCityEventDefinition(event.id).title).join(', ');
  return {
    ...state,
    activeCityEvents,
    pendingCityEvent,
    log: appendLog(state, `Подія міста завершилась: ${expiredNames}.`),
  };
};

const getVisiblePendingCityEvent = (
  pendingCityEvent: GameState['pendingCityEvent'],
  activeCityEvents: ActiveCityEvent[],
): GameState['pendingCityEvent'] => {
  const activeIds = new Set(activeCityEvents.map((event) => event.id));
  if (pendingCityEvent) {
    const primaryIsActive = activeIds.has(pendingCityEvent.id);
    const secondaryIsActive = pendingCityEvent.secondary ? activeIds.has(pendingCityEvent.secondary.id) : false;

    if (primaryIsActive) {
      return {
        ...pendingCityEvent,
        secondary: secondaryIsActive ? pendingCityEvent.secondary : undefined,
        isDouble: secondaryIsActive,
      };
    }

    if (pendingCityEvent.secondary && secondaryIsActive) {
      return {
        id: pendingCityEvent.secondary.id,
        title: pendingCityEvent.secondary.title,
        text: pendingCityEvent.secondary.text,
        round: pendingCityEvent.round,
      };
    }
  }

  const fallback = activeCityEvents[activeCityEvents.length - 1];
  if (!fallback) return undefined;

  const definition = getCityEventDefinition(fallback.id);
  return {
    id: definition.id,
    title: definition.title,
    text: definition.text,
    round: fallback.startedRound,
  };
};

interface DrawCityEventOptions {
  allowDouble?: boolean;
  mayorId?: string;
}

const drawCityEvent = (state: GameState, options: DrawCityEventOptions = {}): GameState => {
  const allowDouble = options.allowDouble ?? true;
  const mayorId = options.mayorId;
  const cityEventDeck = state.cityEventDeck?.length ? state.cityEventDeck : createCityEventDeck(state.cityEventDiscard ?? []);
  const [eventId, ...restDeck] = cityEventDeck;
  const event = getCityEventDefinition(eventId);
  const secondaryEventId = shouldDrawDoubleCityEvent(event, restDeck, allowDouble)
    ? pickSecondCityEventId(restDeck, event.id)
    : undefined;
  const secondaryEvent = secondaryEventId ? getCityEventDefinition(secondaryEventId) : undefined;
  const events = secondaryEvent ? [event, secondaryEvent] : [event];
  const nextDeck = secondaryEventId ? removeFirstCityEventId(restDeck, secondaryEventId) : restDeck;
  const activeCityEvents = activateCityEvents(state.activeCityEvents ?? [], events, state.currentRound ?? 1, mayorId);
  const nextBeforeStartEffects: GameState = {
    ...state,
    cityEventDeck: nextDeck,
    cityEventDiscard: [...(state.cityEventDiscard ?? []), ...events.map((cityEvent) => cityEvent.id)],
    activeCityEvents,
    pendingCityEvent: createPendingCityEvent(events, state.currentRound ?? 1, mayorId),
    log: appendLog(state, formatCityEventDrawLog(events), 'good'),
  };
  const next = events.reduce((current, cityEvent) => applyCityEventStartEffects(current, cityEvent, mayorId), nextBeforeStartEffects);
  const auctionEvent = events.find((cityEvent) => cityEvent.effects.startAuctionOnUnowned);

  return auctionEvent ? startCityEventAuction(next, auctionEvent, mayorId) : next;
};

const shouldDrawDoubleCityEvent = (
  primaryEvent: CityEventDefinition,
  restDeck: CityEventId[],
  allowDouble: boolean,
): boolean => allowDouble && restDeck.some((eventId) => eventId !== primaryEvent.id) && Math.random() < CITY_EVENT_DOUBLE_CHANCE;

const pickSecondCityEventId = (restDeck: CityEventId[], primaryEventId: CityEventId): CityEventId | undefined => {
  const candidates = Array.from(new Set(restDeck.filter((eventId) => eventId !== primaryEventId)));
  if (candidates.length === 0) return undefined;

  if (
    primaryEventId === STEP_FEE_CITY_EVENT_ID &&
    candidates.includes(ROAD_REPAIR_CITY_EVENT_ID) &&
    Math.random() < STEP_FEE_SECOND_SINGLE_DIE_CHANCE
  ) {
    return ROAD_REPAIR_CITY_EVENT_ID;
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
};

const removeFirstCityEventId = (deck: CityEventId[], eventId: CityEventId): CityEventId[] => {
  const index = deck.indexOf(eventId);
  if (index < 0) return deck;
  return [...deck.slice(0, index), ...deck.slice(index + 1)];
};

const activateCityEvents = (
  activeCityEvents: ActiveCityEvent[],
  events: CityEventDefinition[],
  currentRound: number,
  mayorId?: string,
): ActiveCityEvent[] =>
  events.reduce((active, event) => {
    if (event.durationRounds <= 0) return active;
    return [
      ...active.filter((candidate) => candidate.id !== event.id),
      {
        id: event.id,
        remainingRounds: event.durationRounds,
        durationRounds: event.durationRounds,
        startedRound: currentRound,
        mayorId,
      },
    ];
  }, activeCityEvents);

const createPendingCityEvent = (events: CityEventDefinition[], round: number, mayorId?: string): GameState['pendingCityEvent'] => {
  const [primary, secondary] = events;
  return {
    id: primary.id,
    title: primary.title,
    text: primary.text,
    round,
    secondary: secondary
      ? {
          id: secondary.id,
          title: secondary.title,
          text: secondary.text,
        }
      : undefined,
    isDouble: events.length > 1,
    mayorId,
  };
};

const formatCityEventDrawLog = (events: CityEventDefinition[]): string => {
  const [primary, secondary] = events;
  if (!secondary) return `Подія міста: ${primary.title}. ${primary.text}`;
  return `Подвійна подія міста: ${primary.title} + ${secondary.title}. ${primary.text} ${secondary.text}`;
};

const applyCityEventStartEffects = (state: GameState, event: CityEventDefinition, mayorId?: string): GameState => {
  let next = event.effects.sendAllToCasino ? sendAllPlayersToCasinoForCityEvent(state, event) : state;
  const cashPaymentPercent = event.effects.cashPaymentPercent;
  if (!cashPaymentPercent) return next;

  const payments = next.players.map((player) =>
    player.isBankrupt ? 0 : Math.max(0, Math.min(player.money, ceilMoney(Math.max(0, player.money) * cashPaymentPercent))),
  );
  const total = payments.reduce((sum, payment) => sum + payment, 0);
  if (total <= 0) return next;

  const charged: GameState = {
    ...next,
    players: next.players.map((player, index) => ({
      ...player,
      money: player.money - payments[index] + (mayorId && player.id === mayorId ? total : 0),
    })),
    log: appendLog(
      next,
      mayorId
        ? `${event.title}: гравці сплачують ${total}₴, кошти отримує Мер.`
        : `${event.title}: гравці сплачують банку разом ${total}₴.`,
      'bad',
    ),
  };

  return mayorId ? addMayorEventIncome(charged, mayorId, total) : charged;
};

const sendAllPlayersToCasinoForCityEvent = (state: GameState, event: CityEventDefinition): GameState => {
  const casinoPlayerIds = state.players.filter((player) => !player.isBankrupt).map((player) => player.id);
  if (casinoPlayerIds.length === 0) return state;
  const pendingIds = Array.from(new Set([...(state.pendingCityEventCasinoPlayerIds ?? []), ...casinoPlayerIds]));
  return {
    ...state,
    pendingCityEventCasinoPlayerIds: pendingIds,
    players: state.players.map((player) =>
      casinoPlayerIds.includes(player.id)
        ? { ...player, position: GAMBLER_STARTING_CASINO_TILE_ID, jailTurns: 0 }
        : player,
    ),
    log: appendLog(state, `${event.title}: усі гравці переміщуються в казино і мають прокрутити рулетку на своєму ході.`, 'good'),
  };
};

const startCityEventAuction = (state: GameState, event: CityEventDefinition, mayorId?: string): GameState => {
  const availableTiles = propertyTiles.filter((tile) => !state.properties[tile.id]?.ownerId);
  if (availableTiles.length === 0) {
    return {
      ...state,
      log: appendLog(state, `${event.title}: немає вільного майна для аукціону.`),
    };
  }

  const tile = availableTiles[(state.turn + (state.currentRound ?? 1)) % availableTiles.length];
  const price = getEffectivePropertyPrice(state, tile);
  const minimumBid = Math.ceil(price * (event.effects.auctionMinimumMultiplier ?? 1));
  const now = Date.now();

  return {
    ...state,
    phase: 'auction',
    pendingPurchaseTileId: undefined,
    pendingCard: undefined,
    pendingCardDraw: undefined,
    auction: {
      tileId: tile.id,
      source: 'cityEvent',
      sourceMayorId: mayorId,
      startedAt: now,
      endsAt: now + AUCTION_DURATION_MS,
      minimumBid,
      highestBid: 0,
      bids: [],
    },
    log: appendLog(state, `${event.title}: аукціон на ${tile.name} зі стартом ${minimumBid}₴.`),
  };
};

const getMayorCityEventChoiceOptions = (state: GameState): CityEventId[] => {
  const deck = state.cityEventDeck?.length ? state.cityEventDeck : createCityEventDeck(state.cityEventDiscard ?? []);
  const options: CityEventId[] = [];
  [...deck, ...cityEventDefinitions.map((event) => event.id)].forEach((eventId) => {
    if (options.length >= MAYOR_CITY_EVENT_CHOICE_COUNT || options.includes(eventId)) return;
    options.push(eventId);
  });
  return options;
};

const chooseMayorCityEvent = (state: GameState, playerId: string, cityEventId: CityEventId): GameState => {
  const choice = state.pendingMayorCityEventChoice;
  if (state.phase !== 'cityEventChoice' || !choice) throw new Error('Зараз немає вибору міської події.');
  if (choice.playerId !== playerId) throw new Error('Обрати подію може тільки Мер.');
  const mayor = getPlayer(state, playerId);
  if (mayor.roleId !== 'mayor' || mayor.isBankrupt) throw new Error('Обрати подію може тільки активний Мер.');
  if (!choice.options.includes(cityEventId)) throw new Error('Цієї події немає серед варіантів Мера.');

  const deck = state.cityEventDeck?.length ? state.cityEventDeck : createCityEventDeck(state.cityEventDiscard ?? []);
  const deckWithoutChoice = removeFirstCityEventId(deck, cityEventId);
  return prepareTurnStart(
    drawCityEvent(
      {
        ...state,
        phase: 'rolling',
        pendingMayorCityEventChoice: undefined,
        cityEventDeck: [cityEventId, ...deckWithoutChoice],
        log: appendLog(state, `${mayor.name} обирає міську подію: ${getCityEventDefinition(cityEventId).title}.`, 'good'),
      },
      { allowDouble: false, mayorId: playerId },
    ),
    state.currentPlayerId,
  );
};

const tickRentServicesForPlayer = (state: GameState, playerId: string): GameState => {
  const expiredServices: ActiveRentService[] = [];
  const rentServices = (state.rentServices ?? [])
    .map((service) => {
      if (service.beneficiaryId !== playerId) return service;
      const remainingTurns = service.remainingTurns - 1;
      if (remainingTurns <= 0) expiredServices.push(service);
      return { ...service, remainingTurns };
    })
    .filter((service) => service.remainingTurns > 0);

  if (expiredServices.length === 0) return { ...state, rentServices };

  const expiredNames = expiredServices.map((service) => getTile(service.tileId).name).join(', ');
  return {
    ...state,
    rentServices,
    log: appendLog(state, `Пільга на оренду завершилась: ${expiredNames}.`),
  };
};

const tickMortgagesForPlayer = (state: GameState, playerId: string): GameState => {
  const expiredTileIds: number[] = [];
  const nextProperties = Object.fromEntries(
    Object.entries(state.properties).map(([tileIdText, property]) => {
      const tileId = Number(tileIdText);
      if (!property.ownerId || property.ownerId !== playerId || !property.mortgaged) {
        return [tileIdText, property];
      }

      const currentTurnsLeft = getMortgageTurnsLeft(state, property);
      const nextTurnsLeft = currentTurnsLeft - 1;
      if (nextTurnsLeft <= 0) {
        expiredTileIds.push(tileId);
        return [
          tileIdText,
          {
            ...property,
            ownerId: undefined,
            houses: 0,
            mortgaged: false,
            mortgagedAtTurn: undefined,
            mortgageTurnsLeft: undefined,
          },
        ];
      }

      return [tileIdText, { ...property, mortgageTurnsLeft: nextTurnsLeft }];
    }),
  );

  const normalizedState = { ...state, properties: nextProperties };
  if (expiredTileIds.length === 0) return normalizedState;

  const expiredSet = new Set(expiredTileIds);
  const next: GameState = {
    ...normalizedState,
    players: normalizedState.players.map((player) => ({
      ...player,
      properties: player.properties.filter((tileId) => !expiredSet.has(tileId)),
    })),
  };

  const releasedNames = expiredTileIds.map((tileId) => getTile(tileId).name).join(', ');
  return {
    ...next,
    log: appendLog(
      next,
      `Банк повертає у продаж: ${releasedNames}. Заставу не викуплено за ${MORTGAGE_GRACE_TURNS} власних ходів.`,
      'bad',
    ),
  };
};

const continueTurn = (state: GameState, playerId: string): GameState => {
  assertCurrent(state, playerId);
  if (!['turnEnd', 'manage', 'trade'].includes(state.phase)) throw new Error('Хід ще не завершено.');
  if (hasPendingTrade(state)) throw new Error('Спочатку прийміть або відхиліть активну угоду.');

  const player = getPlayer(state, playerId);
  const rolledDouble = isDoubleDice(state.lastDice);
  const canRollAgain = rolledDouble && state.doublesInRow > 0 && player.jailTurns === 0;

  if (canRollAgain) {
    return {
      ...state,
      phase: 'rolling',
      pendingRent: undefined,
      pendingPayment: undefined,
      pendingCasino: undefined,
      pendingBankDeposit: undefined,
      pendingJail: undefined,
      pendingCard: undefined,
      pendingPurchaseTileId: undefined,
      pendingCardDraw: undefined,
      pendingMayorCityEventChoice: undefined,
      log: appendLog(state, `${player.name} викинув дубль і може кидати ще раз.`, 'good'),
    };
  }

  return endTurn(state, playerId);
};

const declareBankruptcy = (state: GameState, playerId: string): GameState => {
  if (state.pendingCasino?.playerId === playerId && isGamblerOpeningCasino(state.pendingCasino)) {
    throw new Error('Спочатку потрібно завершити стартову рулетку Азартного гравця.');
  }
  const debtor = getPlayer(state, playerId);
  const pendingRent = state.pendingRent?.payerId === playerId ? state.pendingRent : undefined;
  const isPendingPaymentPayer = state.pendingPayment?.payerId === playerId;
  const pendingPayment = isPendingPaymentPayer ? state.pendingPayment : undefined;
  const pendingBankDeposit = state.pendingBankDeposit?.playerId === playerId ? state.pendingBankDeposit : undefined;
  const collateralTransfers = getBankruptcyCollateralTransfers(state, playerId);
  const loanBankPayouts = getBankruptcyLoanBankPayouts(state, playerId);
  const pendingRentPaymentEntries = pendingRent ? getPendingRentPaymentEntries(pendingRent) : undefined;
  const creditorPayments = distributeCreditorPayments(
    debtor.money,
    pendingRentPaymentEntries?.map((entry) => ({ playerId: entry.playerId, amount: entry.amount })) ??
      pendingPayment?.recipients ??
      [],
  );
  const mayorRentBankruptcyIncome = pendingRentPaymentEntries
    ? sumMayorRentEntries(splitPartialAmounts(pendingRentPaymentEntries, debtor.money).paid)
    : 0;
  const shouldAdvanceTurn = state.currentPlayerId === playerId || Boolean(pendingRent) || isPendingPaymentPayer || Boolean(pendingBankDeposit);
  let next: GameState = {
    ...state,
    players: state.players.map((player) => {
      if (player.id === playerId) return { ...player, isBankrupt: true, properties: [], money: 0 };
      const received = creditorPayments.get(player.id) ?? 0;
      const loanBankPayout = loanBankPayouts.get(player.id) ?? 0;
      const collateralTileIds = collateralTransfers
        .filter((transfer) => transfer.lenderId === player.id)
        .map((transfer) => transfer.tileId);
      if (received > 0 || loanBankPayout > 0 || collateralTileIds.length > 0) {
        return {
          ...player,
          money: player.money + received + loanBankPayout,
          properties: Array.from(new Set([...player.properties, ...collateralTileIds])),
        };
      }
      return player;
    }),
    properties: Object.fromEntries(
      Object.entries(state.properties).map(([tileId, property]) => [
        tileId,
        property.ownerId === playerId
          ? {
              houses: 0,
              mortgaged: false,
              mortgagedAtTurn: undefined,
              mortgageTurnsLeft: undefined,
              ownerId: collateralTransfers.find((transfer) => transfer.tileId === Number(tileId))?.lenderId,
            }
          : property,
      ]),
    ),
    pendingRent: pendingRent ? undefined : state.pendingRent,
    pendingPayment: isPendingPaymentPayer ? undefined : state.pendingPayment,
    pendingBankDeposit: pendingBankDeposit ? undefined : state.pendingBankDeposit,
    pendingCityEventCasinoPlayerIds: (state.pendingCityEventCasinoPlayerIds ?? []).filter((id) => id !== playerId),
    pendingJail: state.pendingJail?.playerId === playerId ? undefined : state.pendingJail,
    rentServices: (state.rentServices ?? []).filter(
      (service) => service.ownerId !== playerId && service.beneficiaryId !== playerId,
    ),
    tradeOffers: state.tradeOffers.filter(
      (offer) => offer.fromPlayerId !== playerId && offer.toPlayerId !== playerId,
    ),
    loanOffers: (state.loanOffers ?? []).filter(
      (offer) => offer.lenderId !== playerId && offer.borrowerId !== playerId,
    ),
    loans: (state.loans ?? []).filter((loan) => loan.lenderId !== playerId && loan.borrowerId !== playerId),
    log: appendLog(state, `${debtor.name} оголошує банкрутство.`, 'bad'),
  };
  const survivors = next.players.filter((player) => !player.isBankrupt);
  if (survivors.length === 1) {
    next = { ...next, phase: 'finished', winnerId: survivors[0].id };
  } else if (!shouldAdvanceTurn) {
    next = {
      ...next,
      currentPlayerId: survivors.some((player) => player.id === next.currentPlayerId)
        ? next.currentPlayerId
        : survivors[0].id,
    };
  } else if (
    pendingRent?.unoReverse?.originalTurnPlayerId &&
    pendingRent.unoReverse.originalTurnPlayerId !== playerId &&
    survivors.some((player) => player.id === pendingRent.unoReverse?.originalTurnPlayerId)
  ) {
    next = {
      ...next,
      currentPlayerId: pendingRent.unoReverse.originalTurnPlayerId,
      phase: 'turnEnd',
    };
  } else {
    next = endTurn({ ...next, phase: 'turnEnd' }, playerId);
  }
  return addMayorEventIncome(next, pendingRent?.mayorEventIncome?.playerId, mayorRentBankruptcyIncome);
};

const distributeCreditorPayments = (
  availableCash: number,
  recipients: Array<{ playerId: string; amount: number }>,
): Map<string, number> => {
  const payments = new Map<string, number>();
  let remaining = Math.max(0, availableCash);
  recipients.forEach((recipient) => {
    if (remaining <= 0 || recipient.amount <= 0) return;
    const paid = Math.min(remaining, recipient.amount);
    remaining -= paid;
    payments.set(recipient.playerId, (payments.get(recipient.playerId) ?? 0) + paid);
  });
  return payments;
};

const hasPendingTrade = (state: GameState): boolean => state.tradeOffers.some((offer) => offer.status === 'pending');

const rentServiceCooldownKey = (ownerId: string, beneficiaryId: string, tileId: number): string =>
  `${ownerId}:${beneficiaryId}:${tileId}`;

const getMortgageTurnsLeft = (state: GameState, property: Pick<PropertyState, 'mortgagedAtTurn' | 'mortgageTurnsLeft'>) => {
  if (property.mortgageTurnsLeft !== undefined) return property.mortgageTurnsLeft;
  const elapsed = property.mortgagedAtTurn === undefined ? 0 : state.turn - property.mortgagedAtTurn;
  return Math.max(0, MORTGAGE_GRACE_TURNS - elapsed);
};

const drawPendingCard = (state: GameState, playerId: string): GameState => {
  assertCurrent(state, playerId);
  if (state.phase !== 'awaitingCard' || !state.pendingCardDraw) {
    throw new Error('Зараз немає картки для перевірки удачі.');
  }

  return drawCard({ ...state, pendingCardDraw: undefined }, playerId, state.pendingCardDraw.deck);
};

const drawCard = (state: GameState, playerId: string, deck: CardDeck): GameState => {
  const playerBeforeCard = getPlayer(state, playerId);
  const playersBeforeCard = state.players;
  const source = deck === 'chance' ? state.chanceDeck : state.communityDeck;
  const discard = deck === 'chance' ? state.discardChance : state.discardCommunity;
  const fullDeck = deck === 'chance' ? chanceCards : communityCards;
  const recyclableDiscard = getRecyclableCardDiscard(deck, discard);
  const baseReplenished = source.length
    ? source
    : recyclableDiscard.length
      ? recyclableDiscard
      : createCardDeck(fullDeck.filter((candidate) => isReusableCard(deck, candidate.id)));
  const replenished = baseReplenished.some((cardId) => isCardDrawable(state, deck, cardId))
    ? baseReplenished
    : [
        ...baseReplenished,
        ...createCardDeck(fullDeck.filter((candidate) => isReusableCard(deck, candidate.id) && isCardDrawable(state, deck, candidate.id))),
      ];
  const { cardId, rest } = drawCardIdFromDeck(state, playerId, deck, replenished);
  const card = fullDeck.find((candidate) => candidate.id === cardId) ?? fullDeck[0];
  const nextDiscard = source.length ? discard : [];
  const applied = card.apply(
    {
      ...state,
      chanceDeck: deck === 'chance' ? rest : state.chanceDeck,
      communityDeck: deck === 'community' ? rest : state.communityDeck,
      discardChance:
        deck === 'chance'
          ? isReusableCard(deck, card.id)
            ? [...nextDiscard, card.id]
            : nextDiscard
          : state.discardChance,
      discardCommunity:
        deck === 'community' ? [...nextDiscard, card.id] : state.discardCommunity,
      pendingCard: { deck, cardId: card.id, title: card.title, text: card.text },
    },
    playerId,
  );
  const resolved = resolveTileAfterCard(applied, playerId);
  const moneyDelta = getPlayer(resolved, playerId).money - playerBeforeCard.money;
  const moneyText =
    moneyDelta > 0
      ? ` Отримує ${moneyDelta}₴.`
      : moneyDelta < 0
        ? ` Втрачає ${Math.abs(moneyDelta)}₴.`
        : '';
  const completed: GameState = {
    ...resolved,
    phase:
      resolved.phase === 'awaitingPurchase' ||
      resolved.phase === 'awaitingJailDecision' ||
      resolved.phase === 'rent' ||
      resolved.phase === 'payment' ||
      resolved.phase === 'casino' ||
      resolved.phase === 'bankDeposit'
        ? resolved.phase
        : 'turnEnd',
    log: appendLog(resolved, `${playerBeforeCard.name} бере карту: ${card.title}.${moneyText}`),
  };

  return deferCurrentPlayerLossFromCard(completed, playersBeforeCard, playerId, card.title);
};

const deferCurrentPlayerLossFromCard = (
  stateAfter: GameState,
  playersBefore: Player[],
  playerId: string,
  cardTitle: string,
): GameState => {
  const beforeMoney = new Map(playersBefore.map((player) => [player.id, player.money]));
  const payerBefore = beforeMoney.get(playerId);
  if (payerBefore === undefined) return stateAfter;

  const payerAfter = getPlayer(stateAfter, playerId).money;
  if (payerAfter >= payerBefore) return stateAfter;

  const amount = payerBefore - payerAfter;
  const recipients = stateAfter.players
    .filter((player) => player.id !== playerId)
    .map((player) => ({ playerId: player.id, amount: player.money - (beforeMoney.get(player.id) ?? player.money) }))
    .filter((recipient) => recipient.amount > 0);
  const recipientTotal = recipients.reduce((sum, recipient) => sum + recipient.amount, 0);
  const normalizedRecipients = recipientTotal === amount ? recipients : undefined;
  const restoredPlayers = stateAfter.players.map((player) => {
    const restoredMoney = beforeMoney.get(player.id);
    if (player.id === playerId) return { ...player, money: payerBefore };
    if (normalizedRecipients?.some((recipient) => recipient.playerId === player.id) && restoredMoney !== undefined) {
      return { ...player, money: restoredMoney };
    }
    return player;
  });

  return createPendingPayment(
    {
      ...stateAfter,
      players: restoredPlayers,
    },
    {
      payerId: playerId,
      amount,
      reason: `картка "${cardTitle}"`,
      source: 'card',
      recipients: normalizedRecipients,
    },
  );
};

const resolveTileAfterCard = (state: GameState, playerId: string): GameState => {
  const player = getPlayer(state, playerId);
  const tile = getTile(player.position);
  if (tile.type === 'goToJail') {
    const jailFine = getEffectiveFineAmount(state, JAIL_FINE, playerId);
    return {
      ...state,
      phase: 'awaitingJailDecision',
      pendingJail: { playerId, tileId: tile.id },
      log: appendLog(
        state,
        `${player.name} потрапляє на "До вʼязниці" і має вибрати: сплатити ${jailFine}₴ або піти у вʼязницю.`,
        'bad',
      ),
    };
  }
  if (isPropertyTile(tile)) {
    const property = state.properties[tile.id];
    if (!property.ownerId) {
      const price = getEffectivePropertyPrice(state, tile);
      return {
        ...state,
        phase: 'awaitingPurchase',
        pendingPurchaseTileId: tile.id,
        log: appendLog(state, `${player.name} може купити ${tile.name} за ${price}₴.`),
      };
    }
    if (tile.type === 'bank' && property.ownerId === playerId) {
      const depositResolution = resolveBankDepositOnOwnBank(state, playerId, tile.name);
      if (depositResolution) return depositResolution;
      const depositDecision = createBankDepositDecision(state, playerId, tile);
      if (depositDecision) return depositDecision;
    }
    if (property.ownerId !== playerId) {
      const rentService = findRentService(state, property.ownerId, playerId, tile.id);
      const rentSplit = getRentWithMayorEventSplit(state, tile, state.dice[0] + state.dice[1], rentService);
      const { amount: rent, baseAmount: baseRent } = rentSplit;
      const owner = getPlayer(state, property.ownerId);
      if (rent <= 0) {
        return rentService
          ? {
              ...state,
              log: appendLog(state, `${player.name} використовує послугу на ${tile.name}: оренда ${baseRent}₴ не стягується.`),
            }
          : state;
      }
      return {
        ...state,
        phase: 'rent',
        pendingRent: {
          payerId: playerId,
          ownerId: property.ownerId,
          tileId: tile.id,
          amount: rent,
          ownerAmount: rentSplit.ownerAmount,
          mayorEventIncome: rentSplit.mayorEventIncome,
          originalAmount: rentService ? baseRent : undefined,
          rentServiceId: rentService?.id,
          discountPercent: rentService?.discountPercent,
        },
        log: appendLog(
          state,
          rentService
            ? `${player.name} має сплатити ${rent}₴ замість ${baseRent}₴ оренди гравцю ${owner.name}.`
            : `${player.name} має сплатити ${rent}₴ оренди гравцю ${owner.name}.`,
          'bad',
        ),
      };
    }
  }
  if (tile.type === 'casino') {
    const maxBet = getCasinoMaxBet(player);
    return {
      ...state,
      phase: 'casino',
      pendingCasino: { playerId, tileId: tile.id },
      log: appendLog(state, `${player.name} зупиняється біля казино і може зробити ставку до ${maxBet}₴.`),
    };
  }
  return state;
};

const sendToJail = (state: GameState, playerId: string, message: string): GameState => ({
  ...state,
  phase: 'turnEnd',
  doublesInRow: 0,
  pendingJail: undefined,
  pendingCasino: undefined,
  pendingPurchaseTileId: undefined,
  pendingPayment: undefined,
  pendingBankDeposit: undefined,
  pendingMayorCityEventChoice: undefined,
  players: state.players.map((player) =>
    player.id === playerId ? { ...player, position: 10, jailTurns: JAIL_TURNS } : player,
  ),
  log: appendLog(state, message, 'bad'),
});

const transfer = (state: GameState, fromId: string, toId: string, amount: number): GameState => ({
  ...state,
  players: state.players.map((player) => {
    if (player.id === fromId) return { ...player, money: player.money - amount };
    if (player.id === toId) return { ...player, money: player.money + amount };
    return player;
  }),
});

type PendingRentPaymentEntry = {
  playerId: string;
  amount: number;
  rentPart: 'owner' | 'mayor';
};

const getPendingRentPaymentEntries = (pendingRent: NonNullable<GameState['pendingRent']>): PendingRentPaymentEntry[] => {
  const mayorAmount = pendingRent.mayorEventIncome?.amount ?? 0;
  const ownerAmount = Math.max(0, pendingRent.ownerAmount ?? pendingRent.amount - mayorAmount);
  const entries: PendingRentPaymentEntry[] = [
    { playerId: pendingRent.ownerId, amount: ownerAmount, rentPart: 'owner' },
    ...(pendingRent.mayorEventIncome ? [{ ...pendingRent.mayorEventIncome, rentPart: 'mayor' as const }] : []),
  ];
  return entries.filter((entry) => entry.amount > 0);
};

const getPendingRentAfterPartialPayment = (
  pendingRent: NonNullable<GameState['pendingRent']>,
  amount: number,
  remainingEntries: PendingRentPaymentEntry[],
): NonNullable<GameState['pendingRent']> => {
  const ownerAmount = remainingEntries.find((entry) => entry.rentPart === 'owner')?.amount ?? 0;
  const mayorEntry = remainingEntries.find((entry) => entry.rentPart === 'mayor');
  return {
    ...pendingRent,
    amount,
    ownerAmount: mayorEntry ? ownerAmount : undefined,
    mayorEventIncome: mayorEntry ? { playerId: mayorEntry.playerId, amount: mayorEntry.amount } : undefined,
  };
};

const getProtectedPendingRentSplit = (
  pendingRent: NonNullable<GameState['pendingRent']>,
  protectedAmount: number,
): Pick<NonNullable<GameState['pendingRent']>, 'ownerAmount' | 'mayorEventIncome'> => {
  if (!pendingRent.mayorEventIncome || protectedAmount <= 0 || pendingRent.amount <= 0) {
    return { ownerAmount: undefined, mayorEventIncome: undefined };
  }
  const scale = protectedAmount / pendingRent.amount;
  const mayorAmount = Math.min(protectedAmount, Math.floor(pendingRent.mayorEventIncome.amount * scale));
  return {
    ownerAmount: protectedAmount - mayorAmount,
    mayorEventIncome:
      mayorAmount > 0 ? { playerId: pendingRent.mayorEventIncome.playerId, amount: mayorAmount } : undefined,
  };
};

const sumRecipientAmounts = (entries: Array<{ playerId: string; amount: number }>): Map<string, number> => {
  const amounts = new Map<string, number>();
  entries.forEach((entry) => {
    if (entry.amount <= 0) return;
    amounts.set(entry.playerId, (amounts.get(entry.playerId) ?? 0) + entry.amount);
  });
  return amounts;
};

const sumMayorRentEntries = (entries: PendingRentPaymentEntry[]): number =>
  entries.reduce((total, entry) => total + (entry.rentPart === 'mayor' ? entry.amount : 0), 0);

const createPendingPayment = (state: GameState, payment: PendingPayment): GameState => {
  const discounted = applyPendingPaymentRoleDiscount(state, payment);
  const amount = discounted.amount;
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      ...discounted.state,
      phase: 'turnEnd',
      pendingPayment: undefined,
    };
  }

  const payer = getPlayer(discounted.state, payment.payerId);
  const scale = payment.amount > 0 && amount !== payment.amount ? amount / payment.amount : 1;
  const recipients = scalePaymentRecipients(payment.recipients, scale);
  const mayorEventIncome = payment.mayorEventIncome
    ? { ...payment.mayorEventIncome, amount: Math.floor(payment.mayorEventIncome.amount * scale) }
    : undefined;
  return {
    ...discounted.state,
    phase: 'payment',
    pendingPayment: {
      ...payment,
      amount,
      recipients,
      mayorEventIncome,
      originalAmount: discounted.saved > 0 ? discounted.originalAmount : payment.originalAmount,
      lawyerDiscountSaved: discounted.saved > 0 ? discounted.saved : payment.lawyerDiscountSaved,
    },
    pendingRent: undefined,
    log: appendLog(state, `${payer.name} має сплатити ${amount}₴: ${payment.reason}.`, 'bad'),
  };
};

const applyPendingPaymentRoleDiscount = (
  state: GameState,
  payment: PendingPayment,
): { state: GameState; amount: number; originalAmount: number; saved: number } => {
  const baseAmount = Math.floor(payment.source === 'tax' ? getBaseFineAmount(state, payment.amount) : payment.amount);
  const player = getPlayer(state, payment.payerId);
  const shouldDiscount =
    player.roleId === 'lawyer' && (payment.source === 'tax' || payment.source === 'card' || payment.source === 'cityEvent');
  if (!shouldDiscount) return { state, amount: baseAmount, originalAmount: baseAmount, saved: 0 };
  const amount = ceilMoney(baseAmount * LAWYER_FINE_DISCOUNT);
  const saved = Math.max(0, baseAmount - amount);
  return { state, amount, originalAmount: baseAmount, saved };
};

const chargePlayer = (state: GameState, playerId: string, amount: number): GameState => ({
  ...state,
  players: state.players.map((player) => (player.id === playerId ? { ...player, money: player.money - amount } : player)),
});

const moveProperties = (state: GameState, fromId: string, toId: string, tileIds: number[]): GameState => ({
  ...state,
  properties: Object.fromEntries(
    Object.entries(state.properties).map(([tileId, property]) => [
      tileId,
      tileIds.includes(Number(tileId)) ? { ...property, ownerId: toId } : property,
    ]),
  ),
  players: state.players.map((player) => {
    if (player.id === fromId) {
      return { ...player, properties: player.properties.filter((tileId) => !tileIds.includes(tileId)) };
    }
    if (player.id === toId) return { ...player, properties: [...player.properties, ...tileIds] };
    return player;
  }),
});

const mergeRecipients = (recipients: Array<{ playerId: string; amount: number }>): Array<{ playerId: string; amount: number }> => {
  const amounts = new Map<string, number>();
  recipients.forEach((recipient) => {
    if (recipient.amount <= 0) return;
    amounts.set(recipient.playerId, (amounts.get(recipient.playerId) ?? 0) + recipient.amount);
  });
  return [...amounts.entries()].map(([playerId, amount]) => ({ playerId, amount }));
};

const scalePaymentRecipients = (
  recipients: PendingPayment['recipients'],
  scale: number,
): PendingPayment['recipients'] | undefined => {
  if (!recipients) return undefined;
  if (scale === 1) return recipients;
  return mergeRecipients(recipients.map((recipient) => ({ ...recipient, amount: Math.floor(recipient.amount * scale) })));
};

const splitMayorEventIncome = (
  income: PendingPayment['mayorEventIncome'],
  paidAmount: number,
): { paid?: PendingPayment['mayorEventIncome']; remaining?: PendingPayment['mayorEventIncome'] } => {
  if (!income || income.amount <= 0 || paidAmount <= 0) return { remaining: income };
  const paid = Math.min(income.amount, paidAmount);
  return {
    paid: { playerId: income.playerId, amount: paid },
    remaining: income.amount > paid ? { playerId: income.playerId, amount: income.amount - paid } : undefined,
  };
};

const addMayorEventIncome = (state: GameState, playerId: string | undefined, amount: number): GameState => {
  if (!playerId || amount <= 0) return state;
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || player.roleId !== 'mayor') return state;
  return updatePlayerRoleState(state, playerId, (roleState) => ({
    ...roleState,
    mayorEventIncome: roleState.mayorEventIncome + Math.floor(amount),
  }));
};

const getCollateralTileIdSet = (state: Pick<GameState, 'loans'> | Partial<Pick<GameState, 'loans'>>): Set<number> =>
  new Set((state.loans ?? []).flatMap((loan) => loan.collateralTileIds ?? []));

const isLoanCollateral = (state: Pick<GameState, 'loans'> | Partial<Pick<GameState, 'loans'>>, tileId: number): boolean =>
  getCollateralTileIdSet(state).has(tileId);

const getBankruptcyCollateralTransfers = (state: GameState, borrowerId: string): Array<{ tileId: number; lenderId: string }> =>
  (state.loans ?? [])
    .filter((loan) => loan.kind === 'player' && loan.borrowerId === borrowerId && loan.lenderId && loan.collateralTileIds.length > 0)
    .flatMap((loan) => {
      const lenderId = loan.lenderId!;
      const lender = state.players.find((player) => player.id === lenderId && !player.isBankrupt);
      if (!lender) return [];
      return loan.collateralTileIds
        .filter((tileId) => state.properties[tileId]?.ownerId === borrowerId)
        .map((tileId) => ({ tileId, lenderId }));
    });

const getBankruptcyLoanBankPayouts = (state: GameState, borrowerId: string): Map<string, number> => {
  const payouts = new Map<string, number>();
  (state.loans ?? []).forEach((loan) => {
    if (loan.kind !== 'player' || loan.borrowerId !== borrowerId || !loan.lenderId || loan.remainingDue <= 0) return;
    const lender = state.players.find((player) => player.id === loan.lenderId && !player.isBankrupt);
    if (!lender) return;
    payouts.set(lender.id, (payouts.get(lender.id) ?? 0) + ceilMoney(loan.remainingDue * PLAYER_LOAN_BANKRUPTCY_PAYOUT_RATE));
  });
  return payouts;
};

const getLoanNetWorth = (loans: ActiveLoan[], playerId: string): number =>
  loans.reduce((sum, loan) => {
    if (loan.borrowerId === playerId) return sum - loan.remainingDue;
    if (loan.kind === 'player' && loan.lenderId === playerId) return sum + loan.remainingDue;
    return sum;
  }, 0);

const normalizeDistrictPaths = (state: GameState): GameState => {
  const currentDistricts = state.districtPaths ?? {};
  const normalizedEntries = Object.entries(currentDistricts).filter(
    ([group, district]) => cityGroup(group).length > 0 && ownsFullGroup(state, district.ownerId, group),
  );
  if (normalizedEntries.length === Object.keys(currentDistricts).length && state.districtPaths) return state;
  return { ...state, districtPaths: Object.fromEntries(normalizedEntries) };
};

const normalizeBankDeposits = (state: GameState): GameState => {
  const currentDeposits = state.bankDeposits ?? {};
  const activePlayerIds = new Set(state.players.filter((player) => !player.isBankrupt).map((player) => player.id));
  const normalizedEntries = Object.entries(currentDeposits).filter(
    ([playerId, deposit]) => activePlayerIds.has(playerId) && deposit.amount > 0,
  );
  if (normalizedEntries.length === Object.keys(currentDeposits).length && state.bankDeposits) return state;
  return { ...state, bankDeposits: Object.fromEntries(normalizedEntries) };
};

const normalizeRoleState = (state: GameState): GameState => {
  if (state.rolesEnabled === false) return state;
  const current = state.roleState ?? {};
  const nextEntries = state.players.map((player) => [player.id, normalizePlayerRoleState(current[player.id])] as const);
  const nextRoleState: Record<string, PlayerRoleState> = Object.fromEntries(nextEntries);
  const isSame =
    state.roleState &&
    Object.keys(nextRoleState).length === Object.keys(current).length &&
    Object.entries(nextRoleState).every(([playerId, roleState]) => isSameRoleState(roleState, current[playerId]));
  return isSame ? state : { ...state, roleState: nextRoleState };
};

const normalizePlayerRoleState = (roleState: Partial<PlayerRoleState> | undefined): PlayerRoleState => ({
  realtorProfit: Math.max(0, Math.floor(roleState?.realtorProfit ?? 0)),
  lawyerSaved: Math.max(0, Math.floor(roleState?.lawyerSaved ?? 0)),
  lawyerProtectionsLeft: Math.max(0, Math.floor(roleState?.lawyerProtectionsLeft ?? LAWYER_TOTAL_PROTECTIONS)),
  collectorBonusReceived: Math.max(0, Math.floor(roleState?.collectorBonusReceived ?? 0)),
  gamblerOpeningSpinDone: roleState?.gamblerOpeningSpinDone ?? true,
  gamblerOpeningSingleDieRollPending: roleState?.gamblerOpeningSingleDieRollPending ?? false,
  builderRemotePurchaseUsed: roleState?.builderRemotePurchaseUsed ?? false,
  builderAuctionUsed: roleState?.builderAuctionUsed ?? false,
  builderSpecialActionRound: Math.max(0, Math.floor(roleState?.builderSpecialActionRound ?? 0)),
  mayorCityEventsSeen: Math.max(0, Math.floor(roleState?.mayorCityEventsSeen ?? 0)),
  mayorEventIncome: Math.max(0, Math.floor(roleState?.mayorEventIncome ?? 0)),
});

const isSameRoleState = (left: PlayerRoleState, right: PlayerRoleState | undefined): boolean => {
  const normalizedRight = normalizePlayerRoleState(right);
  return (
    left.realtorProfit === normalizedRight.realtorProfit &&
    left.lawyerSaved === normalizedRight.lawyerSaved &&
    left.lawyerProtectionsLeft === normalizedRight.lawyerProtectionsLeft &&
    left.collectorBonusReceived === normalizedRight.collectorBonusReceived &&
    left.gamblerOpeningSpinDone === normalizedRight.gamblerOpeningSpinDone &&
    left.gamblerOpeningSingleDieRollPending === normalizedRight.gamblerOpeningSingleDieRollPending &&
    left.builderRemotePurchaseUsed === normalizedRight.builderRemotePurchaseUsed &&
    left.builderAuctionUsed === normalizedRight.builderAuctionUsed &&
    left.builderSpecialActionRound === normalizedRight.builderSpecialActionRound &&
    left.mayorCityEventsSeen === normalizedRight.mayorCityEventsSeen &&
    left.mayorEventIncome === normalizedRight.mayorEventIncome
  );
};

const getPlayerRoleState = (state: GameState, playerId: string): PlayerRoleState =>
  normalizePlayerRoleState((state.roleState ?? {})[playerId]);

const updatePlayerRoleState = (
  state: GameState,
  playerId: string,
  updater: (roleState: PlayerRoleState) => PlayerRoleState,
): GameState => ({
  ...state,
  roleState: {
    ...(state.roleState ?? {}),
    [playerId]: updater(getPlayerRoleState(state, playerId)),
  },
});

const addRoleSavings = (state: GameState, playerId: string, amount: number): GameState => {
  if (amount <= 0 || getPlayer(state, playerId).roleId !== 'lawyer') return state;
  return updatePlayerRoleState(state, playerId, (roleState) => ({
    ...roleState,
    lawyerSaved: roleState.lawyerSaved + Math.floor(amount),
  }));
};

const useLawyerProtectionCharge = (state: GameState, playerId: string): GameState => {
  const player = getPlayer(state, playerId);
  if (player.roleId !== 'lawyer') throw new Error('Цей захист доступний тільки Юристу.');
  const roleState = getPlayerRoleState(state, playerId);
  if (roleState.lawyerProtectionsLeft <= 0) throw new Error('Юрист уже використав усі захисти.');
  return updatePlayerRoleState(state, playerId, (current) => ({
    ...current,
    lawyerProtectionsLeft: Math.max(0, current.lawyerProtectionsLeft - 1),
  }));
};

const normalizeLoans = (state: GameState): GameState => {
  const loans = state.loans ?? [];
  const offers = state.loanOffers ?? [];
  const activePlayerIds = new Set(state.players.filter((player) => !player.isBankrupt).map((player) => player.id));
  const normalizedLoans = loans.filter(
    (loan) =>
      loan.remainingDue > 0 &&
      activePlayerIds.has(loan.borrowerId) &&
      (loan.kind === 'bank' || (loan.lenderId !== undefined && activePlayerIds.has(loan.lenderId))),
  );
  const normalizedOffers = offers.filter(
    (offer) => activePlayerIds.has(offer.borrowerId) && activePlayerIds.has(offer.lenderId),
  );
  if (normalizedLoans.length === loans.length && normalizedOffers.length === offers.length && state.loans && state.loanOffers) return state;
  return { ...state, loans: normalizedLoans, loanOffers: normalizedOffers };
};

const ownsFullGroup = (state: GameState, playerId: string, group: string): boolean =>
  cityGroup(group).every((tile) => state.properties[tile.id]?.ownerId === playerId);

const cityGroup = (group: string): CityTile[] =>
  boardTiles.filter((tile): tile is CityTile => tile.type === 'city' && tile.group === group);

const getCityGroupOwner = (state: GameState, group: string): string | undefined => {
  const groupTiles = cityGroup(group);
  if (groupTiles.length === 0) return undefined;
  const ownerId = state.properties[groupTiles[0].id]?.ownerId;
  return ownerId && groupTiles.every((tile) => state.properties[tile.id]?.ownerId === ownerId) ? ownerId : undefined;
};

const getOwnedCityGroups = (state: GameState, playerId: string): string[] =>
  Array.from(
    new Set(cityTiles.filter((tile) => state.properties[tile.id]?.ownerId === playerId).map((tile) => tile.group)),
  );

const getOwnedCityGroupCount = (state: GameState, playerId: string): number => getOwnedCityGroups(state, playerId).length;

const getBuilderCompletedDistrictCount = (state: GameState, playerId: string): number =>
  Object.entries(state.districtPaths ?? {}).filter(([group, district]) => {
    if (district.ownerId !== playerId) return false;
    const groupTiles = cityGroup(group);
    return groupTiles.length > 0 && groupTiles.every((tile) => {
      const property = state.properties[tile.id];
      return property?.ownerId === playerId && property.houses >= 5;
    });
  }).length;

const ownedProperties = (state: GameState, playerId: string): PropertyTile[] =>
  propertyTiles.filter((tile) => state.properties[tile.id]?.ownerId === playerId);

const getCollectorUniqueRegionCount = (state: GameState, playerId: string): number => getOwnedCityGroupCount(state, playerId);

const ownedBankCount = (state: GameState, playerId: string): number =>
  ownedProperties(state, playerId).filter((tile) => tile.type === 'bank').length;

const getPlayer = (state: GameState, playerId: string): Player => {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`Unknown player ${playerId}`);
  return player;
};

const getUnoReverseCardCount = (player: Player): number => Math.min(UNO_REVERSE_CARD_LIMIT, player.unoReverseCards ?? 0);

const getLoanPayoffCardCount = (player: Player): number => Math.min(LOAN_PAYOFF_CARD_LIMIT, player.loanPayoffCards ?? 0);

const assertCurrent = (state: GameState, playerId: string) => {
  if (state.currentPlayerId !== playerId) throw new Error('Зараз хід іншого гравця.');
};

const assertPropertyManagementPhase = (state: GameState) => {
  if (state.phase !== 'rolling') throw new Error('Керувати майном можна лише до кидка кубиків.');
};

const assertEmergencyMoneyManagementPhase = (state: GameState, playerId: string, message: string) => {
  const isPurchaseDecision = state.phase === 'awaitingPurchase';
  const isRentDecision = state.phase === 'rent' && state.pendingRent?.payerId === playerId;
  const isPaymentDecision = state.phase === 'payment' && state.pendingPayment?.payerId === playerId;
  const isBankDepositDecision = state.phase === 'bankDeposit' && state.pendingBankDeposit?.playerId === playerId;

  if (state.phase !== 'rolling' && !isPurchaseDecision && !isRentDecision && !isPaymentDecision && !isBankDepositDecision) {
    throw new Error(message);
  }
};

const assertLoanManagementPhase = (state: GameState, playerId: string) => {
  assertCurrent(state, playerId);
  if (!canManageLoansInPhase(state, playerId)) {
    throw new Error('Кредит можна взяти лише під час свого ходу або фінансового рішення.');
  }
};

const canManageLoansInPhase = (state: GameState, playerId: string): boolean =>
  ['rolling', 'manage', 'trade', 'turnEnd'].includes(state.phase) ||
  (state.phase === 'payment' && state.pendingPayment?.payerId === playerId) ||
  (state.phase === 'rent' && state.pendingRent?.payerId === playerId) ||
  state.phase === 'awaitingPurchase' ||
  (state.phase === 'bankDeposit' && state.pendingBankDeposit?.playerId === playerId) ||
  (state.phase === 'casino' &&
    state.pendingCasino?.playerId === playerId &&
    !state.pendingCasino.spinEndsAt &&
    !isGamblerOpeningCasino(state.pendingCasino) &&
    !isCityEventCasino(state.pendingCasino));

const prepareTurnStart = (state: GameState, playerId: string): GameState => {
  const afterLoans = createLoanPaymentIfDue(state, playerId);
  return afterLoans.phase === 'rolling' ? openTurnStartCasinoIfNeeded(afterLoans, playerId) : afterLoans;
};

const openTurnStartCasinoIfNeeded = (state: GameState, playerId: string): GameState =>
  openGamblerOpeningCasinoIfNeeded(openCityEventCasinoIfNeeded(state, playerId));

const openCityEventCasinoIfNeeded = (state: GameState, playerId: string): GameState => {
  if (state.phase !== 'rolling' || state.pendingCasino) return state;
  const activePlayerIds = new Set(state.players.filter((player) => !player.isBankrupt).map((player) => player.id));
  const pendingIds = (state.pendingCityEventCasinoPlayerIds ?? []).filter((id) => activePlayerIds.has(id));
  if (!pendingIds.includes(playerId)) {
    return pendingIds.length === (state.pendingCityEventCasinoPlayerIds ?? []).length
      ? state
      : { ...state, pendingCityEventCasinoPlayerIds: pendingIds };
  }

  const player = getPlayer(state, playerId);
  const nextPendingIds = pendingIds.filter((id) => id !== playerId);
  if (getCasinoMaxBet(player) <= 0) {
    return {
      ...state,
      pendingCityEventCasinoPlayerIds: nextPendingIds,
      log: appendLog(state, `${player.name} пропускає рулетку міської події, бо не має грошей для ставки.`),
    };
  }

  return {
    ...state,
    phase: 'casino',
    pendingCityEventCasinoPlayerIds: pendingIds,
    pendingCasino: {
      playerId,
      tileId: GAMBLER_STARTING_CASINO_TILE_ID,
      forced: 'cityEvent',
    },
    players: state.players.map((candidate) =>
      candidate.id === playerId ? { ...candidate, position: GAMBLER_STARTING_CASINO_TILE_ID, jailTurns: 0 } : candidate,
    ),
    log: appendLog(state, `${player.name} має прокрутити рулетку міської події перед кидком кубиків.`, 'good'),
  };
};

const openGamblerOpeningCasinoIfNeeded = (state: GameState): GameState => {
  if (state.rolesEnabled === false || state.phase !== 'rolling' || state.pendingCasino) return state;
  const player = state.players.find((candidate) => candidate.id === state.currentPlayerId);
  if (!player || player.isBankrupt || player.roleId !== 'gambler') return state;
  if (getPlayerRoleState(state, player.id).gamblerOpeningSpinDone) return state;

  return {
    ...state,
    phase: 'casino',
    pendingCasino: {
      playerId: player.id,
      tileId: GAMBLER_STARTING_CASINO_TILE_ID,
      forced: 'gamblerOpening',
    },
    players: state.players.map((candidate) =>
      candidate.id === player.id ? { ...candidate, position: GAMBLER_STARTING_CASINO_TILE_ID } : candidate,
    ),
    log: appendLog(
      state,
      `${player.name} починає як Азартний гравець: обов'язкова рулетка на весь баланс з множниками x2/x3/x4.`,
      'good',
    ),
  };
};

const markGamblerOpeningSpinDone = (state: GameState, playerId: string, multiplier: number): GameState =>
  updatePlayerRoleState(state, playerId, (roleState) => ({
    ...roleState,
    gamblerOpeningSpinDone: true,
    gamblerOpeningSingleDieRollPending: multiplier === 4,
  }));

const completeCityEventCasinoSpin = (state: GameState, playerId: string): GameState => {
  if (!isCityEventCasino(state.pendingCasino)) return state;
  return {
    ...state,
    pendingCityEventCasinoPlayerIds: (state.pendingCityEventCasinoPlayerIds ?? []).filter((id) => id !== playerId),
  };
};

const randomDice = (diceCount: 1 | 2 = 2): [number, number] => {
  const first = Math.floor(Math.random() * 6) + 1;
  if (diceCount === 1) return [first, 0];
  return [first, Math.floor(Math.random() * 6) + 1];
};

const createCardDeck = (cards: typeof chanceCards): number[] => {
  const weighted = cards.flatMap((card) => Array(getCardDeckCopies(card)).fill(card.id));
  return shuffle(weighted);
};

const getCardDeckCopies = (card: (typeof chanceCards)[number]): number => {
  if (card.deck === 'chance' && card.id === UNO_REVERSE_CARD_ID) return UNO_REVERSE_CARD_DECK_COPIES;
  return card.rarity === 'rare' ? 1 : 4;
};

const getRecyclableCardDiscard = (deck: CardDeck, discard: number[]): number[] =>
  discard.filter((cardId) => isReusableCard(deck, cardId));

const isReusableCard = (deck: CardDeck, cardId: number): boolean =>
  !(deck === 'chance' && cardId === UNO_REVERSE_CARD_ID);

const drawCardIdFromDeck = (
  state: GameState,
  playerId: string,
  deck: CardDeck,
  cardIds: number[],
): { cardId: number; rest: number[] } => {
  const drawableEntries = cardIds
    .map((cardId, index) => ({ cardId, index }))
    .filter((entry) => isCardDrawable(state, deck, entry.cardId));
  const candidates = drawableEntries.length > 0 ? drawableEntries : cardIds.map((cardId, index) => ({ cardId, index }));

  const weights = candidates.map((entry) => getRoleCardDrawWeightMultiplier(state, playerId, deck, entry.cardId));
  if (candidates.length <= 1 || weights.every((weight) => weight === 1)) {
    const selectedIndex = candidates[0]?.index ?? 0;
    return {
      cardId: cardIds[selectedIndex],
      rest: cardIds.filter((_, index) => index !== selectedIndex),
    };
  }

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let target = Math.random() * totalWeight;
  const selectedCandidateIndex = candidates.findIndex((_entry, index) => {
    target -= weights[index];
    return target < 0;
  });
  const safeIndex = selectedCandidateIndex >= 0 ? candidates[selectedCandidateIndex].index : candidates[candidates.length - 1].index;
  return {
    cardId: cardIds[safeIndex],
    rest: cardIds.filter((_, index) => index !== safeIndex),
  };
};

const getRoleCardDrawWeightMultiplier = (state: GameState, playerId: string, deck: CardDeck, cardId: number): number => {
  if (deck === 'community' && cardId === COMMUNISM_COMMUNITY_CARD_ID) {
    return getCommunismDrawWeightMultiplier(state, playerId);
  }
  const roleId = getPlayer(state, playerId).roleId;
  if (deck === 'chance' && roleId === 'gambler' && cardId === CASINO_CHANCE_CARD_ID) {
    return GAMBLER_CASINO_CARD_WEIGHT_MULTIPLIER;
  }
  if (deck === 'chance' && roleId === 'banker' && cardId === NEAREST_BANK_CHANCE_CARD_ID) {
    return BANKER_BANK_CARD_WEIGHT_MULTIPLIER;
  }
  return 1;
};

const isCardDrawable = (state: GameState, deck: CardDeck, cardId: number): boolean => {
  if (deck === 'chance' && cardId === LOAN_PAYOFF_CARD_ID) {
    return (state.loans ?? []).some((loan) => loan.remainingDue > 0);
  }
  return true;
};

const getCommunismDrawWeightMultiplier = (state: GameState, playerId: string): number => {
  const activePlayers = state.players.filter((player) => !player.isBankrupt);
  const player = activePlayers.find((candidate) => candidate.id === playerId);
  if (!player || activePlayers.length < 2) return 1;

  const cashValues = activePlayers.map((candidate) => candidate.money);
  const maxCash = Math.max(...cashValues);
  const minCash = Math.min(...cashValues);
  if (maxCash === minCash) return 1;
  if (player.money === maxCash) return COMMUNISM_RICH_CASH_WEIGHT_MULTIPLIER;
  if (player.money === minCash) return COMMUNISM_LOW_CASH_WEIGHT_MULTIPLIER;
  return 1;
};

const createCityEventDeck = (recentDiscard: CityEventId[] = []): CityEventId[] => {
  const recentSet = new Set(recentDiscard.slice(-5));
  const candidates = cityEventDefinitions
    .map((event) => event.id)
    .filter((eventId) => !recentSet.has(eventId));
  const baseDeck = candidates.length > 0 ? candidates : cityEventDefinitions.map((event) => event.id);
  const boostedDeck = baseDeck.includes(STEP_FEE_CITY_EVENT_ID)
    ? [...baseDeck, ...Array(STEP_FEE_CITY_EVENT_EXTRA_DECK_COPIES).fill(STEP_FEE_CITY_EVENT_ID)]
    : baseDeck;
  return shuffle(boostedDeck);
};

const formatTradeOfferLog = (offer: Omit<TradeOffer, 'id' | 'status'> | TradeOffer): string =>
  `віддає ${formatTradeItems(offer.offerMoney, offer.offerProperties, offer.offerRentServices ?? [])}; просить ${formatTradeItems(
    offer.requestMoney,
    offer.requestProperties,
    offer.requestRentServices ?? [],
  )}`;

const formatTradeItems = (money: number, tileIds: number[], services: RentServiceOffer[] = []): string => {
  const parts = [
    ...(money > 0 ? [`${money}₴`] : []),
    ...tileIds.map((tileId) => getTile(tileId).name),
    ...services.map((service) => formatRentService(service)),
  ];
  return parts.length > 0 ? parts.join(', ') : 'нічого';
};

const formatRentService = (service: RentServiceOffer): string =>
  `${getTile(service.tileId).name}: ${
    service.discountPercent === 100 ? 'без оренди' : '50% оренди'
  } на ${service.turns} ${formatTurnWord(service.turns)} отримувача, перезарядка ${service.turns * 2} ${formatTurnWord(
    service.turns * 2,
  )}`;

const formatTurnWord = (turns: number) => (turns === 1 ? 'хід' : turns >= 2 && turns <= 4 ? 'ходи' : 'ходів');

const formatStepWord = (steps: number) => (steps === 1 ? 'крок' : steps >= 2 && steps <= 4 ? 'кроки' : 'кроків');

const shuffle = <T>(items: T[]): T[] => {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
};

const log = (text: string, tone: LogEntry['tone'] = 'neutral'): LogEntry => ({
  id: crypto.randomUUID(),
  text,
  tone,
  createdAt: Date.now(),
});

const appendLog = (state: GameState, text: string, tone: LogEntry['tone'] = 'neutral'): LogEntry[] => [
  log(text, tone),
  ...state.log,
].slice(0, 18);
