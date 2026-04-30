import { money } from './economy';
import { getLateGameStartRewardMultiplier } from './difficulty';
import type { RoleId } from './types';
import { MAYOR_LAND_ON_START_BONUS, MAYOR_PASS_START_BONUS } from './roles';

export const PASS_START_REWARD = money(200);
export const LAND_ON_START_REWARD = money(300);
export const START_TILE_ID = 0;

export const getStartReward = (
  fromTileId: number,
  toTileId: number,
  isForwardMove: boolean,
  turn = 1,
  options: { roleId?: RoleId } = {},
): number => {
  if (!isForwardMove) return 0;
  const reward = toTileId === START_TILE_ID ? LAND_ON_START_REWARD : toTileId < fromTileId ? PASS_START_REWARD : 0;
  const scaledReward = Math.ceil(reward * getLateGameStartRewardMultiplier(turn));
  if (scaledReward <= 0 || options.roleId !== 'mayor') return scaledReward;
  return scaledReward + (toTileId === START_TILE_ID ? MAYOR_LAND_ON_START_BONUS : MAYOR_PASS_START_BONUS);
};
