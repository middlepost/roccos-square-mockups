# Rocco's Pizza — pickup ordering (Square sandbox)

The approved v3 front end, with the 1 November menu, a cart, and card checkout through **Square sandbox**. Sister-brand colours and copy swap with one env var. Nothing here talks to a live Square account unless you set that on purpose.

Node 20 or newer is the only dependency. There is no install step.

## Run it

```bash
npm start
```

Open http://localhost:3000

Without a token the menu is the saved 1 November list, the cart and the three forms work, and checkout explains that the card cannot be charged yet.

## Seed the sandbox catalog

```bash
cp .env.example .env
```

Put the **sandbox** access token in `.env` as `SQUARE_ACCESS_TOKEN`. Do not commit `.env`.

The other values are already the sandbox application and location:

- Application `sandbox-sq0idb-rqkEoTTcR7FYJQCQiDjBYw`
- Location `LFXEWDVVKRYC0`

```bash
npm run seed -- --dry-run   # prints the menu, contacts Square zero times
npm run seed                 # writes the catalog, then uploads the 15 photos
npm start
```

`npm run seed` is safe to run again. It matches pizzas and drinks by SKU, categories and add-ons by name, and updates those records in place. It does not delete items that use some other SKU. A second run does not upload a photo again when the item already has one.

Re-running the seed puts names, prices, descriptions, and add-ons for these SKUs back to the 1 November list. Change a price in the Square dashboard after seeding if you want the site to show that change.

The seed reads the location's currency and stores prices in it. If that currency is not AUD it says so. 2000 still means 20.00.

## Pay with a test card

In the cart, after the token is set:

- Card `4111 1111 1111 1111`
- Any future expiry, any CVV, any postcode

The charge shows up as an order in the Square **sandbox** dashboard. Pickup is Findon Rd or Grange Rd. Both stores use location `LFXEWDVVKRYC0` until you set `SQUARE_LOCATION_FINDON` and `SQUARE_LOCATION_GRANGE`.

## Forms

Catering, gift cards, and Rocco's Club post to `POST /api/enquiries`. Submissions are appended to `data/enquiries.jsonl` (not committed). The inbox is `ENQUIRY_EMAIL`, currently `placeholder@example.com`. Set `ENQUIRY_WEBHOOK_URL` if you also want each submission POSTed somewhere.

Gift cards are requests only. They do not create a Square gift card and they do not charge a card.

## Tests

```bash
npm test
```

Checkout tests mock Square. They check the order and payment bodies, the sandbox host, and that a token never appears in a page or an error.

## Sandbox today, production later

Leave these as they are for the demo:

```bash
SQUARE_ENV=sandbox
SQUARE_APPLICATION_ID=sandbox-sq0idb-rqkEoTTcR7FYJQCQiDjBYw
SQUARE_LOCATION_ID=LFXEWDVVKRYC0
SQUARE_ACCESS_TOKEN=...sandbox token...
```

Production is a different set of env vars, not a code change. The process refuses to start, and the seed refuses to run, unless all of these are set:

```bash
SQUARE_ENV=production
SQUARE_ALLOW_PRODUCTION=yes
SQUARE_APPLICATION_ID=sq0idp-...
SQUARE_ACCESS_TOKEN=...production token...
SQUARE_LOCATION_ID=...
SQUARE_LOCATION_FINDON=...
SQUARE_LOCATION_GRANGE=...
```

A sandbox application id cannot be used with production, and the reverse is also refused.

## Another brand

```bash
BRAND=margherita npm start
BRAND=hungry-italian npm start
```

`config/brands/` holds colours, hero, story, stores, and the menu file. Margherita and The Hungry Italian are themes only. Their menus are empty on purpose.

## What is still open

Hours, Instagram, the dough video, and real reviews are empty until the shop sends them. The $50 deal and the add-on prices are the v3 list, renamed to the 1 November pizzas. Sopressa Salame and Honey Pesto Chicken descriptions are marked **To confirm**. Tax is not added on top of the menu price. ASAP orders tell Square to allow about 20 minutes.
