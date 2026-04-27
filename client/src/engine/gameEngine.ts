import { boardTiles, getTile, isPropertyTile, propertyTiles } from '../data/board';
import { chanceCards, communityCards } from '../data/cards';
import { CITY_EVENT_ROUND_INTERVAL, cityEventDefinitions, getCityEventDefinition } from '../data/cityEvents';
import type {
  ActiveCityEvent,
  ActiveRentService,
  CardDeck,
  CityEventDefinition,
  CityEventId,
  CityTile,
  GameAction,
  GameState,
  LogEntry,
  MoneyHistoryPoint,
  PendingPayment,
  Player,
  PropertyState,
  PropertyTile,
  RentServiceOffer,
  TradeOffer,
} from './types';
import { money } from './economy';
import { getStartReward } from './startRewards';
import { getLateGameFineMultiplier, getLateGamePriceMultiplier } from './difficulty';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const PLAYER_TOKENS = ['⚓', '✦', '◆', '●', '▲', '■'];
export const PLAYER_COLORS = ['#f8c24e', '#43b3ff', '#f0645f', '#3ccf91', '#a78bfa', '#fb923c'];
const STARTING_MONEY = money(1500);
const MORTGAGE_GRACE_TURNS = 10;
const AUCTION_DURATION_MS = 15_000;
export const AUCTION_BID_INCREMENT = money(10);
const CASINO_MAX_BET = money(300);
const CASINO_MAX_MULTIPLIER = 6;
const CASINO_SPIN_DURATION_MS = 5_400;
const JAIL_FINE = money(100);
const JAIL_TURNS = 3;

interface CreateInitialGameOptions {
  determineTurnOrder?: boolean;
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
    isBankrupt: false,
  }));

  const properties = Object.fromEntries(
    propertyTiles.map((tile) => [
      tile.id,
      { houses: 0, mortgaged: false, mortgagedAtTurn: undefined, mortgageTurnsLeft: undefined },
    ]),
  );
  const moneyHistory = createMoneyHistorySnapshot({
    players,
    turn: 1,
    currentRound: 1,
    properties,
  });

  return {
    id,
    players,
    currentPlayerId: players[0].id,
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
    tradeOffers: [],
    rentServices: [],
    rentServiceCooldowns: {},
    dice: [1, 1],
    diceRollId: 0,
    doublesInRow: 0,
    moneyHistory: [moneyHistory],
    turnOrderRolls: options.determineTurnOrder ? {} : undefined,
    log: [
      log(
        options.determineTurnOrder
          ? 'Партія створена. Кидайте кубики, щоб визначити чергу ходів.'
          : 'Партія створена. Кидайте кубики.',
        'good',
      ),
    ],
  };
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
    case 'pay_rent':
      next = payRent(state, action.playerId);
      break;
    case 'pay_payment':
      next = payPendingPayment(state, action.playerId);
      break;
    case 'pay_bail':
      next = payBail(state, action.playerId);
      break;
    case 'admin_move_current_player':
      next = adminMoveCurrentPlayer(state, action.tileId);
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

  return recordMoneyHistory(state, next);
};

const MONEY_HISTORY_LIMIT = 240;

