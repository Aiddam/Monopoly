# AGENTS.md

Instructions for coding agents working in this repository. This file applies to the whole project.

## Overview

This is "Ukraine Monopoly":

- `client/` - Vite + React + TypeScript client.
- `server/` - ASP.NET Core SignalR room server.
- `server.Tests/` - tests for the room server.

Main rule: gameplay rules belong in `client/src/engine/`. UI should render state and dispatch `GameAction`; it should not duplicate rule logic.

## Commands

From the repository root:

```powershell
dotnet test
```

Client:

```powershell
cd client
npm test
npm run build
npm run dev
```

Server locally:

```powershell
dotnet run --project server
```

Default local SignalR server: `http://localhost:5109`. The client reads the server URL from `VITE_SIGNALR_URL`, with a fallback in `client/src/network/roomClient.ts`.

## Client Structure

- `client/src/App.tsx` - top-level screen routing between home, lobby, room, game, and finished screens.
- `client/src/components/GameScreen.tsx` - main game UI: board, panels, prompts, modals, animations, sounds, timers, and workspace drawer tabs.
- `client/src/components/DiceRoller.tsx` - dice visuals.
- `client/src/components/LobbyScreen.tsx` - local game start and room entry.
- `client/src/components/RoomScreen.tsx` - online room UI.
- `client/src/styles.css` - most styling and CSS animations.
- `client/public/assets/` - static assets. UNO Reverse PNG is `client/public/assets/cards/uno-reverse.png`.

## Data Files

- `client/src/data/board.ts` - all board tiles, cities, banks, utilities, prices, rents, groups, and city art metadata.
- `client/src/data/cards.ts` - Chance and Community card definitions and their `apply` effects.
- `client/src/data/cityEvents.ts` - city event definitions, durations, and effects.
- `client/src/engine/economy.ts` - money helpers. Currently `MONEY_SCALE = 1`.
- `client/src/engine/difficulty.ts` - late-game multipliers for start rewards, prices, and fines.
- `client/src/engine/startRewards.ts` - start tile/pass-start rewards.

## Core Engine

Main file: `client/src/engine/gameEngine.ts`.

This is the single source of truth for game rules. Main exported API:

- `createInitialGame(...)` - creates the initial `GameState`.
- `reduceGame(state, action)` - the only reducer for gameplay actions.
- `calculateRent(...)`, `getEffectivePropertyPrice(...)`, `getEffectiveHouseCost(...)`, `getEffectiveBuildingRefund(...)`, `getEffectiveMortgageValue(...)`, `getEffectiveUnmortgageCost(...)`, `getEffectiveFineAmount(...)`, `getBankLoanLimit(...)` - UI should use these helpers instead of duplicating formulas.

Types live in `client/src/engine/types.ts`.

When adding or changing a gameplay mechanic:

1. Add or update types in `types.ts`.
2. Add a `GameAction` if the mechanic needs a user/admin action.
3. Add a case in `reduceGame`.
4. Add or update pure helper functions in `gameEngine.ts`.
5. Add or update tests in `client/src/engine/gameEngine.test.ts`.
6. Only then connect the UI in `GameScreen.tsx`.

## Game Phases

`GamePhase` in `types.ts` controls which prompt is shown in `GameScreen.tsx`.

Important pending fields in `GameState`:

- `pendingPurchaseTileId` - player must buy or decline a property.
- `pendingRent` - player must pay rent, including optional UNO Reverse context.
- `pendingPayment` - taxes, cards, casino, bank, and city-event payments.
- loan installments also use `pendingPayment` with `source: 'loan'` and `loanPayments`.
- `pendingBankDeposit` - player landed on their own bank and must confirm or skip starting a deposit.
- `pendingCasino` - casino roulette flow.
- `pendingJail` - jail decision.
- `pendingCardDraw` - player landed on Chance/Community and must draw.
- `pendingCard` - card was drawn and is being shown.
- `pendingCityEvent` - city event reveal/banner state.
- `districtPaths` - permanent path choices for completed city color groups.
- `loans` / `loanOffers` - active credits and pending player-to-player credit contracts.

## Board Mechanics

Storage and rules:

- Tile data: `client/src/data/board.ts`.
- Movement and tile resolution: `movePlayer`, `resolveTile`, `resolveTileAfterCard` in `gameEngine.ts`.
- Board rendering, tiles, and pawns: `TileCell`, `BoardPawns`, `boardPosition`, `pawnPoint` in `GameScreen.tsx`.
- Owner abbreviations on cities: `getOwnerNameMark` in `GameScreen.tsx`.
- Old Town pass-through tolls are calculated during `movePlayer` before destination resolution. The toll uses crossed tiles only and excludes the destination tile.

