export const MONEY_SCALE = 1;

export const money = (amount: number): number => amount * MONEY_SCALE;

export const moneyText = (amount: number): string => `${money(amount)}₴`;
