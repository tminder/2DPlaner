"""F-022/F-023/F-028: the load-time validation pass (D-075/D-084)."""

from helpers import load_plan, validation_violations


def test_collision_is_reported(app_page):
    # allowCollisions defaults to allowed (this project's own deliberate default, e.g. a
    # rug legitimately overlapping a table) -- must be turned off plan-wide to make an
    # ordinary overlap a reportable violation at all.
    load_plan(
        app_page,
        """
settings {
  allowCollisions: false
}
element room {
  shape: "rect"
  size: [3m, 2m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element a {
    shape: "rect"
    size: [1m, 1m]
    position: [0.2m, 0.2m]
    style: { fill: "red" }
  }
  element b {
    shape: "rect"
    size: [1m, 1m]
    position: [0.5m, 0.5m]
    style: { fill: "blue" }
  }
}
""",
    )
    violations = validation_violations(app_page)
    assert any("overlap" in v for v in violations), violations


def test_duplicate_id_is_reported(app_page):
    load_plan(
        app_page,
        """
element room {
  shape: "rect"
  size: [3m, 2m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element a {
    shape: "circle"
    radius: 0.2m
    position: [0.5m, 0.5m]
    style: { fill: "red" }
  }
  element a {
    shape: "circle"
    radius: 0.2m
    position: [2m, 1.5m]
    style: { fill: "blue" }
  }
}
""",
    )
    violations = validation_violations(app_page)
    assert any("declared" in v and "times" in v for v in violations), violations


def test_unrecognized_shape_is_reported(app_page):
    load_plan(
        app_page,
        """
element room {
  shape: "rect"
  size: [3m, 2m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element weird {
    shape: "hexagon"
    position: [1m, 1m]
    style: { fill: "red" }
  }
}
""",
    )
    violations = validation_violations(app_page)
    assert any("hexagon" in v and "recognized" in v for v in violations), violations


def test_unsupported_property_for_shape_is_reported(app_page):
    load_plan(
        app_page,
        """
element room {
  shape: "rect"
  size: [3m, 2m]
  position: [0m, 0m]
  rotation: 45
  style: { fill: "#eee" }
}
""",
    )
    violations = validation_violations(app_page)
    assert any("rotation" in v for v in violations), violations


def test_flush_without_inside_is_reported(app_page):
    load_plan(
        app_page,
        """
element room {
  shape: "rect"
  size: [3m, 2m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element cabinet {
    shape: "rect"
    size: [1m, 0.5m]
    position: [0.2m, 0.2m]
    flush: true
    style: { fill: "brown" }
  }
}
""",
    )
    violations = validation_violations(app_page)
    assert any("flush" in v for v in violations), violations
