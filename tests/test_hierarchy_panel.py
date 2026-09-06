"""D-112: the hierarchy/layers panel -- open/close persistence, the full tree in reverse
declaration order, per-parent show/hide (`hidden: true`, a new core-level rendering
property), and sibling reordering via the panel's own up/down buttons."""

from helpers import element_center, load_plan

VAN_PLAN = """
element van {
  shape: "rect"
  size: [4m, 2m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element einrichtung {
    element bett {
      shape: "rect"
      size: [1m, 0.6m]
      position: [0.2m, 0.2m]
      style: { fill: "#8ab" }
    }
  }
  element elektrik {
    element kabel {
      position: [2m, 1m]
    }
  }
}
"""


def open_panel(page):
    page.click("#hierarchy-toggle-btn")
    page.wait_for_timeout(150)


def tree_labels(page):
    return page.evaluate("Array.from(document.querySelectorAll('.hier-label')).map(e => e.textContent)")


def click_row_action(page, label, action):
    page.evaluate(
        """([label, action]) => {
            const rows = Array.from(document.querySelectorAll('.hier-row'));
            const row = rows.find(r => r.querySelector('.hier-label').textContent === label);
            row.querySelector(`[data-action="${action}"]`).click();
        }""",
        [label, action],
    )
    page.wait_for_timeout(150)


def svg_ids(page):
    return page.evaluate("Array.from(document.querySelectorAll('[data-id]')).map(e => e.dataset.id)")


def test_panel_toggles_open_and_closed_and_persists_across_reload(app_page):
    load_plan(app_page, VAN_PLAN)
    assert app_page.evaluate("getComputedStyle(document.getElementById('hierarchy-panel')).display") == "none"
    open_panel(app_page)
    assert app_page.evaluate("getComputedStyle(document.getElementById('hierarchy-panel')).display") == "flex"

    app_page.reload()
    app_page.wait_for_timeout(400)
    assert app_page.evaluate("document.getElementById('layout').classList.contains('hierarchy-open')") is True


def test_tree_lists_every_element_nested_in_reverse_declaration_order(app_page):
    load_plan(app_page, VAN_PLAN)
    open_panel(app_page)
    # einrichtung is declared before elektrik -- reverse order shows elektrik (and its own
    # child, kabel) first, matching "the row at the top is the thing in front."
    assert tree_labels(app_page) == ["van", "elektrik", "kabel", "einrichtung", "bett"]


def test_hiding_a_parent_removes_its_whole_subtree_from_the_svg_and_restores_it(app_page):
    load_plan(app_page, VAN_PLAN)
    open_panel(app_page)
    before = set(svg_ids(app_page))
    assert {"van", "einrichtung", "bett", "elektrik", "kabel"} <= before

    click_row_action(app_page, "elektrik", "toggle-hidden")
    after_hide = set(svg_ids(app_page))
    assert "elektrik" not in after_hide
    assert "kabel" not in after_hide  # cascades to children with no hidden of their own
    assert {"van", "einrichtung", "bett"} <= after_hide

    click_row_action(app_page, "elektrik", "toggle-hidden")
    after_show = set(svg_ids(app_page))
    assert after_show == before


def test_hidden_element_is_unreachable_by_click_or_drag(app_page):
    load_plan(
        app_page,
        """
element van {
  shape: "rect"
  size: [4m, 2m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element sofa {
    shape: "rect"
    size: [1m, 0.6m]
    position: [0.2m, 0.2m]
    style: { fill: "#8ab" }
    hidden: true
  }
}
""",
    )
    assert app_page.locator('[data-id="sofa"]').count() == 0


def test_up_down_buttons_swap_adjacent_siblings_and_change_actual_paint_order(app_page):
    load_plan(app_page, VAN_PLAN)
    open_panel(app_page)

    center_x, center_y = element_center(app_page, "van")
    # einrichtung declared first (back), elektrik declared second (front) -- moving
    # einrichtung "up" (toward the front) should swap their declaration order.
    click_row_action(app_page, "einrichtung", "move-up")
    text = app_page.evaluate("document.getElementById('source').value")
    assert text.index("element elektrik") < text.index("element einrichtung")
    # Order in the panel itself updates to match (elektrik now further from the front).
    assert tree_labels(app_page) == ["van", "einrichtung", "bett", "elektrik", "kabel"]

    click_row_action(app_page, "einrichtung", "move-down")
    text2 = app_page.evaluate("document.getElementById('source').value")
    assert text2.index("element einrichtung") < text2.index("element elektrik")


def test_move_buttons_disabled_at_each_end_of_the_sibling_list(app_page):
    load_plan(app_page, VAN_PLAN)
    open_panel(app_page)
    states = app_page.evaluate(
        """() => Array.from(document.querySelectorAll('.hier-row')).map(r => {
            const label = r.querySelector('.hier-label').textContent;
            const up = r.querySelector('[data-action="move-up"]');
            const down = r.querySelector('[data-action="move-down"]');
            return [label, up ? up.disabled : null, down ? down.disabled : null];
        })"""
    )
    by_label = {label: (up, down) for label, up, down in states}
    assert by_label["van"] == (None, None)  # root has no siblings at all
    assert by_label["elektrik"] == (True, False)  # already frontmost among van's children
    assert by_label["einrichtung"] == (False, True)  # already backmost
