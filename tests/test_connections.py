"""The relationship (`connection`) feature's redesign: the Ctrl/Cmd+drag gesture that
creates one (replacing the old +/- icons), removing one from the right-click menu, and the
`settings { showConnections: true }` visibility toggle."""

from helpers import (
    click_menu_item,
    ctrl_drag,
    element_center,
    load_plan,
    menu_items,
    open_context_menu,
    source_text,
    validation_violations,
)

# `switch` is a bare point (no shape) well outside `lamp`'s bounds -- the exact "not
# touching at all" case the old icon UI could never reach (only fired at an existing
# contact point), and the only combination "Attach outside" is offered for.
SWITCH_AND_LAMP = """
element room {
  shape: "rect"
  size: [4m, 3m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element switch {
    position: [0.3m, 0.3m]
  }
  element lamp {
    shape: "rect"
    size: [1m, 1m]
    position: [2.5m, 1m]
    style: { fill: "#fc6" }
  }
}
"""

SWITCH_ALREADY_CONNECTED = """
element room {
  shape: "rect"
  size: [4m, 3m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element switch {
    position: [0.3m, 0.3m]
  }
  element lamp {
    shape: "rect"
    size: [1m, 1m]
    position: [2.5m, 1m]
    style: { fill: "#fc6" }
  }
}
connection switch lamp
"""


def relate_menu_items(page):
    return page.evaluate(
        """() => Array.from(
            document.querySelectorAll('#interactivity-context-menu button[data-i]')
        ).map((btn) => btn.title)"""
    )


def test_ctrl_drag_far_apart_point_to_rect_offers_both_choices(app_page):
    load_plan(app_page, SWITCH_AND_LAMP)
    sx, sy = element_center(app_page, "switch")
    lx, ly = element_center(app_page, "lamp")
    ctrl_drag(app_page, sx, sy, lx, ly)
    assert relate_menu_items(app_page) == ["Connect to lamp", "Attach outside lamp"]


def test_connect_to_adds_only_the_connection_line(app_page):
    load_plan(app_page, SWITCH_AND_LAMP)
    before = source_text(app_page)
    sx, sy = element_center(app_page, "switch")
    lx, ly = element_center(app_page, "lamp")
    ctrl_drag(app_page, sx, sy, lx, ly)
    click_menu_item(app_page, "Connect to lamp")
    after = source_text(app_page)
    assert after == before + "connection switch lamp\n"
    assert 'placement' not in after


def test_attach_outside_snaps_position_and_sets_placement(app_page):
    load_plan(app_page, SWITCH_AND_LAMP)
    sx, sy = element_center(app_page, "switch")
    lx, ly = element_center(app_page, "lamp")
    ctrl_drag(app_page, sx, sy, lx, ly)
    click_menu_item(app_page, "Attach outside lamp")
    text = source_text(app_page)
    assert 'placement: "outside"' in text
    assert "connection switch lamp" in text

    # lamp spans x:[2.5,3.5] y:[1,2] -- dropped on lamp's own center (lx,ly), which is
    # *inside* the rect, so the nearest boundary point is whichever edge is closest to the
    # center: for a 1x1 square that's a tie broken by candidate order (left first) --
    # either way the switch must now sit exactly on the rect's boundary, not floating
    # somewhere inside/outside it.
    positions = app_page.evaluate(
        """() => {
            const base = window.parseExpanded(document.getElementById('source').value);
            const positions = {};
            window.computePositions(base.root, null, [0, 0], positions);
            return positions['switch'];
        }"""
    )
    x, y = positions
    on_left = abs(x - 2.5) < 1e-6 and 1 - 1e-6 <= y <= 2 + 1e-6
    on_right = abs(x - 3.5) < 1e-6 and 1 - 1e-6 <= y <= 2 + 1e-6
    on_top = abs(y - 1) < 1e-6 and 2.5 - 1e-6 <= x <= 3.5 + 1e-6
    on_bottom = abs(y - 2) < 1e-6 and 2.5 - 1e-6 <= x <= 3.5 + 1e-6
    assert on_left or on_right or on_top or on_bottom

    # A real bug caught by testing this live against production: the F-023 property schema
    # didn't know "placement" is a legitimate property on a shapeless point (D-032), so the
    # gesture's own output immediately triggered a spurious "isn't used by a shapeless
    # element" warning right back.
    assert validation_violations(app_page) == []


