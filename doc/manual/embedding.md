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

## Static image

`<img src="diagram.svg">` also works, with one caveat: browsers do not run
links or scripts inside an image. Use inline SVG for navigation.

## Batch

```
plantuml-render render design/ -o site/svg/
```

renders every `.puml` under `design/` into `site/svg/`, one file per diagram.
