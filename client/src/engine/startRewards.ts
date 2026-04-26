import { money } from './economy';
import { getLateGameStartRewardMultiplier } from './difficulty';

export const PASS_START_REWARD = money(200);
export const LAND_ON_START_REWARD = money(300);
export const START_TILE_ID = 0;

export const getStartReward = (fromTileId: number, toTileId: number, isForwardMove: boolean, turn = 1): number => {
  if (!isForwardMove) return 0;
  const reward = toTileId === START_TILE_ID ? LAND_ON_START_REWARD : toTileId < fromTileId ? PASS_START_REWARD : 0;
  return Math.ceil(reward * getLateGameStartRewardMultiplier(turn));
};