def test_already_connected_pair_disables_connect_offers_attach_outside(app_page):
    load_plan(app_page, SWITCH_ALREADY_CONNECTED)
    sx, sy = element_center(app_page, "switch")
    lx, ly = element_center(app_page, "lamp")
    ctrl_drag(app_page, sx, sy, lx, ly)
    assert relate_menu_items(app_page) == ["Connect to lamp", "Attach outside lamp"]
    disabled = app_page.evaluate(
        """() => {
            const items = Array.from(document.querySelectorAll('#interactivity-context-menu button[data-i]'));
            const btn = items.find((el) => el.title === 'Connect to lamp');
            return btn.classList.contains('disabled');
        }"""
    )
    assert disabled is True


def test_ctrl_drag_between_parent_and_child_offers_no_menu(app_page):
    load_plan(app_page, SWITCH_AND_LAMP)
    rx, ry = element_center(app_page, "room")
    sx, sy = element_center(app_page, "switch")
    before = source_text(app_page)
    ctrl_drag(app_page, sx, sy, rx, ry)
    assert app_page.locator("#interactivity-context-menu").is_hidden()
    assert source_text(app_page) == before


def test_ctrl_drag_released_over_empty_canvas_does_nothing(app_page):
    load_plan(app_page, SWITCH_AND_LAMP)
    sx, sy = element_center(app_page, "switch")
    before = source_text(app_page)
    ctrl_drag(app_page, sx, sy, 20, 20)
    assert app_page.locator("#interactivity-context-menu").is_hidden()
    assert source_text(app_page) == before


def test_disconnect_single_connection_via_context_menu(app_page):
    load_plan(app_page, SWITCH_ALREADY_CONNECTED)
    sx, sy = element_center(app_page, "switch")
    open_context_menu(app_page, sx, sy)
    assert "Disconnect from lamp" in menu_items(app_page)
    click_menu_item(app_page, "Disconnect from lamp")
    assert "connection switch lamp" not in source_text(app_page)


THREE_WAY_CONNECTIONS = """
element room {
  shape: "rect"
  size: [4m, 3m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element hub {
    position: [2m, 1.5m]
  }
  element a {
    position: [0.2m, 0.2m]
  }
  element b {
    position: [3.8m, 0.2m]
  }
  element c {
    position: [0.2m, 2.8m]
  }
}
connection hub a
connection hub b
connection hub c
"""


CHAIN_CONNECTIONS = """
element room {
  shape: "rect"
  size: [4m, 3m]
  position: [0m, 0m]
  style: { fill: "#eee" }

  element a { position: [0.3m, 0.3m] }
  element b { position: [2m, 0.3m] }
  element c { position: [3.7m, 0.3m] }
}
connection a b
connection b c
"""


def test_hovering_one_end_of_a_chain_shows_the_whole_indirect_chain(app_page):
    """Requested directly: A-B-C should show in full when hovering just A, not only A's own
    direct edge to B -- reuses core's own connectedNodeIds BFS, the same "fully transitive"
    notion of connected that drag propagation already uses."""
    load_plan(app_page, CHAIN_CONNECTIONS)
    ax, ay = element_center(app_page, "a")
    app_page.mouse.move(ax, ay)
    app_page.wait_for_timeout(150)
    assert app_page.locator("svg .hover-connection-line").count() == 2
    assert app_page.locator(".connected-highlight").count() == 3

    app_page.mouse.move(20, 20)
    app_page.wait_for_timeout(150)
    assert app_page.locator("svg .hover-connection-line").count() == 0
    assert app_page.locator(".connected-highlight").count() == 0

    # Hovering the middle element (b) shows the same whole chain too.
    bx, by = element_center(app_page, "b")
    app_page.mouse.move(bx, by)
    app_page.wait_for_timeout(150)
    assert app_page.locator("svg .hover-connection-line").count() == 2
    assert app_page.locator(".connected-highlight").count() == 3


