import type { CardDeck, GameState } from '../engine/types';
import { getCityEventDefinition } from './cityEvents';
import { getStartReward } from '../engine/startRewards';
import { getLateGameFineMultiplier } from '../engine/difficulty';
import { money, moneyText } from '../engine/economy';
import { boardTiles } from './board';

const JAIL_TURNS = 3;

export interface CardDefinition {
  id: number;
  deck: CardDeck;
  title: string;
  text: string;
  rarity?: 'normal' | 'rare';
  apply: (state: GameState, playerId: string) => GameState;
}

export const chanceCards: CardDefinition[] = [
  {
    id: 0,
    deck: 'chance',
    title: 'Швидкісний Інтерсіті',
    text: `Перейдіть на Старт і отримайте ${moneyText(300)}.`,
    apply: (state, playerId) => moveTo(state, playerId, 0, true),
  },
  {
    id: 1,
    deck: 'chance',
    title: 'Ділова поїздка',
    text: `Перейдіть до Києва. Якщо проходите Старт, отримайте ${moneyText(200)}.`,
    rarity: 'rare',
    apply: (state, playerId) => moveTo(state, playerId, 39, true),
  },
  {
    id: 2,
    deck: 'chance',
    title: 'Премія за маршрут',
    text: `Отримайте ${moneyText(100)}.`,
    apply: (state, playerId) => addMoney(state, playerId, money(100)),
  },
  {
    id: 3,
    deck: 'chance',
    title: 'Штраф за паркування',
    text: `Сплатіть ${moneyText(50)}.`,
    apply: (state, playerId) => addMoney(state, playerId, -money(50)),
  },
  {
    id: 4,
    deck: 'chance',
    title: "Прямуйте до в'язниці",
    text: 'Не проходьте Старт.',
    apply: (state, playerId) => jail(state, playerId),
  },
  {
    id: 5,
    deck: 'chance',
    title: 'Ремонт фасадів',
    text: `Сплатіть ${moneyText(25)} за кожен будинок і ${moneyText(100)} за готель.`,
    apply: (state, playerId) => repair(state, playerId, money(25), money(100)),
  },
  {
    id: 6,
    deck: 'chance',
    title: 'Найближчий банк',
    text: 'Перейдіть до найближчого банку. Якщо він має власника, далі спрацює оренда.',
    apply: (state, playerId) => moveToNearestType(state, playerId, 'bank'),
  },
  {
    id: 8,
    deck: 'chance',
    title: 'Інвестор у стартап',
    text: `Отримайте ${moneyText(150)} на розвиток бізнесу.`,
    apply: (state, playerId) => addMoney(state, playerId, money(150)),
  },
  {
    id: 9,
    deck: 'chance',
    title: 'Ремонт доріг',
    text: `Сплатіть ${moneyText(40)} за кожен будинок і ${moneyText(115)} за кожен готель.`,
    apply: (state, playerId) => repair(state, playerId, money(40), money(115)),
  },
  {
    id: 10,
    deck: 'chance',
    title: 'До Львова',
    text: `Перейдіть до Львова. Якщо проходите Старт, отримайте ${moneyText(200)}.`,
    rarity: 'rare',
    apply: (state, playerId) => moveTo(state, playerId, 37, true),
  },
  {
    id: 11,
    deck: 'chance',
    title: 'Благодійний марафон',
    text: `Сплатіть кожному активному супернику ${moneyText(20)}.`,
    apply: (state, playerId) => payEachOpponent(state, playerId, money(20)),
  },
  {
    id: 12,
    deck: 'chance',
    title: 'Вечір у казино',
    text: `Перейдіть у казино. Якщо проходите Старт, отримайте ${moneyText(200)}.`,
    apply: (state, playerId) => moveTo(state, playerId, 20, true),
  },
  {
    id: 13,
    deck: 'chance',
    title: 'УНО РЕВЕРС',
    text: 'Отримайте унікальну картку: під час оренди іншому гравцю можна перекинути платіж на власника.',
    apply: (state, playerId) => addUnoReverseCard(state, playerId),
  },
  {
    id: 14,
    deck: 'chance',
    title: 'Кредитна амністія',
    text: 'Рідкісна картка: погасіть один власний кредит без сплати з власних коштів.',
    rarity: 'rare',
    apply: (state, playerId) => addLoanPayoffCard(state, playerId),
  },
];

