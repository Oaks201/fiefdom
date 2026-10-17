# Skirmish token concepts

Second review pass for the four skirmish slots that currently display initials: `company.bears.token`, `company.wolves.token`, `company.giantSpiders.token`, and `company.villageMilitia.token`.

The bear is now head-only, with no paws. The ordinary gray wolf now howls, distinct from the existing supernatural Shadow Hound. The spider has a closer, heavier framing to suggest giant size. The village defender is byte-for-byte unchanged from the first review and uses local rust and cream clothing rather than the player's green and silver Militia uniform.

`prepare.cjs` derives 128×128 map tokens and 48×48 readability checks from the transparent sources. Review only; no game manifest or installed assets were changed.
