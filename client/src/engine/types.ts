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
  | 'tax-crisis'
  | 'tax-madness'
  | 'city-tender'
  | 'bank-day'
  | 'infrastructure-boom'
  | 'night-market'
  | 'bank-audit'
  | 'bank-inspection'
  | 'paid-roads'
  | 'road-repair'
  | 'mass-protest'
  | 'regional-festival'
  | 'transport-strike'
  | 'utility-modernization'
  | 'casino-festival';
export type GamePhase =
  | 'orderRoll'
  | 'rolling'
  | 'cityEventChoice'
  | 'awaitingPurchase'
  | 'awaitingCard'
  | 'awaitingJailDecision'
  | 'auction'
  | 'casino'
  | 'bankDeposit'
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
  roleId?: RoleId;
  money: number;
  position: number;
  properties: number[];
  jailTurns: number;
  jailCards: number;
  unoReverseCards?: number;
  loanPayoffCards?: number;
  isBankrupt: boolean;
  ready?: boolean;
}

export type RoleId = 'gambler' | 'builder' | 'realtor' | 'banker' | 'lawyer' | 'collector' | 'mayor';

export interface PlayerRoleState {
  realtorProfit: number;
  lawyerSaved: number;
  lawyerProtectionsLeft: number;
  collectorBonusReceived: number;
  gamblerOpeningSpinDone: boolean;
  gamblerOpeningSingleDieRollPending: boolean;
  builderRemotePurchaseUsed: boolean;
  builderAuctionUsed: boolean;
  builderSpecialActionRound: number;
  mayorCityEventsSeen: number;
  mayorEventIncome: number;
}

