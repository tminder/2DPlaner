"""F-048/D-157/D-172: core.registerHeaderAction() lets a module add its own single-click
button to the header, landing in a dedicated "Modules" tab (hidden until the first one
registers). Tested by calling the core API directly via page.evaluate, mirroring
test_module_trust.py's own established pattern for exercising core internals without
needing a real external module file to load."""


def test_registering_an_action_unhides_the_modules_tab_and_creates_a_clickable_button(app_page):
    tab_hidden_before = app_page.evaluate("document.getElementById('menu-tab-modules').hidden")
    assert tab_hidden_before is True

    app_page.evaluate(
        """() => {
        window.__clicked = false;
        window.PlanCore.registerHeaderAction({
            id: 'test-action-1', label: 'Do Thing', title: 'Does the thing',
            onClick: () => { window.__clicked = true; },
        });
    }"""
    )
    assert app_page.evaluate("document.getElementById('menu-tab-modules').hidden") is False
    btn = app_page.locator("#test-action-1")
    assert btn.count() == 1
    assert btn.inner_text().strip() == "Do Thing"
    assert btn.get_attribute("title") == "Does the thing"
    assert "module-action" in btn.get_attribute("class")

    # The button only becomes visible/clickable once its own tab is actually selected --
    # matches how Edit/View's own panels already behave, nothing special-cased here.
    app_page.click("#menu-tab-modules")
    btn.click()
    assert app_page.evaluate("window.__clicked") is True


def test_unregister_removes_the_button_and_rehides_the_tab_once_empty(app_page):
    result = app_page.evaluate(
        """() => {
        const reg = window.PlanCore.registerHeaderAction({ id: 'test-action-2', label: 'Thing', onClick: () => {} });
        reg.unregister();
        return {
            buttonGone: !document.getElementById('test-action-2'),
            tabHidden: document.getElementById('menu-tab-modules').hidden,
        };
    }"""
    )
    assert result["buttonGone"] is True
    assert result["tabHidden"] is True


def test_tab_stays_visible_after_unregistering_just_one_of_two(app_page):
    result = app_page.evaluate(
        """() => {
        const a = window.PlanCore.registerHeaderAction({ id: 'test-action-3a', label: 'A', onClick: () => {} });
        const b = window.PlanCore.registerHeaderAction({ id: 'test-action-3b', label: 'B', onClick: () => {} });
        a.unregister();
        return {
            aGone: !document.getElementById('test-action-3a'),
            bStillThere: !!document.getElementById('test-action-3b'),
            tabHidden: document.getElementById('menu-tab-modules').hidden,
        };
    }"""
    )
    assert result["aGone"] is True
    assert result["bStillThere"] is True
    assert result["tabHidden"] is False


def test_a_duplicate_id_warns_and_returns_the_existing_button_instead_of_creating_another(app_page):
    messages = []
    app_page.on("console", lambda m: messages.append(m.text) if m.type == "warning" else None)
    result = app_page.evaluate(
        """() => {
        window.PlanCore.registerHeaderAction({ id: 'test-action-4', label: 'First', onClick: () => {} });
        const second = window.PlanCore.registerHeaderAction({ id: 'test-action-4', label: 'Second', onClick: () => {} });
        return {
            count: document.querySelectorAll('#test-action-4').length,
            returnedLabel: second.el.textContent.trim(),
        };
    }"""
    )
    assert result["count"] == 1
    assert result["returnedLabel"] == "First"
    assert any("test-action-4" in m for m in messages)


def test_modules_tab_panel_shows_and_hides_like_the_other_tabs(app_page):
    app_page.evaluate(
        """() => window.PlanCore.registerHeaderAction({ id: 'test-action-5', label: 'Thing', onClick: () => {} })"""
    )
    app_page.click("#menu-tab-modules")
    panel = app_page.locator('.menu-tab-panel[data-tab="modules"]')
    assert panel.is_visible()

    app_page.click("#menu-tab-view")
    assert not panel.is_visible()
