# Live game visual language

Katwed's live experience has two related but deliberately different surfaces.

- The Presentation is the **stage**: bold, theatrical and legible across a room. It uses controlled theme surfaces over background artwork, a compact broadcast header and semantic layouts for media, choices and image-first question types.
- The Player is the **contestant control pad**: compact, responsive and optimised for rapid phone interaction. Question progress and time stay concise; the prompt, interaction and Lock in action form the primary path.

## Phase compositions

The lobby gives the room code and QR code the strongest hierarchy, with joined players in calm arrival tiles. Head-to-Head uses two balanced named slots rather than the many-player grid. Active questions choose between media-and-answers, answers-only, media-only, image-focus and prompt-only compositions. The compact Controller preview uses the same semantic composition with reduced detail rather than a transformed desktop stage.

Locked is a reveal-gated transition. It confirms that submissions have closed but never exposes the answer. A player's waiting and Locked state retains the submitted palette colour, position marker, value, text, location or exact Mash-up pair wherever the safe payload permits it.

## Answers, time and reveal

Choice answers always use the shared `AnswerTile`, final deterministic option order, palette position and one of eight SVG position markers. True and False use positions one and two without green/red correctness conventions. Multiple Select adds explicit selection guidance and count, while Mash-up continues to require exactly two different people with no partial-credit path.

The circular timer remains visually separate from question progress. Submission count is a quieter broadcast status with a short progress track. Reveal retains palette colour and marker identity: correct answers gain a labelled dominant state, incorrect options recede, and response totals become visible. Multiple Select marks the complete correct set. Slider shows its correct value and accepted range; Pinpoint preserves image geometry, player markers and target; Typed Answer reveals only the primary answer; Mash-up presents the exact pair.

Player correctness uses text and icons as well as colour. It is asserted only when the revealed safe payload can determine it reliably. Typed-answer alternatives and partial-select point awards are not inferred from data the player-safe state does not expose.

## Scoreboards and final results

The live leaderboard is a scoreboard, not a dashboard table: rank, name and score remain the only primary row information, with the top three receiving stronger hierarchy. Final results are separate from the normal leaderboard and introduce a winner or joint-winner heading plus a top-three podium composition. Tied rank data remains authoritative. Head-to-Head keeps a balanced two-competitor final and its existing winner/draw rules.

## Themes, motion and access

Themes modify semantic surface opacity, border character, shadows and accents without replacing answer-palette colours. Existing background artwork remains atmospheric and is always placed behind controlled content surfaces. Pass 2 adds no generated or raster artwork.

Motion is short and phase-led: player arrival, Locked reframing, reveal emphasis, scoreboard entrance, Double Score and a settling final celebration. `prefers-reduced-motion: reduce` removes movement and preserves the final static state. Focus visibility, semantic headings, live status text, native inputs, large touch targets, automatic answer contrast and non-colour markers remain mandatory.

The principal CSS layers are `live-game.css` for shared live primitives, `presentation.css` for stage composition and compact preview, and `player.css` for responsive contestant interaction.