export interface RoleWinState {
  playerId: string;
  roleId: RoleId;
  achievedAtTurn: number;
  achievedAtRound: number;
  reason: string;
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
  source?: 'purchase' | 'cityEvent' | 'builder';
  sourceMayorId?: string;
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

export type LoanKind = 'player' | 'bank';

export interface LoanOffer {
  id: string;
  lenderId: string;
  borrowerId: string;
  proposerId?: string;
  principal: number;
  totalRepayment: number;
  durationTurns: number;
  collateralTileIds: number[];
  status: 'pending' | 'accepted' | 'declined';
  createdAtTurn: number;
}

export interface ActiveLoan {
  id: string;
  kind: LoanKind;
  lenderId?: string;
  borrowerId: string;
  principal: number;
  totalRepayment: number;
  remainingDue: number;
  installmentAmount: number;
  remainingTurns: number;
  deferredDue?: number;
  deferredTurns?: number;
  missedPayments: number;
  collateralTileIds: number[];
  createdAtTurn: number;
}

export interface BankDepositState {
  playerId: string;
  amount: number;
  turns: number;
  steps?: number;
  createdAtTurn: number;
  createdAtDiceRollId: number;
}

export interface CityEventEffect {
  rentMultiplier?: number;
  rentGroups?: string[];
  rentPropertyTypes?: PropertyKind[];
  propertyPriceMultiplier?: number;
  propertyPriceTypes?: PropertyKind[];
  houseCostMultiplier?: number;
  houseCostGroups?: string[];
  fineMultiplier?: number;
  startAuctionOnUnowned?: boolean;
  auctionMinimumMultiplier?: number;
  cashPaymentPercent?: number;
  stepFeePerMove?: number;
  singleDieRolls?: boolean;
  buildingBlocked?: boolean;
  sendAllToCasino?: boolean;
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
  mayorId?: string;
}

export interface PendingCityEvent {
  id: CityEventId;
  title: string;
  text: string;
  round: number;
  secondary?: {
    id: CityEventId;
    title: string;
    text: string;
  };
  isDouble?: boolean;
  mayorId?: string;
}

export interface PendingMayorCityEventChoice {
  playerId: string;
  options: CityEventId[];
  round: number;
  eventNumber: number;
}

export type DistrictPath = 'tourist' | 'oldTown' | 'residential';

export interface DistrictPathState {
  ownerId: string;
  path: DistrictPath;
  createdAtTurn: number;
  creationCost?: number;
}

export interface PendingPayment {
  payerId: string;
  amount: number;
  originalAmount?: number;
  lawyerDiscountSaved?: number;
  reason: string;
  tileId?: number;
  source: 'tax' | 'card' | 'casino' | 'bank' | 'cityEvent' | 'movement' | 'loan';
  recipients?: Array<{
    playerId: string;
    amount: number;
  }>;
  mayorEventIncome?: {
    playerId: string;
    amount: number;
  };
  loanPayments?: Array<{
    loanId: string;
    amount: number;
  }>;
  loanPaymentQueue?: Array<{
    loanId: string;
    amount: number;
  }>;
  afterPayment?: {
    type: 'resolveTile' | 'resumeRolling';
    playerId: string;
    diceTotal?: number;
  };
}

export interface UnoReverseRentContext {
  originalTurnPlayerId: string;
  eventId: string;
  fromPlayerId: string;
  toPlayerId: string;
  usedAt: number;
  sequence: number;
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

export type TransferStatSource =
  | 'rent'
  | 'movement'
  | 'card'
  | 'loan'
  | 'trade'
  | 'bankruptcy'
  | 'loanPayoff'
  | 'other';

export interface PlayerMatchStats {
  purchases: number;
  auctionWins: number;
  purchaseSpend: number;
  mortgageReceived: number;
  unmortgageSpend: number;
  buildingsBuilt: number;
  hotelsBuilt: number;
  buildingSpend: number;
  buildingRefund: number;
  districtsCreated: number;
  districtSpend: number;
  rentPaid: number;
  rentReceived: number;
  taxesPaid: number;
  bankPaid: number;
  casinoBets: number;
  casinoGrossWon: number;
  casinoLost: number;
  casinoNet: number;
  chanceDraws: number;
  communityDraws: number;
  cardsDrawn: number;
  bankLoansTaken: number;
  playerLoansTaken: number;
  loanPrincipalTaken: number;
  loanPrincipalGiven: number;
  loanPaid: number;
  loanReceived: number;
  tradesAccepted: number;
  summaryVotes: number;
}

export interface PropertyMatchStats {
  tileId: number;
  purchaseSpendByPlayer: Record<string, number>;
  rentPaidByPlayer: Record<string, number>;
  rentReceivedByPlayer: Record<string, number>;
  buildingSpendByPlayer: Record<string, number>;
  buildingRefundByPlayer: Record<string, number>;
  mortgageReceivedByPlayer: Record<string, number>;
  unmortgageSpendByPlayer: Record<string, number>;
}

export interface DistrictMatchStats {
  group: string;
  createdByPlayer: Record<string, number>;
  spendByPlayer: Record<string, number>;
  rentReceivedByPlayer: Record<string, number>;
  rentPaidByPlayer: Record<string, number>;
}

export interface MatchStats {
  players: Record<string, PlayerMatchStats>;
  properties: Record<number, PropertyMatchStats>;
  districts: Record<string, DistrictMatchStats>;
  transfers: Record<string, Record<string, number>>;
  transfersBySource: Record<string, Record<string, Partial<Record<TransferStatSource, number>>>>;
  chanceDrawCounts: Record<number, number>;
  communityDrawCounts: Record<number, number>;
}

export type GameFinishReason = 'survivor' | 'summary' | 'role';

export type PostMatchAwardId =
  | 'propertyCount'
  | 'finalCash'
  | 'chanceMaster'
  | 'taxPayer'
  | 'casinoWinner'
  | 'builder'
  | 'rentCollector'
  | 'districtArchitect'
  | 'dealMaker'
  | 'loanMagnet'
  | 'roleVictory'
  | 'lastSurvivor';

export interface PostMatchAward {
  id: PostMatchAwardId;
  title: string;
  description: string;
  winnerIds: string[];
  value: number;
  crown: boolean;
  crownValue?: number;
}

export interface PostMatchPlayerSummary {
  playerId: string;
  finalMoney: number;
  propertyCount: number;
  propertyValue: number;
  totalWorth: number;
  crowns: number;
  rank: number;
}

export interface PostMatchPropertySummary {
  tileId: number;
  ownerId?: string;
  group?: string;
  income: number;
  spend: number;
  net: number;
}

export interface PostMatchTransferSummary {
  fromPlayerId: string;
  toPlayerId: string;
  amount: number;
  bySource: Partial<Record<TransferStatSource, number>>;
}

export interface PostMatchSummary {
  finishedAt: number;
  reason: GameFinishReason;
  selectedAwardIds: PostMatchAwardId[];
  awards: PostMatchAward[];
  players: PostMatchPlayerSummary[];
  properties: PostMatchPropertySummary[];
  transfers: PostMatchTransferSummary[];
  chanceCards: Array<{ cardId: number; count: number }>;
  communityCards: Array<{ cardId: number; count: number }>;
  winnerIds: string[];
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
  districtPaths: Record<string, DistrictPathState>;
  pendingCityEvent?: PendingCityEvent;
  pendingCityEventCasinoPlayerIds?: string[];
  pendingMayorCityEventChoice?: PendingMayorCityEventChoice;
  turnOrderRolls?: Record<string, [number, number]>;
  pendingRoleOrder?: RoleId[];
  pendingPurchaseTileId?: number;
  pendingRent?: {
    payerId: string;
    ownerId: string;
    tileId: number;
    amount: number;
    ownerAmount?: number;
    mayorEventIncome?: {
      playerId: string;
      amount: number;
    };
    originalAmount?: number;
    rentServiceId?: string;
    discountPercent?: 50 | 100;
    lawyerProtected?: boolean;
    unoReverse?: UnoReverseRentContext;
  };
  pendingPayment?: PendingPayment;
  pendingCasino?: {
    playerId: string;
    tileId: number;
    forced?: 'gamblerOpening' | 'cityEvent';
    amount?: number;
    multiplier?: number;
    spinSeed?: number;
    spinStartedAt?: number;
    spinEndsAt?: number;
  };
  pendingBankDeposit?: {
    playerId: string;
    tileId: number;
    amount: number;
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
  loanOffers: LoanOffer[];
  loans: ActiveLoan[];
  rentServices: ActiveRentService[];
  rentServiceCooldowns: Record<string, number>;
  bankDeposits: Record<string, BankDepositState>;
  rolesEnabled?: boolean;
  roleState?: Record<string, PlayerRoleState>;
  roleWin?: RoleWinState;
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
  buildsThisRoll?: {
    playerId: string;
    diceRollId: number;
    group: string;
    count: number;
  };
  summaryVotes?: Record<string, number>;
  matchStats?: MatchStats;
  postMatch?: PostMatchSummary;
  winnerId?: string;
  winnerIds?: string[];
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
  | { type: 'builder_buy_property'; playerId: string; tileId: number }
  | { type: 'builder_start_auction'; playerId: string; tileId: number }
  | { type: 'choose_city_event'; playerId: string; cityEventId: CityEventId }
  | { type: 'skip_casino'; playerId: string }
  | { type: 'start_casino_spin'; playerId: string; amount: number; multiplier: number; spinSeed: number }
  | { type: 'casino_bet'; playerId: string; amount: number; multiplier: number }
  | { type: 'pay_jail_fine'; playerId: string }
  | { type: 'go_to_jail'; playerId: string }
  | { type: 'start_bank_deposit'; playerId: string }
  | { type: 'decline_bank_deposit'; playerId: string }
  | { type: 'create_district'; playerId: string; group: string; path: DistrictPath }
  | { type: 'build'; playerId: string; tileId: number }
  | { type: 'sell_building'; playerId: string; tileId: number }
  | { type: 'mortgage'; playerId: string; tileId: number }
  | { type: 'unmortgage'; playerId: string; tileId: number }
  | { type: 'propose_trade'; offer: Omit<TradeOffer, 'id' | 'status'> }
  | { type: 'accept_trade'; playerId: string; offerId: string }
  | { type: 'decline_trade'; playerId: string; offerId: string }
  | { type: 'propose_loan'; offer: Omit<LoanOffer, 'id' | 'status' | 'createdAtTurn'> }
  | { type: 'accept_loan'; playerId: string; offerId: string }
  | { type: 'decline_loan'; playerId: string; offerId: string }
  | { type: 'take_bank_loan'; playerId: string; amount: number }
  | { type: 'miss_loan_payment'; playerId: string }
  | { type: 'use_loan_payoff_card'; playerId: string; loanId: string }
  | { type: 'pay_rent'; playerId: string }
  | { type: 'pay_rent_with_deposit'; playerId: string }
  | { type: 'use_uno_reverse'; playerId: string }
  | { type: 'pay_payment'; playerId: string }
  | { type: 'pay_payment_with_deposit'; playerId: string }
  | { type: 'use_lawyer_payment_protection'; playerId: string }
  | { type: 'use_lawyer_rent_protection'; playerId: string }
  | { type: 'pay_bail'; playerId: string }
  | { type: 'admin_move_current_player'; tileId: number }
  | { type: 'admin_grant_uno_reverse'; playerId: string }
  | { type: 'admin_start_city_event'; cityEventId: CityEventId }
  | { type: 'request_summary'; playerId: string }
  | { type: 'end_turn'; playerId: string }
  | { type: 'continue_turn'; playerId: string }
  | { type: 'declare_bankruptcy'; playerId: string };