def test_disconnect_submenu_lists_all_partners_and_removes_only_one(app_page):
    """D-144: Disconnect rows now live in the "Connections" submenu (alongside "Connect
    to..."), one flat "Disconnect from X" row per partner -- not a further-nested submenu
    of bare partner names. D-145: that submenu is a group button (radial-btn--group), not a
    hover-flyout <li> header."""
    load_plan(app_page, THREE_WAY_CONNECTIONS)
    hx, hy = element_center(app_page, "hub")
    open_context_menu(app_page, hx, hy)
    group_titles = app_page.eval_on_selector_all(
        "#interactivity-context-menu button.radial-btn--group", "els => els.map(e => e.title)"
    )
    assert "Connections" in group_titles
    for name in ("a", "b", "c"):
        assert f"Disconnect from {name}" in menu_items(app_page)
    click_menu_item(app_page, "Disconnect from b")
    text = source_text(app_page)
    assert "connection hub b" not in text
    assert "connection hub a" in text
    assert "connection hub c" in text


def test_show_connections_toggle_round_trips_and_renders_line(app_page):
    load_plan(app_page, SWITCH_ALREADY_CONNECTED)
    # D-128: Grid/Connections/Layers now live behind the header's own "View" tab.
    app_page.click("#menu-tab-view")
    btn = app_page.locator("#connections-toggle-btn")

    # Case 1: no settings block at all yet.
    btn.click()
    app_page.wait_for_timeout(150)
    text = source_text(app_page)
    assert "settings {\n  showConnections: true\n}" in text
    assert app_page.locator("svg .connection-line").count() == 1

    # Toggle off again: settings block (now empty) stays or is cleanly removable -- either
    # way showConnections itself must be gone and the line must disappear.
    btn.click()
    app_page.wait_for_timeout(150)
    assert "showConnections" not in source_text(app_page)
    assert app_page.locator("svg .connection-line").count() == 0

    # Case 2: settings block already present with an unrelated key.
    load_plan(
        app_page,
        SWITCH_ALREADY_CONNECTED.replace(
            "element room {", "settings {\n  grid: { }\n}\n\nelement room {", 1
        ),
    )
    btn.click()
    app_page.wait_for_timeout(150)
    text = source_text(app_page)
    assert "grid: { }" in text
    assert "showConnections: true" in text
    assert app_page.locator("svg .connection-line").count() == 1


def test_hovering_a_connected_element_shows_the_line_even_without_the_setting(app_page):
    """Requested directly: the connection line should always be visible on hover, regardless
    of `settings.showConnections` -- that setting is for a *permanent* line, hover is a
    separate, transient discoverability aid."""
    load_plan(app_page, SWITCH_ALREADY_CONNECTED)
    assert app_page.locator("svg .hover-connection-line").count() == 0

    sx, sy = element_center(app_page, "switch")
    app_page.mouse.move(sx, sy)
    app_page.wait_for_timeout(150)
    assert app_page.locator("svg .hover-connection-line").count() == 1

    # Moving away removes it again -- it's tied to the hover itself, not left behind.
    app_page.mouse.move(20, 20)
    app_page.wait_for_timeout(150)
    assert app_page.locator("svg .hover-connection-line").count() == 0

    # Symmetric: hovering the *partner* shows the same line too.
    lx, ly = element_center(app_page, "lamp")
    app_page.mouse.move(lx, ly)
    app_page.wait_for_timeout(150)
    assert app_page.locator("svg .hover-connection-line").count() == 1


