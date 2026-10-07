"""F-054: right-click (long-press on touch) a card in the "My plans" picker opens a small
menu offering Duplicate/Delete, acting on that card's own plan without switching to it
first. Local plans only -- Cloud cards (a separate section, D-113) get no context menu,
since deleting/duplicating one remotely would need real storage-service-php calls, out of
scope here."""


def open_open_panel(page):
    page.click("#header-logo")
    page.click("#plan-open-btn")
    page.wait_for_timeout(200)


def seed_plans(page, *names):
    page.evaluate(
        """(names) => {
        for (const n of names) createPlan(n, 'element a { shape: "rect" size: [1,1] position: [0,0] }');
    }""",
        list(names),
    )


def card_names(page):
    return page.evaluate(
        "Array.from(document.querySelectorAll('.picker-card[data-action^=\"plan:\"] .picker-name')).map(n => n.textContent)"
    )


def right_click_first_card(page):
    box = page.locator('.picker-card[data-action^="plan:"]').first.bounding_box()
    page.mouse.click(box["x"] + 20, box["y"] + 20, button="right")
    page.wait_for_timeout(150)


def right_click_card_named(page, name):
    box = page.locator(f'.picker-card:has(.picker-name:text-is("{name}"))').bounding_box()
    page.mouse.click(box["x"] + 20, box["y"] + 20, button="right")
    page.wait_for_timeout(150)


def test_right_click_a_card_opens_the_menu_without_switching_plans(app_page):
    seed_plans(app_page, "Plan A", "Plan B")
    open_open_panel(app_page)
    right_click_first_card(app_page)
    assert app_page.evaluate("!document.getElementById('picker-card-menu').hidden")
    assert app_page.evaluate("!document.getElementById('plan-picker-panel').hidden")


def test_duplicate_adds_a_uniquely_named_copy_and_keeps_the_picker_open(app_page):
    seed_plans(app_page, "Plan A")
    open_open_panel(app_page)
    before = card_names(app_page)
    right_click_first_card(app_page)
    app_page.click("#picker-card-duplicate-btn")
    app_page.wait_for_timeout(200)
    after = card_names(app_page)
    assert len(after) == len(before) + 1
    assert "Plan A (2)" in after
    assert not app_page.evaluate("document.getElementById('plan-picker-panel').hidden")


def test_delete_removes_a_non_active_plan_without_switching(app_page):
    app_page.on("dialog", lambda d: d.accept())
    seed_plans(app_page, "Keep Me", "Delete Me")
    active_before = app_page.evaluate("activePlanId")
    open_open_panel(app_page)
    right_click_card_named(app_page, "Delete Me")
    app_page.click("#picker-card-delete-btn")
    app_page.wait_for_timeout(200)
    assert "Delete Me" not in card_names(app_page)
    assert "Keep Me" in card_names(app_page)
    assert app_page.evaluate("activePlanId") == active_before


def test_deleting_the_active_plan_falls_back_like_the_header_delete_does(app_page):
    app_page.on("dialog", lambda d: d.accept())
    seed_plans(app_page, "Other Plan")
    app_page.evaluate("switchToPlan(plans[plans.length - 1].id)")
    active_id = app_page.evaluate("activePlanId")
    open_open_panel(app_page)
    # Right-click specifically the card matching the active plan.
    app_page.evaluate(
        """(id) => {
        const card = document.querySelector(`.picker-card[data-action="plan:${id}"]`);
        card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 50 }));
    }""",
        active_id,
    )
    app_page.wait_for_timeout(150)
    app_page.click("#picker-card-delete-btn")
    app_page.wait_for_timeout(200)
    assert app_page.evaluate("activePlanId") != active_id


def test_cloud_cards_get_no_context_menu(app_page):
    open_open_panel(app_page)
    app_page.evaluate(
        """() => {
        pickerBodyEl.insertAdjacentHTML('beforeend', planCardMarkup({ text: 'element a {}', name: 'Cloud Plan', action: 'cloud:fake-id' }));
    }"""
    )
    box = app_page.locator('.picker-card[data-action^="cloud:"]').bounding_box()
    app_page.mouse.click(box["x"] + 20, box["y"] + 20, button="right")
    app_page.wait_for_timeout(150)
    assert app_page.evaluate("document.getElementById('picker-card-menu').hidden")


def test_outside_click_closes_the_card_menu_without_closing_the_picker(app_page):
    seed_plans(app_page, "Plan A")
    open_open_panel(app_page)
    right_click_first_card(app_page)
    assert not app_page.evaluate("document.getElementById('picker-card-menu').hidden")
    app_page.click("#picker-title")
    app_page.wait_for_timeout(150)
    assert app_page.evaluate("document.getElementById('picker-card-menu').hidden")
    assert not app_page.evaluate("document.getElementById('plan-picker-panel').hidden")
