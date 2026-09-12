"""F-019/F-021: click-cycling, the stack-hint badge, hover-dim, and the outside-attachment
exclusion -- the most fragile subsystem per the tech-debt audit (S-006), having needed
four same-day bug-fix rounds (D-086, D-088, D-090, D-091) before settling. D-164 later
replaced D-086's own bringToFront (a DOM reorder on selection) with dimming whatever
currently occludes the selection instead -- covered near the bottom of this file."""

from helpers import (
    click_menu_item,
    element_center,
    empty_canvas_point,
    load_plan,
    open_context_menu,
    selected_id,
    stack_badge_lines,
)

THREE_WAY_STACK = """
element zimmer {
  shape: "rect"
  size: [3m, 2m]
  position: [0m, 0m]
  style: { fill: "#eee" }
  label: "Zimmer"

  element sofa {
    shape: "rect"
    size: [1m, 0.6m]
    position: [1m, 0.7m]
    style: { fill: "#8ab" }
    label: "Sofa"
  }
  element bett {
    shape: "rect"
    size: [1m, 0.6m]
    position: [1m, 0.7m]
    style: { fill: "#e88" }
    label: "Bett"
  }
}
"""

OUTSIDE_ATTACHED_PLAN = """
element room {
  shape: "rect"
  size: [3m, 2m]
  position: [0m, 0m]
  style: { fill: "#eee" }
  childPlacement: "inside"

  element fenster {
    shape: "rect"
    size: [0.8m, 0.1m]
    position: [1m, -0.05m]
    placement: "outside"
    style: { fill: "#8cf" }
  }
  element sofa {
    shape: "rect"
    size: [1m, 0.6m]
    position: [1.8m, 0.7m]
    style: { fill: "#8ab" }
  }
  element bett {
    shape: "rect"
    size: [1m, 0.6m]
    position: [1.8m, 0.7m]
    style: { fill: "#e88" }
  }
}
"""


def test_click_cycling_reaches_every_element_and_wraps(app_page):
    load_plan(app_page, THREE_WAY_STACK)
    cx, cy = element_center(app_page, "bett")
    seen = []
    for _ in range(5):
        app_page.mouse.click(cx, cy)
        app_page.wait_for_timeout(120)
        seen.append(selected_id(app_page))
    assert len(set(seen[:3])) == 3, seen  # bett, sofa, zimmer (the root) -- three unique
    assert seen[0] == seen[3]  # wraps back to the start after one full cycle


def test_stack_badge_lists_every_candidate_with_moving_marker(app_page):
    load_plan(app_page, THREE_WAY_STACK)
    cx, cy = element_center(app_page, "bett")
    app_page.mouse.move(cx, cy)
    app_page.wait_for_timeout(150)
    lines = stack_badge_lines(app_page)
    labels = {text.strip() for text, _ in lines}
    assert labels == {"Bett", "Sofa", "Zimmer"}
    first_current = [text.strip() for text, current in lines if current]
    assert first_current == ["Bett"]

    # First click only selects whatever's already topmost (matching the hover default);
    # a click-cycle only advances on a *second* click at the same point.
    app_page.mouse.click(cx, cy)
    app_page.wait_for_timeout(120)
    app_page.mouse.click(cx, cy)  # now cycles to sofa
    app_page.wait_for_timeout(150)
    lines2 = stack_badge_lines(app_page)
    # the list itself must not reorder -- only the marker moves
    assert [t.strip() for t, _ in lines2] == [t.strip() for t, _ in lines]
    now_current = [text.strip() for text, current in lines2 if current]
    assert now_current == ["Sofa"]


def test_hover_dims_every_stacked_element_together(app_page):
    load_plan(app_page, THREE_WAY_STACK)
    cx, cy = element_center(app_page, "bett")
    app_page.mouse.move(cx, cy)
    app_page.wait_for_timeout(150)
    dims = app_page.evaluate(
        """() => ['bett', 'sofa', 'zimmer'].map(
            id => document.querySelector(`[data-id="${id}"]`).classList.contains('stacked-dim')
        )"""
    )
    assert dims == [True, True, True]

    app_page.mouse.move(5, 5)
    app_page.wait_for_timeout(150)
    dims_after = app_page.evaluate(
        """() => ['bett', 'sofa', 'zimmer'].map(
            id => document.querySelector(`[data-id="${id}"]`).classList.contains('stacked-dim')
        )"""
    )
    assert dims_after == [False, False, False]


