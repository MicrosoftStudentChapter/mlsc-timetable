# Card Themes

Each theme is a single CSS file that fully owns the visual look of class cards
(background, fonts, borders, shadows, hover, type badge, room pill, edit btn).
Layout (sizes, positioning, flex direction, grid lines) stays in
`TimetableGrid.css` and is shared across all themes.

## How a theme is applied

The grid container carries `data-card-theme="<name>"`. Every theme file scopes
its rules with that attribute so themes never bleed into each other:

```css
[data-card-theme="<name>"] .tt-class-card { ... }
[data-card-theme="<name>"] .tt-type-badge { ... }
[data-card-theme="<name>"] .tt-card-subject { ... }
[data-card-theme="<name>"] .tt-card-code { ... }
[data-card-theme="<name>"] .tt-card-room { ... }
[data-card-theme="<name>"] .tt-class-card:hover { ... }
[data-card-theme="<name>"] .tt-edit-btn { ... }
```

## Adding a new theme

1. Copy `default.css` to `<your-name>.css`.
2. Find/replace `"default"` with `"<your-name>"` in the selectors.
3. Edit freely — bg, gradients, SVG patterns, fonts, anything.
4. Add `@import './<your-name>.css';` to `index.css`.
5. The theme is now selectable by setting
   `data-card-theme="<your-name>"` on `.tt-grid-frame`.

## Files

- `default.css`  — clean white with type-tinted borders (current look).
- `aurora.css`   — gradient bg, glassy look, soft serif accents.
- `paper.css`    — off-white paper with dotted SVG bg, monospace meta.
- `custom.css`   — empty stub that reads inline CSS variables, so user-picked
  colors/bg can be injected from React (`style={{ '--card-bg': ..., ... }}`).
