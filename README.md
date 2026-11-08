# Smart License Generator

React (Vite) web app to build a smart license and turn it into a Solidity contract.

    npm install
    npm run dev      # development server
    npm run build    # production build in dist/
    npm test         # unit tests + compilation of the generated contracts with solc (OpenZeppelin v4 and v5)

## Flows

1. **Build a new license**: Configure (rules, royalty bases / oracles, rates) → Review & JSON (download) → Solidity (download).
2. **Upload an existing JSON**: convert it straight to Solidity, or open it in the wizard to edit it first.

Both JSON layouts are accepted: the canonical one (`licenseId`, `parties`, `versions[]`) and the flat one of the older
builder (`name`, `licensor`, `licensee`, ..., `rules`). The wizard always writes the canonical layout; editing an uploaded
license appends a new version and keeps the previous ones.

## Code map

- `src/components/wizard/StepConfiguration.jsx`: rules editor ported from `d0na/dapp-alps` (reactstrap 9 / Bootstrap 5).
- `src/lib/licenseSchema.js`: wizard model <-> license JSON.
- `src/lib/generator.js`: JSON -> Solidity. The contract skeleton is fixed; only the oracle interfaces, the rule table and
  the body of `payRoyalty()` (plus small per-rule helpers) change with the rules.
- Rate types: `lumpsum`, `proportional`, `step`, `custom` (formula tree), min/max per period, step structure on a royalty
  base or on time. Unknown types generate a `TODO` stub and a warning.
- `tests/`: unit tests, round trips and compilation with solc.