def test_entering_via_non_overlapping_region_then_moving_into_overlap(app_page):
    """D-091: a large element's own non-overlapping region must not suppress the hint
    once the cursor moves (still inside the same element, no fresh pointerover) into the
    part that does overlap something else."""
    load_plan(
        app_page,
        """
element zimmer {
  shape: "rect"
  size: [3m, 2m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element teppich {
    shape: "rect"
    size: [0.5m, 0.5m]
    position: [1.2m, 0.5m]
    style: { fill: "#8ab" }
  }
  element bett {
    shape: "rect"
    size: [2m, 1m]
    position: [0.2m, 0.2m]
    style: { fill: "#e88" }
  }
}
""",
    )
    bett_box = app_page.locator('[data-id="bett"]').bounding_box()
    teppich_box = app_page.locator('[data-id="teppich"]').bounding_box()

    app_page.mouse.move(bett_box["x"] + 5, bett_box["y"] + 5)
    app_page.wait_for_timeout(150)
    assert app_page.evaluate("document.getElementById('interactivity-stack-badge').hidden") is True

    app_page.mouse.move(
        teppich_box["x"] + teppich_box["width"] / 2,
        teppich_box["y"] + teppich_box["height"] / 2,
        steps=15,
    )
    app_page.wait_for_timeout(150)
    assert app_page.evaluate("document.getElementById('interactivity-stack-badge').hidden") is False


def test_outside_attached_element_does_not_count_as_stacked(app_page):
    load_plan(app_page, OUTSIDE_ATTACHED_PLAN)
    fenster_box = app_page.locator('[data-id="fenster"]').bounding_box()
    app_page.mouse.move(
        fenster_box["x"] + fenster_box["width"] / 2,
        fenster_box["y"] + fenster_box["height"] - 2,
    )
    app_page.wait_for_timeout(150)
    assert app_page.evaluate("document.getElementById('interactivity-stack-badge').hidden") is True

    # a genuine, unrelated stack elsewhere in the same plan must still trigger normally.
    bett_cx, bett_cy = element_center(app_page, "bett")
    app_page.mouse.move(5, 5)
    app_page.wait_for_timeout(100)
    app_page.mouse.move(bett_cx, bett_cy)
    app_page.wait_for_timeout(150)
    assert app_page.evaluate("document.getElementById('interactivity-stack-badge').hidden") is False


def test_badge_order_reflects_a_reorder_instead_of_a_stale_cache(app_page):
    """S-005: the badge's own stacking order used to be cached by id-set and never
    invalidated, so reordering two siblings via the right-click menu and then re-hovering
    the exact same point kept showing the pre-reorder order -- confirmed live before the
    fix. Order should now always match a fresh sample of what's actually on top."""
    load_plan(app_page, THREE_WAY_STACK)
    cx, cy = element_center(app_page, "bett")
    app_page.mouse.move(cx, cy)
    app_page.wait_for_timeout(150)
    before = [text.strip() for text, _ in stack_badge_lines(app_page)]
    assert before == ["Bett", "Sofa", "Zimmer"]

    open_context_menu(app_page, cx, cy)
    click_menu_item(app_page, "Send to Back")

    # Move away and re-hover the exact same point -- a stale, never-invalidated cache
    # would still return the pre-reorder order here even though paint order actually
    # changed (bett now declared first, so sofa paints on top of it).
    app_page.mouse.move(5, 5)
    app_page.wait_for_timeout(100)
    app_page.mouse.move(cx, cy)
    app_page.wait_for_timeout(150)
    after = [text.strip() for text, _ in stack_badge_lines(app_page)]
    assert after == ["Sofa", "Bett", "Zimmer"]

    ground_truth = app_page.evaluate(
        f"""() => Array.from(document.elementsFromPoint({cx}, {cy}))
            .map(el => el.closest && el.closest('[data-id]')?.dataset.id)
            .filter(Boolean)"""
    )
    assert ground_truth[0] == "sofa"


