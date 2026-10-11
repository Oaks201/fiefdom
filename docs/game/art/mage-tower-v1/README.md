# Approved Mage Tower companies

The owner approved Acolytes, Wardens, Magi and Archmagi after reviewing all five Mage Tower tiers at portrait, token and small-icon sizes. Hedge-wardens already had approved art. The four new tiers now fill their portrait and token slots in `src/renderer/public/game-assets/manifest.json`.

- [Final five-tier comparison](../../../../output/art-previews/mage-tower-tiers-3-5-v9/index.html)
- [Sources and art notes](../../../../output/art-previews/mage-tower-tiers-3-5-v9/prompt-set.md)
- Installer: `node scripts/install-mage-tower-art.cjs <path-to-sharp>`

Each portrait is a transparent 512 × 512 PNG, and each token is a transparent 128 × 128 PNG from the same approved source. `GameArt` uses the portrait pixels when displaying these tokens at UI size, as it does for the previously installed company art.
