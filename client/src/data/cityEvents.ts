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
];

export const getCityEventDefinition = (id: CityEventId): CityEventDefinition =>
  cityEventDefinitions.find((event) => event.id === id) ?? cityEventDefinitions[0];
