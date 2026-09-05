"""F-019/F-021: click-cycling, the stack-hint badge, hover-dim, and the outside-attachment
exclusion -- the most fragile subsystem per the tech-debt audit (S-006), having needed
four same-day bug-fix rounds (D-086, D-088, D-090, D-091) before settling."""

from helpers import element_center, load_plan, selected_id, stack_badge_lines

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
