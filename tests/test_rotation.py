"""D-141: `rotation` (degrees, clockwise) for shape:"rect" -- extends F-016's resize
handles into the rect's own rotated axes, extends collision/containment to a rotated rect
via its true rotated corners (not a conservative approximation -- solidGeometryFor/
proposedGeometryFor report a rotated rect as a polygon, so the already-generic
polygon-vs-polygon machinery in interactivity-module.js handles it exactly, for free),
and extends annotations-module.js's dimension/edge-length labels to follow the rotated
corners. Flush and placement:"outside" against a rotated rect are explicitly unsupported --
warn and fall back rather than doing something silently wrong."""

import math
import re

from helpers import drag, drag_message, element_center, load_plan, source_text, validation_violations


def rect_position(text, node_id):
    m = re.search(rf"element {node_id} \{{.*?position: \[(-?[\d.]+)m, (-?[\d.]+)m\]", text, re.S)
    assert m, f"{node_id!r} has no position in:\n{text}"
    return float(m.group(1)), float(m.group(2))


def rect_size(text, node_id):
    m = re.search(rf"element {node_id} \{{.*?size: \[(-?[\d.]+)m, (-?[\d.]+)m\]", text, re.S)
    assert m, f"{node_id!r} has no size in:\n{text}"
    return float(m.group(1)), float(m.group(2))


def resize_handle_count(page):
    return page.locator(".resize-handle").count()


def handle_center(page, node_id, corner):
    box = page.locator(f'.resize-handle[data-node-id="{node_id}"][data-corner="{corner}"]').bounding_box()
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def select(page, node_id):
    cx, cy = element_center(page, node_id)
    page.mouse.click(cx, cy)
    page.wait_for_timeout(150)


def test_rendering_applies_the_correct_rotate_transform(app_page):
    load_plan(
        app_page,
        """
element room {
  shape: "rect"
  size: [4m, 3m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element wall {
    shape: "rect"
    size: [2m, 0.3m]
    position: [1m, 1m]
    rotation: 30
    style: { fill: "#8ab" }
  }
}
""",
    )
    el = app_page.locator('[data-id="wall"]')
    assert el.get_attribute("transform") == "rotate(30 120 69)"  # cx,cy in SVG (M-scaled) units


def test_rotation_absent_or_zero_behaves_identically_to_unrotated(app_page):
    load_plan(
        app_page,
        """
element room {
  shape: "rect"
  size: [4m, 3m]
  position: [0m, 0m]
  style: { fill: "#eee" }
  element a { shape: "rect" size: [1m, 1m] position: [1m, 1m] style: { fill: "#8ab" } }
  element b { shape: "rect" size: [1m, 1m] position: [1m, 1m] rotation: 0 style: { fill: "#8ab" } }
}
""",
    )
    a = app_page.locator('[data-id="a"]')
    b = app_page.locator('[data-id="b"]')
    assert a.get_attribute("transform") is None
    assert b.get_attribute("transform") is None
    assert a.bounding_box() == b.bounding_box()


def test_resize_handles_sit_at_the_rotated_corners_not_the_axis_aligned_ones(app_page):
    load_plan(
        app_page,
        """
element room {
  shape: "rect"
  size: [6m, 4m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element wall {
    shape: "rect"
    size: [2m, 0.3m]
    position: [2m, 2m]
    rotation: 30
    style: { fill: "#8ab" }
  }
}
""",
    )
    select(app_page, "wall")
    assert resize_handle_count(app_page) == 4
    # The tl-br diagonal of an unrotated 2x0.3 rect is near-horizontal; rotated 30 degrees,
    # that diagonal tilts -- confirms handles actually moved off the axis-aligned positions
    # an unrotated rect's own corners would sit at, not just that 4 handles exist.
    tl = handle_center(app_page, "wall", "tl")
    br = handle_center(app_page, "wall", "br")
    angle = math.degrees(math.atan2(br[1] - tl[1], br[0] - tl[0]))
    unrotated_angle = math.degrees(math.atan2(0.3, 2))  # ~8.5 degrees for an unrotated 2x0.3 rect
    assert abs(angle - unrotated_angle) > 15, f"expected a clearly rotated diagonal, got {angle}"


def test_dragging_a_rotated_rects_resize_handle_grows_along_its_own_local_axes(app_page):
    load_plan(
        app_page,
        """
element room {
  shape: "rect"
  size: [6m, 4m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element wall {
    shape: "rect"
    size: [2m, 0.3m]
    position: [2m, 2m]
    rotation: 30
    style: { fill: "#8ab" }
  }
}
""",
    )
    select(app_page, "wall")
    hx, hy = handle_center(app_page, "wall", "br")
    # Drag roughly along the rotated rect's own long axis (30 degrees) -- should grow width,
    # not collapse toward zero the way dragging along the *screen's* x-axis would once the
    # cursor is (correctly) rotated back into the rect's own local frame first.
    dx, dy = 40 * math.cos(math.radians(30)), 40 * math.sin(math.radians(30))
    drag(app_page, hx, hy, hx + dx, hy + dy)

    text = source_text(app_page)
    w, h = rect_size(text, "wall")
    px, py = rect_position(text, "wall")
    assert w > 2.0  # grew along its own local width axis
    assert abs(h - 0.3) < 2e-3  # height (the "tl" anchor's own opposite dimension) unchanged
    assert (px, py) == (2.0, 2.0)  # tl anchor itself never moves for a br-handle drag
    assert "rotation: 30" in text  # untouched by a resize


