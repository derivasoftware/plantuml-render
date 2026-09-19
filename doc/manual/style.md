# Style tokens

All colours are CSS custom properties declared on `.pr-diagram` in the SVG.
Override them from the host page or from the theme block of your site.

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

Dark values are provided under `prefers-color-scheme: dark` and under
`[data-theme="dark"]`; light ones under the bare selector and
`[data-theme="light"]`.
