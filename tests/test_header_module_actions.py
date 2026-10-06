"""F-048/D-157/D-172: core.registerHeaderAction() lets a module add its own single-click
button to the header, landing in a dedicated "Modules" tab (hidden until the first one
registers). Tested by calling the core API directly via page.evaluate, mirroring
test_module_trust.py's own established pattern for exercising core internals without
needing a real external module file to load.

D-175: a header action registered during a module's own load is now auto-removed when that
module is deactivated (its declaration removed from the plan's code), even if the module's
own cleanup forgets to call the action's own unregister() -- core's own safety net, tracked
via currentlyLoadingModule/headerActionsByModule, not reliant on every module author's own
hygiene."""


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


def test_tab_param_lands_the_button_in_an_existing_tab_not_modules(app_page):
    result = app_page.evaluate(
        """() => {
        window.PlanCore.registerHeaderAction({ id: 'test-action-6', label: 'In View', onClick: () => {}, tab: 'view' });
        return {
            inViewPanel: !!document.querySelector('.menu-tab-panel[data-tab="view"] #test-action-6'),
            modulesTabHidden: document.getElementById('menu-tab-modules').hidden,
        };
    }"""
    )
    assert result["inViewPanel"] is True
    assert result["modulesTabHidden"] is True


def test_position_start_prepends_before_whatever_was_first(app_page):
    result = app_page.evaluate(
        """() => {
        const panel = document.querySelector('.menu-tab-panel[data-tab="view"]');
        const firstBefore = panel.firstElementChild.id;
        window.PlanCore.registerHeaderAction({ id: 'test-action-7', label: 'First Now', onClick: () => {}, tab: 'view', position: 'start' });
        return { firstBefore, firstAfter: panel.firstElementChild.id };
    }"""
    )
    assert result["firstAfter"] == "test-action-7"
    assert result["firstBefore"] != "test-action-7"


def test_position_after_a_real_native_button_places_it_immediately_following(app_page):
    order = app_page.evaluate(
        """() => {
        window.PlanCore.registerHeaderAction({ id: 'test-action-8', label: 'After Grid', onClick: () => {}, tab: 'view', position: { after: 'grid-toggle-btn' } });
        const ids = Array.from(document.querySelector('.menu-tab-panel[data-tab="view"]').children).map(el => el.id);
        return ids;
    }"""
    )
    i = order.index("grid-toggle-btn")
    assert order[i + 1] == "test-action-8"


def test_unrecognized_tab_warns_and_falls_back_to_modules(app_page):
    messages = []
    app_page.on("console", lambda m: messages.append(m.text) if m.type == "warning" else None)
    result = app_page.evaluate(
        """() => {
        window.PlanCore.registerHeaderAction({ id: 'test-action-9', label: 'Thing', onClick: () => {}, tab: 'nonexistent' });
        return { inModulesPanel: !!document.querySelector('.menu-tab-panel[data-tab="modules"] #test-action-9') };
    }"""
    )
    assert result["inModulesPanel"] is True
    assert any("nonexistent" in m for m in messages)


def test_position_after_a_nonexistent_id_warns_and_falls_back_to_appending_at_the_end(app_page):
    messages = []
    app_page.on("console", lambda m: messages.append(m.text) if m.type == "warning" else None)
    result = app_page.evaluate(
        """() => {
        const panel = document.querySelector('.menu-tab-panel[data-tab="edit"]');
        window.PlanCore.registerHeaderAction({ id: 'test-action-10', label: 'Thing', onClick: () => {}, tab: 'edit', position: { after: 'nonexistent-id' } });
        return { last: panel.lastElementChild.id };
    }"""
    )
    assert result["last"] == "test-action-10"
    assert any("nonexistent-id" in m for m in messages)


def test_module_action_style_applies_regardless_of_which_tab_it_lands_in(app_page):
    cls = app_page.evaluate(
        """() => {
        window.PlanCore.registerHeaderAction({ id: 'test-action-11', label: 'Thing', onClick: () => {}, tab: 'file' });
        return document.getElementById('test-action-11').className;
    }"""
    )
    assert "module-action" in cls


def test_deactivating_the_owning_module_removes_its_header_action_automatically(app_page):
    """D-175: even a module whose own cleanup forgets to call the action's own unregister()
    doesn't leave an orphaned button or a stuck-visible-but-empty Modules tab -- core sweeps
    it up itself once the module is torn down."""
    result = app_page.evaluate(
        """() => {
        currentlyLoadingModule = 'test-forgetful-module.js';
        window.PlanCore.registerHeaderAction({ id: 'test-action-12', label: 'Forgetful', onClick: () => {} });
        currentlyLoadingModule = null;
        window.PlanCore.registerModuleCleanup('test-forgetful-module.js', () => {}); // never calls unregister()

        const before = {
            btnExists: !!document.getElementById('test-action-12'),
            tabHidden: document.getElementById('menu-tab-modules').hidden,
        };
        deactivateRemovedModules([]); // this module is no longer in the required set
        const after = {
            btnExists: !!document.getElementById('test-action-12'),
            tabHidden: document.getElementById('menu-tab-modules').hidden,
        };
        return { before, after };
    }"""
    )
    assert result["before"] == {"btnExists": True, "tabHidden": False}
    assert result["after"] == {"btnExists": False, "tabHidden": True}


def test_a_header_action_registered_outside_a_module_load_has_no_auto_owner(app_page):
    """Registering with no currentlyLoadingModule set (e.g. straight from the console, or
    from inside a module's own later onRendered callback) means there's nothing for
    deactivateRemovedModules to automatically sweep -- the action's own unregister() is still
    the only way to remove it, unchanged from before this safety net existed."""
    result = app_page.evaluate(
        """() => {
        window.PlanCore.registerHeaderAction({ id: 'test-action-13', label: 'Orphan', onClick: () => {} });
        deactivateRemovedModules([]);
        return !!document.getElementById('test-action-13');
    }"""
    )
    assert result is True