const createMoneyHistorySnapshot = (
  state: Pick<GameState, 'players' | 'turn' | 'currentRound' | 'properties'>,
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

const calculatePlayerWorth = (state: Pick<GameState, 'properties'>, player: Player): number =>
  player.money +
  player.properties.reduce((sum, tileId) => {
    const tile = getTile(tileId);
    if (!isPropertyTile(tile)) return sum;
    const property = state.properties[tile.id];
    const buildingValue = tile.type === 'city' ? property.houses * tile.houseCost : 0;
    return sum + tile.price + buildingValue;
  }, 0);

export const calculateRent = (state: GameState, tile: PropertyTile, diceTotal = 0): number => {
  const ownerId = state.properties[tile.id]?.ownerId;
  if (!ownerId || state.properties[tile.id]?.mortgaged) return 0;

  let rent = 0;
  if (tile.type === 'bank') {
    const bankCount = ownedProperties(state, ownerId).filter((owned) => owned.type === 'bank').length;
    rent = [0, money(25), money(50), money(100), money(200)][bankCount] ?? money(200);
  } else if (tile.type === 'utility') {
    const utilityCount = ownedProperties(state, ownerId).filter((owned) => owned.type === 'utility').length;
    rent = diceTotal * (utilityCount === 2 ? money(12) : money(6));
  } else {
    const houses = state.properties[tile.id].houses;
    const base = tile.rents[houses];
    rent = houses === 0 && ownsFullGroup(state, ownerId, tile.group) ? base * 2 : base;
  }

  return ceilMoney(rent * getCityEventRentMultiplier(state, tile));
};

export const getEffectivePropertyPrice = (state: GameState, tile: PropertyTile): number =>
  ceilMoney(tile.price * getCityEventPropertyPriceMultiplier(state, tile) * getLateGamePriceMultiplier(state.turn));

export const getEffectiveHouseCost = (state: GameState, tile: CityTile): number =>
  ceilMoney(tile.houseCost * getCityEventHouseCostMultiplier(state, tile) * getLateGamePriceMultiplier(state.turn));

export const getEffectiveUnmortgageCost = (state: GameState, tile: PropertyTile): number =>
  ceilMoney(tile.mortgage * 1.1 * getCityEventUnmortgageMultiplier(state) * getLateGamePriceMultiplier(state.turn));

const ceilMoney = (value: number): number => Math.ceil(value - 1e-6);

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

const getCityEventRentMultiplier = (state: GameState, tile: PropertyTile): number =>
  getActiveCityEventDefinitions(state).reduce((multiplier, event) => {
    const effect = event.effects;
    if (!effect.rentMultiplier) return multiplier;
    const matchesGroup = tile.type === 'city' && effect.rentGroups?.includes(tile.group);
    const matchesType = effect.rentPropertyTypes?.includes(tile.type);
    return matchesGroup || matchesType ? multiplier * effect.rentMultiplier : multiplier;
  }, 1);

const getCityEventPropertyPriceMultiplier = (state: GameState, tile: PropertyTile): number =>
  getActiveCityEventDefinitions(state).reduce((multiplier, event) => {
    const effect = event.effects;
    if (!effect.propertyPriceMultiplier) return multiplier;
    return effect.propertyPriceTypes?.includes(tile.type) ? multiplier * effect.propertyPriceMultiplier : multiplier;
  }, 1);

const getCityEventHouseCostMultiplier = (state: GameState, tile: CityTile): number =>
  getActiveCityEventDefinitions(state).reduce((multiplier, event) => {
    const effect = event.effects;
    if (!effect.houseCostMultiplier) return multiplier;
    const matchesGroup = !effect.houseCostGroups || effect.houseCostGroups.includes(tile.group);
    return matchesGroup ? multiplier * effect.houseCostMultiplier : multiplier;
  }, 1);

const getCityEventUnmortgageMultiplier = (state: GameState): number =>
  getActiveCityEventDefinitions(state).reduce(
    (multiplier, event) => multiplier * (event.effects.unmortgageMultiplier ?? 1),
    1,
  );

const getCityEventFineMultiplier = (state: GameState): number =>
  getActiveCityEventDefinitions(state).reduce((multiplier, event) => multiplier * (event.effects.fineMultiplier ?? 1), 1);

const hasSingleDieRolls = (state: GameState): boolean =>
  getActiveCityEventDefinitions(state).some((event) => event.effects.singleDieRolls);

const isBuildingBlockedByCityEvent = (state: GameState): boolean =>
  getActiveCityEventDefinitions(state).some((event) => event.effects.buildingBlocked);

const getRollDiceCount = (state: GameState): 1 | 2 => (hasSingleDieRolls(state) ? 1 : 2);

const normalizeDiceForRoll = (state: GameState, dice: [number, number]): [number, number] =>
  getRollDiceCount(state) === 1 ? [dice[0], 0] : dice;

const isDoubleDice = (dice: [number, number] | undefined): boolean =>
  Boolean(dice && dice[1] > 0 && dice[0] === dice[1]);

export const getEffectiveFineAmount = (state: GameState, amount: number): number =>
  ceilMoney(amount * getCityEventFineMultiplier(state) * getLateGameFineMultiplier(state.turn));

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

  return {
    ...base,
    players: orderedPlayers,
    currentPlayerId: orderedPlayers[0].id,
    phase: 'rolling',
    turn: 1,
    currentRound: 1,
    doublesInRow: 0,
    builtThisRoll: undefined,
    lastOrderRollPlayerId: playerId,
    log: appendLog(base, `Чергу визначено: ${orderText}. ${orderedPlayers[0].name} починає партію.`, 'good'),
  };
};