def test_selecting_a_covered_element_dims_its_occluder_without_reordering_the_dom(app_page):
    """D-164, replacing D-086's own bringToFront: selecting a stacked/covered element used
    to raise its whole subtree to the end of the SVG (a real DOM reorder) so it would paint
    on top. Now paint order is left alone entirely, and whatever's currently painted in
    front of the selection -- at a point where the two actually overlap -- gets dimmed
    instead, persisting for as long as it stays selected (not just during a hover, unlike
    the F-021 stack-hint's own .stacked-dim -- this uses its own separate .occlusion-dim
    class, see its own comment in interactivity-module.js for why sharing one is a bug)."""
    load_plan(app_page, THREE_WAY_STACK)
    cx, cy = element_center(app_page, "bett")
    before_order = app_page.evaluate(
        """() => Array.from(document.querySelector('#plan-root svg').children)
            .map(c => c.dataset && c.dataset.id).filter(Boolean)"""
    )

    app_page.mouse.click(cx, cy)  # selects bett (topmost)
    app_page.wait_for_timeout(120)
    app_page.mouse.click(cx, cy)  # cycles to sofa, which bett now paints in front of
    app_page.wait_for_timeout(150)
    assert selected_id(app_page) == "sofa"

    after_order = app_page.evaluate(
        """() => Array.from(document.querySelector('#plan-root svg').children)
            .map(c => c.dataset && c.dataset.id).filter(Boolean)"""
    )
    assert after_order == before_order  # no DOM reorder at all, unlike the old bringToFront

    # Moved away from the stack point first -- otherwise F-021's own independent *hover*
    # dim (still active, cursor still sitting exactly on the overlap after the click) would
    # also mark sofa (the whole hovered group dims together, selected or not), muddying
    # what's actually being tested here: dimming driven by *selection*, not by hover.
    app_page.mouse.move(5, 5)
    app_page.wait_for_timeout(150)
    dims = app_page.evaluate(
        """() => ({
            bett: document.querySelector('[data-id="bett"]').classList.contains('occlusion-dim'),
            sofa: document.querySelector('[data-id="sofa"]').classList.contains('occlusion-dim'),
        })"""
    )
    assert dims == {"bett": True, "sofa": False}  # the occluder dims, the selection itself doesn't


def test_deselecting_removes_the_occlusion_dim(app_page):
    load_plan(app_page, THREE_WAY_STACK)
    cx, cy = element_center(app_page, "bett")
    app_page.mouse.click(cx, cy)
    app_page.wait_for_timeout(120)
    app_page.mouse.click(cx, cy)  # selects sofa, bett dims as its occluder
    app_page.wait_for_timeout(150)
    app_page.mouse.move(5, 5)  # away from the stack -- isolates selection-dim from hover-dim
    app_page.wait_for_timeout(150)
    assert app_page.evaluate("document.querySelector('[data-id=\"bett\"]').classList.contains('occlusion-dim')")

    ex, ey = empty_canvas_point(app_page, "zimmer", 0.5, "bottom")
    app_page.mouse.click(ex, ey)  # empty canvas -- deselects
    app_page.wait_for_timeout(150)
    app_page.mouse.move(5, 5)
    app_page.wait_for_timeout(150)
    assert not app_page.evaluate("document.querySelector('[data-id=\"bett\"]').classList.contains('occlusion-dim')")


def test_selecting_a_container_does_not_dim_its_own_children(app_page):
    """A container's own children always paint after it and usually sit inside its own
    bounds -- normal nesting, not something to dim away just because the container itself
    got selected."""
    load_plan(app_page, THREE_WAY_STACK)
    cx, cy = element_center(app_page, "bett")
    app_page.mouse.click(cx, cy)
    app_page.wait_for_timeout(120)
    app_page.mouse.click(cx, cy)
    app_page.wait_for_timeout(120)
    app_page.mouse.click(cx, cy)  # third click in the cycle: zimmer, the shared root
    app_page.wait_for_timeout(150)
    assert selected_id(app_page) == "zimmer"

    app_page.mouse.move(5, 5)  # away from the stack -- isolates selection-dim from hover-dim
    app_page.wait_for_timeout(150)
    dims = app_page.evaluate(
        """() => ['bett', 'sofa'].map(
            id => document.querySelector(`[data-id="${id}"]`).classList.contains('occlusion-dim')
        )"""
    )
    assert dims == [False, False]


def test_click_cycling_still_reaches_every_element_after_a_mid_cycle_reorder(app_page):
    load_plan(app_page, THREE_WAY_STACK)
    cx, cy = element_center(app_page, "bett")
    app_page.mouse.click(cx, cy)
    app_page.wait_for_timeout(120)
    assert selected_id(app_page) == "bett"

    open_context_menu(app_page, cx, cy)
    click_menu_item(app_page, "Send to Back")

    seen = []
    for _ in range(4):
        app_page.mouse.click(cx, cy)
        app_page.wait_for_timeout(120)
        seen.append(selected_id(app_page))
    # Every element in the stack is reached and it wraps -- the exact step immediately
    # after a mid-cycle reorder can skip one position (the just-reordered element's own
    # rank shifted, so "one past it" now means something different than before), a
    # self-correcting, one-off consequence of always recomputing fresh rather than a bug.
    assert set(seen) == {"zimmer", "sofa", "bett"}
    assert seen[-1] == seen[0]
