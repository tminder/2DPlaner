"""F-022/F-023/F-028: the load-time validation pass (D-075/D-084). S-043 (D-184): a
property whose rendering module (D-175) isn't declared goes silently inert otherwise --
these cases cover that warning specifically."""

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
  wobble: 45
  style: { fill: "#eee" }
}
""",
    )
    violations = validation_violations(app_page)
    assert any("wobble" in v for v in violations), violations


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


def test_settings_grid_without_the_grid_module_declared_is_reported(app_page):
    load_plan(
        app_page,
        """
settings { grid: { size: 1 } }
element room {
  shape: "rect"
  size: [3m, 2m]
  style: { fill: "#eee" }
}
""",
    )
    violations = validation_violations(app_page)
    assert any("grid-module.js" in v for v in violations), violations


def test_settings_grid_with_the_grid_module_declared_is_not_reported(app_page):
    load_plan(
        app_page,
        """
module "grid-module.js"
settings { grid: { size: 1 } }
element room {
  shape: "rect"
  size: [3m, 2m]
  style: { fill: "#eee" }
}
""",
    )
    violations = validation_violations(app_page)
    assert not any("grid-module.js" in v for v in violations), violations


def test_label_without_annotations_module_declared_is_reported_but_softly_worded(app_page):
    # label is never *fully* inert -- hierarchy-module.js/the stack-hint badge (both core)
    # already read it regardless of annotations-module.js -- so this gets its own wording,
    # not the same blanket "won't render" as dimensions/edgeLengths below.
    load_plan(
        app_page,
        """
element room {
  shape: "rect"
  size: [3m, 2m]
  label: "Living Room"
  style: { fill: "#eee" }
}
""",
    )
    violations = validation_violations(app_page)
    assert any("label" in v and "annotations-module.js" in v and "hierarchy panel" in v for v in violations), violations


def test_dimensions_without_annotations_module_declared_is_reported(app_page):
    load_plan(
        app_page,
        """
element room {
  shape: "rect"
  size: [3m, 2m]
  dimensions: true
  style: { fill: "#eee" }
}
""",
    )
    violations = validation_violations(app_page)
    assert any("dimensions" in v and "annotations-module.js" in v for v in violations), violations


def test_edge_lengths_without_annotations_module_declared_is_reported(app_page):
    load_plan(
        app_page,
        """
element room {
  shape: "polygon"
  points: [[0,0], [3,0], [3,2], [0,2]]
  edgeLengths: true
  style: { fill: "#eee" }
}
""",
    )
    violations = validation_violations(app_page)
    assert any("edgeLengths" in v and "annotations-module.js" in v for v in violations), violations


def test_annotation_properties_with_the_module_declared_are_not_reported(app_page):
    load_plan(
        app_page,
        """
module "annotations-module.js"
element room {
  shape: "rect"
  size: [3m, 2m]
  label: "Living Room"
  dimensions: true
  style: { fill: "#eee" }
}
""",
    )
    violations = validation_violations(app_page)
    assert not any("annotations-module.js" in v for v in violations), violations


def test_compose_wall_with_door_without_its_module_declared_is_reported(app_page):
    load_plan(
        app_page,
        """
element root {
  element w {
    compose: "wallWithDoor"
    from: [0,0]
    to: [4,0]
    doorAt: 2
  }
}
""",
    )
    violations = validation_violations(app_page)
    assert any("wall-with-door-module.js" in v for v in violations), violations


def test_compose_wall_with_door_with_its_module_declared_is_not_reported(app_page):
    load_plan(
        app_page,
        """
module "wall-with-door-module.js"
element root {
  element w {
    compose: "wallWithDoor"
    from: [0,0]
    to: [4,0]
    doorAt: 2
  }
}
""",
    )
    violations = validation_violations(app_page)
    assert not any("wall-with-door-module.js" in v for v in violations), violations