const rollDice = (state: GameState, playerId: string, dice: [number, number]): GameState => {
  assertCurrent(state, playerId);
  if (state.phase !== 'rolling') throw new Error('Зараз не можна кидати кубики.');
  if (hasPendingTrade(state)) throw new Error('Спочатку прийміть або відхиліть активну угоду.');

  const player = getPlayer(state, playerId);
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
  };

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

const movePlayer = (state: GameState, playerId: string, steps: number): GameState => {
  const player = getPlayer(state, playerId);
  const nextPosition = (player.position + steps) % boardTiles.length;
  const startReward = getStartReward(player.position, nextPosition, steps > 0, state.turn);
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

  return resolveTile(next, playerId, steps);
};

const resolveTile = (state: GameState, playerId: string, diceTotal: number): GameState => {
  const player = getPlayer(state, playerId);
  const tile = getTile(player.position);

  if (tile.type === 'goToJail') {
    const jailFine = getEffectiveFineAmount(state, JAIL_FINE);
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
    return {
      ...state,
      phase: 'casino',
      pendingCasino: { playerId, tileId: tile.id },
      log: appendLog(state, `${player.name} зупиняється біля казино і може зробити ставку до ${CASINO_MAX_BET}₴.`),
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

    if (property.ownerId !== playerId) {
      const baseRent = calculateRent(state, tile, diceTotal);
      const rentService = findRentService(state, property.ownerId, playerId, tile.id);
      const rent = applyRentService(baseRent, rentService);
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

const buyPendingProperty = (state: GameState, playerId: string): GameState => {
  assertCurrent(state, playerId);
  if (state.phase !== 'awaitingPurchase' || state.pendingPurchaseTileId === undefined) {
    throw new Error('Немає майна для купівлі.');
  }

  const tile = getTile(state.pendingPurchaseTileId);
  if (!isPropertyTile(tile)) throw new Error('Цю клітинку не можна купити.');
  const player = getPlayer(state, playerId);
  const price = getEffectivePropertyPrice(state, tile);
  if (player.money < price) throw new Error('Недостатньо грошей.');

  return {
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
    players: state.players.map((candidate) =>
      candidate.id === playerId
        ? { ...candidate, money: candidate.money - price, properties: [...candidate.properties, tile.id] }
        : candidate,
    ),
    log: appendLog(state, `${player.name} купує ${tile.name} за ${price}₴.`, 'good'),
  };
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
    return {
      ...state,
      phase: auction.source === 'cityEvent' ? 'rolling' : 'turnEnd',
      auction: undefined,
      log: appendLog(state, `Аукціон за ${getTile(auction.tileId).name} завершено без покупця.`),
    };
  }

  const winner = getPlayer(state, auction.highestBidderId);
  return {
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
    players: state.players.map((player) =>
      player.id === winner.id
        ? {
            ...player,
            money: player.money - auction.highestBid,
            properties: [...player.properties, auction.tileId],
          }
        : player,
    ),
    log: appendLog(state, `${winner.name} виграє аукціон за ${auction.highestBid}₴.`, 'good'),
  };
};

const skipCasino = (state: GameState, playerId: string): GameState => {
  assertCurrent(state, playerId);
  if (state.phase !== 'casino' || state.pendingCasino?.playerId !== playerId) {
    throw new Error('Зараз немає рішення в казино.');
  }
  if (state.pendingCasino.spinEndsAt) throw new Error('Рулетка вже крутиться.');

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
  const bet = normalizeCasinoBet(player, amount);
  const resultMultiplier = normalizeCasinoMultiplier(multiplier);
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
    log: appendLog(state, `${player.name} ставить ${bet}₴ і запускає рулетку.`),
  };
};

const casinoBet = (state: GameState, playerId: string, amount: number, multiplier: number): GameState => {
  assertCurrent(state, playerId);
  if (state.phase !== 'casino' || state.pendingCasino?.playerId !== playerId) {
    throw new Error('Зараз немає активного казино.');
  }

  const player = getPlayer(state, playerId);
  const bet = normalizeCasinoBet(player, amount);
  const resultMultiplier = normalizeCasinoMultiplier(multiplier);
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
    return createPendingPayment(
      {
        ...state,
        pendingCasino: undefined,
        log: appendLog(state, text, 'bad'),
      },
      {
        payerId: playerId,
        amount: Math.abs(net),
        reason: 'програш у казино',
        tileId: state.pendingCasino.tileId,
        source: 'casino',
      },
    );
  }

  const nextPlayers = state.players.map((candidate) =>
    candidate.id === playerId ? { ...candidate, money: candidate.money + net } : candidate,
  );

  return {
    ...state,
    phase: 'turnEnd',
    pendingCasino: undefined,
    players: nextPlayers,
    log: appendLog(state, text, net > 0 ? 'good' : net < 0 ? 'bad' : 'neutral'),
  };
};

const normalizeCasinoBet = (player: Player, amount: number): number => {
  const bet = Math.floor(amount);
  const maxBet = Math.min(CASINO_MAX_BET, player.money);
  if (!Number.isFinite(bet) || bet <= 0 || bet > maxBet) {
    throw new Error(`Ставка має бути від 1 до ${maxBet}₴.`);
  }
  return bet;
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

const payJailFine = (state: GameState, playerId: string): GameState => {
  assertCurrent(state, playerId);
  if (state.phase !== 'awaitingJailDecision' || state.pendingJail?.playerId !== playerId) {
    throw new Error('Зараз немає рішення щодо вʼязниці.');
  }

  const player = getPlayer(state, playerId);
  const jailFine = getEffectiveFineAmount(state, JAIL_FINE);
  if (player.money < jailFine) throw new Error('Недостатньо коштів для штрафу.');

  return {
    ...chargePlayer(state, playerId, jailFine),
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
  if (!ownsFullGroup(state, playerId, tile.group)) throw new Error('Потрібна монополія групи.');
  if (state.builtThisRoll?.playerId === playerId && state.builtThisRoll.diceRollId === state.diceRollId) {
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

  const refund = Math.floor(tile.houseCost / 2);
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
      player.id === playerId ? { ...player, money: player.money + tile.mortgage } : player,
    ),
    log: appendLog(state, `${getPlayer(state, playerId).name} заставляє ${tile.name} і отримує ${tile.mortgage}₴.`),
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
  validateTradeValueRange({
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

const validateTradeValueRange = (offer: Omit<TradeOffer, 'id' | 'status'> | TradeOffer) => {
  const hasPricedProperty = offer.offerProperties.length > 0 || offer.requestProperties.length > 0;
  if (!hasPricedProperty) return;

  const offerValue = offer.offerMoney + tradePropertiesValue(offer.offerProperties);
  const requestValue = offer.requestMoney + tradePropertiesValue(offer.requestProperties);
  if (requestValue <= 0) {
    throw new Error('Обмін майном має мати цінність з обох сторін.');
  }

  const maximum = Math.floor(requestValue * 3);
  if (offerValue > maximum) {
    throw new Error(`Пропозиція занадто велика: максимум ${maximum}₴ з урахуванням майна.`);
  }
};

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
  return {
    ...next,
    phase: getTradeResolutionPhase(state),
    tradeOffers: next.tradeOffers.map((candidate) =>
      candidate.id === offerId ? { ...candidate, status: 'accepted' } : candidate,
    ),
    log: appendLog(next, `${to.name} приймає угоду ${from.name}: ${formatTradeOfferLog(offer)}.`, 'good'),
  };
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

const payRent = (state: GameState, playerId: string): GameState => {
  assertCurrent(state, playerId);
  if (state.phase !== 'rent' || !state.pendingRent || state.pendingRent.payerId !== playerId) {
    throw new Error('Зараз немає оренди до сплати.');
  }

  const payer = getPlayer(state, playerId);
  const owner = getPlayer(state, state.pendingRent.ownerId);
  const tile = getTile(state.pendingRent.tileId);
  if (payer.money < state.pendingRent.amount) throw new Error('Недостатньо грошей для сплати оренди.');

  return {
    ...transfer(state, playerId, state.pendingRent.ownerId, state.pendingRent.amount),
    phase: 'turnEnd',
    pendingRent: undefined,
    log: appendLog(
      state,
      state.pendingRent.originalAmount
        ? `${payer.name} сплачує ${state.pendingRent.amount}₴ замість ${state.pendingRent.originalAmount}₴ оренди гравцю ${owner.name} за ${tile.name}.`
        : `${payer.name} сплачує ${state.pendingRent.amount}₴ оренди гравцю ${owner.name} за ${tile.name}.`,
      'bad',
    ),
  };
};

const payPendingPayment = (state: GameState, playerId: string): GameState => {
  assertCurrent(state, playerId);
  if (state.phase !== 'payment' || !state.pendingPayment || state.pendingPayment.payerId !== playerId) {
    throw new Error('Зараз немає платежу до сплати.');
  }

  const payment = state.pendingPayment;
  const payer = getPlayer(state, playerId);
  if (payer.money < payment.amount) throw new Error('Недостатньо грошей для сплати.');

  const recipientAmounts = new Map((payment.recipients ?? []).map((recipient) => [recipient.playerId, recipient.amount]));
  return {
    ...state,
    phase: 'turnEnd',
    pendingPayment: undefined,
    players: state.players.map((player) => {
      if (player.id === playerId) return { ...player, money: player.money - payment.amount };
      const received = recipientAmounts.get(player.id) ?? 0;
      return received > 0 ? { ...player, money: player.money + received } : player;
    }),
    log: appendLog(state, `${payer.name} сплачує ${payment.amount}₴: ${payment.reason}.`, 'bad'),
  };
};

const payBail = (state: GameState, playerId: string): GameState => {
  assertCurrent(state, playerId);
  const player = getPlayer(state, playerId);
  if (player.jailTurns <= 0) throw new Error('Гравець не у вʼязниці.');
  const jailFine = getEffectiveFineAmount(state, JAIL_FINE);
  if (player.money < jailFine && player.jailCards <= 0) throw new Error('Недостатньо коштів.');
  const usesCard = player.jailCards > 0;
  return {
    ...state,
    phase: 'rolling',
    players: state.players.map((candidate) =>
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

  const next: GameState = {
    ...stateAfterCityEventTicks,
    cityEventDeck: stateAfterCityEventTicks.cityEventDeck ?? createCityEventDeck(),
    cityEventDiscard: stateAfterCityEventTicks.cityEventDiscard ?? [],
    activeCityEvents: stateAfterCityEventTicks.activeCityEvents ?? [],
    currentPlayerId: nextPlayer.id,
    currentRound: nextRound,
    turn: stateAfterCityEventTicks.turn + 1,
    phase: 'rolling',
    pendingRent: undefined,
    pendingPayment: undefined,
    pendingCasino: undefined,
    pendingJail: undefined,
    builtThisRoll: undefined,
    pendingCard: undefined,
    pendingCardDraw: undefined,
    doublesInRow: 0,
    log: appendLog(stateAfterCityEventTicks, `Хід переходить до ${nextPlayer.name}.`),
  };

  return startsNewRound && shouldDrawCityEvent(nextRound) ? drawCityEvent(next) : next;
};

const shouldDrawCityEvent = (round: number): boolean => round > 1 && (round - 1) % CITY_EVENT_ROUND_INTERVAL === 0;

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
  if (pendingCityEvent && activeIds.has(pendingCityEvent.id)) return pendingCityEvent;

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

const drawCityEvent = (state: GameState): GameState => {
  const cityEventDeck = state.cityEventDeck?.length ? state.cityEventDeck : createCityEventDeck(state.cityEventDiscard ?? []);
  const [eventId, ...restDeck] = cityEventDeck;
  const event = getCityEventDefinition(eventId);
  const activeCityEvents =
    event.durationRounds > 0
      ? [
          ...(state.activeCityEvents ?? []).filter((candidate) => candidate.id !== event.id),
          {
            id: event.id,
            remainingRounds: event.durationRounds,
            durationRounds: event.durationRounds,
            startedRound: state.currentRound ?? 1,
          },
        ]
      : state.activeCityEvents ?? [];
  const nextBeforeStartEffects: GameState = {
    ...state,
    cityEventDeck: restDeck,
    cityEventDiscard: [...(state.cityEventDiscard ?? []), event.id],
    activeCityEvents,
    pendingCityEvent: {
      id: event.id,
      title: event.title,
      text: event.text,
      round: state.currentRound ?? 1,
    },
    log: appendLog(state, `Подія міста: ${event.title}. ${event.text}`, 'good'),
  };
  const next = applyCityEventStartEffects(nextBeforeStartEffects, event);

  return event.effects.startAuctionOnUnowned ? startCityEventAuction(next, event) : next;
};

const applyCityEventStartEffects = (state: GameState, event: CityEventDefinition): GameState => {
  const cashPaymentPercent = event.effects.cashPaymentPercent;
  if (!cashPaymentPercent) return state;

  const payments = state.players.map((player) =>
    player.isBankrupt ? 0 : Math.max(0, Math.min(player.money, ceilMoney(Math.max(0, player.money) * cashPaymentPercent))),
  );
  const total = payments.reduce((sum, payment) => sum + payment, 0);
  if (total <= 0) return state;

  return {
    ...state,
    players: state.players.map((player, index) => ({ ...player, money: player.money - payments[index] })),
    log: appendLog(state, `${event.title}: гравці сплачують банку разом ${total}₴.`, 'bad'),
  };
};

const startCityEventAuction = (state: GameState, event: CityEventDefinition): GameState => {
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
      startedAt: now,
      endsAt: now + AUCTION_DURATION_MS,
      minimumBid,
      highestBid: 0,
      bids: [],
    },
    log: appendLog(state, `${event.title}: аукціон на ${tile.name} зі стартом ${minimumBid}₴.`),
  };
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
      pendingJail: undefined,
      pendingCard: undefined,
      pendingPurchaseTileId: undefined,
      pendingCardDraw: undefined,
      log: appendLog(state, `${player.name} викинув дубль і може кидати ще раз.`, 'good'),
    };
  }

  return endTurn(state, playerId);
};

const declareBankruptcy = (state: GameState, playerId: string): GameState => {
  const debtor = getPlayer(state, playerId);
  const paymentCreditorId =
    state.pendingPayment?.payerId === playerId && state.pendingPayment.recipients?.length === 1
      ? state.pendingPayment.recipients[0].playerId
      : undefined;
  const creditorId = state.pendingRent?.payerId === playerId ? state.pendingRent.ownerId : paymentCreditorId;
  let next: GameState = {
    ...state,
    players: state.players.map((player) => {
      if (player.id === playerId) return { ...player, isBankrupt: true, properties: [], money: 0 };
      if (player.id === creditorId) return { ...player, properties: [...player.properties, ...debtor.properties] };
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
              ownerId: creditorId,
            }
          : property,
      ]),
    ),
    pendingRent: undefined,
    pendingPayment: undefined,
    pendingJail: undefined,
    rentServices: (state.rentServices ?? []).filter(
      (service) => service.ownerId !== playerId && service.beneficiaryId !== playerId,
    ),
    log: appendLog(state, `${debtor.name} оголошує банкрутство.`, 'bad'),
  };
  const survivors = next.players.filter((player) => !player.isBankrupt);
  if (survivors.length === 1) {
    next = { ...next, phase: 'finished', winnerId: survivors[0].id };
  } else {
    next = endTurn({ ...next, phase: 'turnEnd' }, playerId);
  }
  return next;
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
  const replenished = source.length ? source : discard;
  const [cardId, ...rest] = replenished;
  const card = fullDeck.find((candidate) => candidate.id === cardId) ?? fullDeck[0];
  const applied = card.apply(
    {
      ...state,
      chanceDeck: deck === 'chance' ? rest : state.chanceDeck,
      communityDeck: deck === 'community' ? rest : state.communityDeck,
      discardChance: deck === 'chance' ? [...(source.length ? state.discardChance : []), card.id] : state.discardChance,
      discardCommunity:
        deck === 'community' ? [...(source.length ? state.discardCommunity : []), card.id] : state.discardCommunity,
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
      resolved.phase === 'casino'
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
    const jailFine = getEffectiveFineAmount(state, JAIL_FINE);
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
    if (property.ownerId !== playerId) {
      const baseRent = calculateRent(state, tile, state.dice[0] + state.dice[1]);
      const rentService = findRentService(state, property.ownerId, playerId, tile.id);
      const rent = applyRentService(baseRent, rentService);
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
    return {
      ...state,
      phase: 'casino',
      pendingCasino: { playerId, tileId: tile.id },
      log: appendLog(state, `${player.name} зупиняється біля казино і може зробити ставку до ${CASINO_MAX_BET}₴.`),
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

const createPendingPayment = (state: GameState, payment: PendingPayment): GameState => {
  const amount = Math.floor(payment.source === 'tax' ? getEffectiveFineAmount(state, payment.amount) : payment.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      ...state,
      phase: 'turnEnd',
      pendingPayment: undefined,
    };
  }

  const payer = getPlayer(state, payment.payerId);
  return {
    ...state,
    phase: 'payment',
    pendingPayment: {
      ...payment,
      amount,
    },
    pendingRent: undefined,
    log: appendLog(state, `${payer.name} має сплатити ${amount}₴: ${payment.reason}.`, 'bad'),
  };
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

const ownsFullGroup = (state: GameState, playerId: string, group: string): boolean =>
  cityGroup(group).every((tile) => state.properties[tile.id]?.ownerId === playerId);

const cityGroup = (group: string): CityTile[] =>
  boardTiles.filter((tile): tile is CityTile => tile.type === 'city' && tile.group === group);

const ownedProperties = (state: GameState, playerId: string): PropertyTile[] =>
  propertyTiles.filter((tile) => state.properties[tile.id]?.ownerId === playerId);

const getPlayer = (state: GameState, playerId: string): Player => {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`Unknown player ${playerId}`);
  return player;
};

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

  if (state.phase !== 'rolling' && !isPurchaseDecision && !isRentDecision && !isPaymentDecision) {
    throw new Error(message);
  }
};

const randomDice = (diceCount: 1 | 2 = 2): [number, number] => {
  const first = Math.floor(Math.random() * 6) + 1;
  if (diceCount === 1) return [first, 0];
  return [first, Math.floor(Math.random() * 6) + 1];
};

const createCardDeck = (cards: typeof chanceCards): number[] => {
  const weighted = cards.flatMap((card) => Array(card.rarity === 'rare' ? 1 : 4).fill(card.id));
  return shuffle(weighted);
};

const createCityEventDeck = (recentDiscard: CityEventId[] = []): CityEventId[] => {
  const recentSet = new Set(recentDiscard.slice(-5));
  const candidates = cityEventDefinitions
    .map((event) => event.id)
    .filter((eventId) => !recentSet.has(eventId));
  return shuffle(candidates.length > 0 ? candidates : cityEventDefinitions.map((event) => event.id));
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
