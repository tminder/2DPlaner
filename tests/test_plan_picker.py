"""F-044: separate Open/New header actions, each a full-width plan-picker panel with live
previews -- replaces the old <select id="plan-switcher"> outright."""

from helpers import load_plan, select_example, source_text


def open_new_panel(page):
    # D-130: Open/New now live inside the header's own File tab flyout.
    page.click("#menu-tab-file")
    page.click("#plan-new-btn")
    page.wait_for_timeout(200)


def open_open_panel(page):
    page.click("#menu-tab-file")
    page.click("#plan-open-btn")
    page.wait_for_timeout(200)


def card_names(page):
    return page.evaluate("Array.from(document.querySelectorAll('.picker-card')).map(c => c.querySelector('.picker-name').textContent)")


def test_old_plan_switcher_select_is_gone(app_page):
    assert app_page.evaluate("!document.getElementById('plan-switcher')")


def test_new_panel_shows_blank_and_every_example_with_a_distinct_preview(app_page):
    open_new_panel(app_page)
    assert card_names(app_page) == ["Blank", "Studio Apartment", "Electrical Grid", "Campervan Build"]
    shape_counts = app_page.evaluate(
        "Array.from(document.querySelectorAll('.picker-preview svg')).map(svg => svg.querySelectorAll('[data-id]').length)"
    )
    assert len(shape_counts) == 4
    assert len(set(shape_counts)) == 4, "each example should render a visibly different preview"
    assert shape_counts[0] == 1  # Blank is just the one root rect


def test_clicking_a_new_panel_card_creates_that_plan_and_closes_the_panel(app_page):
    open_new_panel(app_page)
    app_page.click('.picker-card[data-action="example:campervan"]')
    app_page.wait_for_timeout(300)
    assert app_page.evaluate("document.getElementById('plan-picker-panel').hidden") is True
    assert "element camper" in source_text(app_page)
    label = app_page.evaluate("document.getElementById('plan-open-btn').querySelector('.ribbon-label').textContent")
    assert label == "Campervan Build"


def test_open_panel_lists_saved_plans_with_previews_and_switches(app_page):
    select_example(app_page, "apartment")
    # An unsaved example only turns into a real, saved local plan once its text actually
    # changes (rerender()'s own check) -- a bare synthetic "input" event with no real text
    # change wouldn't trigger it, so this appends a real character.
    app_page.evaluate("""() => {
        const el = document.getElementById('source');
        el.value += '\\n';
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }""")
    app_page.wait_for_timeout(700)

    select_example(app_page, "utility")
    app_page.evaluate("""() => {
        const el = document.getElementById('source');
        el.value += '\\n';
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }""")
    app_page.wait_for_timeout(700)

    open_open_panel(app_page)
    sections = app_page.evaluate("Array.from(document.querySelectorAll('.picker-section-label')).map(e => e.textContent)")
    assert sections == ["My plans"]
    names = card_names(app_page)
    assert "Studio Apartment" in names
    assert "Electrical Grid" in names

    app_page.evaluate(
        """() => {
            const cards = Array.from(document.querySelectorAll('.picker-card'));
            cards.find(c => c.querySelector('.picker-name').textContent === 'Studio Apartment').click();
        }"""
    )
    app_page.wait_for_timeout(300)
    assert "element room" in source_text(app_page)


def test_open_panel_shows_placeholder_for_a_plan_with_corrupted_text(app_page):
    app_page.evaluate("""() => {
        const plans = JSON.parse(localStorage.getItem('2dplaner:plans') || '[]');
        plans.push({ id: 'corrupt-test', name: 'Broken Plan', text: 'element ((( not valid', updatedAt: Date.now() });
        localStorage.setItem('2dplaner:plans', JSON.stringify(plans));
    }""")
    app_page.reload()
    app_page.wait_for_timeout(400)
    open_open_panel(app_page)
    placeholder_text = app_page.evaluate(
        """() => {
            const cards = Array.from(document.querySelectorAll('.picker-card'));
            const broken = cards.find(c => c.querySelector('.picker-name').textContent === 'Broken Plan');
            return broken ? broken.querySelector('.picker-preview').textContent.trim() : null;
        }"""
    )
    assert placeholder_text == "Couldn't preview this plan"
    # The rest of the panel must still work despite one broken card.
    assert app_page.locator(".picker-card").count() >= 1


def test_open_panel_with_no_saved_plans_shows_an_empty_state(app_page):
    # Genuinely unreachable through the live app's own UI -- both the initial bootstrap and
    # the Delete button immediately recreate a default plan the moment "My plans" would
    # otherwise go empty, so a reload alone never reaches this state. Still worth a direct
    # test as a defensive-code check: `plans` (the module-scope array renderOpenPickerBody
    # itself reads) is a bare top-level `let`, reachable by name from injected JS the same
    # way every classic <script> on this page shares one global lexical scope already.
    app_page.evaluate("() => { plans = []; }")
    open_open_panel(app_page)
    assert app_page.locator(".picker-empty").count() == 1
    assert app_page.locator(".picker-card").count() == 0


def test_escape_and_outside_click_both_close_the_panel(app_page):
    open_new_panel(app_page)
    app_page.keyboard.press("Escape")
    app_page.wait_for_timeout(150)
    assert app_page.evaluate("document.getElementById('plan-picker-panel').hidden") is True

    open_new_panel(app_page)
    app_page.mouse.click(700, 500)  # well outside the panel, over the viewer pane
    app_page.wait_for_timeout(150)
    assert app_page.evaluate("document.getElementById('plan-picker-panel').hidden") is True


def test_open_trigger_label_tracks_the_active_plan_across_switches(app_page):
    load_plan(app_page, 'element foo { shape: "rect" size: [1m,1m] position: [0m,0m] }')
    select_example(app_page, "utility")
    label = app_page.evaluate("document.getElementById('plan-open-btn').querySelector('.ribbon-label').textContent")
    assert label == "Electrical Grid"
