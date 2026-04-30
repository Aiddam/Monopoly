import { describe, expect, it } from 'vitest';
import { createInitialGame, reduceGame } from '../engine/gameEngine';
import type { GameState } from '../engine/types';
import { isStaleGameState } from './useGameStore';

describe('game state freshness', () => {
  it('rejects an older same-turn state that would drop a newly started bank deposit', () => {
    let game = createInitialGame(['Olena', 'Taras'], 'stale-bank-deposit', { rolesEnabled: false });
    game = withOwnership(game, 'p1', [5, 15]);
    game = {
      ...game,
      players: game.players.map((player) => (player.id === 'p1' ? { ...player, position: 2 } : player)),
    };

    const beforeDeposit = reduceGame(game, { type: 'roll', playerId: 'p1', dice: [1, 2] });
    const withDeposit = reduceGame(beforeDeposit, { type: 'start_bank_deposit', playerId: 'p1' });

    expect(withDeposit.bankDeposits.p1).toBeDefined();
    expect(beforeDeposit.bankDeposits.p1).toBeUndefined();
    expect(beforeDeposit.turn).toBe(withDeposit.turn);
    expect(isStaleGameState(withDeposit, beforeDeposit)).toBe(true);
  });
});

const withOwnership = (game: GameState, ownerId: string, tileIds: number[]): GameState => ({
  ...game,
  properties: {
    ...game.properties,
    ...Object.fromEntries(tileIds.map((tileId) => [tileId, { ...game.properties[tileId], ownerId }])),
  },
  players: game.players.map((player) =>
    player.id === ownerId
      ? { ...player, properties: Array.from(new Set([...player.properties, ...tileIds])) }
      : { ...player, properties: player.properties.filter((tileId) => !tileIds.includes(tileId)) },
  ),
});