def test_validation_panel_flags_a_rotated_child_whose_true_footprint_escapes_the_parent(app_page):
    load_plan(
        app_page,
        """
element room {
  shape: "rect"
  size: [4m, 4m]
  position: [0m, 0m]
  style: { fill: "#eee" }
  childPlacement: "inside"

  element panel {
    shape: "rect"
    size: [2m, 0.6m]
    position: [3.3m, 1.7m]
    rotation: 45
    style: { fill: "#8ab" }
  }
}
""",
    )
    violations = validation_violations(app_page)
    assert any("panel" in v and "isn't actually inside" in v for v in violations), violations


def test_collision_between_two_rotated_rects_blocks_the_drag(app_page):
    load_plan(
        app_page,
        """
settings { allowCollisions: false }
element room {
  shape: "rect"
  size: [6m, 4m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element a {
    shape: "rect"
    size: [2m, 0.4m]
    position: [1m, 1.5m]
    rotation: 30
    style: { fill: "#8ab" }
  }
  element b {
    shape: "rect"
    size: [2m, 0.4m]
    position: [1m, 2.5m]
    rotation: -30
    style: { fill: "#fc6" }
  }
}
""",
    )
    ax, ay = element_center(app_page, "a")
    drag(app_page, ax, ay, ax, ay + 150)

    assert "stopped by a collision" in drag_message(app_page)
    px, py = rect_position(source_text(app_page), "a")
    assert (px, py) == (1.0, 1.5)  # blocked entirely, not just partially allowed through


def test_dimension_labels_follow_the_rotated_corners(app_page):
    def label_positions(rotation):
        load_plan(
            app_page,
            f"""
element room {{ shape: "rect" size: [6m, 4m] position: [0m, 0m] style: {{ fill: "#eee" }}
  element wall {{ shape: "rect" size: [2m, 0.3m] position: [2m, 2m] rotation: {rotation}
    style: {{ fill: "#8ab" }} edgeLengths: true }}
}}
""",
        )
        app_page.wait_for_timeout(200)
        return app_page.evaluate(
            "Array.from(document.querySelectorAll('.annotation text')).map(t => [t.getAttribute('x'), t.getAttribute('y')])"
        )

    pos0 = label_positions(0)
    pos45 = label_positions(45)
    assert pos0 != pos45


def test_flush_against_a_rotated_parent_warns_and_falls_back_to_plain_containment(app_page):
    load_plan(
        app_page,
        """
element room {
  shape: "rect"
  size: [6m, 4m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element wall {
    shape: "rect"
    size: [4m, 2m]
    position: [1m, 1m]
    rotation: 20
    childPlacement: "inside"
    style: { fill: "#8ab" }

    element sign {
      shape: "rect"
      size: [0.5m, 0.3m]
      position: [1.5m, 0.5m]
      flush: true
      style: { fill: "#fc6" }
    }
  }
}
""",
    )
    sx, sy = element_center(app_page, "sign")
    drag(app_page, sx, sy, sx + 10, sy - 15)

    msg = drag_message(app_page)
    assert "flush against a rotated rect isn't supported yet" in msg


def test_unrotated_flush_is_unaffected(app_page):
    # Regression guard: the new rotation-diversion in clampToContainment must not touch the
    # existing exact flush path when nothing is actually rotated.
    load_plan(
        app_page,
        """
element room {
  shape: "rect"
  size: [4m, 3m]
  position: [0m, 0m]
  childPlacement: "inside"
  style: { fill: "#eee" }

  element sofa {
    shape: "rect"
    size: [1m, 0.6m]
    position: [0.5m, 0.5m]
    flush: true
    style: { fill: "#8ab" }
  }
}
""",
    )
    sx, sy = element_center(app_page, "sofa")
    drag(app_page, sx, sy, sx + 5, sy - 60)

    text = source_text(app_page)
    px, _py = rect_position(text, "sofa")
    # sofa starts equidistant from room's left/top edges (0.5m each); nearestParentRectEdge's
    # own tie-break (Object.keys order: left before top) pins it to the left edge -- exactly
    # 0, the room's own left bound -- regardless of which direction it's then dragged.
    assert abs(px - 0.0) < 1e-3
    assert "flush against a rotated rect" not in drag_message(app_page)
