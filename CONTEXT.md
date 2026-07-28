# Stream Schedule Builder

A single-page tool for streamers to design a schedule graphic — one visual per day of the week, arranged on a canvas — and export it as an image or post it to Discord.

## Language

**Day**:
One of the seven fixed calendar identifiers (`monday`…`sunday`) used as a key. Never created or destroyed, has no content of its own.

**Day Card**:
The persistent record for a Day — its time, title, position, style, and on/off state. Survives even when not currently shown as a Box (e.g. while `enabled` is false), so re-enabling a Day restores its content exactly as it was.
_Avoid_: Day (when referring to the record, not the calendar key)

**Box**:
The rendered visual instance of a Day Card on the Board. Exists 1:1 with a Day Card that is not Hidden — one Box per visible Day Card, never more, never without a backing Day Card.
_Avoid_: day-box (as a concept name; fine as the CSS/DOM class)

**Hidden**:
A Day Card excluded from the schedule graphic entirely — no Box is rendered for it. Governs canvas real estate (e.g. a streamer who only streams 5 days doesn't want the other 2 cluttering the graphic). A Hidden Day Card keeps its content and position in the record; unhiding restores it unchanged.
_Avoid_: disabled, enabled=false

**Dark day**:
A Day Card that is shown on the Board (not Hidden) but deliberately carries no stream time — its Box displays a "no stream" label instead of a time. Communicates to the viewer that the gap is intentional, not a mistake. Mutually exclusive with Hidden in practice: a Dark day only means something once its Box is visible.
_Avoid_: noStream, off day, disabled

**Board**:
The editable surface where Boxes are arranged, dragged, and resized. Its shape is driven by the current Format.
_Avoid_: canvas (as a concept name; fine as the `#schedule-canvas` DOM id)

**Format**:
The chosen aspect ratio and resolution for the schedule graphic — e.g. `16:9`, `1:1`, `9:16`. Shapes the Board and determines the pixel dimensions of the Render.
_Avoid_: canvas preset, resolution

**Render**:
The rasterized bitmap produced from the Board at export time, composited with the background image and posted to Discord or downloaded. Distinct from the Board itself — the Board is what's edited, the Render is what's produced.
_Avoid_: canvas, export canvas

**Neighbor snap**:
Implicit, proximity-based alignment applied to a Box's position when a drag is released — pulls its edges/center to line up with nearby Boxes on the Board within a threshold. Relative to other Boxes, not the Board itself.
_Avoid_: snap, snapping (without qualifier)

**Column align**:
Explicit, button-triggered alignment that jumps a Box to the left, center, or right of the Board's own usable width, ignoring every other Box. Horizontal only — there is no vertical counterpart today.
_Avoid_: snap, snap to column (without qualifier)
