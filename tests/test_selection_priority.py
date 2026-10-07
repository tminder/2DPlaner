"""F-057: once an element is selected, a click/drag starting at a point that's genuinely
stacked (a real sibling overlap, not just an ancestor coincidentally underlying it) prefers
the current selection over whatever's topmost -- the same tie-break D-146's own
handleContextMenu already had for right-click, now shared via preferSelectedAtPoint
(docs/interactivity-module.js) rather than duplicated. Click-cycling (D-077) still overrides
this afterward exactly as before; this only changes the *first* interaction at a fresh
point."""

import re

from helpers import drag, element_center, load_plan, source_text

# sofa/bett fully overlap (identical position/size) -- bett, declared last, paints on top
# and is the raw topmost hit; sofa is only reachable (before this feature) via click-cycling.
TWO_SIBLINGS = """
element room {
  shape: "rect"
  size: [3m, 2m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element sofa {
    shape: "rect"
    size: [1m, 0.6m]
    position: [1m, 0.7m]
    style: { fill: "#8ab" }
  }
  element bett {
    shape: "rect"
    size: [1m, 0.6m]
    position: [1m, 0.7m]
    style: { fill: "#e88" }
  }
}
"""

NON_OVERLAPPING = """
element room {
  shape: "rect"
  size: [3m, 2m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element sofa {
    shape: "rect"
    size: [1m, 0.6m]
    position: [0.2m, 0.2m]
    style: { fill: "#8ab" }
  }
  element bett {
    shape: "rect"
    size: [1m, 0.6m]
    position: [1.8m, 1.2m]
    style: { fill: "#e88" }
  }
}
"""


def position_of(text, node_id):
    m = re.search(node_id + r" \{[^}]*position: \[(-?[\d.]+)m, (-?[\d.]+)m\]", text, re.S)
    return m.groups() if m else None


def select_via_cycling(page, cx, cy, target_id):
    """Click-cycles at (cx, cy) until target_id is selected -- D-077's own established
    mechanism, the only way to reach a fully-covered sibling via the canvas at all."""
    for _ in range(4):
        if page.evaluate("document.getElementById('plan-root').dataset.selectedId") == target_id:
            return
        page.mouse.click(cx, cy)
        page.wait_for_timeout(150)
    assert page.evaluate("document.getElementById('plan-root').dataset.selectedId") == target_id


def test_drag_at_a_stacked_point_moves_the_selection_not_the_topmost(app_page):
    load_plan(app_page, TWO_SIBLINGS)
    cx, cy = element_center(app_page, "bett")
    select_via_cycling(app_page, cx, cy, "sofa")

    # Starts a few px away from the selecting click -- outside CLICK_CYCLE_TOLERANCE_PX (4px)
    # so this reads as a fresh interaction, not another step of the same cycle, while still
    # landing well inside both fully-overlapping rects.
    before = source_text(app_page)
    drag(app_page, cx + 20, cy + 15, cx + 80, cy + 55)
    after = source_text(app_page)

    assert position_of(after, "sofa") != position_of(before, "sofa")
    assert position_of(after, "bett") == position_of(before, "bett")


def test_right_click_at_a_stacked_point_still_targets_the_selection_too(app_page):
    """Confirms D-146's own existing behavior still holds after preferSelectedAtPoint was
    factored out for drag to share -- not just assumed unchanged."""
    from helpers import menu_items, open_context_menu

    load_plan(app_page, TWO_SIBLINGS)
    cx, cy = element_center(app_page, "bett")
    select_via_cycling(app_page, cx, cy, "sofa")

    open_context_menu(app_page, cx + 20, cy + 15)
    items = menu_items(app_page)
    # sofa is declared first -> not yet frontmost in source -- Bring to Front only appears
    # if the menu actually targeted sofa (the selection), not bett (the raw topmost hit).
    assert "Bring to Front" in items


def test_an_unrelated_non_overlapping_point_is_unaffected_topmost_still_wins(app_page):
    load_plan(app_page, NON_OVERLAPPING)
    # Select sofa, then drag starting on bett's own, non-overlapping point -- not stacked at
    # all, so topmost-wins (ordinary, pre-F-057 behavior) must still apply: bett moves.
    sx, sy = element_center(app_page, "sofa")
    app_page.mouse.click(sx, sy)
    app_page.wait_for_timeout(150)
    assert app_page.evaluate("document.getElementById('plan-root').dataset.selectedId") == "sofa"

    bx, by = element_center(app_page, "bett")
    before = source_text(app_page)
    drag(app_page, bx, by, bx + 40, by + 25)
    after = source_text(app_page)

    assert position_of(after, "bett") != position_of(before, "bett")
    assert position_of(after, "sofa") == position_of(before, "sofa")


def test_click_cycling_still_steps_through_the_stack_unchanged(app_page):
    load_plan(app_page, TWO_SIBLINGS)
    cx, cy = element_center(app_page, "bett")
    app_page.mouse.click(cx, cy)
    app_page.wait_for_timeout(150)
    first = app_page.evaluate("document.getElementById('plan-root').dataset.selectedId")
    app_page.mouse.click(cx, cy)
    app_page.wait_for_timeout(150)
    second = app_page.evaluate("document.getElementById('plan-root').dataset.selectedId")
    assert first == "bett"  # topmost, no prior selection to prefer
    assert second == "sofa"  # cycled to the other stacked sibling
