# Reference mockup

`mockup-alpine.html` is the source of the approved interactive mockup ("Alpine Morning"). It was built for a design-canvas runtime and draws the globe by hand on a <canvas> with sample data, so it will not run on its own.

Use it for:
- Exact colors, fonts, sizes, spacing, and copy (the markup section at the top).
- Behavior and timing of the globe: spin, fly-in, spot zoom, pin drop-in, live pulse (the `draw`, `step`, and `flyTo` methods in the script).

Do not port its code. Production uses MapLibre as described in docs/05-map-and-globe.md.

`mockup-people-and-trips.html` shows the spot view with the single filter bar (Traveler + Trip dropdowns), display-only trip cards with who was there, photographer-colored pins, and the gallery grouped by trip with photographer badges. Sample people and data only; same rules as above (reference, not code to port).