Do not change rent formulas only in UI. Formula changes belong in the engine.

## Buying, Auctions, and Property Management

Engine:

- Purchase: `buyPendingProperty`.
- Decline/auction: `startAuction`, `auctionBid`, `auctionPass`, `resolveAuction`.
- District creation: `createDistrictPath`.
- Buildings: `buildOnCity`, `sellBuilding`.
- Mortgage/unmortgage: `mortgageProperty`, `unmortgageProperty`.
- Credits: `proposeLoan`, `acceptLoan`, `takeBankLoan`, `missLoanPayment`.
- Bankruptcy/surrender: `declareBankruptcy`.
- Bank deposits: `startBankDeposit`, `getBankDepositInfo`, `getBankDepositPayout`.

UI:

- Purchase prompt: `BoardPurchasePrompt`.
- Auction UI: `AuctionOverlay`, `AuctionWinAnimationLayer`.
- Property management: `ManagePanel`, `CityAssetCard`, `SimpleAssetCard`, `CityModal`, `ServicePropertyModal`.

Important: on `declare_bankruptcy`, the surrendered player's properties do not transfer to a creditor. They become neutral/bank-owned. A debtor can only transfer available cash to a creditor for pending rent/payment.

## Bank Deposits

Bank deposits are a bank-owner mechanic.

Engine:

- State lives in `GameState.bankDeposits`, keyed by player id.
- Landing on your own unmortgaged bank creates `GameState.pendingBankDeposit` and moves the game to `phase: 'bankDeposit'`.
- Action `start_bank_deposit` confirms that prompt, subtracts the deposit principal from the player, and creates one active deposit.
- Action `decline_bank_deposit` skips the prompt and ends the turn.
- A player needs at least 2 owned banks to start a deposit.
- Deposit principal is the base bank rent for the owner's current bank count: 2 banks = `50`, 3 banks = `100`, 4 banks = `200`.
- Each later `movePlayer` call adds 1 turn to the active deposit, regardless of how many board steps were moved.
- Payout compounds by 10% per turn after the deposit, rounded up after each turn (for example, `100 -> 110 -> 121`).
- Landing on any owned bank automatically returns the deposit only while the player owns at least 2 banks.
- If ownership drops to 1 bank, the deposit remains frozen and cannot be returned until the owner again has at least 2 banks.
- During `phase: 'bankDeposit'`, the player may mortgage properties and sell buildings to raise money before confirming the deposit.
- Bank deposits are removed when the player goes bankrupt.

UI:

- Bank deposit status and the deposit button live in `SimpleAssetCard` and `ServicePropertyModal`.
- The drawer bonus card shows the current projected payout for an active deposit.

## Credits

Credits are an engine-owned debt mechanic.

Engine:

- State lives in `GameState.loans` and `GameState.loanOffers`.
- Types: `LoanOffer`, `ActiveLoan`, and `LoanKind` in `client/src/engine/types.ts`.
- Actions: `propose_loan`, `accept_loan`, `decline_loan`, `take_bank_loan`, and `miss_loan_payment`.
- Player-to-player loan offers are custom contracts: `50-800₴`, `2-10` borrower turns, total repayment from `100%` to `180%`, optional collateral.
- A borrower may have up to 3 active player loans.
- Collateral must be borrower-owned, unmortgaged, without buildings, and unused by another active loan. Collateral cannot be traded, mortgaged, or built on while locked.
- Bank loans are available during the player turn or financial decisions, at most 1 active bank loan per borrower, up to `500₴` and capped by `30%` of player worth. They last 6 borrower turns and repay `115%`.
- Loan installments are created as `pendingPayment.source === 'loan'` when the borrower’s own turn starts, before rolling.
- Missing a first loan payment adds a late fee and carries the missed amount into the next installment. Player loans use a 10% late fee; bank loans use 20%.
- A second miss on a collateralized player loan transfers the collateral to the lender and closes the loan. A second miss on unsecured or bank loans is mandatory pay-or-surrender.
- Borrower bankruptcy transfers collateralized player-loan collateral before remaining borrower property returns to the bank. Other borrower debts clear. Lender bankruptcy cancels outgoing player loans.

UI:

- Credit management lives in the workspace drawer `Кредити` tab in `GameScreen.tsx`.
- Loan due payments reuse `PaymentDecisionPanel`; only loan payments show the `Пропустити` action.

## District Paths

