# Proposed deals

The prices on options D–M are **proposed**. They are worked out from the menu already used in these mockups (Option A). They are not live promotions.

Rocco needs to confirm every deal before it is offered to customers. The confirmed rules then have to be set up in Square Online (discount rules or bundles) so checkout charges the deal price. Until that is done, do not treat the site copy as a promise.

Change a deal in one place: `offers.js`. The pages read that file. They do not repeat the deal table.

## Menu prices used

| Pizza | Menu price |
|---|---|
| Margherita | $19 |
| Marinara | $16 |
| Diavola | $24 |
| Gamberi | $26 |
| Funghi | $23 |
| Prosciutto | $26 |
| Patate e Rosmarino | $21 |
| Rocco's Special | $27 |

Gamberi is $26, as in Option A. Option B lists that pizza at $27.

## Deals

| Offer | Rule | Pizzas | Usual price | Deal price | Saving |
|---|---|---|---|---|---|
| 2 pizzas for $32 | 2 Margheritas. Any day. | 2 × Margherita | $38 | $32 | $6 |
| 3 pizzas for $54 | Margherita, Diavola and Funghi. Any day. | $19 + $24 + $23 | $66 | $54 | $12 |
| Buy 2, save $6 | $6 off any 2 pizzas. The pair shown is Margherita and Marinara. Any day. | $19 + $16 | $35 | $29 | $6 |
| Weekday Lunch Rate | $3 off any pizza, Monday to Friday, 11am to 4pm. The price shown is Margherita unless a card names another pizza. | Margherita $19 | $19 | $16 | $3 |
| Weekend Rate | 2 for $36, Saturday and Sunday. Margherita and Diavola. | $19 + $24 | $43 | $36 | $7 |
| Family deal | 3 pizzas for $48. Margherita, Marinara and Patate e Rosmarino. Any day. | $19 + $16 + $21 | $56 | $48 | $8 |
| Pizza night | 2 Diavola for $40. Any day. | 2 × Diavola | $48 | $40 | $8 |

Savings are the menu total minus the deal price. Each bundle is about 11–19% under the menu total.

Weekday lunch on any other pizza is that pizza's menu price minus $3. Marinara becomes $13 (save $3). Rocco's Special becomes $24 (save $3).

Buy 2, save $6 is always $6, so the deal price moves with the two pizzas chosen. Two Marinara ($32) becomes $26. Two Rocco's Special ($54) becomes $48.

## What was left out

Sides and drinks are not on the menu with prices, so no bundle includes them. A later line that needs one would be marked `price TBC` in `offers.js` only.

There is no promo code. The wording assumes the deal applies automatically at Square Online checkout.

The shops' listed hours are dinner service (Findon Road from 5:00pm, Grange Road from 5:00pm). The Monday–Friday 11am–4pm lunch rate is part of this proposal, not a current opening time.

Today's deal follows the visitor's local day: Monday–Friday shows the lunch rate, Saturday–Sunday shows the weekend rate. If the script does not run, the page still shows the weekday lunch wording. A countdown appears only during the lunch window (until 4pm) or, on a weekend, until the end of Sunday.

The email box is a teaser on the mockup. It does not join a list until that is connected.
