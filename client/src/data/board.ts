import type { BankTile, CityTile, PropertyTile, Tile, UtilityTile } from '../engine/types';
import { money, moneyText } from '../engine/economy';

const city = (
  id: number,
  name: string,
  citySlug: string,
  group: string,
  groupColor: string,
  price: number,
  rents: number[],
  houseCost: number,
): CityTile => ({
  id,
  name,
  citySlug,
  group,
  groupColor,
  price: money(price),
  rents: rents.map(money),
  houseCost: money(houseCost),
  mortgage: money(Math.floor(price / 2)),
  type: 'city',
  image: `/assets/cities/${citySlug}.svg`,
});

const bank = (id: number, name: string, bankKey: BankTile['bankKey']): BankTile => ({
  id,
  name,
  bankKey,
  type: 'bank',
  price: money(200),
  mortgage: money(100),
});

const utility = (id: number, name: string, utilityKey: UtilityTile['utilityKey']): UtilityTile => ({
  id,
  name,
  utilityKey,
  type: 'utility',
  price: money(150),
  mortgage: money(75),
});

export const boardTiles: Tile[] = [
  { id: 0, name: 'Старт', type: 'go', description: `+${moneyText(200)} за проходження, +${moneyText(300)} за зупинку` },
  city(1, 'Павлоград', 'pavlohrad', 'Бурштинова', '#d9a322', 60, [2, 10, 30, 90, 160, 250], 50),
  { id: 2, name: 'Громада', type: 'community' },
  city(3, 'Нікополь', 'nikopol', 'Бурштинова', '#d9a322', 60, [4, 20, 60, 180, 320, 450], 50),
  { id: 4, name: 'Податок на місто', type: 'tax', amount: money(200) },
  bank(5, 'МоноБанк', 'mono'),
  city(6, 'Кропивницький', 'kropyvnytskyi', 'Блакитна', '#54b7d3', 100, [6, 30, 90, 270, 400, 550], 50),
  { id: 7, name: 'Шанс', type: 'chance' },
  city(8, 'Черкаси', 'cherkasy', 'Блакитна', '#54b7d3', 100, [6, 30, 90, 270, 400, 550], 50),
  city(9, 'Житомир', 'zhytomyr', 'Блакитна', '#54b7d3', 120, [8, 40, 100, 300, 450, 600], 50),
  { id: 10, name: "В'язниця", type: 'jail', description: 'Відвідування або очікування ходу' },
  city(11, 'Суми', 'sumy', 'Фіолетова', '#a15bb8', 140, [10, 50, 150, 450, 625, 750], 100),
  utility(12, 'Електромережі', 'electric'),
  city(13, 'Полтава', 'poltava', 'Фіолетова', '#a15bb8', 140, [10, 50, 150, 450, 625, 750], 100),
  city(14, 'Чернігів', 'chernihiv', 'Фіолетова', '#a15bb8', 160, [12, 60, 180, 500, 700, 900], 100),
  bank(15, 'ПриватБанк', 'privat'),
  city(16, 'Хмельницький', 'khmelnytskyi', 'Помаранчева', '#e58335', 180, [14, 70, 200, 550, 750, 950], 100),
  { id: 17, name: 'Громада', type: 'community' },
  city(18, 'Рівне', 'rivne', 'Помаранчева', '#e58335', 180, [14, 70, 200, 550, 750, 950], 100),
  city(19, 'Луцьк', 'lutsk', 'Помаранчева', '#e58335', 200, [16, 80, 220, 600, 800, 1000], 100),
  { id: 20, name: 'Казино', type: 'casino', description: `Ставка до ${moneyText(300)}. Рулетка може дати множник до x6.` },
  city(21, 'Запоріжжя', 'zaporizhzhia', 'Червона', '#d4483b', 220, [18, 90, 250, 700, 875, 1050], 150),
  { id: 22, name: 'Шанс', type: 'chance' },
  city(23, 'Миколаїв', 'mykolaiv', 'Червона', '#d4483b', 220, [18, 90, 250, 700, 875, 1050], 150),
  city(24, 'Вінниця', 'vinnytsia', 'Червона', '#d4483b', 240, [20, 100, 300, 750, 925, 1100], 150),
  bank(25, 'СенсБанк', 'sense'),
  city(26, 'Дніпро', 'dnipro', 'Синя', '#2b73d2', 260, [22, 110, 330, 800, 975, 1150], 150),
  city(27, 'Харків', 'kharkiv', 'Синя', '#2b73d2', 260, [22, 110, 330, 800, 975, 1150], 150),
  utility(28, 'Водоканал', 'water'),
  city(29, 'Одеса', 'odesa', 'Синя', '#2b73d2', 280, [24, 120, 360, 850, 1025, 1200], 150),
  { id: 30, name: "До в'язниці", type: 'goToJail' },
  city(31, 'Івано-Франківськ', 'ivano-frankivsk', 'Зелена', '#299c63', 300, [26, 130, 390, 900, 1100, 1275], 200),
  city(32, 'Ужгород', 'uzhhorod', 'Зелена', '#299c63', 300, [26, 130, 390, 900, 1100, 1275], 200),
  { id: 33, name: 'Громада', type: 'community' },
  city(34, 'Чернівці', 'chernivtsi', 'Зелена', '#299c63', 320, [28, 150, 450, 1000, 1200, 1400], 200),
  bank(35, 'РайфазенБанк', 'raiffeisen'),
  { id: 36, name: 'Шанс', type: 'chance' },
  city(37, 'Львів', 'lviv', 'Золота', '#d8b335', 350, [35, 175, 500, 1100, 1300, 1500], 200),
  { id: 38, name: 'Туристичний збір', type: 'tax', amount: money(100) },
  city(39, 'Київ', 'kyiv', 'Золота', '#d8b335', 400, [50, 200, 600, 1400, 1700, 2000], 200),
];

export const propertyTiles = boardTiles.filter(
  (tile): tile is PropertyTile => tile.type === 'city' || tile.type === 'bank' || tile.type === 'utility',
);

export const cityTiles = boardTiles.filter((tile): tile is CityTile => tile.type === 'city');

export const getTile = (tileId: number): Tile => {
  const tile = boardTiles[tileId];
  if (!tile) {
    throw new Error(`Unknown tile ${tileId}`);
  }
  return tile;
};

export const isPropertyTile = (tile: Tile): tile is PropertyTile =>
  tile.type === 'city' || tile.type === 'bank' || tile.type === 'utility';
