export const getLateGameStartRewardMultiplier = (turn: number): number => {
  if (turn > 65) return 0.5;
  if (turn > 35) return 0.75;
  return 1;
};

export const getLateGamePriceMultiplier = (turn: number): number => {
  if (turn > 70) return 1.5;
  if (turn > 40) return 1.25;
  return 1;
};

export const getLateGameFineMultiplier = (turn: number): number => {
  if (turn > 70) return 2;
  if (turn > 40) return 1.5;
  return 1;
};
