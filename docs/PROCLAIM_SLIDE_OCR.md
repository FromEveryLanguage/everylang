# Getting Slide Text by OCR

Proclaim's local API ([PROCLAIM_DATA_FORMAT.md](PROCLAIM_DATA_FORMAT.md)) has no
endpoint that returns slide text, but it does return each slide as a rendered PNG.
For slides with black backgrounds (like my church uses), these would OCR almost perfectly. This gives us the
text exactly as Proclaim split it into slides, which the SQLite database cannot (see
"Slide Splitting" in the data-format doc).

Status: explored on 2026-11-07 against Proclaim 4.22 on macOS. Nothing in the service
uses this yet.

## Fetching images

```
GET /presentations/onair/items/{serviceItemId}/slides/{slideIndex}/image
    ?localRevision=0&width=1280&longPolling=true[&confidence=true]
OnAirSessionId: <from GET /onair/session>
```

- **Speed:** with `longPolling=true`, each image took about 0.25 s.
- **Without `longPolling`:** a slide that hasn't been rendered yet returns
  `202 {"completionEstimateMs": 250}`.
- **Width:** 1280 px is plenty for OCR, and smaller probably works too. Height follows
  the presentation's aspect ratio, so 1280 gives 1280×720 at 16:9.
- **Which slides exist:** the `slides` list per item in `/presentations/onair` gives the
  valid `slideIndex` values.
- **On air only:** this only works while the presentation is on air.

## What the images look like

Every sample was white text on a black background, with no background images or
motion. Other themes may differ, and an `ImageSlideshow` item is just pictures.

- **Normal slides** (what the audience sees):
  - Text is centered at a large size, with lines wrapped by Proclaim to fit the screen.
  - The line breaks match what the audience sees.
- **Confidence slides** (`confidence=true`, the stage-monitor view) are often more
  useful. Their layout, top to bottom:
  - the service item title, small and grey, e.g. "All Creatures Of Our God And King"
  - the slide text in large bold white. Long lines wrap with a hanging indent, so
    rejoin an indented line onto the line above it.
  - the first line of the next slide, small and grey, often cut short with "…"

  The title and next-line preview make it easy to check alignment with the database
  text, but strip them before using the text itself.
- **Bible passages:**
  - Verse numbers are inline, e.g. "1 Shout for joy to God, all the".
  - The reference and translation sit in a lower corner as separate lines, e.g.
    "Psalm 66:1-2" and "ESV".

## OCR engines

On these images all three engines tested below gave word-for-word output, line breaks
included. The test set was songs, prose prayers and a Bible passage, in both normal and
confidence variants.

| Engine | Platforms | Install | Speed (1280×720) | Tested |
|---|---|---|---|---|
| [RapidOCR](https://github.com/RapidAI/RapidOCR) (PaddleOCR models on ONNX Runtime) | Windows, macOS, Linux | `pip install rapidocr onnxruntime`. Pure pip; models ship in the wheel. | ~0.2–0.4 s on CPU (first call ~1.5 s) | ✅ perfect |
| Tesseract via `pytesseract` | Windows, macOS, Linux | Separate binary install (UB-Mannheim installer on Windows, Homebrew on macOS) | fast | ✅ perfect with `--psm 6` |
| macOS Vision (`VNRecognizeTextRequest`) | macOS only | Built in. From Python, use the `ocrmac` package (PyObjC). | fast | ✅ perfect (via a Swift script) |
| `Windows.Media.Ocr` (WinRT) | Windows 10+ only | Built in. From Python, use the `winrt-Windows.Media.Ocr` packages (PyWinRT). | — | ? untested |

**Recommendation: RapidOCR.**

- It runs the same code on Windows and macOS.
- It is a plain pip dependency, with no system install or PATH setup on the Proclaim
  machine.
- It returns bounding boxes, so you can tell apart the title, body and next-line
  regions of confidence slides.

We could use Tesseract as the fallback if the ONNX Runtime wheel causes trouble. The built-in
OS engines are fine too, but each needs its own platform-specific code.

## Example (Python, RapidOCR)

Tested against a live Proclaim session:

```python
import httpx
from rapidocr import RapidOCR

BASE = "http://127.0.0.1:52195"
ocr = RapidOCR()

def slide_lines(client, session_id, item_id, index, confidence=False, width=1280):
    r = client.get(
        f"{BASE}/presentations/onair/items/{item_id}/slides/{index}/image",
        params={"localRevision": 0, "width": width, "longPolling": "true",
                "confidence": str(confidence).lower()},
        headers={"OnAirSessionId": session_id},
        timeout=30,
    )
    r.raise_for_status()  # 202 only happens without longPolling
    result = ocr(r.content)  # accepts PNG bytes
    if not result.txts:
        return []
    # Sort top-to-bottom by the top-left y of each box.
    rows = sorted(zip(result.boxes, result.txts), key=lambda bt: bt[0][0][1])
    return [txt for _, txt in rows]

with httpx.Client() as client:
    sid = client.get(f"{BASE}/onair/session").text  # bare hex; empty (204) if off air
    status = client.get(f"{BASE}/onair/statusChanged",
                        headers={"OnAirSessionId": sid}).json()["status"]
    print(slide_lines(client, sid, status["itemId"], status["slideIndex"]))
    # -> ['1 Shout for joy to God, all the', 'earth;', 'Psalm 66:1-2', 'ESV']
```

Sorting by y works for single-column slides. On slides with text side by side,
same-row boxes would need grouping by x.

## Ways to use it

1. **Pre-service sweep:**
   - When the presentation goes on air, walk every item and slide index from
     `/presentations/onair`. Skip `ImageSlideshow` items and empty `Grouping` items.
   - OCR each slide. A typical service was about 160 slides, so roughly a minute on CPU.
   - Compare the results with the database-derived split, and flag items where slide
     counts or text boundaries disagree.
2. **Live:**
   - Long-poll `/onair/statusChanged?localRevision=…&step=…`.
   - On each change, OCR the current slide. Cache the result by
     `(itemId, slideIndex, slide.localRevision)`.
   - This gives the on-screen text even for items that were edited on the fly.

## Caveats

- **Brittleness:** OCR text is not byte-identical to the source. Watch smart quotes,
  em dashes, ligatures ("ff", "fi") and rare proper names. Use OCR to align or check the
  database text rather than replace it, for example by fuzzy-matching OCR lines to
  database lines.
- **Busy slides:** slides with background images or video, or styled text such as
  outlines and shadows, will OCR worse. None appeared in the sample presentation.
- **Translation screens:** the renderer has exactly two outputs, `MainDisplay` and
  `ConfidenceDisplay` (the `OutputSlideKind` enum in `Proclaim.Common.dll`), and the API
  has no parameter for choosing a virtual screen. So alternate-language
  (`SlidesAlternateContent`) text still has to come from the database.
