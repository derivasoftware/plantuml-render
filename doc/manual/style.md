# Style tokens

All of these are CSS custom properties declared on `.pr-diagram` in the SVG.
Override them from the host page or from the theme block of your site, or bake
them into a drawing that has no host page with `--token name=value` on the
command line (`renderSvg(ir, { tokens })` from the API).

| Token | Role |
|---|---|
| `--pr-font` | monospace stack for all text |
| `--pr-text`, `--pr-muted`, `--pr-name` | text, secondary text, entity names |
| `--pr-type`, `--pr-param`, `--pr-punct` | syntax colours of members |
| `--pr-vis-public/private/protected/package` | visibility dots |
| `--pr-box-fill`, `--pr-stroke`, `--pr-edge` | surfaces and lines |
| `--pr-head-class/interface/enum/function/abstract` | header bands |
| `--pr-badge-*` | classifier badge per kind |
| `--pr-container-fill`, `--pr-container-stroke` | namespaces and packages |
| `--pr-note-fill`, `--pr-note-stroke` | notes |
| `--pr-stroke-width`, `--pr-container-stroke-width` | how hard box and container borders read |
| `--pr-edge-width` | how thick a relation's line is |
| `--pr-port-in`, `--pr-port-out` | boundary port squares, by direction |

`--outline bold` on the command line is shorthand for the darkest borders at
two pixels, which is what a large diagram shown small needs.

Dark values are provided under `prefers-color-scheme: dark` and under
`[data-theme="dark"]`; light ones under the bare selector and
`[data-theme="light"]`.

## The arrowhead

`--pr-arrow-size` scales every arrowhead, as a multiple of its natural size:

```
plantuml-render flow.puml --token --pr-arrow-size=0.6 -o flow.svg
```

It is the one token the renderer reads itself rather than leaving to the
browser, because an arrowhead's size lives in marker attributes that CSS cannot
reach — so unlike the colours, it cannot be overridden from a host page after
the fact. Anything that is not a positive number is ignored, and the scale is
capped at four. On a diagram of many short wires the natural size reads as
mostly arrowhead; pair a smaller head with a slightly thicker `--pr-edge-width`
and the wires come back.

## Sequence frames

`--pr-frame-alt`, `--pr-frame-loop`, `--pr-frame-opt`, `--pr-frame-par` and
`--pr-frame-other` colour the border, the keyword tab and the condition
pills of each frame kind; each has a light and a dark value. A frame's
group carries `pr-frame-<kind>` and `pr-depth-<n>` for finer overrides.
