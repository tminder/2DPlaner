"""A basic drag changes the element's position in the source; a plain click-to-select
(no movement) doesn't; undo/redo revert and reapply correctly (D-073).

F-072: a node with no position/points of its own (the plan root, or a plain grouping
container) renders only as an otherwise-invisible anchor-hit point -- dragging it must
reject cleanly with a message that actually explains why, not a raw id dump."""

from helpers import drag, drag_message, element_center, load_plan, source_text

PLAN = """
element room {
  shape: "rect"
  size: [3m, 2m]
  position: [0m, 0m]
  style: { fill: "#eee", stroke: "#333", strokeWidth: 0.03 }

  element table {
    shape: "rect"
    size: [0.8m, 0.5m]
    position: [0.3m, 0.3m]
    style: { fill: "brown" }
  }
}
"""


def test_drag_changes_position(app_page):
    load_plan(app_page, PLAN)
    before = source_text(app_page)
    cx, cy = element_center(app_page, "table")
    drag(app_page, cx, cy, cx + 40, cy + 25)
    after = source_text(app_page)
    assert after != before


def test_plain_click_does_not_change_source(app_page):
    load_plan(app_page, PLAN)
    before = source_text(app_page)
    cx, cy = element_center(app_page, "table")
    app_page.mouse.click(cx, cy)
    app_page.wait_for_timeout(150)
    after = source_text(app_page)
    assert after == before


def test_undo_redo_round_trip(app_page):
    load_plan(app_page, PLAN)
    before = source_text(app_page)
    cx, cy = element_center(app_page, "table")
    drag(app_page, cx, cy, cx + 40, cy + 25)
    dragged = source_text(app_page)
    assert dragged != before

    app_page.keyboard.press("Control+z")
    app_page.wait_for_timeout(200)
    assert source_text(app_page) == before

    app_page.keyboard.press("Control+Shift+z")
    app_page.wait_for_timeout(200)
    assert source_text(app_page) == dragged


ROOT_ONLY_PLAN = """
element root {
  element table {
    shape: "rect"
    size: [0.8m, 0.5m]
    position: [0.3m, 0.3m]
    style: { fill: "brown" }
  }
}
"""

# root itself gets a real shape here (unlike ROOT_ONLY_PLAN) specifically so it renders as a
# plain .obj, not its own anchor-hit point -- otherwise group's own anchor-hit (no position
# of its own either, so it defaults to the same local (0,0) as root's) would land exactly on
# top of root's, and the topmost (group, painted later) would always win the click, leaving
# root's own anchor-hit untestable from the same plan.
NESTED_CONTAINER_PLAN = """
element root {
  shape: "rect"
  size: [4m, 4m]
  position: [0m, 0m]
  style: { fill: "#f5f5f5", stroke: "#ccc", strokeWidth: 0.02 }

  element group {
    element table {
      shape: "rect"
      size: [0.8m, 0.5m]
      position: [0.3m, 0.3m]
      style: { fill: "brown" }
    }
  }
}
"""


def anchor_hit_center(page, node_id):
    box = page.evaluate(
        """(id) => {
            const c = document.querySelector(`circle.anchor-hit[data-id="${id}"]`);
            const r = c.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }""",
        node_id,
    )
    return box["x"], box["y"]


def anchor_hit_title(page, node_id):
    return page.evaluate(
        """(id) => document.querySelector(`circle.anchor-hit[data-id="${id}"] title`)?.textContent""",
        node_id,
    )


def test_dragging_the_plan_root_is_a_clean_no_op_with_a_clear_message(app_page):
    load_plan(app_page, ROOT_ONLY_PLAN)
    before = source_text(app_page)
    cx, cy = anchor_hit_center(app_page, "root")
    drag(app_page, cx, cy, cx + 40, cy + 25)
    assert source_text(app_page) == before  # a clean no-op, nothing silently moved
    assert "plan itself" in drag_message(app_page)
    assert "root" not in drag_message(app_page)  # names the concept, not the raw id
    assert "plan itself" in anchor_hit_title(app_page, "root")
    assert "root" not in anchor_hit_title(app_page, "root")


def test_dragging_a_nested_shapeless_container_names_it_by_id(app_page):
    load_plan(app_page, NESTED_CONTAINER_PLAN)
    before = source_text(app_page)
    cx, cy = anchor_hit_center(app_page, "group")
    drag(app_page, cx, cy, cx + 40, cy + 25)
    assert source_text(app_page) == before
    assert "'group'" in drag_message(app_page)
    assert "container" in drag_message(app_page)
    assert "'group'" in anchor_hit_title(app_page, "group")
