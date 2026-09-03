# Katwed quiz format v6

Version 6 is the export target for Visual Pinpoint Authoring. It retains all v5 quiz, media, theme, audio, scoring and reference semantics and replaces the three Pinpoint answer coordinates with one `target` object. See [v5](katwed-quiz-format-v5.md) for unchanged fields and the [v6 JSON Schema](schemas/katwed-quiz-v6.schema.json) for the complete structure.

The importer continues to accept **versions 1–5**. Their `targetX`, `targetY` and `targetRadius` fields become `{ "kind": "circle", "x": targetX, "y": targetY, "radius": targetRadius }` automatically. Re-export always writes v6. Versions 1–5 do not accept the new `target` field; v6 does not accept the legacy fields. No images or game history are embedded.

## Pinpoint targets

Pinpoint still requires image media. A v6 Pinpoint question has exactly one of these targets:

```json
{ "kind": "circle", "x": 0.5, "y": 0.5, "radius": 0.1 }
```

```json
{ "kind": "rectangle", "x": 0.2, "y": 0.3, "width": 0.4, "height": 0.2 }
```

```json
{
  "kind": "polygon",
  "points": [
    { "x": 0.1, "y": 0.1 },
    { "x": 0.8, "y": 0.1 },
    { "x": 0.4, "y": 0.8 }
  ]
}
```

Every coordinate is a finite number in the image's normalised 0–1 square. Rectangles use the **top-left corner**, positive width and height, and must remain inside the image. Circle radius is between 0.000001 and 1, retaining the database's historical rule. Circles may extend beyond an edge; only points on the image can be submitted. Circle distance uses the historical normalised Euclidean metric, so the accepted region appears oval on a non-square image. The overlay always represents the actual scoring region.

Polygons contain 3–64 distinct vertices in outline order. The final edge closes automatically; do not repeat the first vertex. Vertices must be at least 0.000001 apart, the normalised area must be at least 0.0001, and the outline must not cross or double back over itself. Unknown fields, null targets and malformed geometry are rejected. The JSON Schema covers structure and scalar bounds; application and database validation additionally enforce geometric rules.

All shape boundaries count as correct, with a fixed arithmetic tolerance of `1e-10` shared by client and database geometry. Polygon scoring uses deterministic even/odd ray casting with an explicit boundary check. A submitted answer remains `{ "type": "pinpoint", "x": 0.4, "y": 0.5 }`. Supabase remains authoritative for validation, deadlines, correctness and points; targets are excluded from safe questions and appear only through the existing reveal-gated payload.

## Authoring and release

The editor draws over the actual contained image bounds. Circle drags run from centre to radius, rectangles from corner to corner, and freehand strokes close on release. Freehand capture is bounded, filters redundant samples, then deterministically removes the least significant bends until the tolerance and 64-vertex limit are met. Invalid strokes retain the previous target. Escape and pointer cancellation abandon the current stroke. Clear removes the target and blocks saving until a valid area is configured. Advanced settings supports keyboard creation and numerical editing for all three tools.

Forward migration `20260903203203_visual_pinpoint_targets.sql` normalises existing answer keys, updates the retained save, validation and scoring implementations, and leaves the established RPC wrappers, locks and phase boundaries intact. It must be deliberately released with this frontend; it has not been applied to production. Deploying the new frontend against the old database is unsupported, because that database cannot store rectangle or polygon targets. Existing v1–v5 files remain importable after release.
