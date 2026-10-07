# Embedding the SVG in HTML

The SVG is made to live inline inside any page:

- Every style rule is scoped under `.pr-diagram`; nothing leaks into the host.
- Ids are prefixed per diagram, so many diagrams share one document without
  collisions. The logical entity id (its qualified name) is in `data-id`;
  edges carry `data-from` and `data-to`.
- The root carries `viewBox`, its natural `width`/`height`, and
  `style="max-width:100%;height:auto"`: small diagrams stay small, large
  ones shrink to the container.
- Light and dark palettes are declared in the SVG itself: it follows
  `prefers-color-scheme`, and a host can force one with
  `<html data-theme="dark">` or `data-theme="light"`.
- Override any token from the host, e.g.
  `.pr-diagram { --pr-type: #0a7; --pr-font: "IBM Plex Mono", monospace }`.

## When there is no host to override from

A diagram written to a file and opened on its own — or dropped into a document
that cannot carry CSS — has nobody to set its tokens, so the renderer bakes
them in instead:

```
plantuml-render big.puml --outline bold -o big.svg
plantuml-render big.puml --token --pr-stroke=#334155 --token --pr-stroke-width=2 -o big.svg
```

`--outline bold` is the one combination with a name: the darkest border at two
pixels, for a large diagram that will be shown small. `--token` sets any token
at all, and a later one wins. From the API it is `renderSvg(ir, { tokens })`.

## Static image

`<img src="diagram.svg">` also works, with one caveat: browsers do not run
links or scripts inside an image. Use inline SVG for navigation.

## Batch

```
plantuml-render render design/ -o site/svg/
```

renders every `.puml` under `design/` into `site/svg/`, one file per diagram.
