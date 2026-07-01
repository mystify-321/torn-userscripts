// ==UserScript==
// @name         Torn OC Crimes Filter
// @namespace    http://tampermonkey.net/
// @version      2026-07-01_02
// @description  Filter the Organized Crimes list by joinable status, success chance color, minimum success chance, and OC level
// @author       You
// @match        https://www.torn.com/factions.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @grant        GM_getValue
// @grant        GM_setValue
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const FILTER_KEYS = {
        ONLY_JOINABLE: 'oc_filter_only_joinable',
        SHOW_GREEN: 'oc_filter_show_green',
        SHOW_ORANGE: 'oc_filter_show_orange',
        SHOW_RED: 'oc_filter_show_red',
        MIN_CHANCE: 'oc_filter_min_chance',
        HIDE_OC_ALL_HIDDEN: 'oc_filter_hide_oc_all_hidden',
        MIN_LEVEL: 'oc_filter_min_level',
        MAX_LEVEL: 'oc_filter_max_level'
    };

    function hasClassPrefix(el, prefix) {
        return Array.from(el.classList).some(c => c.startsWith(prefix));
    }

    function findDescendantWithClassPrefix(root, prefix) {
        for (const el of root.querySelectorAll('*')) {
            if (hasClassPrefix(el, prefix)) return el;
        }
        return null;
    }

    /** @returns {{color: 'green'|'orange'|'red', joinable: boolean} | null} */
    function getRoleInfo(el) {
        const classes = Array.from(el.classList);
        let color = null;
        if (classes.some(c => c.startsWith('successGreen___'))) color = 'green';
        else if (classes.some(c => c.startsWith('successOrange___'))) color = 'orange';
        else if (classes.some(c => c.startsWith('successRed___'))) color = 'red';
        if (!color) return null;
        const joinable = classes.some(c => c.startsWith('waitingJoin___'));
        return { color, joinable };
    }

    function findRoleDivs(ocDiv) {
        return Array.from(ocDiv.querySelectorAll('div')).filter(div => getRoleInfo(div) !== null);
    }

    function getOcLevel(ocDiv) {
        const levelEl = findDescendantWithClassPrefix(ocDiv, 'levelValue___');
        return levelEl ? parseFloat(levelEl.textContent) || 0 : 0;
    }

    function isRecruitingTabActive() {
        const container = document.querySelector('[class*="buttonsContainer___"]');
        if (!container) return false;
        const activeButton = Array.from(container.querySelectorAll('button')).find(btn => hasClassPrefix(btn, 'active___'));
        return !!activeButton && activeButton.textContent.trim() === 'Recruiting';
    }

    function resetVisibility() {
        document.querySelectorAll('.tt-oc2-list [data-oc-id]').forEach(ocDiv => {
            ocDiv.style.display = '';
            findRoleDivs(ocDiv).forEach(roleDiv => { roleDiv.style.display = ''; });
        });
    }

    function createFilterArea() {
        const filterContainer = document.createElement('div');
        filterContainer.className = 'oc-filter-area';
        filterContainer.style.cssText = 'border: 1px solid #ccc; border-radius: 5px; margin-bottom: 10px; padding: 10px; font-family: Arial, sans-serif; color: #ddd; background: rgba(0,0,0,0.2);';

        const header = document.createElement('div');
        header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; cursor: pointer; font-weight: bold;';
        header.innerHTML = '<span>OC filters</span><span class="collapse-arrow">▼</span>';
        filterContainer.appendChild(header);

        const content = document.createElement('div');
        content.style.cssText = 'display: flex; flex-wrap: wrap; gap: 16px; margin-top: 10px; align-items: center;';
        filterContainer.appendChild(content);

        header.onclick = () => {
            const isHidden = content.style.display === 'none';
            content.style.display = isHidden ? 'flex' : 'none';
            header.querySelector('.collapse-arrow').textContent = isHidden ? '▼' : '▲';
        };

        const createCheckbox = (label, key, defaultValue, container) => {
            const wrapper = document.createElement('label');
            wrapper.style.cssText = 'display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer; white-space:nowrap;';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = GM_getValue(key, defaultValue);
            input.onchange = () => {
                GM_setValue(key, input.checked);
                applyFilters();
            };
            wrapper.appendChild(input);
            wrapper.appendChild(document.createTextNode(label));
            container.appendChild(wrapper);
            return input;
        };

        createCheckbox('Only show joinable', FILTER_KEYS.ONLY_JOINABLE, false, content);

        const colorsWrapper = document.createElement('div');
        colorsWrapper.style.cssText = 'display:flex; gap:8px; align-items:center; font-size:12px;';
        colorsWrapper.appendChild(document.createTextNode('Show colors:'));
        createCheckbox('🟢 Green', FILTER_KEYS.SHOW_GREEN, true, colorsWrapper);
        createCheckbox('🟠 Orange', FILTER_KEYS.SHOW_ORANGE, true, colorsWrapper);
        createCheckbox('🔴 Red', FILTER_KEYS.SHOW_RED, true, colorsWrapper);
        content.appendChild(colorsWrapper);

        const minChanceWrapper = document.createElement('div');
        minChanceWrapper.style.cssText = 'display:flex; flex-direction:column; font-size:12px;';
        const minChanceLabel = document.createElement('label');
        minChanceLabel.textContent = 'Min success chance';
        const minChanceInput = document.createElement('input');
        minChanceInput.type = 'number';
        minChanceInput.min = '0';
        minChanceInput.max = '100';
        minChanceInput.style.cssText = 'width: 60px; padding: 4px; border: 1px solid #ccc; border-radius: 3px;';
        minChanceInput.value = GM_getValue(FILTER_KEYS.MIN_CHANCE, 0);
        minChanceInput.oninput = () => {
            GM_setValue(FILTER_KEYS.MIN_CHANCE, minChanceInput.value);
            applyFilters();
        };
        minChanceWrapper.append(minChanceLabel, minChanceInput);
        content.appendChild(minChanceWrapper);

        const createNumberInput = (label, key, defaultValue) => {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'display:flex; flex-direction:column; font-size:12px;';
            const labelEl = document.createElement('label');
            labelEl.textContent = label;
            const input = document.createElement('input');
            input.type = 'number';
            input.min = '0';
            input.style.cssText = 'width: 60px; padding: 4px; border: 1px solid #ccc; border-radius: 3px;';
            input.value = GM_getValue(key, defaultValue);
            input.oninput = () => {
                GM_setValue(key, input.value);
                applyFilters();
            };
            wrapper.append(labelEl, input);
            content.appendChild(wrapper);
            return input;
        };

        createNumberInput('Min Level', FILTER_KEYS.MIN_LEVEL, 0);
        createNumberInput('Max Level', FILTER_KEYS.MAX_LEVEL, 999);

        createCheckbox('Hide OC if all roles hidden', FILTER_KEYS.HIDE_OC_ALL_HIDDEN, false, content);

        return filterContainer;
    }

    function applyFilters() {
        if (!isRecruitingTabActive()) {
            resetVisibility();
            return;
        }

        const onlyJoinable = GM_getValue(FILTER_KEYS.ONLY_JOINABLE, false);
        const showGreen = GM_getValue(FILTER_KEYS.SHOW_GREEN, true);
        const showOrange = GM_getValue(FILTER_KEYS.SHOW_ORANGE, true);
        const showRed = GM_getValue(FILTER_KEYS.SHOW_RED, true);
        const minChance = parseFloat(GM_getValue(FILTER_KEYS.MIN_CHANCE, 0)) || 0;
        const hideOcAllHidden = GM_getValue(FILTER_KEYS.HIDE_OC_ALL_HIDDEN, false);
        const minLevel = parseFloat(GM_getValue(FILTER_KEYS.MIN_LEVEL, 0)) || 0;
        const maxLevel = parseFloat(GM_getValue(FILTER_KEYS.MAX_LEVEL, 999)) || 999;

        document.querySelectorAll('.tt-oc2-list [data-oc-id]').forEach(ocDiv => {
            const level = getOcLevel(ocDiv);
            if (level < minLevel || level > maxLevel) {
                ocDiv.style.display = 'none';
                return;
            }

            const roleDivs = findRoleDivs(ocDiv);
            let anyVisible = false;

            roleDivs.forEach(roleDiv => {
                const { color, joinable } = getRoleInfo(roleDiv);
                const chanceEl = findDescendantWithClassPrefix(roleDiv, 'successChance___');
                const chance = chanceEl ? parseFloat(chanceEl.textContent) || 0 : 0;

                let visible = true;
                if (onlyJoinable && !joinable) visible = false;
                if (color === 'green' && !showGreen) visible = false;
                if (color === 'orange' && !showOrange) visible = false;
                if (color === 'red' && !showRed) visible = false;
                if (chance < minChance) visible = false;

                roleDiv.style.display = visible ? '' : 'none';
                if (visible) anyVisible = true;
            });

            ocDiv.style.display = (hideOcAllHidden && roleDivs.length > 0 && !anyVisible) ? 'none' : '';
        });
    }

    function injectFilterAreasIfNeeded() {
        document.querySelectorAll('.tt-oc2-list').forEach(list => {
            if (!list.querySelector(':scope > .oc-filter-area')) {
                list.prepend(createFilterArea());
            }
        });
    }

    let refreshScheduled = false;
    function scheduleRefresh() {
        if (refreshScheduled) return;
        refreshScheduled = true;
        setTimeout(() => {
            refreshScheduled = false;
            injectFilterAreasIfNeeded();
            applyFilters();
        }, 150);
    }

    function observeMutations() {
        const observer = new MutationObserver(mutations => {
            for (const mut of mutations) {
                if (mut.type === 'childList' && mut.addedNodes.length) {
                    scheduleRefresh();
                    break;
                }
                if (mut.type === 'attributes' && mut.target.tagName === 'BUTTON') {
                    scheduleRefresh();
                    break;
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        scheduleRefresh();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observeMutations);
    } else {
        observeMutations();
    }
})();
