# Proclaim Data Format

This documents the parts of Proclaim's local API and SQLite database format that we use.

## Local API (port 52195)

Faithlife Proclaim runs an HTTP server on port 52195 called the "Local Remote" service.
It is the API that Proclaim's remote-control app uses. Notes below are from Proclaim
4.22 on macOS, which reports Local Remote version 1.4.0.0.

**Proclaim documents this API itself.** While Proclaim is running:

- `GET /docs/openapi.json` returns an OpenAPI 3 spec.
- `GET /docs` serves a Swagger UI for that spec. It loads its assets from unpkg, so it
  needs internet access.

The spec is mostly accurate; the places where it is wrong are noted below. The route
list here is complete. It was checked against a decompile of the route table
(`Logos.Proclaim.Common.EmbeddedWebServer` in `Proclaim.Common.dll`).

**No endpoint returns slide text or service-item content.** Text is only available as a
rendered image, so for text we use the SQLite database (below) or OCR the slide images
([PROCLAIM_SLIDE_OCR.md](PROCLAIM_SLIDE_OCR.md)). The client DTO assembly does define a
`LocalRemoteSlideConfidenceDto`, with fields `Title`, `MainContent`, `SongPartHeading`,
`NextSlidePreviewLine`, `HymnNumber` and `BibleReference`. As of 4.22 no route returns
it.

### Conventions

- **JSON casing:** request and response JSON uses camelCase. The spec incorrectly shows PascalCase.
- Fields with **null:** value are left out of the response.
- **Errors:** errors look like `{"errorCode": "PresentationNotOnAir"}`. The possible codes
  are `Unknown`, `AccessDenied`, `GeneralConnectionFailure`, `CannotLoadImage`,
  `ItemNotFound` and `PresentationNotOnAir`.
- **`OnAirSessionId` header:** on-air routes need this header, set to the value from
  `GET /onair/session`. Without it, or with a stale value, they return
  `404 PresentationNotOnAir`.
- **CORS:** responses send `Access-Control-Allow-Origin: *` and
  `Access-Control-Allow-Private-Network: true`.
- **Timestamps** (`dateGiven`, `startTime` and the per-slide `localRevision` values) these are .NET ticks (100 ns units since 0001-01-01), *not Unix time*. To convert:
  `unix_seconds = (ticks - 621355968000000000) / 10_000_000`.

### Read-only endpoints (what we use)

