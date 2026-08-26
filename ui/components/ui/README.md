# BFL UI component variants

## SelectorGroup

`SelectorGroup` is the shared exclusive-choice primitive. Colour, signal and
elevation remain theme tokens; the variant describes control anatomy.

| Variant | Anatomy | Current use |
|---|---|---|
| `tabs` | Flat/outside tool or surface launcher | Workspace modes, dashboard tabs, script views |
| `segmented` | Contained, indented two-part selector | Header Image / Video domain |
| `raised` | Compact raised radio-card selector | Magic/Cinematic/Moonlit and Jungle/Desert/Lab |
| `icon-rail` | Bare icon-only exclusive selector | Collapsed Prompt Library Image / Video rail |

Use `SelectorOption` inside the group. It owns the shared `active` class,
`aria-pressed` state and variant marker. Product-specific classes may be added
for layout or semantic colour, but should not recreate selection behavior.
