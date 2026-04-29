import { describe, expect, it, vi } from 'vitest';
import {
  calculateRent,
  buildMatchSummary,
  createInitialGame,
  diceRotationForValue,
  getBankDepositInfo,
  getBankDepositPayout,
  getBankLoanLimit,
  getDistrictCreationCost,
  getEffectiveBuildingRefund,
  getEffectiveFineAmount,
  getEffectiveHouseCost,
  getEffectiveMortgageValue,
  getEffectivePropertyPrice,
  getEffectiveUnmortgageCost,
  reduceGame,
  selectAwardIds,
} from './gameEngine';
import { money } from './economy';
import type { DistrictPath } from './types';
import { getTile } from '../data/board';

describe('Ukraine Monopoly engine', () => {
  it('supports games with up to six players', () => {
    const game = createInitialGame(['One', 'Two', 'Three', 'Four', 'Five', 'Six'], 'six-players');

    expect(game.players).toHaveLength(6);
    expect(game.players[5]).toMatchObject({ id: 'p6', name: 'Six' });
    expect(() => createInitialGame(['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'])).toThrow(
      'Гра підтримує 2-6 гравців.',
    );
  });

  it('lets players roll once to determine the starting turn order', () => {
    let game = createInitialGame(['One', 'Two', 'Three'], 'turn-order', { determineTurnOrder: true });

    expect(game.phase).toBe('orderRoll');
    expect(game.currentPlayerId).toBe('p1');

    game = reduceGame(game, { type: 'roll_for_order', playerId: 'p1', dice: [1, 1] });
    expect(game.phase).toBe('orderRoll');
    expect(game.currentPlayerId).toBe('p2');

    game = reduceGame(game, { type: 'roll_for_order', playerId: 'p2', dice: [6, 5] });
    expect(game.currentPlayerId).toBe('p3');

    game = reduceGame(game, { type: 'roll_for_order', playerId: 'p3', dice: [3, 3] });
    expect(game.phase).toBe('rolling');
    expect(game.currentPlayerId).toBe('p2');
    expect(game.players.map((player) => player.id)).toEqual(['p2', 'p3', 'p1']);
  });

  it('allows any unrolled player to roll during starting turn order', () => {
    let game = createInitialGame(['One', 'Two', 'Three'], 'turn-order-free', { determineTurnOrder: true });

    game = reduceGame(game, { type: 'roll_for_order', playerId: 'p3', dice: [6, 6] });

    expect(game.phase).toBe('orderRoll');
    expect(game.turnOrderRolls?.p3).toEqual([6, 6]);
    expect(game.lastOrderRollPlayerId).toBe('p3');
    expect(game.currentPlayerId).toBe('p1');

    game = reduceGame(game, { type: 'roll_for_order', playerId: 'p1', dice: [1, 1] });
    game = reduceGame(game, { type: 'roll_for_order', playerId: 'p2', dice: [3, 3] });

    expect(game.phase).toBe('rolling');
    expect(game.currentPlayerId).toBe('p3');
    expect(game.players.map((player) => player.id)).toEqual(['p3', 'p2', 'p1']);
  });

  it('moves a player, lets them buy Pavlohrad, and deducts money', () => {
    let game = createInitialGame(['Олена', 'Тарас'], 'test');
    expect(game.moneyHistory?.at(-1)?.money.p1).toBe(money(1700));
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 39 } : player)),
    };
    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    game = reduceGame(game, { type: 'buy', playerId: 'p1' });

    const player = game.players[0];
    expect(player.position).toBe(1);
    expect(player.money).toBe(money(1840));
    expect(game.properties[1].ownerId).toBe('p1');
    expect(game.moneyHistory?.at(-1)).toMatchObject({
      turn: 1,
      round: 1,
      money: { p1: money(1840), p2: money(1700) },
      worth: { p1: money(1900), p2: money(1700) },
    });

    game = reduceGame(game, { type: 'end_turn', playerId: 'p1' });
    expect(game.moneyHistory?.at(-1)).toMatchObject({
      turn: 2,
      round: 1,
      money: { p1: money(1840), p2: money(1700) },
      worth: { p1: money(1900), p2: money(1700) },
    });
  });

  it('pays 200 for passing start and 300 for landing on start', () => {
    let passGame = createInitialGame(['Olena', 'Taras'], 'start-pass');
    passGame = {
      ...passGame,
      players: passGame.players.map((player) => (player.id === 'p1' ? { ...player, position: 39 } : player)),
    };
    passGame = reduceGame(passGame, { type: 'roll', playerId: 'p1', dice: [1, 1] });

    expect(passGame.players.find((player) => player.id === 'p1')?.position).toBe(1);
    expect(passGame.players.find((player) => player.id === 'p1')?.money).toBe(money(1900));

    let landGame = createInitialGame(['Olena', 'Taras'], 'start-land');
    landGame = {
      ...landGame,
      players: landGame.players.map((player) => (player.id === 'p1' ? { ...player, position: 38 } : player)),
    };
    landGame = reduceGame(landGame, { type: 'roll', playerId: 'p1', dice: [1, 1] });

    expect(landGame.players.find((player) => player.id === 'p1')?.position).toBe(0);
    expect(landGame.players.find((player) => player.id === 'p1')?.money).toBe(money(2000));
  });

  it('reduces start rewards as the game gets longer', () => {
    let midGame = createInitialGame(['Olena', 'Taras'], 'late-start-mid');
    midGame = {
      ...midGame,
      turn: 36,
      players: midGame.players.map((player) => (player.id === 'p1' ? { ...player, position: 39 } : player)),
    };
    midGame = reduceGame(midGame, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    expect(midGame.players.find((player) => player.id === 'p1')?.money).toBe(money(1850));

    let lateGame = createInitialGame(['Olena', 'Taras'], 'late-start-end');
    lateGame = {
      ...lateGame,
      turn: 66,
      players: lateGame.players.map((player) => (player.id === 'p1' ? { ...player, position: 38 } : player)),
    };
    lateGame = reduceGame(lateGame, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    expect(lateGame.players.find((player) => player.id === 'p1')?.money).toBe(money(1850));
  });

  it('charges doubled rent when the owner has a full color group without houses', () => {
    let game = createInitialGame(['Олена', 'Тарас'], 'test');
    game = {
      ...game,
      properties: {
        ...game.properties,
        1: { ...game.properties[1], ownerId: 'p1' },
        3: { ...game.properties[3], ownerId: 'p1' },
      },
      players: game.players.map((player) =>
        player.id === 'p1' ? { ...player, properties: [1, 3] } : player,
      ),
    };

    const pavlohrad = getTile(1);
    if (pavlohrad.type !== 'city') throw new Error('Expected Pavlohrad to be a city.');
    expect(calculateRent(game, pavlohrad)).toBe(money(4));
  });

  it('keeps Pavlohrad house rents above the other amber city', () => {
    const pavlohrad = getTile(1);
    const amberNeighbor = getTile(3);
    if (pavlohrad.type !== 'city' || amberNeighbor.type !== 'city') {
      throw new Error('Expected amber city tiles.');
    }

    pavlohrad.rents.slice(1).forEach((rent, index) => {
      expect(rent).toBeGreaterThan(amberNeighbor.rents[index + 1]);
    });
  });

  it('uses bank count instead of station rent', () => {
    let game = createInitialGame(['Олена', 'Тарас'], 'test');
    game = {
      ...game,
      properties: {
        ...game.properties,
        5: { ...game.properties[5], ownerId: 'p1' },
        15: { ...game.properties[15], ownerId: 'p1' },
        25: { ...game.properties[25], ownerId: 'p1' },
      },
      players: game.players.map((player) =>
        player.id === 'p1' ? { ...player, properties: [5, 15, 25] } : player,
      ),
    };

    const mono = getTile(5);
    if (mono.type !== 'bank') throw new Error('Expected MonoBank to be a bank.');
    expect(calculateRent(game, mono)).toBe(money(150));
  });

  it('allows bank deposits from an owned bank and returns them with turn interest on any owned bank', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'bank-deposit');
    game = withOwnership(game, 'p1', [5, 15, 25]);

    expect(getBankDepositInfo(game, 'p1')).toMatchObject({
      bankCount: 3,
      amount: money(150),
      canStart: false,
    });
    expect(() => reduceGame(game, { type: 'start_bank_deposit', playerId: 'p1' })).toThrow();

    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 2 } : player)),
    };
    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 2] });

    expect(game.phase).toBe('bankDeposit');
    expect(game.pendingBankDeposit).toMatchObject({ playerId: 'p1', tileId: 5, amount: money(150) });

    expect(getBankDepositInfo(game, 'p1')).toMatchObject({
      bankCount: 3,
      amount: money(150),
      canStart: true,
    });

    game = reduceGame(game, { type: 'start_bank_deposit', playerId: 'p1' });

    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1550));
    expect(game.bankDeposits.p1).toMatchObject({ amount: money(150), turns: 0 });

    game = {
      ...game,
      phase: 'rolling',
      bankDeposits: {
        ...game.bankDeposits,
        p1: { ...game.bankDeposits.p1, turns: 1 },
      },
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 14 } : player)),
    };
    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 0] });

    expect(game.phase).toBe('turnEnd');
    expect(game.bankDeposits.p1).toBeUndefined();
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1732));
  });

  it('keeps a bank deposit frozen when the owner has only one bank', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'bank-deposit-frozen');
    game = withOwnership(game, 'p1', [5, 15]);
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 2 } : player)),
    };
    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 2] });
    game = reduceGame(game, { type: 'start_bank_deposit', playerId: 'p1' });
    game = withOwnership(game, 'p2', [15]);
    game = {
      ...game,
      phase: 'rolling',
      bankDeposits: {
        ...game.bankDeposits,
        p1: { ...game.bankDeposits.p1, turns: 4 },
      },
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 4 } : player)),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 0] });

    expect(game.phase).toBe('turnEnd');
    expect(game.bankDeposits.p1).toMatchObject({ amount: money(75), turns: 5 });
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1625));
  });

  it('lets a bank deposit cover payments and keeps the unused balance growing', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'bank-deposit-payment');
    game = {
      ...game,
      phase: 'payment',
      pendingPayment: {
        payerId: 'p1',
        amount: money(200),
        reason: 'тестовий платіж',
        source: 'tax',
      },
      bankDeposits: {
        p1: { playerId: 'p1', amount: money(240), turns: 0, createdAtTurn: 1, createdAtDiceRollId: 1 },
      },
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, money: money(0) } : player)),
    };

    game = reduceGame(game, { type: 'pay_payment_with_deposit', playerId: 'p1' });

    expect(game.phase).toBe('turnEnd');
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(0));
    expect(game.bankDeposits.p1).toMatchObject({ amount: money(40), turns: 0 });

    game = {
      ...game,
      phase: 'rolling',
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 0 } : player)),
    };
    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 0] });

    expect(game.bankDeposits.p1).toMatchObject({ amount: money(40), turns: 1 });
    expect(getBankDepositPayout(game.bankDeposits.p1)).toBe(money(44));
  });

  it('leaves a reduced payment decision when a bank deposit only partially covers it', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'bank-deposit-partial-payment');
    game = {
      ...game,
      phase: 'payment',
      pendingPayment: {
        payerId: 'p1',
        amount: money(300),
        reason: 'тестовий платіж',
        source: 'tax',
      },
      bankDeposits: {
        p1: { playerId: 'p1', amount: money(240), turns: 0, createdAtTurn: 1, createdAtDiceRollId: 1 },
      },
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, money: money(60) } : player)),
    };

    game = reduceGame(game, { type: 'pay_payment_with_deposit', playerId: 'p1' });

    expect(game.phase).toBe('payment');
    expect(game.pendingPayment).toMatchObject({ payerId: 'p1', amount: money(60), source: 'tax' });
    expect(game.bankDeposits.p1).toBeUndefined();
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(60));

    game = reduceGame(game, { type: 'pay_payment', playerId: 'p1' });

    expect(game.phase).toBe('turnEnd');
    expect(game.pendingPayment).toBeUndefined();
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(0));
  });

  it('uses a bank deposit as partial rent funding and caps deposit growth at 650', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'bank-deposit-rent');
    game = {
      ...game,
      phase: 'rent',
      pendingRent: { payerId: 'p1', ownerId: 'p2', tileId: 5, amount: money(300) },
      bankDeposits: {
        p1: { playerId: 'p1', amount: money(240), turns: 0, createdAtTurn: 1, createdAtDiceRollId: 1 },
      },
      players: game.players.map((player) =>
        player.id === 'p1'
          ? { ...player, money: money(60) }
          : player.id === 'p2'
            ? { ...player, money: money(1700) }
            : player,
      ),
    };

    game = reduceGame(game, { type: 'pay_rent_with_deposit', playerId: 'p1' });

    expect(game.phase).toBe('rent');
    expect(game.pendingRent).toMatchObject({ payerId: 'p1', ownerId: 'p2', tileId: 5, amount: money(60) });
    expect(game.bankDeposits.p1).toBeUndefined();
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(60));
    expect(game.players.find((player) => player.id === 'p2')?.money).toBe(money(1940));

    game = reduceGame(game, { type: 'pay_rent', playerId: 'p1' });

    expect(game.phase).toBe('turnEnd');
    expect(game.bankDeposits.p1).toBeUndefined();
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(0));
    expect(game.players.find((player) => player.id === 'p2')?.money).toBe(money(2000));
    expect(
      getBankDepositPayout({
        playerId: 'p1',
        amount: money(600),
        turns: 2,
        createdAtTurn: 1,
        createdAtDiceRollId: 1,
      }),
    ).toBe(money(650));
  });

  it('allows selling buildings and mortgaging property during a bank deposit decision', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'bank-deposit-management');
    game = withOwnership(game, 'p1', [1, 3, 5, 15]);
    game = {
      ...game,
      players: game.players.map((player) =>
        player.id === 'p1' ? { ...player, money: money(20), position: 2 } : player,
      ),
      properties: {
        ...game.properties,
        1: { ...game.properties[1], ownerId: 'p1', houses: 1 },
        3: { ...game.properties[3], ownerId: 'p1', houses: 1 },
      },
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 2] });

    expect(game.phase).toBe('bankDeposit');
    expect(getBankDepositInfo(game, 'p1').canStart).toBe(false);

    game = reduceGame(game, { type: 'sell_building', playerId: 'p1', tileId: 1 });
    expect(game.phase).toBe('bankDeposit');
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(45));

    game = reduceGame(game, { type: 'mortgage', playerId: 'p1', tileId: 1 });
    expect(game.phase).toBe('bankDeposit');
    expect(getBankDepositInfo(game, 'p1').canStart).toBe(true);

    game = reduceGame(game, { type: 'start_bank_deposit', playerId: 'p1' });

    expect(game.phase).toBe('turnEnd');
    expect(game.bankDeposits.p1).toMatchObject({ amount: money(75), turns: 0 });
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(0));
  });

  it('charges utility rent at x6 for one service and x12 for both services', () => {
    let game = createInitialGame(['Олена', 'Тарас'], 'utility-rent');
    game = withOwnership(game, 'p1', [12]);

    const electric = getTile(12);
    if (electric.type !== 'utility') throw new Error('Expected electric service to be a utility.');
    expect(calculateRent(game, electric, 7)).toBe(money(42));

    game = withOwnership(game, 'p1', [12, 28]);
    expect(calculateRent(game, electric, 7)).toBe(money(84));
  });

  it('waits for a rent decision and then transfers rent on pay', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'rent-decision');
    game = withOwnership(game, 'p2', [1]);
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 39 } : player)),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });

    expect(game.phase).toBe('rent');
    expect(game.pendingRent).toMatchObject({ payerId: 'p1', ownerId: 'p2', tileId: 1, amount: money(2) });
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1900));
    expect(game.players.find((player) => player.id === 'p2')?.money).toBe(money(1700));

    game = reduceGame(game, { type: 'pay_rent', playerId: 'p1' });

    expect(game.phase).toBe('turnEnd');
    expect(game.pendingRent).toBeUndefined();
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1898));
    expect(game.players.find((player) => player.id === 'p2')?.money).toBe(money(1702));
  });

  it('caps UNO Reverse cards at one when drawn', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'uno-reverse-card-cap');
    game = {
      ...game,
      phase: 'awaitingCard',
      pendingCardDraw: { deck: 'chance', tileId: 7 },
      chanceDeck: [13],
      discardChance: [],
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, unoReverseCards: 1 } : player)),
    };

    game = reduceGame(game, { type: 'draw_card', playerId: 'p1' });

    expect(game.players.find((player) => player.id === 'p1')?.unoReverseCards).toBe(1);
    expect(game.pendingCard?.title).toBe('УНО РЕВЕРС');
    expect(game.discardChance).not.toContain(13);
  });

  it('does not recycle UNO Reverse after it has been drawn', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'uno-reverse-no-recycle');
    game = {
      ...game,
      phase: 'awaitingCard',
      pendingCardDraw: { deck: 'chance', tileId: 7 },
      chanceDeck: [13],
      discardChance: [2],
    };

    game = reduceGame(game, { type: 'draw_card', playerId: 'p1' });

    expect(game.players.find((player) => player.id === 'p1')?.unoReverseCards).toBe(1);
    expect(game.discardChance).toEqual([2]);

    game = {
      ...game,
      phase: 'awaitingCard',
      pendingCardDraw: { deck: 'chance', tileId: 7 },
      chanceDeck: [],
      discardChance: [13, 2],
    };

    game = reduceGame(game, { type: 'draw_card', playerId: 'p1' });

    expect(game.pendingCard?.cardId).toBe(2);
    expect(game.discardChance).toEqual([2]);
  });

  it('uses UNO Reverse on rent and returns a double turn to the original player', () => {
    let game = createInitialGame(['Olena', 'Taras', 'Maria'], 'uno-reverse-double');
    game = withOwnership(game, 'p3', [1]);
    game = {
      ...game,
      players: game.players.map((player) =>
        player.id === 'p1' ? { ...player, position: 39, unoReverseCards: 1 } : player,
      ),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    game = reduceGame(game, { type: 'use_uno_reverse', playerId: 'p1' });

    expect(game.currentPlayerId).toBe('p3');
    expect(game.pendingRent).toMatchObject({ payerId: 'p3', ownerId: 'p1', tileId: 1, amount: money(2) });
    expect(game.pendingRent?.unoReverse).toMatchObject({ originalTurnPlayerId: 'p1', fromPlayerId: 'p1', toPlayerId: 'p3' });
    expect(game.players.find((player) => player.id === 'p1')?.unoReverseCards).toBe(0);

    game = reduceGame(game, { type: 'pay_rent', playerId: 'p3' });

    expect(game.phase).toBe('turnEnd');
    expect(game.currentPlayerId).toBe('p1');
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1902));
    expect(game.players.find((player) => player.id === 'p3')?.money).toBe(money(1698));

    game = reduceGame(game, { type: 'continue_turn', playerId: 'p1' });

    expect(game.phase).toBe('rolling');
    expect(game.currentPlayerId).toBe('p1');
  });

  it('continues to the next player after an UNO Reverse rent payment without a double', () => {
    let game = createInitialGame(['Olena', 'Taras', 'Maria'], 'uno-reverse-next-player');
    game = withOwnership(game, 'p3', [3]);
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, unoReverseCards: 1 } : player)),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 2] });
    game = reduceGame(game, { type: 'use_uno_reverse', playerId: 'p1' });
    game = reduceGame(game, { type: 'pay_rent', playerId: 'p3' });
    game = reduceGame(game, { type: 'continue_turn', playerId: 'p1' });

    expect(game.phase).toBe('rolling');
    expect(game.currentPlayerId).toBe('p2');
  });

  it('allows an UNO Reverse chain when the target also has the card', () => {
    let game = createInitialGame(['Olena', 'Taras', 'Maria'], 'uno-reverse-chain');
    game = withOwnership(game, 'p3', [3]);
    game = {
      ...game,
      players: game.players.map((player) =>
        player.id === 'p1' || player.id === 'p3' ? { ...player, unoReverseCards: 1 } : player,
      ),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 2] });
    game = reduceGame(game, { type: 'use_uno_reverse', playerId: 'p1' });
    game = reduceGame(game, { type: 'use_uno_reverse', playerId: 'p3' });

    expect(game.currentPlayerId).toBe('p1');
    expect(game.pendingRent).toMatchObject({ payerId: 'p1', ownerId: 'p3', tileId: 3, amount: money(4) });
    expect(game.pendingRent?.unoReverse).toMatchObject({ originalTurnPlayerId: 'p1', fromPlayerId: 'p3', toPlayerId: 'p1' });
    expect(game.players.find((player) => player.id === 'p1')?.unoReverseCards).toBe(0);
    expect(game.players.find((player) => player.id === 'p3')?.unoReverseCards).toBe(0);
  });

  it('returns a reversed bankruptcy decision to the original double turn', () => {
    let game = createInitialGame(['Olena', 'Taras', 'Maria'], 'uno-reverse-bankruptcy');
    game = withOwnership(game, 'p3', [1]);
    game = {
      ...game,
      players: game.players.map((player) =>
        player.id === 'p1' ? { ...player, position: 39, unoReverseCards: 1 } : player,
      ),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    game = reduceGame(game, { type: 'use_uno_reverse', playerId: 'p1' });
    game = reduceGame(game, { type: 'declare_bankruptcy', playerId: 'p3' });

    expect(game.phase).toBe('turnEnd');
    expect(game.currentPlayerId).toBe('p1');
    expect(game.players.find((player) => player.id === 'p3')?.isBankrupt).toBe(true);

    game = reduceGame(game, { type: 'continue_turn', playerId: 'p1' });

    expect(game.phase).toBe('rolling');
    expect(game.currentPlayerId).toBe('p1');
  });

  it('opens a payment decision before charging tax', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'tax-payment');
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 2 } : player)),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });

    expect(game.phase).toBe('payment');
    expect(game.pendingPayment).toMatchObject({ payerId: 'p1', amount: money(200), tileId: 4, source: 'tax' });
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1700));

    game = reduceGame(game, { type: 'pay_payment', playerId: 'p1' });

    expect(game.phase).toBe('turnEnd');
    expect(game.pendingPayment).toBeUndefined();
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1500));
  });

  it('opens a payment decision for negative card money', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'card-payment');
    game = {
      ...game,
      phase: 'awaitingCard',
      pendingCardDraw: { deck: 'chance', tileId: 7 },
      chanceDeck: [3],
      discardChance: [],
    };

    game = reduceGame(game, { type: 'draw_card', playerId: 'p1' });

    expect(game.phase).toBe('payment');
    expect(game.pendingPayment).toMatchObject({ payerId: 'p1', amount: money(50), source: 'card' });
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1700));

    game = reduceGame(game, { type: 'pay_payment', playerId: 'p1' });

    expect(game.phase).toBe('turnEnd');
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1650));
  });

  it('redistributes 25 percent of player money for the trickle-down economy community card', () => {
    let game = createInitialGame(['Olena', 'Taras', 'Maria'], 'community-communism');
    game = {
      ...game,
      phase: 'awaitingCard',
      pendingCardDraw: { deck: 'community', tileId: 2 },
      communityDeck: [12],
      discardCommunity: [],
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, money: money(1000) } : player)),
    };

    game = reduceGame(game, { type: 'draw_card', playerId: 'p1' });

    expect(game.pendingCard?.title).toBe('Економіка просочування');
    expect(game.phase).toBe('payment');
    expect(game.pendingPayment).toMatchObject({
      payerId: 'p1',
      amount: money(250),
      source: 'card',
      recipients: [
        { playerId: 'p2', amount: money(125) },
        { playerId: 'p3', amount: money(125) },
      ],
    });
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1000));

    game = reduceGame(game, { type: 'pay_payment', playerId: 'p1' });

    expect(game.phase).toBe('turnEnd');
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(750));
    expect(game.players.find((player) => player.id === 'p2')?.money).toBe(money(1825));
    expect(game.players.find((player) => player.id === 'p3')?.money).toBe(money(1825));
  });

  it('boosts the trickle-down economy community card for the player with the most cash', () => {
    let game = createInitialGame(['Olena', 'Taras', 'Maria'], 'community-communism-rich');
    game = {
      ...game,
      phase: 'awaitingCard',
      pendingCardDraw: { deck: 'community', tileId: 2 },
      communityDeck: [0, 12],
      discardCommunity: [],
      players: game.players.map((player) =>
        player.id === 'p1'
          ? { ...player, money: money(2000) }
          : player.id === 'p2'
            ? { ...player, money: money(1000) }
            : { ...player, money: money(900) },
      ),
    };
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    try {
      game = reduceGame(game, { type: 'draw_card', playerId: 'p1' });
    } finally {
      randomSpy.mockRestore();
    }

    expect(game.pendingCard?.title).toBe('Економіка просочування');
    expect(game.pendingPayment).toMatchObject({ payerId: 'p1', amount: money(500), source: 'card' });
    expect(game.communityDeck).toEqual([0]);
  });

  it('lowers the trickle-down economy community card chance for the player with the least cash', () => {
    let game = createInitialGame(['Olena', 'Taras', 'Maria'], 'community-communism-low-cash');
    game = {
      ...game,
      phase: 'awaitingCard',
      pendingCardDraw: { deck: 'community', tileId: 2 },
      communityDeck: [12, 0],
      discardCommunity: [],
      players: game.players.map((player) =>
        player.id === 'p1'
          ? { ...player, money: money(500) }
          : player.id === 'p2'
            ? { ...player, money: money(1000) }
            : { ...player, money: money(900) },
      ),
    };
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    try {
      game = reduceGame(game, { type: 'draw_card', playerId: 'p1' });
    } finally {
      randomSpy.mockRestore();
    }

    expect(game.pendingCard?.title).toBe('Грант громади');
    expect(game.pendingPayment).toBeUndefined();
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(600));
    expect(game.communityDeck).toEqual([12]);
  });

  it('makes surrendered properties neutral and pays rent creditor from available cash', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'rent-surrender');
    game = withOwnership(game, 'p1', [3]);
    game = withOwnership(game, 'p2', [1]);
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 39 } : player)),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    game = reduceGame(game, { type: 'declare_bankruptcy', playerId: 'p1' });

    expect(game.pendingRent).toBeUndefined();
    expect(game.phase).toBe('finished');
    expect(game.winnerId).toBe('p2');
    expect(game.properties[3]).toMatchObject({ ownerId: undefined, houses: 0, mortgaged: false });
    expect(game.players.find((player) => player.id === 'p1')?.isBankrupt).toBe(true);
    expect(game.players.find((player) => player.id === 'p1')?.properties).toEqual([]);
    expect(game.players.find((player) => player.id === 'p2')?.properties).toEqual([1]);
    expect(game.players.find((player) => player.id === 'p2')?.money).toBe(money(1702));
  });

  it('pays only the cash a surrendering rent debtor still has', () => {
    let game = createInitialGame(['Olena', 'Taras', 'Maria'], 'rent-surrender-cash-limit');
    game = withOwnership(game, 'p1', [3]);
    game = withOwnership(game, 'p2', [39]);
    game = {
      ...game,
      properties: {
        ...game.properties,
        39: { ...game.properties[39], houses: 5 },
      },
      players: game.players.map((player) =>
        player.id === 'p1' ? { ...player, position: 37, money: money(100) } : player,
      ),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    game = reduceGame(game, { type: 'declare_bankruptcy', playerId: 'p1' });

    expect(game.pendingRent).toBeUndefined();
    expect(game.properties[3].ownerId).toBeUndefined();
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(0);
    expect(game.players.find((player) => player.id === 'p2')?.money).toBe(money(1800));
  });

  it('lets a non-current player surrender without interrupting the active turn', () => {
    let game = createInitialGame(['Olena', 'Taras', 'Maria'], 'out-of-turn-surrender');
    game = withOwnership(game, 'p2', [1, 3]);

    game = reduceGame(game, { type: 'declare_bankruptcy', playerId: 'p2' });

    expect(game.phase).toBe('rolling');
    expect(game.currentPlayerId).toBe('p1');
    expect(game.players.find((player) => player.id === 'p2')).toMatchObject({
      isBankrupt: true,
      money: 0,
      properties: [],
    });
    expect(game.properties[1].ownerId).toBeUndefined();
    expect(game.properties[3].ownerId).toBeUndefined();
  });

  it('finishes by summary votes immediately even during an active decision', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'summary-delay');
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 39 } : player)),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    expect(game.phase).toBe('awaitingPurchase');

    game = reduceGame(game, { type: 'request_summary', playerId: 'p1' });
    game = reduceGame(game, { type: 'request_summary', playerId: 'p2' });

    expect(game.phase).toBe('finished');
    expect(game.summaryVotes).toMatchObject({ p1: expect.any(Number), p2: expect.any(Number) });
    expect(game.postMatch?.reason).toBe('summary');
    expect(game.pendingPurchaseTileId).toBeUndefined();
    expect(game.postMatch?.awards.some((award) => award.id === 'lastSurvivor')).toBe(false);
  });

  it('ignores bankrupt players when all active players request the summary', () => {
    let game = createInitialGame(['Olena', 'Taras', 'Maria'], 'summary-bankrupt-ignore');

    game = reduceGame(game, { type: 'declare_bankruptcy', playerId: 'p3' });
    game = reduceGame(game, { type: 'request_summary', playerId: 'p3' });
    game = reduceGame(game, { type: 'request_summary', playerId: 'p1' });

    expect(game.phase).toBe('rolling');
    expect(game.summaryVotes?.p3).toBeUndefined();

    game = reduceGame(game, { type: 'request_summary', playerId: 'p2' });

    expect(game.phase).toBe('finished');
    expect(game.postMatch?.reason).toBe('summary');
  });

  it('adds the last survivor crown only for bankruptcy finishes', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'survivor-award');

    game = reduceGame(game, { type: 'declare_bankruptcy', playerId: 'p1' });

    expect(game.phase).toBe('finished');
    expect(game.postMatch?.reason).toBe('survivor');
    expect(game.postMatch?.awards.find((award) => award.id === 'lastSurvivor')).toMatchObject({
      winnerIds: ['p2'],
      crown: true,
    });
  });

  it('selects two fixed awards and three deterministic random awards', () => {
    const game = createInitialGame(['Olena', 'Taras'], 'award-selection');
    const first = selectAwardIds(game);
    const second = selectAwardIds(game);

    expect(first).toEqual(second);
    expect(first).toHaveLength(5);
    expect(first.slice(0, 2)).toEqual(['propertyCount', 'finalCash']);
  });

  it('allows players to share first place when crown counts are tied', () => {
    const game = createInitialGame(['Olena', 'Taras'], 'shared-awards');
    const summary = buildMatchSummary(game, 'summary');

    expect(summary.winnerIds).toEqual(['p1', 'p2']);
    expect(summary.players.filter((player) => player.rank === 1).map((player) => player.playerId)).toEqual(['p1', 'p2']);
  });

  it('opens casino on tile 20 and lets the player skip it', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'casino-skip');
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 18 } : player)),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });

    expect(getTile(20).type).toBe('casino');
    expect(game.phase).toBe('casino');
    expect(game.pendingCasino).toMatchObject({ playerId: 'p1', tileId: 20 });
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1700));

    game = reduceGame(game, { type: 'skip_casino', playerId: 'p1' });

    expect(game.phase).toBe('turnEnd');
    expect(game.pendingCasino).toBeUndefined();
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1700));
  });

  it('allows bank and player loan requests while the current player is deciding at the casino', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'casino-loans');
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 18 } : player)),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });

    expect(game.phase).toBe('casino');
    expect(game.pendingCasino).toMatchObject({ playerId: 'p1', tileId: 20 });

    game = reduceGame(game, { type: 'take_bank_loan', playerId: 'p1', amount: money(100) });

    expect(game.phase).toBe('casino');
    expect(game.pendingCasino).toMatchObject({ playerId: 'p1', tileId: 20 });
    expect(game.loans.find((loan) => loan.kind === 'bank' && loan.borrowerId === 'p1')).toMatchObject({
      principal: money(100),
      totalRepayment: money(130),
    });

    game = reduceGame(game, {
      type: 'propose_loan',
      offer: {
        lenderId: 'p2',
        borrowerId: 'p1',
        proposerId: 'p1',
        principal: money(200),
        totalRepayment: money(260),
        durationTurns: 4,
        collateralTileIds: [],
      },
    });

    expect(game.phase).toBe('casino');
    expect(game.pendingCasino).toMatchObject({ playerId: 'p1', tileId: 20 });
    expect(game.loanOffers[0]).toMatchObject({
      lenderId: 'p2',
      borrowerId: 'p1',
      proposerId: 'p1',
      principal: money(200),
      status: 'pending',
    });
  });

  it('pays casino roulette winnings up to x6 and caps the bet at 600', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'casino-bet');
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 18 } : player)),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    expect(() => reduceGame(game, { type: 'casino_bet', playerId: 'p1', amount: 0, multiplier: 2 })).toThrow();
    expect(() => reduceGame(game, { type: 'casino_bet', playerId: 'p1', amount: money(600) + 1, multiplier: 2 })).toThrow();

    game = reduceGame(game, { type: 'casino_bet', playerId: 'p1', amount: money(100), multiplier: 6 });

    expect(game.phase).toBe('turnEnd');
    expect(game.pendingCasino).toBeUndefined();
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(2200));
  });

  it('opens a payment decision for casino losses', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'casino-loss');
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 18 } : player)),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    game = reduceGame(game, { type: 'casino_bet', playerId: 'p1', amount: money(100), multiplier: 0 });

    expect(game.phase).toBe('payment');
    expect(game.pendingPayment).toMatchObject({ payerId: 'p1', amount: money(100), tileId: 20, source: 'casino' });
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1700));

    game = reduceGame(game, { type: 'pay_payment', playerId: 'p1' });

    expect(game.phase).toBe('turnEnd');
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1600));
  });

  it('records structured match statistics for rent, taxes, casino, cards, purchases, and buildings', () => {
    let purchaseGame = createInitialGame(['Olena', 'Taras'], 'stats-purchase');
    purchaseGame = {
      ...purchaseGame,
      players: purchaseGame.players.map((player) => (player.id === 'p1' ? { ...player, position: 39 } : player)),
    };
    purchaseGame = reduceGame(purchaseGame, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    purchaseGame = reduceGame(purchaseGame, { type: 'buy', playerId: 'p1' });
    expect(purchaseGame.matchStats?.players.p1.purchaseSpend).toBe(money(60));
    expect(purchaseGame.matchStats?.properties[1].purchaseSpendByPlayer.p1).toBe(money(60));

    let rentGame = createInitialGame(['Olena', 'Taras'], 'stats-rent');
    rentGame = withOwnership(rentGame, 'p2', [1]);
    rentGame = {
      ...rentGame,
      players: rentGame.players.map((player) => (player.id === 'p1' ? { ...player, position: 39 } : player)),
    };
    rentGame = reduceGame(rentGame, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    rentGame = reduceGame(rentGame, { type: 'pay_rent', playerId: 'p1' });
    expect(rentGame.matchStats?.players.p1.rentPaid).toBe(money(2));
    expect(rentGame.matchStats?.players.p2.rentReceived).toBe(money(2));
    expect(rentGame.matchStats?.transfers.p1.p2).toBe(money(2));

    let taxGame = createInitialGame(['Olena', 'Taras'], 'stats-tax');
    taxGame = {
      ...taxGame,
      players: taxGame.players.map((player) => (player.id === 'p1' ? { ...player, position: 2 } : player)),
    };
    taxGame = reduceGame(taxGame, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    taxGame = reduceGame(taxGame, { type: 'pay_payment', playerId: 'p1' });
    expect(taxGame.matchStats?.players.p1.taxesPaid).toBe(money(200));

    let casinoGame = createInitialGame(['Olena', 'Taras'], 'stats-casino');
    casinoGame = {
      ...casinoGame,
      players: casinoGame.players.map((player) => (player.id === 'p1' ? { ...player, position: 18 } : player)),
    };
    casinoGame = reduceGame(casinoGame, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    casinoGame = reduceGame(casinoGame, { type: 'casino_bet', playerId: 'p1', amount: money(100), multiplier: 6 });
    expect(casinoGame.matchStats?.players.p1.casinoBets).toBe(money(100));
    expect(casinoGame.matchStats?.players.p1.casinoGrossWon).toBe(money(500));

    let cardGame = createInitialGame(['Olena', 'Taras'], 'stats-card');
    cardGame = {
      ...cardGame,
      pendingCardDraw: { deck: 'chance', tileId: 7 },
      chanceDeck: [2],
      phase: 'awaitingCard',
    };
    cardGame = reduceGame(cardGame, { type: 'draw_card', playerId: 'p1' });
    expect(cardGame.matchStats?.players.p1.chanceDraws).toBe(1);
    expect(cardGame.matchStats?.chanceDrawCounts[2]).toBe(1);

    let buildGame = createInitialGame(['Olena', 'Taras'], 'stats-build');
    buildGame = withOwnership(buildGame, 'p1', [1, 3]);
    buildGame = withDistrict(buildGame, 'p1', 1);
    buildGame = reduceGame(buildGame, { type: 'build', playerId: 'p1', tileId: 1 });
    expect(buildGame.matchStats?.players.p1.buildingsBuilt).toBe(1);
    expect(buildGame.matchStats?.players.p1.buildingSpend).toBe(money(50));
  });

  it('starts a shared casino spin before applying its result', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'casino-spin');
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 18 } : player)),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    expect(() => reduceGame(game, { type: 'start_casino_spin', playerId: 'p1', amount: 0, multiplier: 4, spinSeed: 42 })).toThrow();
    game = reduceGame(game, { type: 'start_casino_spin', playerId: 'p1', amount: money(100), multiplier: 4, spinSeed: 42 });

    expect(game.phase).toBe('casino');
    expect(game.pendingCasino).toMatchObject({ playerId: 'p1', tileId: 20, amount: money(100), multiplier: 4, spinSeed: 42 });
    expect(game.pendingCasino?.spinEndsAt).toBeGreaterThan(Date.now());
    expect(() => reduceGame(game, { type: 'casino_bet', playerId: 'p1', amount: money(100), multiplier: 4 })).toThrow(
      'Рулетка ще крутиться.',
    );

    game = { ...game, pendingCasino: { ...game.pendingCasino!, spinEndsAt: Date.now() - 1 } };
    game = reduceGame(game, { type: 'casino_bet', playerId: 'p1', amount: money(100), multiplier: 4 });

    expect(game.phase).toBe('turnEnd');
    expect(game.pendingCasino).toBeUndefined();
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(2000));
  });

  it('does not allow jailed players to bid in an auction', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'auction-jail-block');
    game = {
      ...game,
      players: game.players.map((player) =>
        player.id === 'p1' ? { ...player, position: 39 } : player.id === 'p2' ? { ...player, jailTurns: 2 } : player,
      ),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    game = reduceGame(game, { type: 'decline_buy', playerId: 'p1' });

    expect(game.phase).toBe('auction');
    expect(() => reduceGame(game, { type: 'auction_bid', playerId: 'p2', amount: money(60) })).toThrow(
      'Гравець у вʼязниці не може брати участь в аукціоні.',
    );
  });

  it('lets test admin move the current player to a tile and resolve its action', () => {
    let casinoGame = createInitialGame(['Olena', 'Taras'], 'admin-casino');
    casinoGame = reduceGame(casinoGame, { type: 'admin_move_current_player', tileId: 20 });

    expect(casinoGame.players.find((player) => player.id === 'p1')?.position).toBe(20);
    expect(casinoGame.phase).toBe('casino');
    expect(casinoGame.pendingCasino).toMatchObject({ playerId: 'p1', tileId: 20 });

    let purchaseGame = createInitialGame(['Olena', 'Taras'], 'admin-purchase');
    purchaseGame = reduceGame(purchaseGame, { type: 'admin_move_current_player', tileId: 1 });

    expect(purchaseGame.players.find((player) => player.id === 'p1')?.position).toBe(1);
    expect(purchaseGame.phase).toBe('awaitingPurchase');
    expect(purchaseGame.pendingPurchaseTileId).toBe(1);
  });

  it('lets admin grant an UNO Reverse card without exceeding one card', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'admin-uno-reverse');

    game = reduceGame(game, { type: 'admin_grant_uno_reverse', playerId: 'p2' });
    expect(game.players.find((player) => player.id === 'p2')?.unoReverseCards).toBe(1);
    expect(game.log[0].text).toContain('УНО РЕВЕРС');

    game = reduceGame(game, { type: 'admin_grant_uno_reverse', playerId: 'p2' });
    expect(game.players.find((player) => player.id === 'p2')?.unoReverseCards).toBe(1);
  });

  it('lets admin start a selected city event immediately', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'admin-city-event');

    game = reduceGame(game, { type: 'admin_start_city_event', cityEventId: 'road-repair' });

    expect(game.pendingCityEvent?.id).toBe('road-repair');
    expect(game.activeCityEvents).toContainEqual({
      id: 'road-repair',
      remainingRounds: 2,
      durationRounds: 2,
      startedRound: 1,
    });
    expect(game.log[0].text).toContain('Ремонт доріг');
  });

  it('blocks admin city events while a player decision is active', () => {
    const game = {
      ...createInitialGame(['Olena', 'Taras'], 'admin-city-event-blocked'),
      phase: 'rent' as const,
      pendingRent: { payerId: 'p1', ownerId: 'p2', tileId: 1, amount: money(2) },
    };

    expect(() => reduceGame(game, { type: 'admin_start_city_event', cityEventId: 'road-repair' })).toThrow(
      'Міську подію можна запустити',
    );
  });

  it('sends a player to jail on three doubles', () => {
    let game = createInitialGame(['Олена', 'Тарас'], 'test');
    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    game = { ...game, phase: 'rolling' };
    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [2, 2] });
    game = { ...game, phase: 'rolling' };
    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [3, 3] });

    expect(game.players[0].position).toBe(10);
    expect(game.players[0].jailTurns).toBe(3);
  });

  it('asks for a jail decision on Go To Jail and lets the player pay 100', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'jail-entry-pay');
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 27 } : player)),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 2] });

    expect(game.phase).toBe('awaitingJailDecision');
    expect(game.pendingJail).toMatchObject({ playerId: 'p1', tileId: 30 });
    expect(game.players.find((player) => player.id === 'p1')?.position).toBe(30);
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1700));

    game = reduceGame(game, { type: 'pay_jail_fine', playerId: 'p1' });

    expect(game.phase).toBe('turnEnd');
    expect(game.pendingJail).toBeUndefined();
    expect(game.players.find((player) => player.id === 'p1')?.position).toBe(30);
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1600));
    expect(game.players.find((player) => player.id === 'p1')?.jailTurns).toBe(0);
  });

  it('sends a player from Go To Jail to jail without a start reward', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'jail-entry-go');
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 27 } : player)),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 2] });
    game = reduceGame(game, { type: 'go_to_jail', playerId: 'p1' });

    expect(game.phase).toBe('turnEnd');
    expect(game.players.find((player) => player.id === 'p1')?.position).toBe(10);
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1700));
    expect(game.players.find((player) => player.id === 'p1')?.jailTurns).toBe(3);
  });

  it('counts down jail turns on failed doubles and releases on a double roll', () => {
    let failedRollGame = createInitialGame(['Olena', 'Taras'], 'jail-failed-roll');
    failedRollGame = {
      ...failedRollGame,
      players: failedRollGame.players.map((player) =>
        player.id === 'p1' ? { ...player, position: 10, jailTurns: 3 } : player,
      ),
    };

    failedRollGame = reduceGame(failedRollGame, { type: 'roll', playerId: 'p1', dice: [1, 2] });

    expect(failedRollGame.phase).toBe('turnEnd');
    expect(failedRollGame.players.find((player) => player.id === 'p1')?.position).toBe(10);
    expect(failedRollGame.players.find((player) => player.id === 'p1')?.jailTurns).toBe(2);

    let doubleRollGame = createInitialGame(['Olena', 'Taras'], 'jail-double-roll');
    doubleRollGame = {
      ...doubleRollGame,
      players: doubleRollGame.players.map((player) =>
        player.id === 'p1' ? { ...player, position: 10, jailTurns: 2 } : player,
      ),
    };

    doubleRollGame = reduceGame(doubleRollGame, { type: 'roll', playerId: 'p1', dice: [2, 2] });

    expect(doubleRollGame.players.find((player) => player.id === 'p1')?.position).toBe(14);
    expect(doubleRollGame.players.find((player) => player.id === 'p1')?.jailTurns).toBe(0);
    expect(doubleRollGame.phase).toBe('awaitingPurchase');
  });

  it('advances the turn after a failed jail dice roll is continued', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'jail-failed-continue');
    game = {
      ...game,
      players: game.players.map((player) =>
        player.id === 'p1' ? { ...player, position: 10, jailTurns: 3 } : player,
      ),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 2] });
    expect(game.phase).toBe('turnEnd');

    game = reduceGame(game, { type: 'continue_turn', playerId: 'p1' });

    expect(game.currentPlayerId).toBe('p2');
    expect(game.phase).toBe('rolling');
    expect(game.turn).toBe(2);
  });

  it('lets a jailed player pay 100 and then roll this turn', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'jail-pay-bail');
    game = {
      ...game,
      players: game.players.map((player) =>
        player.id === 'p1' ? { ...player, position: 10, jailTurns: 3 } : player,
      ),
    };

    game = reduceGame(game, { type: 'pay_bail', playerId: 'p1' });

    expect(game.phase).toBe('rolling');
    expect(game.players.find((player) => player.id === 'p1')?.jailTurns).toBe(0);
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1600));
  });

  it('continues the same turn after doubles and advances after a normal roll', () => {
    let doubleGame = createInitialGame(['Olena', 'Taras'], 'test-doubles');
    doubleGame = {
      ...doubleGame,
      players: doubleGame.players.map((player) => (player.id === 'p1' ? { ...player, position: 38 } : player)),
    };
    doubleGame = reduceGame(doubleGame, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    doubleGame = reduceGame(doubleGame, { type: 'continue_turn', playerId: 'p1' });

    expect(doubleGame.currentPlayerId).toBe('p1');
    expect(doubleGame.phase).toBe('rolling');
    expect(doubleGame.turn).toBe(1);

    let normalGame = createInitialGame(['Olena', 'Taras'], 'test-normal');
    normalGame = {
      ...normalGame,
      players: normalGame.players.map((player) => (player.id === 'p1' ? { ...player, position: 37 } : player)),
    };
    normalGame = reduceGame(normalGame, { type: 'roll', playerId: 'p1', dice: [1, 2] });
    normalGame = reduceGame(normalGame, { type: 'continue_turn', playerId: 'p1' });

    expect(normalGame.currentPlayerId).toBe('p2');
    expect(normalGame.phase).toBe('rolling');
    expect(normalGame.turn).toBe(2);
  });

  it('waits for a luck check before drawing a chance card', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'card-check');
    game = {
      ...game,
      chanceDeck: [2],
      discardChance: [],
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 5 } : player)),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    expect(game.phase).toBe('awaitingCard');
    expect(game.pendingCardDraw).toMatchObject({ deck: 'chance', tileId: 7 });
    expect(game.pendingCard).toBeUndefined();

    game = reduceGame(game, { type: 'draw_card', playerId: 'p1' });
    expect(game.pendingCard?.deck).toBe('chance');
    expect(game.pendingCardDraw).toBeUndefined();
    expect(game.phase).toBe('turnEnd');
  });

  it('can draw a chance card that sends the player to the casino', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'card-casino');
    game = {
      ...game,
      chanceDeck: [12],
      discardChance: [],
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 5 } : player)),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    game = reduceGame(game, { type: 'draw_card', playerId: 'p1' });

    expect(game.pendingCard?.title).toBe('Вечір у казино');
    expect(game.players.find((player) => player.id === 'p1')?.position).toBe(20);
    expect(game.phase).toBe('casino');
    expect(game.pendingCasino).toMatchObject({ playerId: 'p1', tileId: 20 });
  });

  it('applies start rewards to card movement and does not pay for jail movement', () => {
    let startCardGame = createInitialGame(['Olena', 'Taras'], 'card-start');
    startCardGame = {
      ...startCardGame,
      chanceDeck: [0],
      discardChance: [],
      players: startCardGame.players.map((player) => (player.id === 'p1' ? { ...player, position: 5 } : player)),
    };
    startCardGame = reduceGame(startCardGame, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    startCardGame = reduceGame(startCardGame, { type: 'draw_card', playerId: 'p1' });

    expect(startCardGame.players.find((player) => player.id === 'p1')?.position).toBe(0);
    expect(startCardGame.players.find((player) => player.id === 'p1')?.money).toBe(money(2000));

    let jailCardGame = createInitialGame(['Olena', 'Taras'], 'card-jail');
    jailCardGame = {
      ...jailCardGame,
      chanceDeck: [4],
      discardChance: [],
      players: jailCardGame.players.map((player) => (player.id === 'p1' ? { ...player, position: 5 } : player)),
    };
    jailCardGame = reduceGame(jailCardGame, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    jailCardGame = reduceGame(jailCardGame, { type: 'draw_card', playerId: 'p1' });

    expect(jailCardGame.players.find((player) => player.id === 'p1')?.position).toBe(10);
    expect(jailCardGame.players.find((player) => player.id === 'p1')?.money).toBe(money(1700));
  });

  it('lets a player buy Kyiv after drawing the rare Kyiv travel card', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'rare-kyiv-card');
    game = {
      ...game,
      chanceDeck: [1],
      discardChance: [],
      players: game.players.map((player) =>
        player.id === 'p1' ? { ...player, position: 5, money: money(1500) } : player,
      ),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    game = reduceGame(game, { type: 'draw_card', playerId: 'p1' });

    expect(game.pendingCard?.title).toBe('Ділова поїздка');
    expect(game.players.find((player) => player.id === 'p1')?.position).toBe(39);
    expect(game.phase).toBe('awaitingPurchase');
    expect(game.pendingPurchaseTileId).toBe(39);

    game = reduceGame(game, { type: 'buy', playerId: 'p1' });

    expect(game.properties[39].ownerId).toBe('p1');
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1100));
    expect(game.phase).toBe('turnEnd');
  });

  it('keeps travel chance cards rare and treats UNO Reverse as a normal weighted card', () => {
    const game = createInitialGame(['Olena', 'Taras'], 'rare-card-weight');
    const kyivCards = game.chanceDeck.filter((cardId) => cardId === 1);
    const lvivCards = game.chanceDeck.filter((cardId) => cardId === 10);
    const unoReverseCards = game.chanceDeck.filter((cardId) => cardId === 13);
    const commonCards = game.chanceDeck.filter((cardId) => cardId === 2);

    expect(kyivCards).toHaveLength(1);
    expect(lvivCards).toHaveLength(1);
    expect(unoReverseCards).toHaveLength(4);
    expect(commonCards).toHaveLength(4);
  });

  it('keeps the trickle-down economy community card rare', () => {
    const game = createInitialGame(['Olena', 'Taras'], 'rare-community-card');
    const trickleDownCards = game.communityDeck.filter((cardId) => cardId === 12);
    const commonCards = game.communityDeck.filter((cardId) => cardId === 0);

    expect(trickleDownCards).toHaveLength(1);
    expect(commonCards).toHaveLength(4);
  });

  it('draws the rare loan payoff card only while an active loan exists', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'loan-payoff-draw');

    game = {
      ...game,
      phase: 'awaitingCard',
      pendingCardDraw: { deck: 'chance', tileId: 2 },
      chanceDeck: [14, 2],
    };
    game = reduceGame(game, { type: 'draw_card', playerId: 'p1' });

    expect(game.pendingCard?.cardId).toBe(2);
    expect(game.chanceDeck).toEqual([14]);

    game = createInitialGame(['Olena', 'Taras'], 'loan-payoff-draw-active');
    game = reduceGame(game, {
      type: 'propose_loan',
      offer: { lenderId: 'p1', borrowerId: 'p2', principal: money(100), totalRepayment: money(120), durationTurns: 2, collateralTileIds: [] },
    });
    game = reduceGame(game, { type: 'accept_loan', playerId: 'p2', offerId: game.loanOffers[0].id });
    game = {
      ...game,
      phase: 'awaitingCard',
      pendingCardDraw: { deck: 'chance', tileId: 2 },
      chanceDeck: [14],
    };
    game = reduceGame(game, { type: 'draw_card', playerId: 'p1' });

    expect(game.pendingCard?.cardId).toBe(14);
    expect(game.players.find((player) => player.id === 'p1')?.loanPayoffCards).toBe(1);
  });

  it('starts a timed auction and leaves the property unowned when nobody bids', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'auction-empty');
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 39 } : player)),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    game = reduceGame(game, { type: 'decline_buy', playerId: 'p1' });

    expect(game.phase).toBe('auction');
    expect(game.auction?.minimumBid).toBe(money(60));
    expect(game.auction?.bids).toHaveLength(0);
    expect(game.log[0].text).toContain('Olena');
    expect(game.log[0].text).toContain('аукціон');

    game = { ...game, auction: { ...game.auction!, endsAt: Date.now() - 1 } };
    game = reduceGame(game, { type: 'resolve_auction' });

    expect(game.phase).toBe('turnEnd');
    expect(game.properties[1].ownerId).toBeUndefined();
  });

  it('awards the auctioned property to the highest bidder after the timer ends', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'auction-winner');
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 39 } : player)),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    game = reduceGame(game, { type: 'decline_buy', playerId: 'p1' });

    expect(() => reduceGame(game, { type: 'auction_bid', playerId: 'p2', amount: money(59) })).toThrow();

    game = reduceGame(game, { type: 'auction_bid', playerId: 'p2', amount: money(60) });
    expect(game.auction?.highestBidderId).toBe('p2');
    expect(game.auction?.highestBid).toBe(money(60));
    expect(game.auction?.bids).toHaveLength(1);
    expect(() => reduceGame(game, { type: 'auction_bid', playerId: 'p1', amount: money(69) })).toThrow(
      'Мінімальна ставка 70₴.',
    );

    game = { ...game, auction: { ...game.auction!, endsAt: Date.now() - 1 } };
    game = reduceGame(game, { type: 'resolve_auction' });

    expect(game.phase).toBe('turnEnd');
    expect(game.properties[1].ownerId).toBe('p2');
    expect(game.players.find((player) => player.id === 'p2')?.money).toBe(money(1640));
  });

  it('builds only on a completed city group', () => {
    let game = createInitialGame(['Олена', 'Тарас'], 'test');
    game = {
      ...game,
      properties: {
        ...game.properties,
        1: { ...game.properties[1], ownerId: 'p1' },
        3: { ...game.properties[3], ownerId: 'p1' },
      },
      players: game.players.map((player) =>
        player.id === 'p1' ? { ...player, properties: [1, 3] } : player,
      ),
    };
    game = withDistrict(game, 'p1', 1);

    game = reduceGame(game, { type: 'build', playerId: 'p1', tileId: 1 });
    const pavlohrad = getTile(1);
    const kryvyiRih = getTile(3);
    if (pavlohrad.type !== 'city' || kryvyiRih.type !== 'city') throw new Error('Expected a completed city group.');
    expect(game.properties[1].houses).toBe(1);
    expect(game.players[0].money).toBe(money(1650));
    expect(game.moneyHistory?.at(-1)?.worth?.p1).toBe(
      game.players[0].money + pavlohrad.price + kryvyiRih.price + pavlohrad.houseCost,
    );
  });

  it('enforces even building across a city group', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'build-even');
    game = withOwnership(game, 'p1', [1, 3]);
    game = withDistrict(game, 'p1', 1);

    game = reduceGame(game, { type: 'build', playerId: 'p1', tileId: 1 });
    expect(() => reduceGame(game, { type: 'build', playerId: 'p1', tileId: 1 })).toThrow();

    game = nextBuildRoll(game);
    game = reduceGame(game, { type: 'build', playerId: 'p1', tileId: 3 });
    game = nextBuildRoll(game);
    game = reduceGame(game, { type: 'build', playerId: 'p1', tileId: 1 });

    expect(game.properties[1].houses).toBe(2);
    expect(game.properties[3].houses).toBe(1);
  });

  it('allows only one building per dice roll', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'build-once-per-roll');
    game = withOwnership(game, 'p1', [1, 3]);
    game = withDistrict(game, 'p1', 1);

    game = reduceGame(game, { type: 'build', playerId: 'p1', tileId: 1 });

    expect(() => reduceGame(game, { type: 'build', playerId: 'p1', tileId: 3 })).toThrow();

    game = nextBuildRoll(game);
    game = reduceGame(game, { type: 'build', playerId: 'p1', tileId: 3 });

    expect(game.properties[1].houses).toBe(1);
    expect(game.properties[3].houses).toBe(1);
  });

  it('requires a district path before the first build in a full city group', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'district-required');
    game = withOwnership(game, 'p1', [1, 3]);

    expect(() => reduceGame(game, { type: 'build', playerId: 'p1', tileId: 1 })).toThrow('Спочатку створіть район');
  });

  it('creates a district only for full ownership, charges 2x highest house cost, and cannot change it', () => {
    const pavlohrad = getTile(1);
    if (pavlohrad.type !== 'city') throw new Error('Expected Pavlohrad to be a city.');
    let game = createInitialGame(['Olena', 'Taras'], 'district-create');
    game = withOwnership(game, 'p1', [1]);

    expect(() =>
      reduceGame(game, { type: 'create_district', playerId: 'p1', group: pavlohrad.group, path: 'tourist' }),
    ).toThrow('Потрібна повна');

    game = withOwnership(game, 'p1', [1, 3]);
    const cost = getDistrictCreationCost(game, pavlohrad.group);
    expect(cost).toBe(money(100));

    game = reduceGame(game, { type: 'create_district', playerId: 'p1', group: pavlohrad.group, path: 'oldTown' });

    expect(game.districtPaths[pavlohrad.group]).toMatchObject({ ownerId: 'p1', path: 'oldTown', creationCost: cost });
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1600));
    expect(() =>
      reduceGame(game, { type: 'create_district', playerId: 'p1', group: pavlohrad.group, path: 'residential' }),
    ).toThrow('не можна змінити');
  });

  it('keeps tourist rent and build costs unchanged', () => {
    const pavlohrad = getTile(1);
    if (pavlohrad.type !== 'city') throw new Error('Expected Pavlohrad to be a city.');
    let game = createInitialGame(['Olena', 'Taras'], 'district-tourist');
    game = withOwnership(game, 'p1', [1, 3]);
    game = withDistrict(game, 'p1', 1, 'tourist');
    game = {
      ...game,
      properties: {
        ...game.properties,
        1: { ...game.properties[1], houses: 1 },
      },
    };

    expect(calculateRent(game, pavlohrad)).toBe(money(28));
    expect(getEffectiveHouseCost(game, pavlohrad)).toBe(money(50));
  });

  it('reduces Old Town rent and uses a separate Residential rent divisor', () => {
    const lviv = getTile(37);
    const kyiv = getTile(39);
    const chernivtsi = getTile(34);
    if (lviv.type !== 'city') throw new Error('Expected Lviv to be a city.');
    if (kyiv.type !== 'city') throw new Error('Expected Kyiv to be a city.');
    if (chernivtsi.type !== 'city') throw new Error('Expected Chernivtsi to be a city.');
    let game = createInitialGame(['Olena', 'Taras'], 'district-old-town-rent');
    game = withOwnership(game, 'p1', [37, 39]);
    game = withDistrict(game, 'p1', 37, 'oldTown');

    expect(calculateRent(game, lviv)).toBe(money(30));

    game = {
      ...game,
      properties: {
        ...game.properties,
        37: { ...game.properties[37], houses: 1 },
      },
    };

    expect(calculateRent(game, lviv)).toBe(money(75));

    let residentialGoldGame = createInitialGame(['Olena', 'Taras'], 'district-residential-gold-rent');
    residentialGoldGame = withOwnership(residentialGoldGame, 'p1', [37, 39]);
    residentialGoldGame = withDistrict(residentialGoldGame, 'p1', 37, 'residential');
    residentialGoldGame = {
      ...residentialGoldGame,
      properties: {
        ...residentialGoldGame.properties,
        39: { ...residentialGoldGame.properties[39], houses: 1 },
      },
    };

    const residentialBaseRentGame = withDistrict(
      withOwnership(createInitialGame(['Olena', 'Taras'], 'district-residential-base-rent'), 'p1', [37, 39]),
      'p1',
      37,
      'residential',
    );

    expect(calculateRent(residentialBaseRentGame, lviv)).toBe(money(39));
    expect(calculateRent(residentialGoldGame, kyiv)).toBe(money(112));

    let greenGame = createInitialGame(['Olena', 'Taras'], 'district-old-town-green-rent');
    greenGame = withOwnership(greenGame, 'p1', [31, 32, 34]);
    greenGame = withDistrict(greenGame, 'p1', 31, 'oldTown');
    greenGame = {
      ...greenGame,
      properties: {
        ...greenGame.properties,
        34: { ...greenGame.properties[34], houses: 1 },
      },
    };

    expect(calculateRent(greenGame, chernivtsi)).toBe(money(64));
  });

  it('charges Old Town pass-through tolls before resolving the landing tile and does not toll the landing city', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'district-old-town-toll');
    game = withOwnership(game, 'p2', [37, 39]);
    game = withDistrict(game, 'p2', 37, 'oldTown');
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 35 } : player)),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 2] });

    expect(game.phase).toBe('payment');
    expect(game.pendingPayment).toMatchObject({
      payerId: 'p1',
      amount: money(9),
      reason: 'Пройдено район "Старе місто". Ви прогулялись бруківкою старого Львова. Плата 9₴',
      source: 'movement',
      recipients: [{ playerId: 'p2', amount: money(9) }],
    });

    game = reduceGame(game, { type: 'pay_payment', playerId: 'p1' });

    expect(game.phase).toBe('payment');
    expect(game.pendingPayment).toMatchObject({ payerId: 'p1', amount: money(100), source: 'tax' });
    expect(game.players.find((player) => player.id === 'p2')?.money).toBe(money(1709));

    let landingGame = createInitialGame(['Olena', 'Taras'], 'district-old-town-landing');
    landingGame = withOwnership(landingGame, 'p2', [37, 39]);
    landingGame = withDistrict(landingGame, 'p2', 37, 'oldTown');
    landingGame = {
      ...landingGame,
      players: landingGame.players.map((player) => (player.id === 'p1' ? { ...player, position: 36 } : player)),
    };
    landingGame = reduceGame(landingGame, { type: 'roll', playerId: 'p1', dice: [1, 0] });

    expect(landingGame.phase).toBe('rent');
    expect(landingGame.pendingRent).toMatchObject({ payerId: 'p1', ownerId: 'p2', tileId: 37, amount: money(30) });

    let builtTollGame = createInitialGame(['Olena', 'Taras'], 'district-old-town-built-toll');
    builtTollGame = withOwnership(builtTollGame, 'p2', [37, 39]);
    builtTollGame = withDistrict(builtTollGame, 'p2', 37, 'oldTown');
    builtTollGame = {
      ...builtTollGame,
      properties: {
        ...builtTollGame.properties,
        37: { ...builtTollGame.properties[37], houses: 1 },
      },
      players: builtTollGame.players.map((player) => (player.id === 'p1' ? { ...player, position: 35 } : player)),
    };
    builtTollGame = reduceGame(builtTollGame, { type: 'roll', playerId: 'p1', dice: [1, 2] });

    expect(builtTollGame.pendingPayment).toMatchObject({
      payerId: 'p1',
      amount: money(22),
      reason: 'Пройдено район "Старе місто". Ви прогулялись бруківкою старого Львова. Плата 22₴',
      recipients: [{ playerId: 'p2', amount: money(22) }],
    });

    let kyivTollGame = createInitialGame(['Olena', 'Taras'], 'district-old-town-kyiv-toll');
    kyivTollGame = withOwnership(kyivTollGame, 'p2', [37, 39]);
    kyivTollGame = withDistrict(kyivTollGame, 'p2', 37, 'oldTown');
    kyivTollGame = {
      ...kyivTollGame,
      players: kyivTollGame.players.map((player) => (player.id === 'p1' ? { ...player, position: 37 } : player)),
    };
    kyivTollGame = reduceGame(kyivTollGame, { type: 'roll', playerId: 'p1', dice: [1, 2] });

    expect(kyivTollGame.pendingPayment).toMatchObject({
      payerId: 'p1',
      amount: money(13),
      reason: 'Пройдено район "Старе місто". Ви насолодились вечірнім Києвом. Плата 13₴',
      recipients: [{ playerId: 'p2', amount: money(13) }],
    });
  });

  it('discounts Residential house cost and allows exactly two builds in that district per dice roll', () => {
    const pavlohrad = getTile(1);
    if (pavlohrad.type !== 'city') throw new Error('Expected Pavlohrad to be a city.');
    let game = createInitialGame(['Olena', 'Taras'], 'district-residential');
    game = withOwnership(game, 'p1', [1, 3]);
    game = withDistrict(game, 'p1', 1, 'residential');

    expect(getEffectiveHouseCost(game, pavlohrad)).toBe(money(23));

    game = reduceGame(game, { type: 'build', playerId: 'p1', tileId: 1 });
    game = reduceGame(game, { type: 'build', playerId: 'p1', tileId: 3 });

    expect(game.properties[1].houses).toBe(1);
    expect(game.properties[3].houses).toBe(1);
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1654));
    expect(getEffectiveBuildingRefund(game, pavlohrad)).toBe(money(11));
    game = reduceGame(game, { type: 'sell_building', playerId: 'p1', tileId: 1 });
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1665));
    expect(() => reduceGame(game, { type: 'build', playerId: 'p1', tileId: 1 })).toThrow();
  });

  it('includes district creation value in mortgage value and unmortgage cost', () => {
    const pavlohrad = getTile(1);
    if (pavlohrad.type !== 'city') throw new Error('Expected Pavlohrad to be a city.');
    const kyiv = getTile(39);
    if (kyiv.type !== 'city') throw new Error('Expected Kyiv to be a city.');
    let game = createInitialGame(['Olena', 'Taras'], 'district-mortgage');
    game = withOwnership(game, 'p1', [1, 3]);
    game = withDistrict(game, 'p1', 1, 'oldTown');

    expect(getEffectiveMortgageValue(game, pavlohrad)).toBe(money(55));
    expect(getEffectiveUnmortgageCost(game, pavlohrad)).toBe(money(58));

    game = reduceGame(game, { type: 'mortgage', playerId: 'p1', tileId: 1 });
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1755));

    game = reduceGame(game, { type: 'unmortgage', playerId: 'p1', tileId: 1 });
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1697));

    const goldGame = withDistrict(withOwnership(createInitialGame(['Olena', 'Taras'], 'district-kyiv-mortgage'), 'p1', [37, 39]), 'p1', 39, 'oldTown');

    expect(getEffectiveMortgageValue(goldGame, kyiv)).toBe(money(300));
    expect(getEffectiveUnmortgageCost(goldGame, kyiv)).toBe(money(315));
  });

  it('destroys a district when city ownership changes or the owner surrenders', () => {
    const pavlohrad = getTile(1);
    if (pavlohrad.type !== 'city') throw new Error('Expected Pavlohrad to be a city.');
    let tradeGame = createInitialGame(['Olena', 'Taras'], 'district-trade-destroy');
    tradeGame = withOwnership(tradeGame, 'p1', [1, 3]);
    tradeGame = withOwnership(tradeGame, 'p2', [6]);
    tradeGame = withDistrict(tradeGame, 'p1', 1, 'tourist');

    tradeGame = reduceGame(tradeGame, {
      type: 'propose_trade',
      offer: {
        fromPlayerId: 'p1',
        toPlayerId: 'p2',
        offerMoney: 0,
        requestMoney: 0,
        offerProperties: [1],
        requestProperties: [6],
        offerRentServices: [],
        requestRentServices: [],
      },
    });
    tradeGame = reduceGame(tradeGame, { type: 'accept_trade', playerId: 'p2', offerId: tradeGame.tradeOffers[0].id });

    expect(tradeGame.districtPaths[pavlohrad.group]).toBeUndefined();

    let bankruptGame = createInitialGame(['Olena', 'Taras'], 'district-bankrupt-destroy');
    bankruptGame = withOwnership(bankruptGame, 'p1', [1, 3]);
    bankruptGame = withDistrict(bankruptGame, 'p1', 1, 'tourist');
    bankruptGame = reduceGame(bankruptGame, { type: 'declare_bankruptcy', playerId: 'p1' });

    expect(bankruptGame.districtPaths[pavlohrad.group]).toBeUndefined();
  });

  it('blocks building while the owner is in jail', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'build-in-jail');
    game = withOwnership(game, 'p1', [1, 3]);
    game = withDistrict(game, 'p1', 1);
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 10, jailTurns: 2 } : player)),
    };

    expect(() => reduceGame(game, { type: 'build', playerId: 'p1', tileId: 1 })).toThrow('вʼязниці');
    expect(game.properties[1].houses).toBe(0);
  });

  it('blocks building but allows emergency selling and mortgaging during a purchase decision', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'manage-after-roll-purchase');
    game = withOwnership(game, 'p1', [1, 3]);
    game = withDistrict(game, 'p1', 1);
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 4 } : player)),
    };

    game = reduceGame(game, { type: 'build', playerId: 'p1', tileId: 1 });
    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });

    expect(game.phase).toBe('awaitingPurchase');
    expect(game.pendingPurchaseTileId).toBe(6);
    expect(() => reduceGame(game, { type: 'build', playerId: 'p1', tileId: 3 })).toThrow();
    game = reduceGame(game, { type: 'sell_building', playerId: 'p1', tileId: 1 });
    expect(game.phase).toBe('awaitingPurchase');
    expect(game.pendingPurchaseTileId).toBe(6);
    expect(game.properties[1].houses).toBe(0);

    game = reduceGame(game, { type: 'mortgage', playerId: 'p1', tileId: 1 });
    expect(game.phase).toBe('awaitingPurchase');
    expect(game.pendingPurchaseTileId).toBe(6);
    expect(game.properties[1].mortgaged).toBe(true);

    game = reduceGame(game, { type: 'buy', playerId: 'p1' });

    expect(game.phase).toBe('turnEnd');
    expect(game.properties[6].ownerId).toBe('p1');
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1630));
  });

  it('allows mortgaging owned property while deciding whether to buy', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'mortgage-during-purchase');
    game = withOwnership(game, 'p1', [1]);
    game = {
      ...game,
      phase: 'awaitingPurchase',
      pendingPurchaseTileId: 3,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, money: money(30) } : player)),
    };

    game = reduceGame(game, { type: 'mortgage', playerId: 'p1', tileId: 1 });

    expect(game.phase).toBe('awaitingPurchase');
    expect(game.pendingPurchaseTileId).toBe(3);
    expect(game.properties[1].mortgaged).toBe(true);
    expect(game.properties[1].mortgageTurnsLeft).toBe(10);
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(60));

    game = reduceGame(game, { type: 'buy', playerId: 'p1' });

    expect(game.properties[3].ownerId).toBe('p1');
  });

  it('allows the active payer to sell buildings and mortgage during rent or payment decisions', () => {
    let rentGame = createInitialGame(['Olena', 'Taras'], 'emergency-rent-management');
    rentGame = withOwnership(rentGame, 'p1', [1, 3]);
    rentGame = withDistrict(rentGame, 'p1', 1);
    rentGame = withOwnership(rentGame, 'p2', [6]);
    rentGame = {
      ...rentGame,
      properties: {
        ...rentGame.properties,
        1: { ...rentGame.properties[1], houses: 1 },
      },
      players: rentGame.players.map((player) => (player.id === 'p1' ? { ...player, position: 4 } : player)),
    };

    rentGame = reduceGame(rentGame, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    expect(rentGame.phase).toBe('rent');

    rentGame = reduceGame(rentGame, { type: 'sell_building', playerId: 'p1', tileId: 1 });
    expect(rentGame.phase).toBe('rent');
    expect(rentGame.pendingRent?.payerId).toBe('p1');
    expect(rentGame.properties[1].houses).toBe(0);

    rentGame = reduceGame(rentGame, { type: 'mortgage', playerId: 'p1', tileId: 1 });
    expect(rentGame.phase).toBe('rent');
    expect(rentGame.pendingRent?.payerId).toBe('p1');
    expect(rentGame.properties[1].mortgaged).toBe(true);

    let paymentGame = createInitialGame(['Olena', 'Taras'], 'emergency-payment-management');
    paymentGame = withOwnership(paymentGame, 'p1', [1, 3]);
    paymentGame = withDistrict(paymentGame, 'p1', 1);
    paymentGame = {
      ...paymentGame,
      properties: {
        ...paymentGame.properties,
        1: { ...paymentGame.properties[1], houses: 1 },
      },
      players: paymentGame.players.map((player) => (player.id === 'p1' ? { ...player, position: 2 } : player)),
    };

    paymentGame = reduceGame(paymentGame, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    expect(paymentGame.phase).toBe('payment');

    paymentGame = reduceGame(paymentGame, { type: 'sell_building', playerId: 'p1', tileId: 1 });
    paymentGame = reduceGame(paymentGame, { type: 'mortgage', playerId: 'p1', tileId: 1 });
    expect(paymentGame.phase).toBe('payment');
    expect(paymentGame.pendingPayment?.payerId).toBe('p1');
    expect(paymentGame.players.find((player) => player.id === 'p1')?.money).toBe(money(1780));
  });

  it('sells buildings evenly and refunds half the house cost', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'sell-building');
    game = withOwnership(game, 'p1', [1, 3]);
    game = withDistrict(game, 'p1', 1);

    game = reduceGame(game, { type: 'build', playerId: 'p1', tileId: 1 });
    game = nextBuildRoll(game);
    game = reduceGame(game, { type: 'build', playerId: 'p1', tileId: 3 });
    game = nextBuildRoll(game);
    game = reduceGame(game, { type: 'build', playerId: 'p1', tileId: 1 });

    expect(() => reduceGame(game, { type: 'sell_building', playerId: 'p1', tileId: 3 })).toThrow();

    game = reduceGame(game, { type: 'sell_building', playerId: 'p1', tileId: 1 });

    expect(game.properties[1].houses).toBe(1);
    expect(game.properties[3].houses).toBe(1);
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1575));
  });

  it('allows property management only during the owner turn', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'manage-own-turn');
    game = withOwnership(game, 'p2', [1, 3]);
    game = {
      ...game,
      properties: {
        ...game.properties,
        1: { ...game.properties[1], houses: 1 },
        3: { ...game.properties[3], mortgaged: true },
      },
    };

    expect(() => reduceGame(game, { type: 'build', playerId: 'p2', tileId: 3 })).toThrow();
    expect(() => reduceGame(game, { type: 'sell_building', playerId: 'p2', tileId: 1 })).toThrow();
    expect(() => reduceGame(game, { type: 'mortgage', playerId: 'p2', tileId: 1 })).toThrow();
    expect(() => reduceGame(game, { type: 'unmortgage', playerId: 'p2', tileId: 3 })).toThrow();

    game = { ...game, currentPlayerId: 'p2' };
    game = reduceGame(game, { type: 'sell_building', playerId: 'p2', tileId: 1 });
    expect(game.properties[1].houses).toBe(0);
  });

  it('validates player loan offers and collateral eligibility', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'loan-validation');
    game = withOwnership(game, 'p2', [1]);

    expect(() =>
      reduceGame(game, {
        type: 'propose_loan',
        offer: { lenderId: 'p1', borrowerId: 'p2', principal: money(900), totalRepayment: money(900), durationTurns: 4, collateralTileIds: [] },
      }),
    ).toThrow();

    game = {
      ...game,
      properties: {
        ...game.properties,
        1: { ...game.properties[1], houses: 1 },
      },
    };

    expect(() =>
      reduceGame(game, {
        type: 'propose_loan',
        offer: { lenderId: 'p1', borrowerId: 'p2', principal: money(200), totalRepayment: money(260), durationTurns: 4, collateralTileIds: [1] },
      }),
    ).toThrow();
  });

  it('accepts a player loan and creates due installments before the borrower rolls', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'loan-player');
    game = reduceGame(game, {
      type: 'propose_loan',
      offer: { lenderId: 'p1', borrowerId: 'p2', principal: money(300), totalRepayment: money(360), durationTurns: 3, collateralTileIds: [] },
    });
    const offerId = game.loanOffers[0].id;
    game = reduceGame(game, { type: 'accept_loan', playerId: 'p2', offerId });

    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1400));
    expect(game.players.find((player) => player.id === 'p2')?.money).toBe(money(2000));
    expect(game.loans[0]).toMatchObject({ kind: 'player', borrowerId: 'p2', lenderId: 'p1', remainingDue: money(360), installmentAmount: money(120) });

    game = reduceGame({ ...game, phase: 'turnEnd' }, { type: 'end_turn', playerId: 'p1' });

    expect(game.currentPlayerId).toBe('p2');
    expect(game.phase).toBe('payment');
    expect(game.pendingPayment).toMatchObject({
      payerId: 'p2',
      amount: money(120),
      source: 'loan',
      recipients: [{ playerId: 'p1', amount: money(120) }],
    });

    game = reduceGame(game, { type: 'pay_payment', playerId: 'p2' });
    expect(game.phase).toBe('rolling');
    expect(game.currentPlayerId).toBe('p2');
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1520));
    expect(game.players.find((player) => player.id === 'p2')?.money).toBe(money(1880));
    expect(game.loans[0]).toMatchObject({ remainingDue: money(240), remainingTurns: 2 });
  });

  it('lets the borrower request a player loan for the lender to accept', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'loan-request');
    game = reduceGame(game, {
      type: 'propose_loan',
      offer: {
        lenderId: 'p2',
        borrowerId: 'p1',
        proposerId: 'p1',
        principal: money(200),
        totalRepayment: money(260),
        durationTurns: 4,
        collateralTileIds: [],
      },
    });

    expect(game.loanOffers[0]).toMatchObject({ lenderId: 'p2', borrowerId: 'p1', proposerId: 'p1', status: 'pending' });
    expect(game.log[0].text).toContain('просить кредит');
    expect(() => reduceGame(game, { type: 'accept_loan', playerId: 'p1', offerId: game.loanOffers[0].id })).toThrow();

    game = reduceGame(game, { type: 'accept_loan', playerId: 'p2', offerId: game.loanOffers[0].id });

    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1900));
    expect(game.players.find((player) => player.id === 'p2')?.money).toBe(money(1500));
    expect(game.loans[0]).toMatchObject({ lenderId: 'p2', borrowerId: 'p1', remainingDue: money(260), installmentAmount: money(65) });
  });

  it('creates bank loans with soft terms and respects the bank loan cap', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'loan-bank');

    expect(getBankLoanLimit(game, 'p1')).toBe(money(500));
    game = reduceGame(game, { type: 'take_bank_loan', playerId: 'p1', amount: money(500) });

    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(2200));
    expect(game.loans[0]).toMatchObject({
      kind: 'bank',
      borrowerId: 'p1',
      principal: money(500),
      totalRepayment: money(650),
      installmentAmount: money(65),
      remainingTurns: 10,
    });
    expect(() => reduceGame(game, { type: 'take_bank_loan', playerId: 'p1', amount: money(50) })).toThrow();
  });

  it('shows multiple due loan payments one at a time with bank loans first', () => {
    let game = createInitialGame(['Olena', 'Taras', 'Maria'], 'loan-aggregate');
    game = {
      ...game,
      currentPlayerId: 'p2',
      phase: 'rolling',
    };
    game = reduceGame(game, { type: 'take_bank_loan', playerId: 'p2', amount: money(200) });
    const bankLoanId = game.loans[0].id;
    game = {
      ...game,
      currentPlayerId: 'p1',
      phase: 'rolling',
    };
    game = reduceGame(game, {
      type: 'propose_loan',
      offer: { lenderId: 'p1', borrowerId: 'p2', principal: money(100), totalRepayment: money(120), durationTurns: 2, collateralTileIds: [] },
    });
    game = reduceGame(game, { type: 'accept_loan', playerId: 'p2', offerId: game.loanOffers[0].id });
    const playerLoanId = game.loans.find((loan) => loan.kind === 'player')!.id;

    game = reduceGame({ ...game, currentPlayerId: 'p1', phase: 'turnEnd' }, { type: 'end_turn', playerId: 'p1' });

    expect(game.phase).toBe('payment');
    expect(game.pendingPayment).toMatchObject({
      payerId: 'p2',
      amount: money(26),
      source: 'loan',
      loanPayments: [{ loanId: bankLoanId, amount: money(26) }],
      loanPaymentQueue: [{ loanId: playerLoanId, amount: money(60) }],
    });
    expect(game.pendingPayment?.reason).toBe('виплата за банківським кредитом');

    game = reduceGame(game, { type: 'pay_payment', playerId: 'p2' });

    expect(game.phase).toBe('payment');
    expect(game.pendingPayment).toMatchObject({
      payerId: 'p2',
      amount: money(60),
      source: 'loan',
      recipients: [{ playerId: 'p1', amount: money(60) }],
      loanPayments: [{ loanId: playerLoanId, amount: money(60) }],
    });
    expect(game.pendingPayment?.reason).toBe('виплата за кредитом від Olena');

    game = reduceGame(game, { type: 'pay_payment', playerId: 'p2' });

    expect(game.phase).toBe('rolling');
    expect(game.pendingPayment).toBeUndefined();
  });

  it('keeps the borrower turn active after skipping a loan payment', () => {
    let game = createInitialGame(['Olena', 'Taras', 'Maria'], 'loan-miss-continues-turn');
    game = {
      ...game,
      currentPlayerId: 'p2',
      phase: 'rolling',
    };
    game = reduceGame(game, { type: 'take_bank_loan', playerId: 'p2', amount: money(200) });
    const bankLoanId = game.loans[0].id;
    game = {
      ...game,
      currentPlayerId: 'p1',
      phase: 'rolling',
    };
    game = reduceGame(game, {
      type: 'propose_loan',
      offer: { lenderId: 'p1', borrowerId: 'p2', principal: money(100), totalRepayment: money(120), durationTurns: 2, collateralTileIds: [] },
    });
    game = reduceGame(game, { type: 'accept_loan', playerId: 'p2', offerId: game.loanOffers[0].id });
    const playerLoanId = game.loans.find((loan) => loan.kind === 'player')!.id;

    game = reduceGame({ ...game, currentPlayerId: 'p1', phase: 'turnEnd' }, { type: 'end_turn', playerId: 'p1' });
    game = reduceGame(game, { type: 'miss_loan_payment', playerId: 'p2' });

    expect(game.currentPlayerId).toBe('p2');
    expect(game.phase).toBe('payment');
    expect(game.pendingPayment).toMatchObject({
      payerId: 'p2',
      amount: money(60),
      source: 'loan',
      recipients: [{ playerId: 'p1', amount: money(60) }],
      loanPayments: [{ loanId: playerLoanId, amount: money(60) }],
    });
    expect(game.loans.find((loan) => loan.id === bankLoanId)).toMatchObject({
      missedPayments: 1,
      remainingDue: money(266),
    });

    game = reduceGame(game, { type: 'miss_loan_payment', playerId: 'p2' });

    expect(game.currentPlayerId).toBe('p2');
    expect(game.phase).toBe('rolling');
    expect(game.pendingPayment).toBeUndefined();
  });

  it('uses a loan payoff card to close a borrower loan without spending borrower cash', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'loan-payoff-card');
    game = reduceGame(game, {
      type: 'propose_loan',
      offer: { lenderId: 'p1', borrowerId: 'p2', principal: money(300), totalRepayment: money(360), durationTurns: 3, collateralTileIds: [] },
    });
    game = reduceGame(game, { type: 'accept_loan', playerId: 'p2', offerId: game.loanOffers[0].id });
    const loanId = game.loans[0].id;
    game = {
      ...game,
      currentPlayerId: 'p2',
      phase: 'rolling',
      players: game.players.map((player) => (player.id === 'p2' ? { ...player, loanPayoffCards: 1 } : player)),
    };

    game = reduceGame(game, { type: 'use_loan_payoff_card', playerId: 'p2', loanId });

    expect(game.loans).toHaveLength(0);
    expect(game.players.find((player) => player.id === 'p2')?.money).toBe(money(2000));
    expect(game.players.find((player) => player.id === 'p2')?.loanPayoffCards).toBe(0);
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1760));
  });

  it('clears a pending loan payment when the borrower pays that loan off with a card', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'loan-payoff-card-pending');
    game = reduceGame(game, {
      type: 'propose_loan',
      offer: { lenderId: 'p1', borrowerId: 'p2', principal: money(300), totalRepayment: money(360), durationTurns: 3, collateralTileIds: [] },
    });
    game = reduceGame(game, { type: 'accept_loan', playerId: 'p2', offerId: game.loanOffers[0].id });
    const loanId = game.loans[0].id;
    game = reduceGame({ ...game, phase: 'turnEnd' }, { type: 'end_turn', playerId: 'p1' });
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p2' ? { ...player, loanPayoffCards: 1 } : player)),
    };

    game = reduceGame(game, { type: 'use_loan_payoff_card', playerId: 'p2', loanId });

    expect(game.phase).toBe('rolling');
    expect(game.pendingPayment).toBeUndefined();
    expect(game.loans).toHaveLength(0);
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1760));
  });

  it('allows repeated player-loan misses until the final payment without transferring collateral', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'loan-default-collateral');
    game = withOwnership(game, 'p2', [1]);
    game = reduceGame(game, {
      type: 'propose_loan',
      offer: { lenderId: 'p1', borrowerId: 'p2', principal: money(300), totalRepayment: money(360), durationTurns: 3, collateralTileIds: [1] },
    });
    game = reduceGame(game, { type: 'accept_loan', playerId: 'p2', offerId: game.loanOffers[0].id });
    game = reduceGame({ ...game, phase: 'turnEnd' }, { type: 'end_turn', playerId: 'p1' });
    game = reduceGame(game, { type: 'miss_loan_payment', playerId: 'p2' });

    expect(game.currentPlayerId).toBe('p2');
    expect(game.phase).toBe('rolling');
    expect(game.loans[0]).toMatchObject({ missedPayments: 1, remainingDue: money(372) });

    game = reduceGame({ ...game, phase: 'turnEnd' }, { type: 'end_turn', playerId: 'p2' });
    game = reduceGame({ ...game, phase: 'turnEnd' }, { type: 'end_turn', playerId: 'p1' });
    expect(game.pendingPayment).toMatchObject({ amount: money(252), source: 'loan' });
    game = reduceGame(game, { type: 'miss_loan_payment', playerId: 'p2' });

    expect(game.currentPlayerId).toBe('p2');
    expect(game.phase).toBe('rolling');
    expect(game.properties[1].ownerId).toBe('p2');
    expect(game.players.find((player) => player.id === 'p2')?.properties).toContain(1);
    expect(game.loans[0]).toMatchObject({ missedPayments: 2, remainingDue: money(398) });

    game = reduceGame({ ...game, phase: 'turnEnd' }, { type: 'end_turn', playerId: 'p2' });
    game = reduceGame({ ...game, phase: 'turnEnd' }, { type: 'end_turn', playerId: 'p1' });
    expect(game.pendingPayment).toMatchObject({ amount: money(398), source: 'loan' });
    expect(() => reduceGame(game, { type: 'miss_loan_payment', playerId: 'p2' })).toThrow();
  });

  it('forces payment or surrender on a second unsecured or bank loan miss', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'loan-default-unsecured');
    game = reduceGame(game, { type: 'take_bank_loan', playerId: 'p1', amount: money(300) });
    game = reduceGame({ ...game, phase: 'turnEnd' }, { type: 'end_turn', playerId: 'p1' });
    game = reduceGame({ ...game, phase: 'turnEnd' }, { type: 'end_turn', playerId: 'p2' });
    game = reduceGame(game, { type: 'miss_loan_payment', playerId: 'p1' });
    game = reduceGame({ ...game, phase: 'turnEnd' }, { type: 'end_turn', playerId: 'p1' });
    game = reduceGame({ ...game, phase: 'turnEnd' }, { type: 'end_turn', playerId: 'p2' });

    expect(game.phase).toBe('payment');
    expect(() => reduceGame(game, { type: 'miss_loan_payment', playerId: 'p1' })).toThrow();
  });

  it('handles loan cleanup during borrower or lender bankruptcy', () => {
    let borrowerGame = createInitialGame(['Olena', 'Taras'], 'loan-bankruptcy-borrower');
    borrowerGame = withOwnership(borrowerGame, 'p2', [1]);
    borrowerGame = reduceGame(borrowerGame, {
      type: 'propose_loan',
      offer: { lenderId: 'p1', borrowerId: 'p2', principal: money(300), totalRepayment: money(360), durationTurns: 3, collateralTileIds: [1] },
    });
    borrowerGame = reduceGame(borrowerGame, { type: 'accept_loan', playerId: 'p2', offerId: borrowerGame.loanOffers[0].id });
    borrowerGame = reduceGame(borrowerGame, { type: 'declare_bankruptcy', playerId: 'p2' });

    expect(borrowerGame.properties[1].ownerId).toBe('p1');
    expect(borrowerGame.players.find((player) => player.id === 'p1')?.money).toBe(money(1616));
    expect(borrowerGame.loans).toHaveLength(0);

    let lenderGame = createInitialGame(['Olena', 'Taras', 'Maria'], 'loan-bankruptcy-lender');
    lenderGame = reduceGame(lenderGame, {
      type: 'propose_loan',
      offer: { lenderId: 'p1', borrowerId: 'p2', principal: money(200), totalRepayment: money(240), durationTurns: 4, collateralTileIds: [] },
    });
    lenderGame = reduceGame(lenderGame, { type: 'accept_loan', playerId: 'p2', offerId: lenderGame.loanOffers[0].id });
    lenderGame = reduceGame(lenderGame, { type: 'declare_bankruptcy', playerId: 'p1' });

    expect(lenderGame.loans).toHaveLength(0);
  });

  it('mortgages and unmortgages a property with a premium', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'mortgage-premium');
    game = withOwnership(game, 'p1', [1]);

    game = reduceGame(game, { type: 'mortgage', playerId: 'p1', tileId: 1 });
    expect(game.properties[1].mortgaged).toBe(true);
    expect(game.properties[1].mortgagedAtTurn).toBe(1);
    expect(game.properties[1].mortgageTurnsLeft).toBe(10);
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1730));

    game = reduceGame(game, { type: 'unmortgage', playerId: 'p1', tileId: 1 });
    expect(game.properties[1].mortgaged).toBe(false);
    expect(game.properties[1].mortgagedAtTurn).toBeUndefined();
    expect(game.properties[1].mortgageTurnsLeft).toBeUndefined();
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1698));
  });

  it('counts mortgage turns only after the owner turn and returns overdue property to the bank', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'mortgage-expire');
    game = withOwnership(game, 'p1', [1]);
    game = reduceGame(game, { type: 'mortgage', playerId: 'p1', tileId: 1 });

    for (let index = 0; index < 10; index += 1) {
      game = { ...game, phase: 'turnEnd' };
      game = reduceGame(game, { type: 'end_turn', playerId: game.currentPlayerId });
    }

    expect(game.properties[1].ownerId).toBe('p1');
    expect(game.properties[1].mortgaged).toBe(true);
    expect(game.properties[1].mortgageTurnsLeft).toBe(5);

    for (let index = 0; index < 9; index += 1) {
      game = { ...game, phase: 'turnEnd' };
      game = reduceGame(game, { type: 'end_turn', playerId: game.currentPlayerId });
    }

    expect(game.properties[1].ownerId).toBeUndefined();
    expect(game.properties[1].mortgaged).toBe(false);
    expect(game.properties[1].mortgagedAtTurn).toBeUndefined();
    expect(game.properties[1].mortgageTurnsLeft).toBeUndefined();
    expect(game.players.find((player) => player.id === 'p1')?.properties).not.toContain(1);
  });

  it('creates a valid pending trade offer', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'trade-valid');
    game = withOwnership(game, 'p1', [1]);
    game = withOwnership(game, 'p2', [3]);

    game = reduceGame(game, {
      type: 'propose_trade',
      offer: {
        fromPlayerId: 'p1',
        toPlayerId: 'p2',
        offerMoney: money(100),
        requestMoney: money(50),
        offerProperties: [1],
        requestProperties: [3],
      },
    });

    expect(game.phase).toBe('rolling');
    expect(game.tradeOffers).toHaveLength(1);
    expect(game.tradeOffers[0]).toMatchObject({
      fromPlayerId: 'p1',
      toPlayerId: 'p2',
      status: 'pending',
      offerProperties: [1],
      requestProperties: [3],
    });
    expect(game.log[0].text).toContain('Olena');
    expect(game.log[0].text).toContain('Taras');
    expect(game.log[0].text).toContain(`${money(100)}₴`);
    expect(game.log[0].text).toContain(`${money(50)}₴`);
  });

  it('allows only the current player to create one instant pending trade', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'trade-turn-bound');
    game = withOwnership(game, 'p1', [1]);
    game = withOwnership(game, 'p2', [3]);

    expect(() =>
      reduceGame(game, {
        type: 'propose_trade',
        offer: {
          fromPlayerId: 'p2',
          toPlayerId: 'p1',
          offerMoney: 0,
          requestMoney: 0,
          offerProperties: [3],
          requestProperties: [],
        },
      }),
    ).toThrow();

    game = reduceGame(game, {
      type: 'propose_trade',
      offer: {
        fromPlayerId: 'p1',
        toPlayerId: 'p2',
        offerMoney: 0,
        requestMoney: money(30),
        offerProperties: [1],
        requestProperties: [],
      },
    });

    expect(() => reduceGame(game, { type: 'continue_turn', playerId: 'p1' })).toThrow();
    expect(() => reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] })).toThrow('активну угоду');

    expect(() =>
      reduceGame(game, {
        type: 'propose_trade',
        offer: {
          fromPlayerId: 'p1',
          toPlayerId: 'p2',
          offerMoney: money(10),
          requestMoney: 0,
          offerProperties: [],
          requestProperties: [],
        },
      }),
    ).toThrow();
  });

  it('rejects a trade with another player property or insufficient money on accept', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'trade-reject');
    game = withOwnership(game, 'p1', [1]);
    game = withOwnership(game, 'p2', [3]);

    expect(() =>
      reduceGame(game, {
        type: 'propose_trade',
        offer: {
          fromPlayerId: 'p1',
          toPlayerId: 'p2',
          offerMoney: 0,
          requestMoney: 0,
          offerProperties: [3],
          requestProperties: [],
        },
      }),
    ).toThrow();

    game = reduceGame(game, {
      type: 'propose_trade',
      offer: {
        fromPlayerId: 'p1',
        toPlayerId: 'p2',
        offerMoney: 0,
        requestMoney: money(30),
        offerProperties: [1],
        requestProperties: [],
      },
    });
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p2' ? { ...player, money: money(10) } : player)),
    };

    expect(() => reduceGame(game, { type: 'accept_trade', playerId: 'p2', offerId: game.tradeOffers[0].id })).toThrow();
  });

  it('accepts a trade and transfers money plus properties', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'trade-accept');
    game = withOwnership(game, 'p1', [1]);
    game = withOwnership(game, 'p2', [3]);

    game = reduceGame(game, {
      type: 'propose_trade',
      offer: {
        fromPlayerId: 'p1',
        toPlayerId: 'p2',
        offerMoney: money(100),
        requestMoney: money(50),
        offerProperties: [1],
        requestProperties: [3],
      },
    });
    game = reduceGame(game, { type: 'accept_trade', playerId: 'p2', offerId: game.tradeOffers[0].id });

    expect(game.phase).toBe('rolling');
    expect(game.tradeOffers[0].status).toBe('accepted');
    expect(game.log[0].text).toContain('приймає угоду');
    expect(game.properties[1].ownerId).toBe('p2');
    expect(game.properties[3].ownerId).toBe('p1');
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1650));
    expect(game.players.find((player) => player.id === 'p2')?.money).toBe(money(1750));

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 2] });
    expect(game.diceRollId).toBe(1);
  });

  it('allows low property offers but rejects offers above the triple value range', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'trade-value-range');
    game = withOwnership(game, 'p2', [1]);

    const lowOfferGame = reduceGame(game, {
      type: 'propose_trade',
      offer: {
        fromPlayerId: 'p1',
        toPlayerId: 'p2',
        offerMoney: money(10),
        requestMoney: 0,
        offerProperties: [],
        requestProperties: [1],
      },
    });

    expect(lowOfferGame.tradeOffers).toHaveLength(1);

    expect(() =>
      reduceGame(game, {
        type: 'propose_trade',
        offer: {
          fromPlayerId: 'p1',
          toPlayerId: 'p2',
          offerMoney: money(200),
          requestMoney: 0,
          offerProperties: [],
          requestProperties: [1],
        },
      }),
    ).toThrow('Пропозиція занадто велика');
  });

  it('activates a trade rent service with discount and cooldown', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'trade-rent-service');
    game = withOwnership(game, 'p2', [1]);

    game = reduceGame(game, {
      type: 'propose_trade',
      offer: {
        fromPlayerId: 'p1',
        toPlayerId: 'p2',
        offerMoney: money(100),
        requestMoney: 0,
        offerProperties: [],
        requestProperties: [],
        requestRentServices: [{ tileId: 1, turns: 3, discountPercent: 50 }],
      },
    });
    game = reduceGame(game, { type: 'accept_trade', playerId: 'p2', offerId: game.tradeOffers[0].id });

    expect(game.rentServices).toHaveLength(1);
    expect(game.rentServices[0]).toMatchObject({
      ownerId: 'p2',
      beneficiaryId: 'p1',
      tileId: 1,
      remainingTurns: 3,
      discountPercent: 50,
    });

    expect(() =>
      reduceGame(game, {
        type: 'propose_trade',
        offer: {
          fromPlayerId: 'p1',
          toPlayerId: 'p2',
          offerMoney: money(100),
          requestMoney: 0,
          offerProperties: [],
          requestProperties: [],
          requestRentServices: [{ tileId: 1, turns: 1, discountPercent: 100 }],
        },
      }),
    ).toThrow('ще перезаряджається');

    game = {
      ...game,
      phase: 'rolling',
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 38 } : player)),
    };
    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 2] });

    expect(game.phase).toBe('rent');
    expect(game.pendingRent).toMatchObject({ amount: money(1), originalAmount: money(2), discountPercent: 50 });

    game = reduceGame(game, { type: 'pay_rent', playerId: 'p1' });
    game = reduceGame(game, { type: 'continue_turn', playerId: 'p1' });

    expect(game.currentPlayerId).toBe('p2');
    expect(game.rentServices[0].remainingTurns).toBe(2);
  });

  it('declines a pending trade offer', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'trade-decline');
    game = withOwnership(game, 'p1', [1]);

    game = reduceGame(game, {
      type: 'propose_trade',
      offer: {
        fromPlayerId: 'p1',
        toPlayerId: 'p2',
        offerMoney: money(10),
        requestMoney: 0,
        offerProperties: [],
        requestProperties: [],
      },
    });
    game = reduceGame(game, { type: 'decline_trade', playerId: 'p2', offerId: game.tradeOffers[0].id });

    expect(game.phase).toBe('rolling');
    expect(game.tradeOffers[0].status).toBe('declined');
    expect(game.log[0].text).toContain('відхиляє угоду');
  });

  it('does not allow properties with houses in a trade offer', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'trade-houses');
    game = withOwnership(game, 'p1', [1, 3]);
    game = {
      ...game,
      properties: {
        ...game.properties,
        1: { ...game.properties[1], houses: 1 },
      },
    };

    expect(() =>
      reduceGame(game, {
        type: 'propose_trade',
        offer: {
          fromPlayerId: 'p1',
          toPlayerId: 'p2',
          offerMoney: 0,
          requestMoney: 0,
          offerProperties: [1],
          requestProperties: [],
        },
      }),
    ).toThrow();
  });

  it('applies city event rent multipliers to matching streets', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'city-event-rent');
    game = withOwnership(game, 'p2', [21]);
    game = {
      ...game,
      activeCityEvents: [{ id: 'tourist-season', remainingRounds: 3, durationRounds: 3, startedRound: 4 }],
    };

    const zaporizhzhia = getTile(21);
    if (zaporizhzhia.type !== 'city') throw new Error('Expected Zaporizhzhia to be a city.');
    expect(calculateRent(game, zaporizhzhia)).toBe(money(27));
  });

  it('raises building cost during a tax crisis city event', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'city-event-build');
    game = withOwnership(game, 'p1', [1, 3]);
    game = withDistrict(game, 'p1', 1);
    game = {
      ...game,
      activeCityEvents: [{ id: 'tax-crisis', remainingRounds: 2, durationRounds: 2, startedRound: 4 }],
    };

    const pavlohrad = getTile(1);
    if (pavlohrad.type !== 'city') throw new Error('Expected Pavlohrad to be a city.');
    expect(getEffectiveHouseCost(game, pavlohrad)).toBe(money(65));

    game = reduceGame(game, { type: 'build', playerId: 'p1', tileId: 1 });
    expect(game.properties[1].houses).toBe(1);
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1635));
  });

  it('raises purchase and mortgage values during a tax crisis city event', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'city-event-tax');
    game = {
      ...game,
      phase: 'awaitingPurchase',
      pendingPurchaseTileId: 1,
      activeCityEvents: [{ id: 'tax-crisis', remainingRounds: 2, durationRounds: 2, startedRound: 4 }],
    };

    const pavlohrad = getTile(1);
    if (pavlohrad.type !== 'city') throw new Error('Expected Pavlohrad to be a city.');
    expect(getEffectivePropertyPrice(game, pavlohrad)).toBe(money(78));

    game = reduceGame(game, { type: 'buy', playerId: 'p1' });
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1622));

    game = {
      ...game,
      phase: 'rolling',
      properties: {
        ...game.properties,
        1: { ...game.properties[1], mortgaged: true, mortgageTurnsLeft: 10 },
      },
    };
    expect(getEffectiveMortgageValue(game, pavlohrad)).toBe(money(39));
    expect(getEffectiveUnmortgageCost(game, pavlohrad)).toBe(money(41));
  });

  it('doubles tax payments during tax madness city event', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'city-event-tax-madness');
    game = {
      ...game,
      activeCityEvents: [{ id: 'tax-madness', remainingRounds: 2, durationRounds: 2, startedRound: 4 }],
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 2 } : player)),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });

    expect(game.phase).toBe('payment');
    expect(game.pendingPayment).toMatchObject({ payerId: 'p1', amount: money(400), tileId: 4, source: 'tax' });
  });

  it('charges every active player 10% cash when bank inspection is drawn', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'city-event-bank-inspection');
    game = {
      ...game,
      cityEventDeck: ['bank-inspection'],
      cityEventDiscard: [],
      players: game.players.map((player) => (player.id === 'p2' ? { ...player, money: money(987) } : player)),
    };

    for (let index = 0; index < 6; index += 1) {
      game = reduceGame({ ...game, phase: 'turnEnd' }, { type: 'end_turn', playerId: game.currentPlayerId });
    }

    expect(game.pendingCityEvent?.id).toBe('bank-inspection');
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1530));
    expect(game.players.find((player) => player.id === 'p2')?.money).toBe(money(888));
  });

  it('boosts paid roads in the city event deck', () => {
    const game = createInitialGame(['Olena', 'Taras'], 'city-event-paid-roads-boost');

    expect(game.cityEventDeck.filter((eventId) => eventId === 'paid-roads')).toHaveLength(2);
  });

  it('charges paid roads by moved steps before resolving the landing tile', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'city-event-paid-roads-step-fee');
    game = {
      ...game,
      activeCityEvents: [{ id: 'paid-roads', remainingRounds: 2, durationRounds: 2, startedRound: 4 }],
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 39 } : player)),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 2] });

    expect(game.phase).toBe('payment');
    expect(game.pendingPayment).toMatchObject({ payerId: 'p1', amount: money(15), source: 'cityEvent' });
    expect(game.players.find((player) => player.id === 'p1')?.position).toBe(2);

    game = reduceGame(game, { type: 'pay_payment', playerId: 'p1' });
    expect(game.phase).toBe('awaitingCard');
    expect(game.pendingCardDraw).toMatchObject({ deck: 'community', tileId: 2 });
  });

  it('can draw a double city event and biases paid roads toward one-die repair', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'city-event-double-paid-roads');
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValueOnce(0.01).mockReturnValueOnce(0.01);

    try {
      game = {
        ...game,
        currentPlayerId: 'p2',
        currentRound: 3,
        turn: 6,
        phase: 'turnEnd',
        cityEventDeck: ['paid-roads', 'road-repair'],
        cityEventDiscard: [],
      };

      game = reduceGame(game, { type: 'end_turn', playerId: 'p2' });
    } finally {
      randomSpy.mockRestore();
    }

    expect(game.pendingCityEvent).toMatchObject({
      id: 'paid-roads',
      isDouble: true,
      secondary: { id: 'road-repair' },
    });
    expect(game.activeCityEvents.map((event) => event.id)).toEqual(expect.arrayContaining(['paid-roads', 'road-repair']));
    expect(game.cityEventDiscard).toEqual(['paid-roads', 'road-repair']);
  });

  it('uses one die during road repair and prevents jail escape by doubles', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'city-event-road-repair');
    game = {
      ...game,
      activeCityEvents: [{ id: 'road-repair', remainingRounds: 2, durationRounds: 2, startedRound: 4 }],
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 10, jailTurns: 2 } : player)),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [6, 6] });

    expect(game.dice).toEqual([6, 0]);
    expect(game.phase).toBe('turnEnd');
    expect(game.players.find((player) => player.id === 'p1')).toMatchObject({ position: 10, jailTurns: 1 });
  });

  it('blocks building during a mass protest city event', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'city-event-mass-protest');
    game = withOwnership(game, 'p1', [1, 3]);
    game = {
      ...game,
      activeCityEvents: [{ id: 'mass-protest', remainingRounds: 2, durationRounds: 2, startedRound: 4 }],
    };

    expect(() => reduceGame(game, { type: 'build', playerId: 'p1', tileId: 1 })).toThrow('Будівництво заборонене');
  });

  it('raises prices by turn and taxes by round later in the game without raising rent', () => {
    const pavlohrad = getTile(1);
    if (pavlohrad.type !== 'city') throw new Error('Expected Pavlohrad to be a city.');

    let midGame = createInitialGame(['Olena', 'Taras'], 'late-prices-mid');
    midGame = {
      ...midGame,
      turn: 41,
      currentRound: 1,
      properties: {
        ...midGame.properties,
        1: { ...midGame.properties[1], mortgaged: true, mortgageTurnsLeft: 10 },
      },
    };

    expect(getEffectivePropertyPrice(midGame, pavlohrad)).toBe(money(75));
    expect(getEffectiveHouseCost(midGame, pavlohrad)).toBe(money(63));
    expect(getEffectiveMortgageValue(midGame, pavlohrad)).toBe(money(38));
    expect(getEffectiveUnmortgageCost(midGame, pavlohrad)).toBe(money(40));
    expect(getEffectiveFineAmount(midGame, money(200))).toBe(money(200));
    expect(getEffectiveFineAmount({ ...midGame, currentRound: 41 }, money(200))).toBe(money(300));

    let lateGame = createInitialGame(['Olena', 'Taras'], 'late-prices-end');
    lateGame = withOwnership(
      {
        ...lateGame,
        turn: 71,
        currentRound: 1,
        properties: {
          ...lateGame.properties,
          1: { ...lateGame.properties[1], mortgaged: true, mortgageTurnsLeft: 10 },
        },
      },
      'p2',
      [1],
    );

    expect(getEffectivePropertyPrice(lateGame, pavlohrad)).toBe(money(90));
    expect(getEffectiveHouseCost(lateGame, pavlohrad)).toBe(money(75));
    expect(getEffectiveMortgageValue(lateGame, pavlohrad)).toBe(money(45));
    expect(getEffectiveUnmortgageCost(lateGame, pavlohrad)).toBe(money(48));
    expect(getEffectiveFineAmount(lateGame, money(200))).toBe(money(200));
    expect(getEffectiveFineAmount({ ...lateGame, currentRound: 71 }, money(200))).toBe(money(400));

    const lateRentGame = withOwnership(
      {
        ...lateGame,
        properties: {
          ...lateGame.properties,
          1: { ...lateGame.properties[1], mortgaged: false },
        },
      },
      'p2',
      [1],
    );
    expect(calculateRent(lateRentGame, pavlohrad)).toBe(money(2));
  });

  it('applies late-game card fines by round instead of turn', () => {
    let highTurnEarlyRound = createInitialGame(['Olena', 'Taras'], 'card-fine-turn-round');
    highTurnEarlyRound = {
      ...highTurnEarlyRound,
      turn: 41,
      currentRound: 1,
      phase: 'awaitingCard',
      pendingCardDraw: { deck: 'chance', tileId: 7 },
      chanceDeck: [3],
      discardChance: [],
    };

    highTurnEarlyRound = reduceGame(highTurnEarlyRound, { type: 'draw_card', playerId: 'p1' });
    expect(highTurnEarlyRound.pendingPayment).toMatchObject({ payerId: 'p1', amount: money(50), source: 'card' });

    let highRound = createInitialGame(['Olena', 'Taras'], 'card-fine-round');
    highRound = {
      ...highRound,
      turn: 41,
      currentRound: 41,
      phase: 'awaitingCard',
      pendingCardDraw: { deck: 'chance', tileId: 7 },
      chanceDeck: [3],
      discardChance: [],
    };

    highRound = reduceGame(highRound, { type: 'draw_card', playerId: 'p1' });
    expect(highRound.pendingPayment).toMatchObject({ payerId: 'p1', amount: money(75), source: 'card' });
  });

  it('draws a city event every third completed round', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'city-event-rounds');
    game = { ...game, cityEventDeck: ['tourist-season'], cityEventDiscard: [] };

    for (let index = 0; index < 6; index += 1) {
      game = reduceGame({ ...game, phase: 'turnEnd' }, { type: 'end_turn', playerId: game.currentPlayerId });
    }

    expect(game.currentRound).toBe(4);
    expect(game.pendingCityEvent?.id).toBe('tourist-season');
    expect(game.activeCityEvents.find((event) => event.id === 'tourist-season')?.remainingRounds).toBe(3);
  });

  it('reshuffles city events without immediately repeating recent discards', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'city-event-reshuffle');
    const recentEvents = ['tourist-season', 'tax-madness', 'tax-crisis', 'city-tender', 'bank-day'] as const;
    game = { ...game, cityEventDeck: [], cityEventDiscard: [...recentEvents] };

    for (let index = 0; index < 6; index += 1) {
      game = reduceGame({ ...game, phase: 'turnEnd' }, { type: 'end_turn', playerId: game.currentPlayerId });
    }

    expect(game.currentRound).toBe(4);
    expect(game.pendingCityEvent?.id).toBeDefined();
    expect(recentEvents).not.toContain(game.pendingCityEvent?.id);
  });

  it('expires a city event after every player completes the round', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'city-event-expire');
    game = {
      ...game,
      currentPlayerId: 'p2',
      currentRound: 4,
      turn: 8,
      phase: 'turnEnd',
      activeCityEvents: [{ id: 'tourist-season', remainingRounds: 1, durationRounds: 3, startedRound: 4 }],
      pendingCityEvent: {
        id: 'tourist-season',
        title: 'Туристичний сезон',
        text: 'Оренда на червоних і жовтих вулицях +50% на 3 раунди.',
        round: 4,
      },
    };

    game = reduceGame(game, { type: 'end_turn', playerId: 'p2' });

    expect(game.currentRound).toBe(5);
    expect(game.currentPlayerId).toBe('p1');
    expect(game.activeCityEvents).toHaveLength(0);
    expect(game.pendingCityEvent).toBeUndefined();
  });

  it('can start a city event auction on unowned property without skipping the next player turn', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'city-event-auction');
    game = { ...game, cityEventDeck: ['city-tender'], cityEventDiscard: [] };

    for (let index = 0; index < 6; index += 1) {
      game = reduceGame({ ...game, phase: 'turnEnd' }, { type: 'end_turn', playerId: game.currentPlayerId });
    }

    expect(game.currentRound).toBe(4);
    expect(game.currentPlayerId).toBe('p1');
    expect(game.phase).toBe('auction');
    expect(game.auction?.source).toBe('cityEvent');

    game = reduceGame(
      { ...game, auction: game.auction ? { ...game.auction, endsAt: Date.now() - 1 } : undefined },
      { type: 'resolve_auction' },
    );
    expect(game.phase).toBe('rolling');
    expect(game.currentPlayerId).toBe('p1');
  });

  it('keeps dice value mapping deterministic for Three.js animation', () => {
    expect(diceRotationForValue(1)).toEqual([0, 0, 0]);
    expect(diceRotationForValue(6)[0]).toBeLessThan(0);
  });
});