- **GET /** returns a JSON string like `"Hello from Proclaim Local Remote version 1.4.0.0"`.
  It works as a liveness check.
- **GET /onair/session** returns the on-air session ID.
  - The ID is a bare 32-character hex string with no hyphens and no JSON quotes, e.g.
    `4722b03b36a44036b28f66725d4ca401`.
  - When nothing is on air it returns **`204` with an empty body**.
  - This ID is *not* the same as `sessionId` in `/presentations/onair`. Use this one for
    the `OnAirSessionId` header.
- **GET /presentations/onair** returns the on-air presentation. It requires the
  `OnAirSessionId` header.
  ```json
  {
    "sessionId": "2768bba0-4131-4e1b-9e69-84ec3008de38",
    "groupId": 4146860,
    "groupName": "New City Fellowship Grand Rapids",
    "id": "7e932701-7e6a-460e-9078-5122c058af53",
    "localRevision": 26869660,
    "title": "Sunday, Nov 1",
    "logoServiceItemId": "03449839-cadd-54a1-b0ea-b56237e9dd9b",
    "dateGiven": 639290880000000000,
    "startTime": 639296920602659370,
    "aspectRatio": "SixteenByNine",
    "warmupStartIndex": 3,
    "serviceStartIndex": 3,
    "postServiceStartIndex": 36,
    "serviceItems": [
      {
        "id": "eb4a51f2-0519-44bb-9911-ae04365b4c22",
        "title": "Call to Worship",
        "notes": "",
        "kind": "BiblePassage",
        "slides": [
          { "localRevision": 639296915371973960, "index": 0 },
          { "localRevision": 639296915371973960, "index": 1 }
        ]
      }
    ]
  }
  ```
  Field notes:
  - **`id`** is the presentation ID and matches `Presentations.PresentationId`, apart
    from hyphens. Service item `id`s match `ServiceItems.ServiceItemId` in the same way.
  - **`*___StartIndex`** fields are indexes into `serviceItems` that mark the warm-up,
    service and post-service sections.
  - **`slides` is Proclaim's actual slide list**, after its own automatic splitting. Its
    length is the real slide count for the item, so we could check our splitting of
    database text against it (see "Slide Splitting" below). `Grouping` items have an
    empty `slides` list.
  - **`quickScreens`** is only included when the `User-Agent` reports a new enough
    Proclaim remote-client version. Otherwise it is left out.
- **GET /onair/statusChanged** returns the current status. It requires the
  `OnAirSessionId` header and returns `404 PresentationNotOnAir` when off air.
  ```json
  {
    "presentationId": "7e932701-7e6a-460e-9078-5122c058af53",
    "presentationLocalRevision": 26869660,
    "status": {
      "revision": 3,
      "itemId": "eb4a51f2-0519-44bb-9911-ae04365b4c22",
      "slideIndex": 0,
      "quickScreenKind": "None",
      "mediaState": "Playing"
    }
  }
  ```
  - **Long polling:** pass `?localRevision=<presentationLocalRevision>&step=<status.revision>`.
    If those match the current state, the server holds the request for up to about a
    minute and responds as soon as the status changes. We could use this to poll less frequently.
  - **`status.revision`** is a "step" counter that goes up on every navigation.
  - **`presentationLocalRevision`** changes when the presentation is edited while on air.
    When it changes, re-fetch `/presentations/onair`.
  - **`status.quickScreen`, `status.quickScreenData`, `status.quickScreenKind`** describe
    an active quick screen, such as blank or logo.
  - **`ConnectionId` header (optional):** if sent, it marks a controller as still
    connected.
- **GET /presentations/onair/items/{serviceItemId}/slides/{slideIndex}/image** returns a
  rendered PNG of one slide, in the presentation's aspect ratio.
  - **Required query parameters:**
    - `localRevision`: `0` means the latest revision.
    - `width`: the image width in pixels.
  - **Optional query parameters:**
    - `confidence=true` renders the confidence-monitor version of the slide.
    - `longPolling=true` makes the request wait until rendering finishes.
  - **Without `longPolling`**, a slide that hasn't been rendered yet returns
    `202 {"completionEstimateMs": 250}`. Retry after that delay.
  - **Speed:** with `longPolling=true`, a 1280-px slide took about 0.25 s.
  - See [PROCLAIM_SLIDE_OCR.md](PROCLAIM_SLIDE_OCR.md) for what the images look like.
- **GET /presentations/onair/thumbnail?width=N[&longPolling=true]** returns a PNG of the
  presentation's first visible slide.

### Control endpoints (unused)

We don't use these routes. Ironically, these are the ones that are [officially documented](https://support.proclaim.logos.com/hc/en-us/articles/19864456647053-Proclaim-App-Command-API).

- **POST /config:** the client sends `{version, slideWidth}` and gets back
  `{version, isClientSupported}`.
- **POST /auth/control:** send `{userName, remoteDeviceName, password, faithlifeUserId?}`,
  where the password is the Local Remote password. The response is
  `{authenticationToken, connectionId}`. A wrong password returns 403.
- **GET /auth/disconnectcontrol:** releases control. Send the `ConnectionId` header.
- **POST /onair/statusChanged:** navigates the presentation. The body has the same shape
  as the GET response, and `status.revision` must be higher than the current value. It
  requires the `ProclaimAuthToken` header.
- **POST /appCommand/authenticate**, body `{password}`, returns `{proclaimAuthToken}`.
  - This is the App Commands feature, with its own password.
- **GET /appCommand/perform?appCommandName=X[&index=N]** runs an app command.
  - Command names are case-insensitive. Examples:
    - **Navigation:** `NextSlide`, `PreviousSlide`, `NextServiceItem`,
      `GoToServiceItem`, `GoToSlide` (both use `index`)
    - **On/off air:** `GoOnAir`, `GoOffAir`
    - **Service sections:** `StartPreService`, `StartWarmUp`, `StartService`,
      `StartPostService`
    - **Quick screens:** `ShowBlankQuickScreen`, `ShowLogoQuickScreen`,
      `ShowNoTextQuickScreen`
    - **Song parts:** `ShowSongLyricsChorus`, `ShowSongLyricsVerse1` through
      `ShowSongLyricsVerse9`, `ShowSongLyricsVerseByIndex`
    - **Video:** `VideoPlay`, `VideoPause`
    - The full list is in `Logos.Proclaim.Common.Model.AppCommandKind`.
  - **Requests from localhost skip authentication.**
  - It returns `success` as `text/plain`, or 404 for an unknown command.

## SQLite Database

Proclaim stores presentation data in a SQLite database at:

- **macOS**: `~/Library/Application Support/Proclaim/Data/<id>/PresentationManager/PresentationManager.db`
- **Windows**: `%LOCALAPPDATA%\Proclaim\Data\<id>\PresentationManager\PresentationManager.db`

There may be multiple `<id>` directories; we use the one with the most recently modified database.

### Tables

#### `Presentations`

| Column         | Type | Description                                    |
|---------------|------|------------------------------------------------|
| PresentationId | TEXT | UUID (no hyphens)                              |
| DateGiven      | TEXT | Date string (e.g., `"2025-03-02"`)             |
| Title          | TEXT | Presentation title                             |
| Content        | TEXT | JSON blob with presentation-level settings     |

The `Content` JSON includes:

- **`VirtualScreens`** — JSON string (yes, double-encoded) listing the output screens:
  ```json
  [
    { "name": "Main",         "outputKind": "Slides" },
    { "name": "Green Screen",  "outputKind": "Slides" },
    { "name": "French",        "outputKind": "SlidesAlternateContent" }
  ]
  ```
  We filter to screens with `outputKind` in `["Slides", "SlidesAlternateContent"]` and identify translation screens by name (containing "French" or "Haitian").

#### `ServiceItems`

| Column          | Type | Description                                          |
|----------------|------|------------------------------------------------------|
| ServiceItemId   | TEXT | UUID (no hyphens)                                    |
| PresentationId  | TEXT | FK to Presentations                                  |
| Title           | TEXT | Item title (e.g., "Call to Worship")                 |
| ServiceItemKind | TEXT | One of: `SongLyrics`, `Content`, `BiblePassage`, `ImageSlideshow`, `Grouping` |
| Content         | TEXT | JSON blob with item-specific data                    |

### ServiceItem Content JSON

The `Content` JSON structure varies by `ServiceItemKind`. All text content is stored as rich text XML (see below).

#### Common keys

- **`slideOutput:{N}:RichTextXml`** — The content for screen index N (0-based, but offset by -1 from VirtualScreens index). For example, if the translation screen is at VirtualScreens index 2, the translation content is at `slideOutput:1:RichTextXml`.
- **`slideOutput:{N}:MediaId`** — Media ID for screen N.

#### `SongLyrics`

- **`_richtextfield:Lyrics`** — Main lyrics in rich text XML.
- **`CustomOrderSequence`** — Comma-separated order string (e.g., `"V1, V2, C, V3, C, B, C"`).
- **`CustomOrderSlides`** — `"true"` if custom ordering is enabled.
- **`SongDisplayTitle`** — Optional title slide text.
- **`UseCustomTransition`** — `"true"` if using custom transitions.
- **`CustomTransitionKind`** — e.g., `"LyricScrolling"`.
- **`CustomTransitionDuration`** — e.g., `"0"`.
- **`ShowTitle`** - `"true"` if the title of a song is displayed
- **`TitleSlide`** - `"Title"`, `"Final"`, `"FirstLyric"`, or `"Every"`. Title and Final will add a title slide to the deck.

#### `Content`

- **`_richtextfield:Main Content`** — Main content in rich text XML.

#### `BiblePassage`

- **`_richtextfield:Passage`** — Passage text in rich text XML.
- **`_textfield:BibleReference`** — Reference string (e.g., `"Psalm 23:1-6"`).

## Rich Text XML

Text content in Proclaim is stored as rich text XML fragments. Each paragraph is a `<Paragraph>` element containing one or more `<Run>` elements with a `Text` attribute.

```xml
<Paragraph Language="en-US" Margin="0,0,0,0">
    <Run Text="First line of text" />
</Paragraph>
<Paragraph Language="en-US" Margin="0,0,0,0">
    <Run Text="Second line of text" />
</Paragraph>
<Paragraph Language="en-US" Margin="0,0,0,0" />
<Paragraph Language="en-US" Margin="0,0,0,0">
    <Run Text="After a blank line" />
</Paragraph>
```

- Each `<Paragraph>` becomes one line of text.
- Empty paragraphs (no `<Run>` children) become blank lines.
- Multiple `<Run>` elements within a paragraph are concatenated with spaces.
- The XML fragments are **not** wrapped in a root element; we wrap them in `<Song>...</Song>` for parsing.

## Song Section Format

Song lyrics are divided into labeled sections. A line matching a section type name acts as a section header:

| Section     | Shorthands in CustomOrderSequence |
|------------|-----------------------------------|
| Verse      | `V`, `V1`, `1`                   |
| Chorus     | `C`, `C1`                        |
| Pre-chorus | `P`, `P1`                        |
| Bridge     | `B` (if Bridge exists), `Bridge` |
| Tag        | `T`                              |
| Interlude  | `I`                              |
| Ending     | `Ending`                         |
| Blank      | `B` (if no Bridge section)       |

Lines in `{Braces}` are also treated as section labels (e.g., `{Credits}`, `{Source}`).

### Example lyrics text (after XML decoding)

```
Verse 1
Line one of verse one
Line two of verse one

Verse 2
Line one of verse two
Line two of verse two

Chorus
Line one of chorus
Line two of chorus

Bridge
Line one of bridge
```

With `CustomOrderSequence = "V1, V2, C, V1, C, B, C"`, the slides would be ordered as: Verse 1, Verse 2, Chorus, Verse 1 (again), Chorus, Bridge, Chorus.

## Slide Splitting

Within each section, text is split into individual slides:

- If the text contains `--`, only `--` lines are slide breaks (explicit delimiters). This is the reliable case.
- If there are **no `--` delimiters**, Proclaim automatically breaks text into slides based on how it fits on screen. We approximate this by treating blank lines as slide breaks, but this is fragile — Proclaim may keep text on one slide even across blank lines if it all fits, or break mid-paragraph if it doesn't. There is no way to know the exact breaks without rendering the text at the actual slide dimensions.
- Sections starting with `{Credits}` or `{Source}` are filtered out.

Because of this ambiguity, the validator warns when content items lack explicit `--` delimiters and have multiple slides — our view may be misaligned with the original.

### Ground truth from the API

While a presentation is on air, the API gives two ways we could check our splitting:

- **Slide counts:** `len(serviceItems[i].slides)` from `/presentations/onair` is
  Proclaim's real slide count for each item. If it differs from our split count, the
  alignment is wrong.
- **Slide text:** the rendered slide images show exactly where each break falls, and
  they OCR cleanly. See [PROCLAIM_SLIDE_OCR.md](PROCLAIM_SLIDE_OCR.md).