def test_hovering_element_with_several_connections_shows_one_line_per_partner(app_page):
    load_plan(app_page, THREE_WAY_CONNECTIONS)
    hx, hy = element_center(app_page, "hub")
    app_page.mouse.move(hx, hy)
    app_page.wait_for_timeout(150)
    assert app_page.locator("svg .hover-connection-line").count() == 3


def test_relate_drag_line_endpoint_exactly_matches_the_cursor(app_page):
    """Real bug found live: the viewer's SVG is letterboxed whenever its on-screen aspect
    ratio doesn't match its viewBox's (the default preserveAspectRatio="xMidYMid meet"
    centers the content instead of anchoring it top-left) -- the coordinate conversion
    silently ignored that offset, so the drag line's end didn't land under the actual
    cursor. Converts the line's own endpoint back to client coordinates using the exact
    scale+offset math the app itself uses and checks it lands exactly on the real mouse
    position, not just "some point on screen"."""
    load_plan(app_page, SWITCH_AND_LAMP)
    sx, sy = element_center(app_page, "switch")
    target_x, target_y = sx + 150, sy + 80

    app_page.keyboard.down("Control")
    app_page.mouse.move(sx, sy)
    app_page.mouse.down()
    app_page.mouse.move(target_x, target_y, steps=8)
    app_page.wait_for_timeout(150)

    client_pos = app_page.evaluate(
        """() => {
            const svg = document.querySelector('#plan-root svg');
            const line = document.querySelector('svg .relate-drag-line');
            const rect = svg.getBoundingClientRect();
            const vb = svg.viewBox.baseVal;
            const scale = Math.min(rect.width / vb.width, rect.height / vb.height);
            const offsetX = (rect.width - vb.width * scale) / 2;
            const offsetY = (rect.height - vb.height * scale) / 2;
            const x2 = parseFloat(line.getAttribute('x2'));
            const y2 = parseFloat(line.getAttribute('y2'));
            return {
                x: rect.left + offsetX + (x2 - vb.x) * scale,
                y: rect.top + offsetY + (y2 - vb.y) * scale,
            };
        }"""
    )
    app_page.mouse.up()
    app_page.keyboard.up("Control")

    assert abs(client_pos["x"] - target_x) < 0.5
    assert abs(client_pos["y"] - target_y) < 0.5


def test_relate_drag_shows_a_live_line_from_source_to_cursor(app_page):
    """Requested directly: while Ctrl/Cmd-dragging, a line should always be visible between
    the source element and the current mouse position, not just once a valid target is
    found under the cursor."""
    load_plan(app_page, SWITCH_AND_LAMP)
    sx, sy = element_center(app_page, "switch")
    mid_x, mid_y = sx + 150, sy + 80  # partway toward empty canvas, not yet over any element

    app_page.keyboard.down("Control")
    app_page.mouse.move(sx, sy)
    app_page.mouse.down()
    app_page.mouse.move(mid_x, mid_y, steps=8)
    app_page.wait_for_timeout(150)

    line = app_page.locator("svg .relate-drag-line")
    assert line.count() == 1
    x2, y2 = float(line.get_attribute("x2")), float(line.get_attribute("y2"))
    # The endpoint tracks the cursor, not a fixed candidate position -- roughly under
    # (mid_x, mid_y) in screen space once converted back, not still at the source.
    x1, y1 = float(line.get_attribute("x1")), float(line.get_attribute("y1"))
    assert (x2, y2) != (x1, y1)

    app_page.mouse.up()
    app_page.keyboard.up("Control")
    app_page.wait_for_timeout(150)
    # Gone once the gesture ends, whether or not a menu opened (released over empty canvas).
    assert app_page.locator("svg .relate-drag-line").count() == 0