District Paths are permanent route choices for completed city color groups.

Types and state:

- `DistrictPath = 'tourist' | 'oldTown' | 'residential'` in `client/src/engine/types.ts`.
- `GameState.districtPaths` stores one district record per city `group`: `{ ownerId, path, createdAtTurn, creationCost }`.
- `GameAction` includes `create_district`, dispatched from city management UI.
- Per-roll build tracking is stored in `buildsThisRoll`; keep `builtThisRoll` compatibility in mind when touching older saved-state logic.

Engine rules:

- A player must own the full city group before creating a district.
- A district must be created before the first build in that group.
- District creation cost is `2 * max(current house-build cost)` for that group at creation time, before any district-path house discount is applied.
- A district path cannot be changed after creation.
- Districts are destroyed automatically by `normalizeDistrictPaths` when ownership of any city in the group changes, including trades, auctions, bankruptcy/surrender, or future ownership-transfer actions.
- If the group is later fully owned again, the owner must create and pay for a new district.

Path behavior:

- `tourist`: existing rent, build, and sale behavior.
- `oldTown`: city rent is reduced by `DISTRICT_RENT_DIVISOR` (`2.5`). For building/hotel rent in the green group, use `GREEN_DISTRICT_BUILDING_RENT_DIVISOR` (`4`); for the gold Kyiv/Lviv group, use `GOLD_DISTRICT_BUILDING_RENT_DIVISOR` (`3.5`). Passing through crossed Old Town cities owned by another player creates a pre-resolution movement `pendingPayment`; the toll is current crossed-city rent divided by `OLD_TOWN_PASS_THROUGH_DIVISOR` (`3.5`), or by the same group-specific building divisor when the crossed green/gold city has buildings.
- `residential`: house cost uses `RESIDENTIAL_HOUSE_COST_MULTIPLIER` (`0.45`) before city-event and late-game multipliers, city rent follows the same district rent divisors as Old Town, and the owner may build exactly up to 2 times in that district per dice roll.
- Any created district increases city mortgage value by that city's share of half the district creation cost. Do not reduce mortgage value by the district rent divisor.

Money helpers:

- Use `getEffectiveHouseCost` for build cost.
- Use `getEffectiveBuildingRefund` for sell-building refunds; Residential affects this.
- Use `getEffectiveMortgageValue` for mortgage cash and UI labels; district creation value, city-event property price modifiers, and late-game price multipliers are included.
- Use `getEffectiveUnmortgageCost` for buyback cost; it is only the effective mortgage value with `UNMORTGAGE_INTEREST_MULTIPLIER` (`1.05`) and should not apply extra late-game or city-event multipliers again.
- Do not use raw `tile.houseCost` or `tile.mortgage` in UI or engine actions when a district can affect the value.

UI:

- District selection lives in `CityModal`.
- City tiles and asset cards show district badges via `TileCell`, `ManagePanel`, and `CityAssetCard`.
- Creation animation uses `DistrictPathAnimationLayer`, `useDistrictPathAnimationEvents`, and `.district-path-*` CSS in `client/src/styles.css`.
- Rent preview tables in `CityRentTable` must mirror engine formulas only through shared constants/helpers or carefully matched display logic.

Tests:

- District mechanic tests live near the building/property-management tests in `client/src/engine/gameEngine.test.ts`.
- When changing district rules, cover creation, build blocking, rent formulas, pass-through tolls, Residential two-build behavior, district destruction on ownership change, building refunds, mortgage value, and unmortgage cost.

## Rent, Payments, and Surrender

Engine:

- Rent: `payRent`, `calculateRent`, `findRentService`, `applyRentService`.
- General payments: `createPendingPayment`, `payPendingPayment`, `chargePlayer`.
- Surrender: `declareBankruptcy`.

UI:

- Rent: `BoardRentPrompt`.
- Payment/card/tax/bank/city-event payment: `BoardPaymentPrompt`, `PaymentDecisionPanel`.
- Global surrender button: `BoardActionDock`.

Surrender buttons use a charge/hold interaction. Do not make surrender instant-click unless explicitly requested.

## UNO Reverse

UNO Reverse is a unique Chance card mechanic.

Data and engine:

- Chance card id `13`: `client/src/data/cards.ts`.
- Constants: `UNO_REVERSE_CARD_ID`, `UNO_REVERSE_CARD_DECK_COPIES`, `UNO_REVERSE_CARD_LIMIT` in `gameEngine.ts`.
- Player state: `Player.unoReverseCards` in `types.ts`.
- Rent context: `UnoReverseRentContext` and `pendingRent.unoReverse` in `types.ts`.
- Use action: `useUnoReverse` in `gameEngine.ts`.
- Hand limit: `getUnoReverseCardCount` and `addUnoReverseCard`.
- Admin grant: `adminGrantUnoReverse`.

