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

## Links without JavaScript

- In the render-IR, nodes and edges take `href`, `title` and `refs`; the
  engine emits `<a href>`, `<title>` and `data-ref-<key>` attributes.
- From the command line, `--links map.json` decorates entities by id (or
  by a short name unique in the diagram): a bare URL, or
  `{ "href": "...", "title": "...", "refs": { "reqs": ["REQ-1"] } }`.
  `--link-template "https://docs/{name}"` gives every remaining entity a
  link; `{id}` and `{name}` expand.

```
plantuml-render render design/ -o site/svg/ --links site/links.json
```

## Coming next

- `[[url]]` PlantUML hyperlinks, once the grammar structures them.
- design-render filling `href` and `refs` from the argos model.
