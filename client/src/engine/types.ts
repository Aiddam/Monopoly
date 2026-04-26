export type TileType =
  | 'go'
  | 'city'
  | 'bank'
  | 'utility'
  | 'tax'
  | 'chance'
  | 'community'
  | 'jail'
  | 'casino'
  | 'goToJail';

export type PropertyKind = 'city' | 'bank' | 'utility';
export type CardDeck = 'chance' | 'community';
export type CityEventId =
  | 'tourist-season'
  | 'economic-crisis'
  | 'tax-crisis'
  | 'tax-madness'
  | 'city-tender'
  | 'bank-day'
  | 'investor-day'
  | 'renovation-grants'
  | 'infrastructure-boom'
  | 'night-market'
  | 'construction-permit'
  | 'bank-audit'
  | 'regional-festival'
  | 'transport-strike'
  | 'utility-modernization'
  | 'heritage-protection'
  | 'startup-wave';
export type GamePhase =
  | 'orderRoll'
  | 'rolling'
  | 'awaitingPurchase'
  | 'awaitingCard'
  | 'awaitingJailDecision'
  | 'auction'
  | 'casino'
  | 'payment'
  | 'rent'
  | 'manage'
  | 'trade'
  | 'bankruptcy'
  | 'turnEnd'
  | 'finished';

export interface BaseTile<T extends TileType = TileType> {
  id: number;
  name: string;
  type: T;
  description?: string;
}

export interface CityTile extends BaseTile<'city'> {
  type: 'city';
  citySlug: string;
  group: string;
  groupColor: string;
  price: number;
  rents: number[];
  houseCost: number;
  mortgage: number;
  image: string;
}

export interface BankTile extends BaseTile<'bank'> {
  type: 'bank';
  bankKey: 'mono' | 'privat' | 'sense' | 'raiffeisen';
  price: number;
  mortgage: number;
}

export interface UtilityTile extends BaseTile<'utility'> {
  type: 'utility';
  utilityKey: 'electric' | 'water';
  price: number;
  mortgage: number;
}

export interface TaxTile extends BaseTile<'tax'> {
  type: 'tax';
  amount: number;
}

export type GoTile = BaseTile<'go'>;
export type ChanceTile = BaseTile<'chance'>;
export type CommunityTile = BaseTile<'community'>;
export type JailTile = BaseTile<'jail'>;
export type CasinoTile = BaseTile<'casino'>;
export type GoToJailTile = BaseTile<'goToJail'>;

export type Tile =
  | GoTile
  | CityTile
  | BankTile
  | UtilityTile
  | TaxTile
  | ChanceTile
  | CommunityTile
  | JailTile
  | CasinoTile
  | GoToJailTile;
export type PropertyTile = CityTile | BankTile | UtilityTile;

export interface Player {
  id: string;
  name: string;
  token: string;
  color: string;
  money: number;
  position: number;
  properties: number[];
  jailTurns: number;
  jailCards: number;
  isBankrupt: boolean;
  ready?: boolean;
}

export interface PropertyState {
  ownerId?: string;
  houses: number;
  mortgaged: boolean;
  mortgagedAtTurn?: number;
  mortgageTurnsLeft?: number;
}

export interface AuctionState {
  tileId: number;
  source?: 'purchase' | 'cityEvent';
  startedAt: number;
  endsAt: number;
  minimumBid: number;
  highestBid: number;
  highestBidderId?: string;
  bids: Array<{
    playerId: string;
    amount: number;
    placedAt: number;
  }>;
}

export interface TradeOffer {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  offerMoney: number;
  requestMoney: number;
  offerProperties: number[];
  requestProperties: number[];
  offerRentServices?: RentServiceOffer[];
  requestRentServices?: RentServiceOffer[];
  status: 'pending' | 'accepted' | 'declined';
}

export interface RentServiceOffer {
  tileId: number;
  turns: number;
  discountPercent: 50 | 100;
}

export interface ActiveRentService extends RentServiceOffer {
  id: string;
  ownerId: string;
  beneficiaryId: string;
  remainingTurns: number;
  duration: number;
  cooldownUntilTurn: number;
  createdAtTurn: number;
}

export interface CityEventEffect {
  rentMultiplier?: number;
  rentGroups?: string[];
  rentPropertyTypes?: PropertyKind[];
  propertyPriceMultiplier?: number;
  propertyPriceTypes?: PropertyKind[];
  houseCostMultiplier?: number;
  houseCostGroups?: string[];
  unmortgageMultiplier?: number;
  fineMultiplier?: number;
  startAuctionOnUnowned?: boolean;
  auctionMinimumMultiplier?: number;
}

