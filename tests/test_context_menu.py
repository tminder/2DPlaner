"""D-030/D-074/D-089/D-090: the right-click context menu's structural actions --
Duplicate, Delete, and the persistent Bring to Front/Send to Back reorder."""

from helpers import (
    click_menu_item,
    element_center,
    load_plan,
    menu_items,
    open_context_menu,
    source_text,
)

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

# Non-overlapping, unlike TWO_SIBLINGS -- Duplicate/Delete each target whatever the raw
# DOM hit-test finds (no prior selection), so an overlapping pair would ambiguously
# resolve to whichever is currently on top rather than the one actually clicked "on".
TWO_NON_OVERLAPPING_SIBLINGS = """
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


def test_duplicate_adds_a_new_element(app_page):
    load_plan(app_page, TWO_NON_OVERLAPPING_SIBLINGS)
    before = source_text(app_page)
    cx, cy = element_center(app_page, "sofa")
    open_context_menu(app_page, cx, cy)
    click_menu_item(app_page, "Duplicate")
    after = source_text(app_page)
    assert after != before
    # the clone gets a fresh, distinct id -- not a second element still called "sofa"
    assert "element sofa {" in after
    assert "element sofa_copy {" in after


def test_delete_removes_the_element(app_page):
    load_plan(app_page, TWO_NON_OVERLAPPING_SIBLINGS)
    cx, cy = element_center(app_page, "sofa")
    open_context_menu(app_page, cx, cy)
    click_menu_item(app_page, "Delete Element")
    after = source_text(app_page)
    assert "element sofa" not in after
    assert "element bett" in after


def test_bring_to_front_and_send_to_back_persist_and_repaint(app_page):
    load_plan(app_page, TWO_SIBLINGS)
    cx, cy = element_center(app_page, "bett")  # bett is declared last -> already frontmost

    open_context_menu(app_page, cx, cy)
    items = menu_items(app_page)
    assert "Bring to Front" not in items  # already frontmost, would be a no-op
    assert "Send to Back" in items
    click_menu_item(app_page, "Send to Back")

    text = source_text(app_page)
    assert text.index("element bett") < text.index("element sofa")

    topmost = app_page.evaluate(
        """(pt) => document.elementsFromPoint(pt[0], pt[1])[0].closest('[data-id]')?.dataset.id""",
        [cx, cy],
    )
    assert topmost == "sofa"  # now the last-declared sibling, painting on top with no click needed


def test_right_click_targets_current_selection_over_dom_topmost(app_page):
    load_plan(app_page, TWO_SIBLINGS)
    cx, cy = element_center(app_page, "bett")
    app_page.mouse.click(cx, cy)  # selects bett (topmost)
    app_page.wait_for_timeout(120)
    app_page.mouse.click(cx, cy)  # cycles to sofa; D-086 also raises it to the front
    app_page.wait_for_timeout(120)

    open_context_menu(app_page, cx, cy)
    items = menu_items(app_page)
    # sofa is declared first -> not yet frontmost in the *source* -- Bring to Front must
    # be offered, proving the menu targeted sofa (the selection), not just whatever the
    # raw DOM hit-test would have returned.
    assert "Bring to Front" in items
