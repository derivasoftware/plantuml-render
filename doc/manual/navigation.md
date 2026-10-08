# Navigation: clickable diagrams

Every entity in the SVG is a `<g data-id="qualified.Name">`; every relation a
`<g class="pr-edge-group" data-from=".." data-to="..">` holding two paths —
`pr-edge-hit`, an invisible band `--pr-edge-hit` wide (twelve pixels) that
takes the pointer, because a line a pixel wide is a poor target, and
`pr-edge`, the drawn line, which takes none. Explanations
ride as `<title>`, on either, and may run to several lines.

That is the graph and the words, inside the drawing, which is enough for a host
to add behaviour without reloading the model.

## Lighting what the pointer is on

Two functions ship from `plantuml-render/browser`, so no surface writes them
twice:

```ts
import { attachFocus, neighbourhood } from "plantuml-render/browser";

const release = attachFocus(svg, {
  onFocus: (focused) => {
    if (!focused) return hide();
    // a node: what reaches it, what leaves it, who is at the other end
    // a relation: what it says, and its two ends
    show(focused.node ?? focused.relation);
  },
});
```

`attachFocus` dims the drawing and lights what the pointer is on together with
everything it touches — one hop, not the neighbour of a neighbour — through
three classes the engine already styles: `pr-focusing` on the root,
`pr-focus` on what stays lit, `pr-focus-root` on the one pointed at. Redefine
`--pr-focus` and `--pr-dimmed` for another look, or the classes themselves.
It returns the function that puts everything back.

`neighbourhood(svg, id)` answers the same question without a pointer, for a
search box or a keyboard walk.

What to show is the host's decision — a tooltip, a side card, a status line —
and that part is deliberately not in the package. On a diagram of a thousand
states a focus update takes about 3.5 ms, so there is nothing to optimise.

## Jumping to the entity

`data-id` is the same across diagrams, so a click can resolve the entity
elsewhere; when the page follows the folio anchor rule (`cls-<id with
non-alphanumerics dashed>`, `fig-<diagram id>`), it navigates to those
anchors.

## Rows and branches of a sequence

A sequence SVG also tells a host page how it is built in time: the root
carries `data-row-tops` (the y of every row), every message, note and
divider carries `data-row`, every frame `data-span="first,last"`, and
every condition is a `<g class="pr-branch">` pill with `data-rows` (the
rows it governs). That is enough to fold a frame to its tab, focus one
branch of an `alt` (dim the others) or show a single scenario by hiding
rows and shifting what follows up, without laying the diagram out again.

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

## Links written in the PlantUML source

A hyperlink on an entity head sets `href` (and `title` from the tooltip)
on its box, the standard PlantUML way:

```
class Order [[https://docs/order.html{Order aggregate}]]
interface Payable [[#payable]]
```

A `--links` map entry for that entity overrides the source link; the
`--link-template` only fills entities that have no link.

## Coming next

- design-render filling `href` and `refs` from the argos model.
- Keeping a focus pinned on click, which today is the host's to add.
