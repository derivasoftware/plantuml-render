# Navigation: clickable diagrams

Every entity in the SVG is a `<g data-id="qualified.Name">`; every edge a
`<path data-from=".." data-to="..">`. That is enough for a host page to add:

- hover: highlight the entity and its edges, show a card with its facts;
- click: jump to the entity's own diagram or to its detail anchor.

A reference implementation (2 KB of plain JavaScript, no framework) ships
as `plantuml-render docs nav-js`; paste it into the page that embeds the
diagrams. It resolves the same entity across diagrams by `data-id` and,
when the page follows the folio anchor rule (`cls-<id with non-alphanumerics
dashed>`, `fig-<diagram id>`), it navigates to those anchors.

## Coming next

- `--links map.json`: decorate entities with `<a href>` from a JSON map of
  id → url (navigable without any JavaScript).
- `[[url]]` PlantUML hyperlinks, once the grammar structures them.
- `href` and `refs` in the render-IR for producers such as design-render.
