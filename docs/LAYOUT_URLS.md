# Layout URLs

The landing page covers the usual cases: one tap per language. Anything else is a URL you
type or bookmark, for example a booth display, a second screen, or a combination nobody has
made a card for. This page is for building those URLs by hand.

## The grammar

The path is a list of panes:

- `|` separates **columns**. They sit side by side on a wide screen and stack on a phone.
- `,` stacks panes **within** a column.

So `/a,b|c` is `a` above `b` on the left, with `c` on the right. The definition is
`parseLayoutString` in [src/App.tsx](../src/App.tsx). The pane names are the `PagePart`
branches in the same file; an unknown name renders an "Unknown component" card rather than
breaking the page, so a typo is visible.

Text panes take a language's **display name** (`French`, `Haitian Creole`, URL-encoded as
`Haitian%20Creole` if your tool insists). `listen-` takes a **BCP-47 code** (`fr`, `pt`).
That split is historical, and the cache keys depend on the display names
([LANDING_PAGE.md §7](LANDING_PAGE.md#7-open-questions-for-review)).

## Examples

| You want | URL |
|---|---|
| English speaker: the slide, with the live transcript under it | `/currentSlide,listen-en` |
| French slides and audio, side by side on a laptop | `/slideTranslation-French\|listen-fr` |
| French audio only, no slides | `/listen-fr` |
| Booth screen: original slide beside its French translation | `/currentSlide\|slideTranslation-French` |
| Sermon notes, French beside the original | `/bilingual-French` |
| Note-taker (needs a write key) | `/sourceText\|bilingual-French#editor` |

Append `?locale=fr` (or `es`, `ht`) to switch the interface language, and `?doc=…` to look
at a session other than the current one ([CURRENT_SESSION.md](CURRENT_SESSION.md)).

Inside any layout, a pane's own language picker rewrites the URL in place, so you can start
from a close example and change languages from there. Adding or removing a pane means
editing the URL.

If one of these gets used a lot, that's the case for giving it a card on the landing page.
