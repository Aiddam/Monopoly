import { describe, expect, it } from 'vitest';
import {
  calculateRent,
  createInitialGame,
  diceRotationForValue,
  getEffectiveFineAmount,
  getEffectiveHouseCost,
  getEffectivePropertyPrice,
  getEffectiveUnmortgageCost,
  reduceGame,
} from './gameEngine';
import { money } from './economy';
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
    expect(game.moneyHistory?.at(-1)?.money.p1).toBe(money(1500));
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 39 } : player)),
    };
    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    game = reduceGame(game, { type: 'buy', playerId: 'p1' });

    const player = game.players[0];
    expect(player.position).toBe(1);
    expect(player.money).toBe(money(1640));
    expect(game.properties[1].ownerId).toBe('p1');
    expect(game.moneyHistory?.at(-1)).toMatchObject({
      turn: 1,
      round: 1,
      money: { p1: money(1640), p2: money(1500) },
      worth: { p1: money(1700), p2: money(1500) },
    });

    game = reduceGame(game, { type: 'end_turn', playerId: 'p1' });
    expect(game.moneyHistory?.at(-1)).toMatchObject({
      turn: 2,
      round: 1,
      money: { p1: money(1640), p2: money(1500) },
      worth: { p1: money(1700), p2: money(1500) },
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
    expect(passGame.players.find((player) => player.id === 'p1')?.money).toBe(money(1700));

    let landGame = createInitialGame(['Olena', 'Taras'], 'start-land');
    landGame = {
      ...landGame,
      players: landGame.players.map((player) => (player.id === 'p1' ? { ...player, position: 38 } : player)),
    };
    landGame = reduceGame(landGame, { type: 'roll', playerId: 'p1', dice: [1, 1] });

    expect(landGame.players.find((player) => player.id === 'p1')?.position).toBe(0);
    expect(landGame.players.find((player) => player.id === 'p1')?.money).toBe(money(1800));
  });

  it('reduces start rewards as the game gets longer', () => {
    let midGame = createInitialGame(['Olena', 'Taras'], 'late-start-mid');
    midGame = {
      ...midGame,
      turn: 36,
      players: midGame.players.map((player) => (player.id === 'p1' ? { ...player, position: 39 } : player)),
    };
    midGame = reduceGame(midGame, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    expect(midGame.players.find((player) => player.id === 'p1')?.money).toBe(money(1650));

    let lateGame = createInitialGame(['Olena', 'Taras'], 'late-start-end');
    lateGame = {
      ...lateGame,
      turn: 66,
      players: lateGame.players.map((player) => (player.id === 'p1' ? { ...player, position: 38 } : player)),
    };
    lateGame = reduceGame(lateGame, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    expect(lateGame.players.find((player) => player.id === 'p1')?.money).toBe(money(1650));
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
    expect(calculateRent(game, mono)).toBe(money(100));
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
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1700));
    expect(game.players.find((player) => player.id === 'p2')?.money).toBe(money(1500));

    game = reduceGame(game, { type: 'pay_rent', playerId: 'p1' });

    expect(game.phase).toBe('turnEnd');
    expect(game.pendingRent).toBeUndefined();
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1698));
    expect(game.players.find((player) => player.id === 'p2')?.money).toBe(money(1502));
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
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1500));

    game = reduceGame(game, { type: 'pay_payment', playerId: 'p1' });

    expect(game.phase).toBe('turnEnd');
    expect(game.pendingPayment).toBeUndefined();
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1300));
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
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1500));

    game = reduceGame(game, { type: 'pay_payment', playerId: 'p1' });

    expect(game.phase).toBe('turnEnd');
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1450));
  });

  it('surrenders to the rent creditor and clears pending rent', () => {
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
    expect(game.properties[3].ownerId).toBe('p2');
    expect(game.players.find((player) => player.id === 'p1')?.isBankrupt).toBe(true);
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
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1500));

    game = reduceGame(game, { type: 'skip_casino', playerId: 'p1' });

    expect(game.phase).toBe('turnEnd');
    expect(game.pendingCasino).toBeUndefined();
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1500));
  });

  it('pays casino roulette winnings up to x6 and caps the bet at 300', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'casino-bet');
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 18 } : player)),
    };

    game = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 1] });
    expect(() => reduceGame(game, { type: 'casino_bet', playerId: 'p1', amount: 0, multiplier: 2 })).toThrow();
    expect(() => reduceGame(game, { type: 'casino_bet', playerId: 'p1', amount: money(300) + 1, multiplier: 2 })).toThrow();

    game = reduceGame(game, { type: 'casino_bet', playerId: 'p1', amount: money(100), multiplier: 6 });

    expect(game.phase).toBe('turnEnd');
    expect(game.pendingCasino).toBeUndefined();
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(2000));
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
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1500));

    game = reduceGame(game, { type: 'pay_payment', playerId: 'p1' });

    expect(game.phase).toBe('turnEnd');
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1400));
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
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1800));
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
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1500));

    game = reduceGame(game, { type: 'pay_jail_fine', playerId: 'p1' });

    expect(game.phase).toBe('turnEnd');
    expect(game.pendingJail).toBeUndefined();
    expect(game.players.find((player) => player.id === 'p1')?.position).toBe(30);
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1400));
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
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1500));
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
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1400));
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
    expect(startCardGame.players.find((player) => player.id === 'p1')?.money).toBe(money(1800));

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
    expect(jailCardGame.players.find((player) => player.id === 'p1')?.money).toBe(money(1500));
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

  it('keeps travel chance cards to Kyiv and Lviv rare in the weighted deck', () => {
    const game = createInitialGame(['Olena', 'Taras'], 'rare-card-weight');
    const kyivCards = game.chanceDeck.filter((cardId) => cardId === 1);
    const lvivCards = game.chanceDeck.filter((cardId) => cardId === 10);
    const commonCards = game.chanceDeck.filter((cardId) => cardId === 2);

    expect(kyivCards).toHaveLength(1);
    expect(lvivCards).toHaveLength(1);
    expect(commonCards).toHaveLength(4);
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
    expect(game.players.find((player) => player.id === 'p2')?.money).toBe(money(1440));
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

    game = reduceGame(game, { type: 'build', playerId: 'p1', tileId: 1 });
    const pavlohrad = getTile(1);
    const kryvyiRih = getTile(3);
    if (pavlohrad.type !== 'city' || kryvyiRih.type !== 'city') throw new Error('Expected a completed city group.');
    expect(game.properties[1].houses).toBe(1);
    expect(game.players[0].money).toBe(money(1450));
    expect(game.moneyHistory?.at(-1)?.worth?.p1).toBe(
      game.players[0].money + pavlohrad.price + kryvyiRih.price + pavlohrad.houseCost,
    );
  });

  it('enforces even building across a city group', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'build-even');
    game = withOwnership(game, 'p1', [1, 3]);

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

    game = reduceGame(game, { type: 'build', playerId: 'p1', tileId: 1 });

    expect(() => reduceGame(game, { type: 'build', playerId: 'p1', tileId: 3 })).toThrow();

    game = nextBuildRoll(game);
    game = reduceGame(game, { type: 'build', playerId: 'p1', tileId: 3 });

    expect(game.properties[1].houses).toBe(1);
    expect(game.properties[3].houses).toBe(1);
  });

  it('blocks building while the owner is in jail', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'build-in-jail');
    game = withOwnership(game, 'p1', [1, 3]);
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
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1405));
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
    expect(paymentGame.players.find((player) => player.id === 'p1')?.money).toBe(money(1555));
  });

  it('sells buildings evenly and refunds half the house cost', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'sell-building');
    game = withOwnership(game, 'p1', [1, 3]);

    game = reduceGame(game, { type: 'build', playerId: 'p1', tileId: 1 });
    game = nextBuildRoll(game);
    game = reduceGame(game, { type: 'build', playerId: 'p1', tileId: 3 });
    game = nextBuildRoll(game);
    game = reduceGame(game, { type: 'build', playerId: 'p1', tileId: 1 });

    expect(() => reduceGame(game, { type: 'sell_building', playerId: 'p1', tileId: 3 })).toThrow();

    game = reduceGame(game, { type: 'sell_building', playerId: 'p1', tileId: 1 });

    expect(game.properties[1].houses).toBe(1);
    expect(game.properties[3].houses).toBe(1);
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1375));
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

  it('mortgages and unmortgages a property with a premium', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'mortgage-premium');
    game = withOwnership(game, 'p1', [1]);

    game = reduceGame(game, { type: 'mortgage', playerId: 'p1', tileId: 1 });
    expect(game.properties[1].mortgaged).toBe(true);
    expect(game.properties[1].mortgagedAtTurn).toBe(1);
    expect(game.properties[1].mortgageTurnsLeft).toBe(10);
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1530));

    game = reduceGame(game, { type: 'unmortgage', playerId: 'p1', tileId: 1 });
    expect(game.properties[1].mortgaged).toBe(false);
    expect(game.properties[1].mortgagedAtTurn).toBeUndefined();
    expect(game.properties[1].mortgageTurnsLeft).toBeUndefined();
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1497));
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
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1450));
    expect(game.players.find((player) => player.id === 'p2')?.money).toBe(money(1550));

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

  it('discounts building cost during an economic crisis city event', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'city-event-build');
    game = withOwnership(game, 'p1', [1, 3]);
    game = {
      ...game,
      activeCityEvents: [{ id: 'economic-crisis', remainingRounds: 2, durationRounds: 2, startedRound: 4 }],
    };

    const pavlohrad = getTile(1);
    if (pavlohrad.type !== 'city') throw new Error('Expected Pavlohrad to be a city.');
    expect(getEffectiveHouseCost(game, pavlohrad)).toBe(money(35));

    game = reduceGame(game, { type: 'build', playerId: 'p1', tileId: 1 });
    expect(game.properties[1].houses).toBe(1);
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1465));
  });

  it('raises purchase and unmortgage costs during a tax crisis city event', () => {
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
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1422));

    game = {
      ...game,
      phase: 'rolling',
      properties: {
        ...game.properties,
        1: { ...game.properties[1], mortgaged: true, mortgageTurnsLeft: 10 },
      },
    };
    expect(getEffectiveUnmortgageCost(game, pavlohrad)).toBe(money(43));
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
    expect(game.players.find((player) => player.id === 'p1')?.money).toBe(money(1350));
    expect(game.players.find((player) => player.id === 'p2')?.money).toBe(money(888));
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

  it('raises prices and taxes later in the game without raising rent', () => {
    const pavlohrad = getTile(1);
    if (pavlohrad.type !== 'city') throw new Error('Expected Pavlohrad to be a city.');

    let midGame = createInitialGame(['Olena', 'Taras'], 'late-prices-mid');
    midGame = {
      ...midGame,
      turn: 41,
      properties: {
        ...midGame.properties,
        1: { ...midGame.properties[1], mortgaged: true, mortgageTurnsLeft: 10 },
      },
    };

    expect(getEffectivePropertyPrice(midGame, pavlohrad)).toBe(money(75));
    expect(getEffectiveHouseCost(midGame, pavlohrad)).toBe(money(63));
    expect(getEffectiveUnmortgageCost(midGame, pavlohrad)).toBe(money(42));
    expect(getEffectiveFineAmount(midGame, money(200))).toBe(money(300));

    let lateGame = createInitialGame(['Olena', 'Taras'], 'late-prices-end');
    lateGame = withOwnership(
      {
        ...lateGame,
        turn: 71,
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
    expect(getEffectiveUnmortgageCost(lateGame, pavlohrad)).toBe(money(50));
    expect(getEffectiveFineAmount(lateGame, money(200))).toBe(money(400));

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
    const recentEvents = ['tourist-season', 'economic-crisis', 'tax-crisis', 'city-tender', 'bank-day'] as const;
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

const nextBuildRoll = (game: ReturnType<typeof createInitialGame>): ReturnType<typeof createInitialGame> => ({
  ...game,
  diceRollId: game.diceRollId + 1,
  builtThisRoll: undefined,
});
