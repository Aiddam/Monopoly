import { money } from './economy';

export const PASS_START_REWARD = money(200);
export const LAND_ON_START_REWARD = money(300);
export const START_TILE_ID = 0;

export const getStartReward = (fromTileId: number, toTileId: number, isForwardMove: boolean): number => {
  if (!isForwardMove) return 0;
  if (toTileId === START_TILE_ID) return LAND_ON_START_REWARD;
  return toTileId < fromTileId ? PASS_START_REWARD : 0;
};
