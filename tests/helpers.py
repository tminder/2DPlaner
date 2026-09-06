"""Shared helper functions for the Playwright suite — plain functions, not fixtures, so
each test file imports only what it needs. Mirrors the patterns this project's own ad hoc
scratchpad scripts already used successfully throughout this project's history."""


def load_plan(page, text):
    """Set the code pane to `text` as a fresh baseline — the same
    resetUndoHistory()+rerender() pair a real plan switch uses, not a dispatched `input`
    event: that path debounces commitUndoStep 600ms later (matching real typing), which
    races non-deterministically with whatever a test does immediately afterward (e.g. a
    drag, which commits its own undo step at pointerup) and must not leak into it."""
    page.evaluate(
        """(text) => {
            const el = document.getElementById('source');
            el.value = text;
            window.resetUndoHistory(text);
            window.rerender();
        }""",
        text,
    )
    page.wait_for_timeout(400)


def select_example(page, name):
    """Switch to one of the shipped examples (blank/apartment/utility) via the
    plan-switcher <select>, the same element a real user would use."""
    page.select_option("#plan-switcher", f"example:{name}")
    page.wait_for_timeout(400)


def source_text(page):
    return page.evaluate("document.getElementById('source').value")


def selected_id(page):
    return page.evaluate("document.getElementById('plan-root').dataset.selectedId")


def drag_message(page):
    return page.evaluate("document.getElementById('dragmsg').textContent")


def validation_violations(page):
    """Text of every line currently shown in the F-022/F-023 validation panel."""
    return page.evaluate(
        """() => Array.from(
            document.querySelectorAll('#interactivity-validation-panel li')
        ).map(li => li.textContent)"""
    )


def menu_items(page):
    """Labels of every clickable item currently shown in the right-click context menu
    (its own .menu-label text only -- not the checkmark span), submenu items included by
    their own real label (e.g. "Inside room"). A non-clickable group header like
    "Placement" has no data-i and is deliberately excluded -- it isn't an action itself,
    its children are. Every placement item is now always shown (checked/disabled convey
    state instead of the item appearing/disappearing) -- use menu_item_state() to inspect
    checked/disabled for a specific label."""
    return page.evaluate(
        """() => Array.from(
            document.querySelectorAll('#interactivity-context-menu li[data-i]')
        ).map((li) => li.querySelector('.menu-label').textContent.trim())"""
    )


def menu_item_state(page, label):
    """{'checked': bool, 'disabled': bool} for the item with this exact label."""
    return page.evaluate(
        """(label) => {
            const items = Array.from(document.querySelectorAll('#interactivity-context-menu li[data-i]'));
            const li = items.find((el) => el.querySelector('.menu-label').textContent.trim() === label);
            if (!li) return null;
            return {
                checked: li.querySelector('.menu-check').textContent.trim() === '✓',
                disabled: li.classList.contains('disabled'),
            };
        }""",
        label,
    )


def open_context_menu(page, x, y):
    page.mouse.click(x, y, button="right")
    page.wait_for_timeout(150)


def click_menu_item(page, label):
    """Finds the item with this exact label by its own data-i (never by array position,
    which no longer lines up 1:1 with data-i once a non-clickable group header can also
    appear among the <li> elements), hovers its own specific enclosing group open first if
    it's nested inside one -- CSS :hover only responds to genuine pointer input, not a
    dispatched event, so this uses Playwright's own .hover() the same way a real user would
    open the flyout. Walks up to find *which* group (there can be more than one open at
    once now, e.g. Placement and Disconnect together) rather than always hovering whichever
    submenu happens to appear first in the menu."""
    li_data_i, group_index = page.evaluate(
        """(label) => {
            const items = Array.from(document.querySelectorAll('#interactivity-context-menu li[data-i]'));
            const match = items.find((el) => el.querySelector('.menu-label').textContent.trim() === label);
            if (!match) return [null, -1];
            const group = match.closest('li.has-submenu');
            const groups = Array.from(document.querySelectorAll('#interactivity-context-menu li.has-submenu'));
            return [match.dataset.i, group ? groups.indexOf(group) : -1];
        }""",
        label,
    )
    assert li_data_i is not None, f"menu item not found: {label!r}"
    if group_index != -1:
        page.locator("#interactivity-context-menu li.has-submenu").nth(group_index).hover()
        page.wait_for_timeout(100)
    page.locator(f'#interactivity-context-menu li[data-i="{li_data_i}"]').click()
    page.wait_for_timeout(200)


def element_center(page, node_id):
    box = page.locator(f'[data-id="{node_id}"]').bounding_box()
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def drag(page, from_x, from_y, to_x, to_y, steps=6):
    page.mouse.move(from_x, from_y)
    page.mouse.down()
    page.wait_for_timeout(30)
    page.mouse.move(to_x, to_y, steps=steps)
    page.wait_for_timeout(30)
    page.mouse.up()
    page.wait_for_timeout(150)


def ctrl_drag(page, from_x, from_y, to_x, to_y, steps=6):
    """The Ctrl/Cmd+drag relate gesture: holds Control for the whole gesture (mirroring a
    real user holding the key down throughout), released only after pointerup so the
    browser's own click-event synthesis doesn't fire with the modifier already gone."""
    page.keyboard.down("Control")
    page.mouse.move(from_x, from_y)
    page.mouse.down()
    page.wait_for_timeout(30)
    page.mouse.move(to_x, to_y, steps=steps)
    page.wait_for_timeout(30)
    page.mouse.up()
    page.keyboard.up("Control")
    page.wait_for_timeout(150)


def stack_badge_lines(page):
    """(text, is_current) for each line currently shown in the F-021 stack-hint badge."""
    lines = page.evaluate(
        """() => Array.from(
            document.querySelectorAll('#interactivity-stack-badge .stack-line')
        ).map(l => ({
            text: l.querySelector('span:last-child').textContent,
            current: l.classList.contains('current'),
        }))"""
    )
    return [(l["text"], l["current"]) for l in lines]
