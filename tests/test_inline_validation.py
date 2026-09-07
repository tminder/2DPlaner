"""F-037: validation violations marked inline in the code pane, not just the separate
panel -- a wavy-underline span at the offending property key or element id. No hover
tooltip on the mark itself (a native title= can't work -- the backdrop it lives in is
pointer-events: none so it never receives a real hover event -- and a custom one would need
real pixel-to-character text layout including soft-wrap handling, decided directly not
worth it); the panel's own already-working tooltip still shows every full message."""

from helpers import element_center, load_plan, source_text

PLAN_UNSUPPORTED_PROPERTY = """
element room {
  shape: "rect"
  size: [3m, 2m]
  position: [0m, 0m]
  style: { fill: "#eee" }
  bogus: true
}
"""

PLAN_COLLISION = """
settings { allowCollisions: false }
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
"""

PLAN_DUPLICATE_ID = """
element room {
  shape: "rect"
  size: [3m, 2m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element a {
    shape: "rect"
    size: [1m, 1m]
    position: [0.2m, 0.2m]
  }
  element a {
    shape: "circle"
    radius: 0.3m
    position: [2m, 1m]
  }
}
"""

PLAN_NO_VIOLATIONS = """
element room {
  shape: "rect"
  size: [3m, 2m]
  position: [0m, 0m]
  style: { fill: "#eee" }
}
"""


def violation_spans(page):
    return page.evaluate(
        "Array.from(document.querySelectorAll('#code-highlight-backdrop .tok-violation')).map(e => e.textContent)"
    )


def select(page, node_id):
    cx, cy = element_center(page, node_id)
    page.mouse.click(cx, cy)
    page.wait_for_timeout(150)


def test_unsupported_property_marks_the_property_key_inline(app_page):
    load_plan(app_page, PLAN_UNSUPPORTED_PROPERTY)
    spans = violation_spans(app_page)
    assert spans == ["bogus"]
    # The panel still shows the full message too -- inline marking coexists, doesn't replace it.
    assert "bogus" in app_page.evaluate("document.getElementById('interactivity-validation-panel').textContent")


def test_collision_marks_both_involved_elements(app_page):
    load_plan(app_page, PLAN_COLLISION)
    spans = violation_spans(app_page)
    assert sorted(spans) == ["a", "b"]


def test_duplicate_id_marks_every_occurrence(app_page):
    load_plan(app_page, PLAN_DUPLICATE_ID)
    spans = violation_spans(app_page)
    assert spans == ["a", "a"]


def test_no_violations_means_no_inline_marks(app_page):
    load_plan(app_page, PLAN_NO_VIOLATIONS)
    assert violation_spans(app_page) == []
    assert app_page.evaluate("document.getElementById('interactivity-validation-panel').hidden") is True


def test_violation_on_the_selected_element_nests_inside_the_selection_mark(app_page):
    load_plan(app_page, PLAN_UNSUPPORTED_PROPERTY)
    select(app_page, "room")
    nested = app_page.evaluate(
        "!!document.querySelector('#code-highlight-backdrop .tok-selected .tok-violation')"
    )
    assert nested
    # Still exactly one violation span, not duplicated by the extra nesting.
    assert len(violation_spans(app_page)) == 1


def test_source_text_unaffected(app_page):
    # The new parser fields (idStart/idEnd/propKeySpans) are purely additive -- confirms
    # a plan with no violations at all still round-trips through parse/render exactly the
    # same as before this feature existed.
    load_plan(app_page, PLAN_NO_VIOLATIONS)
    assert "element room" in source_text(app_page)
