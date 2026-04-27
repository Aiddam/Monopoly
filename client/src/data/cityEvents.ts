import type { CityEventDefinition, CityEventId } from '../engine/types';

export const CITY_EVENT_ROUND_INTERVAL = 3;

export const cityEventDefinitions: CityEventDefinition[] = [
  {
    id: 'tourist-season',
    title: 'Туристичний сезон',
    text: 'Оренда на червоних і жовтих вулицях +50% на 3 раунди.',
    durationRounds: 3,
    effects: {
      rentGroups: ['Червона', 'Золота'],
      rentMultiplier: 1.5,
    },
  },
  {
    id: 'economic-crisis',
    title: 'Економічна криза',
    text: 'Будинки 2 раунди коштують на 30% дешевше.',
    durationRounds: 2,
    effects: {
      houseCostMultiplier: 0.7,
    },
  },
  {
    id: 'tax-crisis',
    title: 'Податкова криза',
    text: 'Міста, викуп застави та будівлі 2 раунди коштують на 30% дорожче. Оренда не змінюється.',
    durationRounds: 2,
    effects: {
      propertyPriceTypes: ['city', 'bank', 'utility'],
      propertyPriceMultiplier: 1.3,
      houseCostMultiplier: 1.3,
      unmortgageMultiplier: 1.3,
    },
  },
  {
    id: 'tax-madness',
    title: 'Податкове шаленство',
    text: 'Усі штрафи банку, податки та штрафні картки x2 на 2 раунди.',
    durationRounds: 2,
    effects: {
      fineMultiplier: 2,
    },
  },
  {
    id: 'city-tender',
    title: 'Міський тендер',
    text: 'Банк запускає аукціон на випадкове вільне поле зі стартом 80% ціни.',
    durationRounds: 0,
    effects: {
      startAuctionOnUnowned: true,
      auctionMinimumMultiplier: 0.8,
    },
  },
  {
    id: 'bank-day',
    title: 'Банківський день',
    text: 'Оренда банків і сервісів +50% на 2 раунди.',
    durationRounds: 2,
    effects: {
      rentPropertyTypes: ['bank', 'utility'],
      rentMultiplier: 1.5,
    },
  },
  {
    id: 'investor-day',
    title: 'День інвестора',
    text: 'Придбання вільного майна 2 раунди дешевше на 20%.',
    durationRounds: 2,
    effects: {
      propertyPriceTypes: ['city', 'bank', 'utility'],
      propertyPriceMultiplier: 0.8,
    },
  },
  {
    id: 'renovation-grants',
    title: 'Гранти на реновацію',
    text: 'Будинки на синіх і зелених вулицях 2 раунди дешевші на 20%.',
    durationRounds: 2,
    effects: {
      houseCostGroups: ['Синя', 'Зелена'],
      houseCostMultiplier: 0.8,
    },
  },
  {
    id: 'infrastructure-boom',
    title: 'Інфраструктурний бум',
    text: 'Оренда на блакитних і помаранчевих вулицях +25% на 2 раунди.',
    durationRounds: 2,
    effects: {
      rentGroups: ['Блакитна', 'Помаранчева'],
      rentMultiplier: 1.25,
    },
  },
  {
    id: 'night-market',
    title: 'Нічний ринок',
    text: 'Оренда на фіолетових і бурштинових вулицях +40% на 2 раунди.',
    durationRounds: 2,
    effects: {
      rentGroups: ['Фіолетова', 'Бурштинова'],
      rentMultiplier: 1.4,
    },
  },
  {
    id: 'construction-permit',
    title: 'Будівельні дозволи',
    text: 'Будинки на червоних і золотих вулицях 2 раунди коштують на 25% дешевше.',
    durationRounds: 2,
    effects: {
      houseCostGroups: ['Червона', 'Золота'],
      houseCostMultiplier: 0.75,
    },
  },
  {
    id: 'bank-audit',
    title: 'Банківський аудит',
    text: 'Придбання банків 2 раунди дорожче на 25%, але їхня оренда +25%.',
    durationRounds: 2,
    effects: {
      propertyPriceTypes: ['bank'],
      propertyPriceMultiplier: 1.25,
      rentPropertyTypes: ['bank'],
      rentMultiplier: 1.25,
    },
  },
  {
    id: 'bank-inspection',
    title: 'Банківська перевірка',
    text: 'Кожен гравець одразу сплачує 10% від своїх готівкових коштів у банк.',
    durationRounds: 0,
    effects: {
      cashPaymentPercent: 0.1,
    },
  },
  {
    id: 'road-repair',
    title: 'Ремонт доріг',
    text: '2 раунди гравці кидають лише 1 кубик замість 2. Дубль під час такого кидка не може випасти.',
    durationRounds: 2,
    effects: {
      singleDieRolls: true,
    },
  },
  {
    id: 'mass-protest',
    title: 'Масовий протест',
    text: '2 раунди будівництво заборонене.',
    durationRounds: 2,
    effects: {
      buildingBlocked: true,
    },
  },
  {
    id: 'regional-festival',
    title: 'Фестиваль регіонів',
    text: 'Оренда на зелених, синіх і блакитних вулицях +30% на 2 раунди.',
    durationRounds: 2,
    effects: {
      rentGroups: ['Зелена', 'Синя', 'Блакитна'],
      rentMultiplier: 1.3,
    },
  },
  {
    id: 'transport-strike',
    title: 'Транспортний страйк',
    text: 'Оренда банків і сервісів 2 раунди зменшується на 40%.',
    durationRounds: 2,
    effects: {
      rentPropertyTypes: ['bank', 'utility'],
      rentMultiplier: 0.6,
    },
  },
  {
    id: 'utility-modernization',
    title: 'Модернізація сервісів',
    text: 'Сервіси 3 раунди дорожчі на 20%, а їхня оренда +50%.',
    durationRounds: 3,
    effects: {
      propertyPriceTypes: ['utility'],
      propertyPriceMultiplier: 1.2,
      rentPropertyTypes: ['utility'],
      rentMultiplier: 1.5,
    },
  },
  {
    id: 'heritage-protection',
    title: 'Охорона спадщини',
    text: 'Будинки на золотих і зелених вулицях 2 раунди дорожчі на 35%.',
    durationRounds: 2,
    effects: {
      houseCostGroups: ['Золота', 'Зелена'],
      houseCostMultiplier: 1.35,
    },
  },
  {
    id: 'startup-wave',
    title: 'Стартап-хвиля',
    text: 'Вільні міста та сервіси 2 раунди дешевші на 15%.',
    durationRounds: 2,
    effects: {
      propertyPriceTypes: ['city', 'utility'],
      propertyPriceMultiplier: 0.85,
    },
  },
];

export const getCityEventDefinition = (id: CityEventId): CityEventDefinition =>
  cityEventDefinitions.find((event) => event.id === id) ?? cityEventDefinitions[0];