export const communityCards: CardDefinition[] = [
  {
    id: 0,
    deck: 'community',
    title: 'Грант громади',
    text: `Отримайте ${moneyText(100)}.`,
    apply: (state, playerId) => addMoney(state, playerId, money(100)),
  },
  {
    id: 1,
    deck: 'community',
    title: 'Комунальні платежі',
    text: `Сплатіть ${moneyText(75)}.`,
    apply: (state, playerId) => addMoney(state, playerId, -money(75)),
  },
  {
    id: 2,
    deck: 'community',
    title: 'Картка виходу',
    text: "Отримайте картку виходу з в'язниці.",
    apply: (state, playerId) => ({
      ...state,
      players: state.players.map((player) =>
        player.id === playerId ? { ...player, jailCards: player.jailCards + 1 } : player,
      ),
    }),
  },
  {
    id: 3,
    deck: 'community',
    title: 'До Павлограда',
    text: `Перейдіть до Павлограда. Якщо проходите Старт, отримайте ${moneyText(200)}.`,
    apply: (state, playerId) => moveTo(state, playerId, 1, true),
  },
  {
    id: 4,
    deck: 'community',
    title: 'Медичне страхування',
    text: `Сплатіть ${moneyText(50)}.`,
    apply: (state, playerId) => addMoney(state, playerId, -money(50)),
  },
  {
    id: 5,
    deck: 'community',
    title: 'Свято міста',
    text: `Кожен суперник платить вам ${moneyText(25)}.`,
    apply: (state, playerId) => {
      const activeOpponents = state.players.filter((player) => player.id !== playerId && !player.isBankrupt);
      return activeOpponents.reduce((next, opponent) => transferMoney(next, opponent.id, playerId, money(25)), state);
    },
  },
  {
    id: 6,
    deck: 'community',
    title: 'День міста',
    text: `Кожен активний суперник платить вам ${moneyText(40)}.`,
    apply: (state, playerId) => collectFromEachOpponent(state, playerId, money(40)),
  },
  {
    id: 7,
    deck: 'community',
    title: 'Кешбек за майно',
    text: `Отримайте ${moneyText(25)} за кожну вашу картку майна.`,
    apply: (state, playerId) => addMoneyForOwnedProperties(state, playerId, money(25)),
  },
  {
    id: 8,
    deck: 'community',
    title: 'Аварія в мережі',
    text: 'Перейдіть до найближчого сервісу. Якщо він має власника, далі спрацює оренда.',
    apply: (state, playerId) => moveToNearestType(state, playerId, 'utility'),
  },
  {
    id: 9,
    deck: 'community',
    title: 'Податкова помилка',
    text: `Банк повертає вам ${moneyText(75)}.`,
    apply: (state, playerId) => addMoney(state, playerId, money(75)),
  },
  {
    id: 10,
    deck: 'community',
    title: 'Сімейні витрати',
    text: `Сплатіть ${moneyText(80)}.`,
    apply: (state, playerId) => addMoney(state, playerId, -money(80)),
  },
  {
    id: 11,
    deck: 'community',
    title: 'Квиток до Одеси',
    text: `Перейдіть до Одеси. Якщо проходите Старт, отримайте ${moneyText(200)}.`,
    apply: (state, playerId) => moveTo(state, playerId, 29, true),
  },
  {
    id: 12,
    deck: 'community',
    title: 'Економіка просочування',
    text: 'В честь великого економічного Генія Пекельної Акули. Розподіліть 25% своїх грошей між іншими гравцями.',
    apply: (state, playerId) => redistributeMoneyToOpponents(state, playerId, 0.25),
  },
];

const addMoney = (state: GameState, playerId: string, amount: number): GameState => {
  const normalizedAmount = amount < 0 ? -getEffectiveFineAmount(state, Math.abs(amount)) : amount;
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? { ...player, money: player.money + normalizedAmount } : player,
    ),
  };
};