Rules:

- A player can hold at most 1 UNO Reverse card.
- After using it, the card is consumed and the player can draw one again later.
- The starting Chance deck has 4 UNO Reverse copies, matching a normal Chance card.
- After UNO Reverse is drawn, it does not go into discard and cannot be recycled, so it can appear at most 4 times per game.
- UNO Reverse works only during a rent decision against another player.
- When the rent payer uses UNO Reverse, payer/owner are swapped for that decision.
- If the new payer also has UNO Reverse, they can reverse it again.
- After payment or surrender, turn flow follows `payRent`/`declareBankruptcy`, including double-roll handling.

UI and animation:

- Rent button: `BoardRentPrompt`.
- Use animation: `UnoReverseAnimationLayer` plus CSS `.uno-reverse-*`.
- Draw/acquire animation: special branch in `CardDrawOverlay`, CSS `.uno-reverse-acquire-*`.
- PNG asset: `client/public/assets/cards/uno-reverse.png`.
- Card in "My cards": `ManagePanel`, `.bonus-card.uno-reverse`.

When changing UNO Reverse, update tests near `uno-reverse-*` in `gameEngine.test.ts`.

## Cards

Data:

- Chance/Community definitions: `client/src/data/cards.ts`.
- Each card has `id`, `deck`, `title`, `text`, optional `rarity`, and `apply`.

Engine:

- Deck creation: `createCardDeck`.
- Draw flow: `drawPendingCard`, `drawCard`.
- Post-card tile resolution: `resolveTileAfterCard`, `deferCurrentPlayerLossFromCard`.
- `pendingCard` exists for overlays and auto-continue delay.

UI:

- Normal card animation: `CardDrawOverlay`, `.card-draw-*`, `.drawn-card`.
- Payment cards use the inline panel `.card-payment-inline`.
- UNO acquire does not render explanatory card text; it uses a separate animation.

## City Events

Data:

- `client/src/data/cityEvents.ts`.
- Draw interval: `CITY_EVENT_ROUND_INTERVAL`.
- Effects model: `CityEventEffect` in `types.ts`.

Engine:

- Round ticking: `tickCityEventsForNewRound`.
- Draw condition: `shouldDrawCityEvent`.
- Draw: `drawCityEvent`.
- Double event: `shouldDrawDoubleCityEvent`, `pickSecondCityEventId`, `createPendingCityEvent`, `activateCityEvents`.
- Start effects: `applyCityEventStartEffects`, `startCityEventAuction`.
- Effect helpers: `getCityEventStepFee`, `hasSingleDieRolls`, `isBuildingBlockedByCityEvent`.
- Admin start: `adminStartCityEvent`.

UI:

- Top-right board banner: `CityEventBanner`.
- Hover tooltip for long text: `.city-event-tip`.
- Reveal animation: `CityEventReveal`, `.city-event-reveal-*`.
- Double event styling: `.double-city-event`, `.city-event-banner.double`.

When adding a new `CityEventEffect`:

1. Add the field in `types.ts`.
2. Handle it in an engine helper or start effect.
3. Add UI text only if needed.
4. Add tests.

## Casino

Engine:

- `skipCasino`, `startCasinoSpin`, `casinoBet`.
- Constants: `CASINO_MAX_BET`, `CASINO_MAX_MULTIPLIER`, `CASINO_SPIN_DURATION_MS`.

UI:

- `BoardCasinoPrompt`.
- Wheel constants/rendering in `GameScreen.tsx`: `CASINO_SEGMENTS`, `CASINO_WHEEL_SEGMENTS`, `CASINO_WHEEL_BACKGROUND`.
- Sound kind: `casino`.

## Jail

Engine:

- `payJailFine`, `goToJailFromDecision`, `payBail`, `sendToJail`.
- Jail cards live on `Player.jailCards`.

UI:

- `BoardJailDecisionPrompt`.
- `BoardJailTurnPrompt`.
- Jail notes in `BoardActionDock`.

## Trades and Rent Services

Engine:

- `proposeTrade`, `acceptTrade`, `declineTrade`.
- Validation: `validateTradeOffer`, `validateTradeProperties`, `validateTradeRentServices`, `validateTradeValueRange`.
- Rent services: `activateRentServices`, `tickRentServicesForPlayer`, `findRentService`, `applyRentService`.

