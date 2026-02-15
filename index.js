// ==UserScript==
// @name         Torn Load user networth
// @namespace    http://tampermonkey.net/
// @version      2026-02-14
// @description  try to take over the world!
// @author       You
// @match        https://www.torn.com/index.php*
// @match        https://www.torn.com/page.php*
// @match        https://www.torn.com/factions.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

// Set PUBLIC_ACCESS_TOKEN in Tampermonkey: Dashboard → this script → Storage (key: PUBLIC_ACCESS_TOKEN).
// Or enter it in the modal shown on first run.

(function () {
    'use strict';

    const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
    const CACHE_KEY_PREFIX = 'torn_networth_';

    function showTokenModal(onSave) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:999999;font-family:system-ui,sans-serif;';
        const box = document.createElement('div');
        box.style.cssText = 'background:#1a1a1a;color:#eee;padding:24px;border-radius:12px;max-width:400px;box-shadow:0 8px 32px rgba(0,0,0,.4);';
        box.innerHTML = '<p style="margin:0 0 16px;">Set your Torn Public API key below, or in Tampermonkey: Dashboard → this script → Storage.</p><p style="margin:0 0 12px;font-size:14px;color:#aaa;">Get a key from Torn → Profile → Preferences → API (use Public access).</p>';
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Public API key';
        input.style.cssText = 'width:100%;box-sizing:border-box;padding:10px 12px;margin-bottom:12px;border:1px solid #444;border-radius:6px;background:#2a2a2a;color:#eee;font-size:14px;';
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.style.cssText = 'padding:8px 16px;border:none;border-radius:6px;background:#2d7d46;color:#fff;cursor:pointer;font-size:14px;';
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'padding:8px 16px;border:1px solid #555;border-radius:6px;background:transparent;color:#ccc;cursor:pointer;font-size:14px;';
        saveBtn.addEventListener('click', () => {
            const value = (input.value || '').trim();
            if (value) {
                GM_setValue('PUBLIC_ACCESS_TOKEN', value);
                overlay.remove();
                onSave(value);
            }
        });
        cancelBtn.addEventListener('click', () => overlay.remove());
        row.append(cancelBtn, saveBtn);
        box.append(input, row);
        overlay.append(box);
        document.body.appendChild(overlay);
        input.focus();
    }

    function runMain(PUBLIC_ACCESS_TOKEN) {
        function getNetworthCache(userId) {
            try {
                const raw = localStorage.getItem(CACHE_KEY_PREFIX + userId);
                if (!raw) return null;
                const { value, timestamp } = JSON.parse(raw);
                if (Date.now() - timestamp >= CACHE_TTL_MS) return null;
                return value;
            } catch {
                return null;
            }
        }

        function setNetworthCache(userId, value) {
            try {
                localStorage.setItem(CACHE_KEY_PREFIX + userId, JSON.stringify({
                    value,
                    timestamp: Date.now()
                }));
            } catch (_) { }
        }

        /** @returns {HTMLSpanElement} span with formatted networth text and optional styling */
        function formatNetworth(num, userId) {
            const span = document.createElement('span');
            span.dataset.userId = userId;
            if (num == null || typeof num !== 'number' || Number.isNaN(num)) {
                span.textContent = '—';
                return span;
            }
            const n = Math.abs(num);
            let text;
            if (n >= 1e9) {
                text = (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
                span.textContent = text;
                span.dataset.networthPiggy = '1';
                span.style.fontSize = '1.15em';
                span.style.color = '#e74c3c';
            } else if (n >= 500e6) {
                text = (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
                span.textContent = text;
                span.dataset.networthPiggy = '1';
                span.style.color = '#3498db';
                span.style.fontWeight = 'bold';
            } else if (n >= 1e6) {
                span.textContent = (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
                span.style.color = '#666';
            } else if (n >= 1e3) {
                span.textContent = (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
                span.style.color = '#333';
            }
            return span;
        }

        async function getNetworth(userId) {
            const cached = getNetworthCache(userId);
            if (cached != null) return cached;
            try {
                const res = await fetch(
                    `https://api.torn.com/v2/user/${userId}/personalstats?stat=networth`,
                    { headers: { Authorization: `ApiKey ${PUBLIC_ACCESS_TOKEN}` } }
                );
                if (!res.ok) return null;
                const data = await res.json();
                const value = data?.personalstats?.[0]?.value;
                if (typeof value !== 'number') return null;
                setNetworthCache(userId, value);
                return value;
            } catch {
                return null;
            }
        }

        /** @returns {'blue'|'green'|'red'|null} userFfColor from scouter arrow img, or null if not a recognized arrow */
        function getUserFfColor(img) {
            if (!img || img.nodeType !== Node.ELEMENT_NODE || img.tagName !== 'IMG') return null;
            if (!img.classList.contains('tt-ff-scouter-arrow')) return null;
            const src = (img.src || '').toLowerCase();
            if (src.includes('blue-arrow.svg')) return 'blue';
            if (src.includes('green-arrow.svg')) return 'green';
            if (src.includes('red-arrow.svg')) return 'red';
            return null;
        }

        function isFactionsPage() {
            return /^\/factions\.php/.test(window.location.pathname);
        }

        function isIndexPage() {
            return /^\/index\.php/.test(window.location.pathname);
        }

        /** Find li elements with profile link (XID) and span.level, process each for networth. */
        function scanUserRowsWithLevel(root) {
            if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
            const listItems = root.querySelectorAll('li');
            for (const li of listItems) {
                const profileLink = li.querySelector('a[href*="profiles.php"]');
                if (!profileLink) continue;
                const xidMatch = (profileLink.getAttribute('href') || '').match(/XID=(\d+)/);
                if (!xidMatch) continue;
                if (!li.querySelector('span.level')) continue;
                processRow(li, xidMatch[1]);
            }
        }

        function findUserLiFromDescendant(descendant) {
            let el = descendant;
            while (el && el !== document.body) {
                if (el.tagName === 'LI') {
                    const classMatch = el.className && typeof el.className === 'string' && el.className.match(/\buser(\d+)\b/);
                    if (classMatch) return { li: el, userId: classMatch[1] };
                    const profileLink = el.querySelector('a[href*="profiles.php"]');
                    if (profileLink) {
                        const xidMatch = (profileLink.getAttribute('href') || '').match(/XID=(\d+)/);
                        if (xidMatch) return { li: el, userId: xidMatch[1] };
                    }
                }
                el = el.parentElement;
            }
            return null;
        }

        function processRow(li, userId) {
            if (li.dataset.networthDone === '1') return;

            li.dataset.networthDone = '1';

            (async () => {
                const value = await getNetworth(userId);
                const nwSpan = document.createElement('span');
                const nwSpanContainer = formatNetworth(value, userId);
                nwSpan.appendChild(nwSpanContainer);
                console.log('nwSpanContainer.dataset.networthPiggy='+ nwSpanContainer.dataset.networthPiggy+' userId='+userId);
                if (!isFactionsPage() && nwSpanContainer.dataset.networthPiggy === '1') {
                    console.log('fetching user profile for userId', userId);
                    const lastActionSpan = document.createElement('span');
                    const userProfile = await fetch(`https://api.torn.com/user/${userId}?key=${PUBLIC_ACCESS_TOKEN}`);
                    const userProfileData = await userProfile.json();

                    const lastActionRelative = userProfileData.last_action.relative;
                    lastActionSpan.textContent = formatLastActionRelative(lastActionRelative);
                    lastActionSpan.style.border = '1px dashed #666';
                    nwSpan.appendChild(lastActionSpan);

                    const lifeCurrent = userProfileData.life.current;
                    const lifeMax = userProfileData.life.maximum;
                    if (lifeCurrent !== lifeMax) {
                        const lifePercentage = Math.floor(lifeCurrent / lifeMax * 100);
                        const lifeSpan = document.createElement('span');
                        lifeSpan.textContent = '❤️'+lifePercentage + '%';
                        nwSpan.appendChild(lifeSpan);
                    }
                }

                if (isFactionsPage()) {
                    const row = document.createElement('div');
                    row.appendChild(nwSpan);
                    row.dataset.networthRow = '1';
                    const levelDiv = li.querySelector('div.lvl');
                    levelDiv.insertAdjacentElement('afterend', row);
                } else {
                    const levelSpan = li.querySelector('span.level');
                    if (levelSpan) {
                        //levelSpan.appendChild(document.createTextNode(' / '));
                        levelSpan.appendChild(nwSpan);
                    }
                }
            })();
        }

        // Returns the shortened last action string, e.g. "4m" for "4 minutes ago", "2h" for "2 hours ago"
        function formatLastActionRelative(lastActionRelative) {
            if (typeof lastActionRelative !== 'string') return lastActionRelative;

            const secondsMatch = lastActionRelative.match(/^(\d+)\s*second/);
            if (secondsMatch) {
                return `${secondsMatch[1]}s`;
            }
            
            const minuteMatch = lastActionRelative.match(/^(\d+)\s*minute/);
            if (minuteMatch) {
                return `${minuteMatch[1]}m`;
            }

            const hourMatch = lastActionRelative.match(/^(\d+)\s*hour/);
            if (hourMatch) {
                return `${hourMatch[1]}h`;
            }

            const dayMatch = lastActionRelative.match(/^(\d+)\s*day/);
            if (dayMatch) {
                return `${dayMatch[1]}d`;
            }

            const weekMatch = lastActionRelative.match(/^(\d+)\s*week/);
            if (weekMatch) {
                return `${weekMatch[1]}w`;
            }

            const monthMatch = lastActionRelative.match(/^(\d+)\s*month/);
            if (monthMatch) {
                return `${monthMatch[1]}m`;
            }

            const yearMatch = lastActionRelative.match(/^(\d+)\s*year/);
            if (yearMatch) {
                return `${yearMatch[1]}y`;
            }

            // If the string does not match minutes or hours, return as is
            return lastActionRelative;
        }

        // On factions.php run for any arrow; on page.php skip red.
        function shouldProcessArrow(userFfColor) {
            if (!userFfColor) return false;
            if (isFactionsPage()) return true;
            return userFfColor !== 'red';
        }

        function handleAddedNodes(node) {
            if (isIndexPage() && node.nodeType === Node.ELEMENT_NODE) {
                scanUserRowsWithLevel(node);
            }
            const color = getUserFfColor(node);
            if (color != null && shouldProcessArrow(color)) {
                const found = findUserLiFromDescendant(node);
                if (found) processRow(found.li, found.userId);
                return;
            }
            if (node.nodeType === Node.ELEMENT_NODE && node.hasChildNodes()) {
                for (const child of node.querySelectorAll ? node.querySelectorAll('img.tt-ff-scouter-arrow') : []) {
                    const childColor = getUserFfColor(child);
                    if (shouldProcessArrow(childColor)) {
                        const found = findUserLiFromDescendant(child);
                        if (found) processRow(found.li, found.userId);
                    }
                }
            }
        }

        function observeMutations() {
            const observer = new MutationObserver(mutations => {
                for (const mut of mutations) {
                    if (mut.type !== 'childList' || !mut.addedNodes.length) continue;
                    for (const node of mut.addedNodes) {
                        if (node.nodeType !== Node.ELEMENT_NODE) continue;
                        handleAddedNodes(node);
                    }
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            if (isIndexPage()) {
                scanUserRowsWithLevel(document.body);
            }
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', observeMutations);
        } else {
            observeMutations();
        }
    }

    const token = GM_getValue('PUBLIC_ACCESS_TOKEN', '');
    if (token && token.length > 0) {
        runMain(token);
    } else {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => showTokenModal(runMain));
        } else {
            showTokenModal(runMain);
        }
    }
})();
