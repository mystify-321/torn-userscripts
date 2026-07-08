// ==UserScript==
// @name         FF Scouter Target Finder - Remove Red Targets
// @namespace    http://tampermonkey.net/
// @version      2026-07-08_1
// @description  Adds a button to remove all red (bad fair fight) targets from the FF Scouter target finder results
// @author       You
// @match        https://ffscouter.com/target-finder*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ffscouter.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const BUTTON_ID = 'ff-scouter-remove-red-targets-btn';

    function removeRedTargets() {
        Array.from(document.querySelectorAll('#resultsTable > tr > td[class*="text-red-"]'))
            .forEach(it => it.closest('tr').querySelector('button[title="Remove target"]').click());
    }

    function addButton(resultsDiv) {
        if (resultsDiv.querySelector('#' + BUTTON_ID)) return;

        const button = document.createElement('button');
        button.id = BUTTON_ID;
        button.type = 'button';
        button.textContent = 'Remove Red Targets';
        button.style.cssText = 'margin-bottom:10px;padding:6px 12px;background:#c0392b;color:#fff;border:none;border-radius:4px;cursor:pointer;';
        button.addEventListener('click', removeRedTargets);

        resultsDiv.insertBefore(button, resultsDiv.firstChild);
    }

    function tryAddButton() {
        const resultsDiv = document.querySelector('div#results');
        if (resultsDiv) addButton(resultsDiv);
    }

    function startObserver() {
        const observer = new MutationObserver(() => {
            tryAddButton();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        tryAddButton();
    }

    if (document.readyState === 'loading' || !document.body) {
        document.addEventListener('DOMContentLoaded', startObserver);
    } else {
        startObserver();
    }
})();