const withOwnership = (
  game: ReturnType<typeof createInitialGame>,
  ownerId: string,
  tileIds: number[],
): ReturnType<typeof createInitialGame> => ({
  ...game,
  properties: {
    ...game.properties,
    ...Object.fromEntries(tileIds.map((tileId) => [tileId, { ...game.properties[tileId], ownerId }])),
  },
  players: game.players.map((player) =>
    player.id === ownerId
      ? { ...player, properties: Array.from(new Set([...player.properties, ...tileIds])) }
      : {
          ...player,
          properties: player.properties.filter((tileId) => !tileIds.includes(tileId)),
        },
  ),
});

const withDistrict = (
  game: ReturnType<typeof createInitialGame>,
  ownerId: string,
  tileId: number,
  path: DistrictPath = 'tourist',
): ReturnType<typeof createInitialGame> => {
  const tile = getTile(tileId);
  if (tile.type !== 'city') throw new Error('Expected city tile for district helper.');
  return {
    ...game,
    districtPaths: {
      ...(game.districtPaths ?? {}),
      [tile.group]: { ownerId, path, createdAtTurn: game.turn, creationCost: getDistrictCreationCost(game, tile.group) },
    },
  };
};

const nextBuildRoll = (game: ReturnType<typeof createInitialGame>): ReturnType<typeof createInitialGame> => ({
  ...game,
  diceRollId: game.diceRollId + 1,
  builtThisRoll: undefined,
  buildsThisRoll: undefined,
});