export interface CityEventDefinition {
  id: CityEventId;
  title: string;
  text: string;
  durationRounds: number;
  effects: CityEventEffect;
}

export interface ActiveCityEvent {
  id: CityEventId;
  remainingRounds: number;
  durationRounds: number;
  startedRound: number;
}

export interface PendingCityEvent {
  id: CityEventId;
  title: string;
  text: string;
  round: number;
}

export interface PendingPayment {
  payerId: string;
  amount: number;
  reason: string;
  tileId?: number;
  source: 'tax' | 'card' | 'casino' | 'bank';
  recipients?: Array<{
    playerId: string;
    amount: number;
  }>;
}

export interface LogEntry {
  id: string;
  text: string;
  tone?: 'good' | 'bad' | 'neutral';
  createdAt?: number;
}

export interface MoneyHistoryPoint {
  turn: number;
  round: number;
  createdAt: number;
  money: Record<string, number>;
  worth?: Record<string, number>;
}

export interface GameState {
  id: string;
  players: Player[];
  currentPlayerId: string;
  turn: number;
  currentRound: number;
  phase: GamePhase;
  properties: Record<number, PropertyState>;
  chanceDeck: number[];
  communityDeck: number[];
  discardChance: number[];
  discardCommunity: number[];
  cityEventDeck: CityEventId[];
  cityEventDiscard: CityEventId[];
  activeCityEvents: ActiveCityEvent[];
  pendingCityEvent?: PendingCityEvent;
  turnOrderRolls?: Record<string, [number, number]>;
  pendingPurchaseTileId?: number;
  pendingRent?: {
    payerId: string;
    ownerId: string;
    tileId: number;
    amount: number;
    originalAmount?: number;
    rentServiceId?: string;
    discountPercent?: 50 | 100;
  };
  pendingPayment?: PendingPayment;
  pendingCasino?: {
    playerId: string;
    tileId: number;
    amount?: number;
    multiplier?: number;
    spinSeed?: number;
    spinStartedAt?: number;
    spinEndsAt?: number;
  };
  pendingJail?: {
    playerId: string;
    tileId: number;
  };
  pendingCard?: {
    deck: CardDeck;
    cardId: number;
    title: string;
    text: string;
  };
  pendingCardDraw?: {
    deck: CardDeck;
    tileId: number;
  };
  auction?: AuctionState;
  tradeOffers: TradeOffer[];
  rentServices: ActiveRentService[];
  rentServiceCooldowns: Record<string, number>;
  dice: [number, number];
  diceRollId: number;
  lastDice?: [number, number];
  lastOrderRollPlayerId?: string;
  doublesInRow: number;
  builtThisRoll?: {
    playerId: string;
    diceRollId: number;
    tileId: number;
  };
  winnerId?: string;
  log: LogEntry[];
  moneyHistory?: MoneyHistoryPoint[];
}

export type GameAction =
  | { type: 'roll_for_order'; playerId: string; dice?: [number, number] }
  | { type: 'roll'; playerId: string; dice?: [number, number] }
  | { type: 'buy'; playerId: string }
  | { type: 'decline_buy'; playerId: string }
  | { type: 'draw_card'; playerId: string }
  | { type: 'auction_bid'; playerId: string; amount: number }
  | { type: 'auction_pass'; playerId: string }
  | { type: 'resolve_auction' }
  | { type: 'skip_casino'; playerId: string }
  | { type: 'start_casino_spin'; playerId: string; amount: number; multiplier: number; spinSeed: number }
  | { type: 'casino_bet'; playerId: string; amount: number; multiplier: number }
  | { type: 'pay_jail_fine'; playerId: string }
  | { type: 'go_to_jail'; playerId: string }
  | { type: 'build'; playerId: string; tileId: number }
  | { type: 'sell_building'; playerId: string; tileId: number }
  | { type: 'mortgage'; playerId: string; tileId: number }
  | { type: 'unmortgage'; playerId: string; tileId: number }
  | { type: 'propose_trade'; offer: Omit<TradeOffer, 'id' | 'status'> }
  | { type: 'accept_trade'; playerId: string; offerId: string }
  | { type: 'decline_trade'; playerId: string; offerId: string }
  | { type: 'pay_rent'; playerId: string }
  | { type: 'pay_payment'; playerId: string }
  | { type: 'pay_bail'; playerId: string }
  | { type: 'admin_move_current_player'; tileId: number }
  | { type: 'end_turn'; playerId: string }
  | { type: 'continue_turn'; playerId: string }
  | { type: 'declare_bankruptcy'; playerId: string };