UI:

- Drawer tab: `TradePanel`.
- Active offer: `BoardActiveTrade`, `TradeOfferCard`.
- Builder: `BoardTradeBuilder`, `TradeDraftSide`, `MoneyInput`.
- Rent service status: `RentServicesStatusPanel`.

Rules:

- Properties with buildings cannot be traded.
- Services have cooldowns stored in `rentServiceCooldowns`.
- Accepted/declined pending trades affect turn controls in `BoardActionDock`.

## Timers and Auto Flow

Hooks in `GameScreen.tsx`:

- `useTurnTimer` - 180-second turn/payment timer.
- `useAutoContinueTurn` - auto end/continue after animations/card reveal.
- `useDiceRollAnimation` - dice roll visual state.
- `useAnimatedPositions` - pawn movement animation.

Constants near the top of `GameScreen.tsx`:

- `TURN_SECONDS`
- `AUTO_CONTINUE_MS`
- `CARD_REVEAL_MS`
- `DICE_ROLL_ANIMATION_MS`
- `PAWN_STEP_ANIMATION_MS`
- `SURRENDER_CHARGE_MS`

## Sounds and Emotes

UI:

- Sound hooks: `useGameSounds`, `useEmoteSounds`.
- Audio helpers: `playGameSound`, `playTone`, `playNoise`, `playEmoteAudio`.
- Emote definitions: `EMOTE_OPTIONS`.
- Emote assets: `client/public/assets/emotes/`.

Networking:

- Emote messages use `PeerMessage` type `emote` in `peerMesh.ts`.

## State Store and Multiplayer

Store:

- `client/src/store/useGameStore.ts` owns local state, room state, persistence, dispatch, and broadcasts.
- `screenForGame(game)` ensures finished games show the finished screen for all clients.
- Saved session versioning and localStorage helpers live near the bottom of `useGameStore.ts`.

Network:

- `client/src/network/roomClient.ts` - SignalR room client, room snapshots, signaling messages.
- `client/src/network/peerMesh.ts` - WebRTC mesh and game/emote messages.
- `server/Rooms/*` - SignalR room hub, room manager, models.

Model:

- SignalR coordinates room membership and signaling.
- Game actions/state are sent over WebRTC data channels when possible.
- The host applies actions through `reduceGame` and broadcasts action/state.

## Server

- `server/Program.cs` - ASP.NET Core setup, CORS, SignalR hub at `/hubs/rooms`, health endpoint.
- `server/Rooms/RoomHub.cs` - hub methods/events.
- `server/Rooms/RoomManager.cs` - room lifecycle.
- `server/Rooms/RoomModels.cs` - server room models.
- `server.Tests/RoomManagerTests.cs` - server tests.

Deployment notes live in `DEPLOYMENT.md`.

## Tests

Client:

- `client/src/engine/gameEngine.test.ts` - gameplay rules. Add tests here for every engine change.
- `client/src/network/peerMesh.test.ts` - WebRTC/peer behavior.

Server:

- `server.Tests/RoomManagerTests.cs`.

Preferred verification after gameplay logic changes:

```powershell
cd client
npm test
npm run build
cd ..
dotnet test
```

For CSS-only or UI-only changes, at least run:

```powershell
cd client
npm run build
```

## Styling and UI Rules

- Most game UI is in one large `GameScreen.tsx`; keep additions near related components.
- Most CSS is in `client/src/styles.css`; reuse existing naming patterns.
- Use lucide icons already imported in `GameScreen.tsx` when possible.
- Use `framer-motion` for overlay/reveal animations, following existing `motion.*` patterns.
- Keep board overlays layered deliberately. Check z-index before changing:
  - pawn/building/auction/mortgage/UNO layers;
  - `card-draw-overlay`;
  - `dice-roll-overlay`;
  - city event reveal;
  - modal backdrops.
- If an overlay should appear above the log, check `CardDrawOverlay`, `BoardLogFeed`, and z-index in `styles.css`.
- Responsive dock styles live around `.board-action-dock`, `.dock-tools`, `.dock-surrender`.

## Generated or Build Output

Do not edit generated/build artifacts:

- `client/dist/`
- `client/node_modules/`
- `server/bin/`, `server/obj/`
- `server.Tests/bin/`, `server.Tests/obj/`

## Git and Worktree Safety

The worktree may already contain user changes. Do not revert unrelated edits. When modifying shared files like `GameScreen.tsx`, `gameEngine.ts`, `types.ts`, or `styles.css`, inspect nearby code first and keep patches scoped.