const addUnoReverseCard = (state: GameState, playerId: string): GameState => ({
  ...state,
  players: state.players.map((player) =>
    player.id === playerId ? { ...player, unoReverseCards: Math.min(1, (player.unoReverseCards ?? 0) + 1) } : player,
  ),
});

const addLoanPayoffCard = (state: GameState, playerId: string): GameState => ({
  ...state,
  players: state.players.map((player) =>
    player.id === playerId ? { ...player, loanPayoffCards: Math.min(1, (player.loanPayoffCards ?? 0) + 1) } : player,
  ),
});

const transferMoney = (state: GameState, fromPlayerId: string, toPlayerId: string, amount: number): GameState => ({
  ...state,
  players: state.players.map((player) => {
    if (player.id === fromPlayerId) return { ...player, money: player.money - amount };
    if (player.id === toPlayerId) return { ...player, money: player.money + amount };
    return player;
  }),
});

const activeOpponents = (state: GameState, playerId: string) =>
  state.players.filter((player) => player.id !== playerId && !player.isBankrupt);

const collectFromEachOpponent = (state: GameState, playerId: string, amount: number): GameState =>
  activeOpponents(state, playerId).reduce((next, opponent) => transferMoney(next, opponent.id, playerId, amount), state);

const payEachOpponent = (state: GameState, playerId: string, amount: number): GameState =>
  activeOpponents(state, playerId).reduce((next, opponent) => transferMoney(next, playerId, opponent.id, amount), state);

const redistributeMoneyToOpponents = (state: GameState, playerId: string, percent: number): GameState => {
  const player = state.players.find((candidate) => candidate.id === playerId);
  const opponents = activeOpponents(state, playerId);
  if (!player || opponents.length === 0) return state;

  const total = Math.min(player.money, Math.ceil(Math.max(0, player.money) * percent));
  if (total <= 0) return state;

  const baseShare = Math.floor(total / opponents.length);
  const remainder = total % opponents.length;
  return opponents.reduce(
    (next, opponent, index) => transferMoney(next, playerId, opponent.id, baseShare + (index < remainder ? 1 : 0)),
    state,
  );
};

const addMoneyForOwnedProperties = (state: GameState, playerId: string, amount: number): GameState => {
  const player = state.players.find((candidate) => candidate.id === playerId);
  return addMoney(state, playerId, (player?.properties.length ?? 0) * amount);
};

const moveTo = (state: GameState, playerId: string, tileId: number, collectGo: boolean): GameState => ({
  ...state,
  players: state.players.map((player) => {
    if (player.id !== playerId) return player;
    return { ...player, position: tileId, money: player.money + getStartReward(player.position, tileId, collectGo, state.turn) };
  }),
});

const moveToNearestType = (state: GameState, playerId: string, type: 'bank' | 'utility'): GameState => {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return state;

  const target = boardTiles
    .filter((tile) => tile.type === type)
    .sort((first, second) => {
      const firstDistance = (first.id - player.position + boardTiles.length) % boardTiles.length;
      const secondDistance = (second.id - player.position + boardTiles.length) % boardTiles.length;
      return firstDistance - secondDistance;
    })[0];

  return target ? moveTo(state, playerId, target.id, true) : state;
};

const jail = (state: GameState, playerId: string): GameState => ({
  ...state,
  players: state.players.map((player) =>
    player.id === playerId ? { ...player, position: 10, jailTurns: JAIL_TURNS } : player,
  ),
});

const repair = (state: GameState, playerId: string, houseFee: number, hotelFee: number): GameState => {
  const owned = Object.entries(state.properties).filter(([, property]) => property.ownerId === playerId);
  const total = owned.reduce((sum, [, property]) => {
    if (property.houses === 5) return sum + hotelFee;
    return sum + property.houses * houseFee;
  }, 0);
  return addMoney(state, playerId, -total);
};

const getEffectiveFineAmount = (state: GameState, amount: number): number => {
  const multiplier = (state.activeCityEvents ?? []).reduce(
    (current, event) => current * (getCityEventDefinition(event.id).effects.fineMultiplier ?? 1),
    1,
  );
  return Math.ceil(amount * multiplier * getLateGameFineMultiplier(state.turn));
};
