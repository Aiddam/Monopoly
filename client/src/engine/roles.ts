import type { RoleId } from './types';

export const ROLE_IDS: RoleId[] = ['gambler', 'builder', 'realtor', 'banker', 'lawyer', 'collector', 'mayor'];

export const GAMBLER_WIN_CASH = 10000;
export const GAMBLER_STARTING_CASH = 600;
export const GAMBLER_STARTING_CASINO_TILE_ID = 20;
export const GAMBLER_OPENING_CASINO_MULTIPLIERS = [2, 3, 4] as const;
export const GAMBLER_CASINO_ZERO_WEIGHT_MULTIPLIER = 1.25;
export const GAMBLER_CASINO_CARD_WEIGHT_MULTIPLIER = 3;
export const BUILDER_HOUSE_COST_MULTIPLIER = 0.5;
export const BUILDER_BUILDING_REFUND_MULTIPLIER = 0.9;
export const BUILDER_REMOTE_PURCHASE_MULTIPLIER = 1.3;
export const BUILDER_WIN_DISTRICTS = 3;
export const REALTOR_STARTING_CITY_COUNT = 3;
export const REALTOR_BUILD_COST_MULTIPLIER = 1.4;
export const REALTOR_TRADE_VALUE_MULTIPLIER = 4;
export const DEFAULT_TRADE_VALUE_MULTIPLIER = 3;
export const REALTOR_WIN_PROFIT = 1500;
export const BANKER_STARTING_BANK_TILE_ID = 35;
export const BANKER_RENT_MULTIPLIER = 1.5;
export const BANKER_BANK_CARD_WEIGHT_MULTIPLIER = 3;
export const BANKER_WIN_BANKS = 4;
export const BANKER_WIN_DEPOSIT_PAYOUT = 650;
export const LAWYER_TOTAL_PROTECTIONS = 3;
export const LAWYER_FINE_DISCOUNT = 0.5;
export const LAWYER_RENT_DISCOUNT = 0.6;
export const LAWYER_WIN_SAVED = 1800;
export const COLLECTOR_GROUP_BONUS = 25;
export const COLLECTOR_WIN_PROPERTIES = 6;
export const COLLECTOR_WIN_NET_WORTH = 3500;
export const MAYOR_CHOOSE_EVENT_INTERVAL = 3;
export const MAYOR_CITY_EVENT_CHOICE_COUNT = 3;
export const MAYOR_WIN_EVENT_INCOME = 2000;
export const MAYOR_PASS_START_BONUS = 100;
export const MAYOR_LAND_ON_START_BONUS = 150;
export const CASINO_CHANCE_CARD_ID = 12;
export const NEAREST_BANK_CHANCE_CARD_ID = 6;

export interface RoleDefinition {
  id: RoleId;
  title: string;
  publicTitle: string;
  description: string;
  winCondition: string;
  awardTitle: string;
}

export const ROLE_DEFINITIONS: Record<RoleId, RoleDefinition> = {
  gambler: {
    id: 'gambler',
    title: 'Азартний гравець',
    publicTitle: 'Азартний гравець',
    description:
      'Починає на казино з 600₴ і має одразу прокрутити стартову рулетку на весь баланс з множником x2, x3 або x4. Після x4 його перший кидок буде одним кубиком. Далі може ставити в казино будь-яку суму в межах власного кешу, частіше витягує карту "Вечір у казино", але шанс x0 у рулетці для нього вищий.',
    winCondition: `Мати ${GAMBLER_WIN_CASH}₴ кешу на рахунку.`,
    awardTitle: 'Той хто обійшов систему',
  },
  builder: {
    id: 'builder',
    title: 'Будівельник',
    publicTitle: 'Будівельник',
    description:
      'Будує будинки та готелі на 50% дешевше, продає будівлі майже за фактичною ціною будівництва, один раз за гру може купити будь-яке вільне майно за 130% ціни і один раз запустити аукціон на будь-яке вільне майно.',
    winCondition: `Створити ${BUILDER_WIN_DISTRICTS} райони і мати готелі на всіх містах цих районів.`,
    awardTitle: 'Індустріалізація',
  },
  realtor: {
    id: 'realtor',
    title: 'Рієлтор',
    publicTitle: 'Рієлтор',
    description:
      'На старті отримує 3 безкоштовні міста з різних районів. Може створювати угоди з вигодою до 400% у свій бік, але будинки, готелі та створення району коштують для нього на 40% дорожче.',
    winCondition: `Заробити ${REALTOR_WIN_PROFIT}₴ чистої вигоди з прийнятих угод.`,
    awardTitle: 'Майстер угод',
  },
  banker: {
    id: 'banker',
    title: 'Банкір',
    publicTitle: 'Банкір',
    description:
      'На старті отримує Райфайзен Банк. Оренда від його банків на 50% більша, а карта "Найближчий банк" трапляється частіше.',
    winCondition: `Мати ${BANKER_WIN_BANKS} банки і активний депозит з виплатою від ${BANKER_WIN_DEPOSIT_PAYOUT}₴.`,
    awardTitle: 'Фінансова імперія',
  },
  lawyer: {
    id: 'lawyer',
    title: 'Юрист',
    publicTitle: 'Юрист',
    description:
      'Автоматично зменшує штрафи та податки на 50%, крім оренди та кредитів. Має 3 ручні захисти: платежі скасовуються, а для банк-кредиту скасовується тільки поточний платіж.',
    winCondition: `Зекономити ${LAWYER_WIN_SAVED}₴ завдяки знижкам і захистам.`,
    awardTitle: 'Сила договору',
  },
  collector: {
    id: 'collector',
    title: 'Колекціонер',
    publicTitle: 'Колекціонер',
    description: 'На початку кожного раунду отримує 25₴ за кожен міський район, де має хоча б одне місто.',
    winCondition: `Мати ${COLLECTOR_WIN_PROPERTIES} клітинок в унікальних районах з власністю від ${COLLECTOR_WIN_NET_WORTH}₴ з урахуванням боргів.`,
    awardTitle: 'Колекція України',
  },
  mayor: {
    id: 'mayor',
    title: 'Мер',
    publicTitle: 'Мер',
    description:
      'Кожну третю міську подію обирає з 3 варіантів. Додаткова націнка від його події йде Меру: базову ціну отримує банк або власник, а бонус події отримує Мер. За проходження Старту отримує +100₴ зверху, за зупинку на Старті +150₴ зверху.',
    winCondition: `Заробити ${MAYOR_WIN_EVENT_INCOME}₴ з міських подій.`,
    awardTitle: 'Міська влада',
  },
};

export const getRoleTitle = (roleId: RoleId | undefined): string => (roleId ? ROLE_DEFINITIONS[roleId].title : 'Без ролі');
