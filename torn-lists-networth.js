// ==UserScript==
// @name         Torn tools mugger addon
// @description  A set to filters made for muggers in the game Torn. Which allow you to pick targets fast and efficiently
// @namespace    http://tampermonkey.net/
// @version      2026-03-08_02
// @author       You
// @match        https://www.torn.com/index.php*
// @match        https://www.torn.com/page.php*
// @match        https://www.torn.com/factions.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @grant        GM_getValue
// @grant        GM_setValue
// @license      MIT
// ==/UserScript==

// Set PUBLIC_ACCESS_TOKEN in Tampermonkey: Dashboard → this script → Storage (key: PUBLIC_ACCESS_TOKEN).
// Or enter it in the modal shown on first run.

(function () {
    'use strict';

    const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
    const CACHE_KEY_PREFIX = 'torn_networth_';

/*
    const staggerRequestTimeoutMs = 100;
    let staggeredRequestTimeEpoch = Date.now();

    function getStaggeredRequestTime() {
        const now = Date.now();
        if (staggeredRequestTimeEpoch < now) {
            staggeredRequestTimeEpoch = now + staggerRequestTimeoutMs;
            return null;
        }
        const time = staggeredRequestTimeEpoch;
        staggeredRequestTimeEpoch += staggerRequestTimeoutMs;
        return time - now;
    }

    function awaitStaggeredRequestTime() {
        const time = getStaggeredRequestTime();
        if (time == null) return Promise.resolve();
        return new Promise(resolve => setTimeout(resolve, time));
    }
*/
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
            if (n >= 1e9) {
                span.textContent = (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
                span.dataset.networthPiggy = '1';
                span.style.fontSize = '1.15em';
                span.style.color = '#e74c3c';
            } else if (n >= 500e6) {
                span.textContent = (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
                span.dataset.networthPiggy = '1';
                span.style.color = '#3498db';
                span.style.fontWeight = 'bold';
            } else if (n >= 150e6) {
                span.textContent = (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
                span.dataset.networthPiggy = '1';
                span.style.color = '#33ff33';
            } else if (n >= 1e6) {
                span.textContent = (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
                span.style.color = '#666';
            } else if (n >= 1e3) {
                span.textContent = (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
                span.style.color = '#333';
            }
            span.title = 'Networth: $' + num.toLocaleString();
            span.dataset.networth = num ? `${num}` : null;
            return span;
        }

        async function getNetworth(userId) {
            //await awaitStaggeredRequestTime();
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

        const OVERLAY_STYLE = 'position:absolute;color:white;border-color:white;border-style:dashed;background:black;z-index:999;bottom:0px;display:block;justify-content:start;font-size:60%;';
        const OVERLAY_STYLE_RIGHT = OVERLAY_STYLE +'right:0px;';
        const OVERLAY_STYLE_LEFT = OVERLAY_STYLE +'left:0px;';
        
        const FILTER_KEYS = {
            MIN_NETWORTH: 'filter_min_networth',
            MIN_LIFE: 'filter_min_life',
            MAX_LIFE: 'filter_max_life',
            MIN_LAST_ACTION: 'filter_min_last_action',
            MAX_LAST_ACTION: 'filter_max_last_action'
        };

        function createFilterArea() {
            const filterContainer = document.createElement('div');
            filterContainer.className = 'mugger-filter-area';
            filterContainer.style.cssText = 'border: 1px solid #ccc; border-radius: 5px; margin-bottom: 10px; padding: 10px; font-family: Arial, sans-serif;';

            const header = document.createElement('div');
            header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; cursor: pointer; font-weight: bold;';
            header.innerHTML = '<span>Mugger filters</span><span class="collapse-arrow">▼</span>';
            filterContainer.appendChild(header);

            const content = document.createElement('div');
            content.style.cssText = 'display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; align-items: flex-end;';
            filterContainer.appendChild(content);

            header.onclick = () => {
                const isHidden = content.style.display === 'none';
                content.style.display = isHidden ? 'flex' : 'none';
                header.querySelector('.collapse-arrow').textContent = isHidden ? '▼' : '▲';
            };

            const createInput = (label, key, defaultValue = '') => {
                const wrapper = document.createElement('div');
                wrapper.style.cssText = 'display: flex; flex-direction: column; font-size: 12px;';
                const labelEl = document.createElement('label');
                labelEl.textContent = label;
                const input = document.createElement('input');
                input.type = 'number';
                input.value = GM_getValue(key, defaultValue);
                input.style.cssText = 'width: 80px; padding: 4px; border: 1px solid #ccc; border-radius: 3px;';
                input.onchange = () => GM_setValue(key, input.value);
                wrapper.appendChild(labelEl);
                wrapper.appendChild(input);
                content.appendChild(wrapper);
                return input;
            };

            const minNetworth = createInput('Min Networth', FILTER_KEYS.MIN_NETWORTH);
            const minLife = createInput('Min Life %', FILTER_KEYS.MIN_LIFE);
            const maxLife = createInput('Max Life %', FILTER_KEYS.MAX_LIFE);
            const minLastAction = createInput('Min Last Action (m)', FILTER_KEYS.MIN_LAST_ACTION);
            const maxLastAction = createInput('Max Last Action (m)', FILTER_KEYS.MAX_LAST_ACTION);

            const filterBtn = document.createElement('button');
            filterBtn.textContent = 'Filter';
            filterBtn.style.cssText = 'padding: 6px 12px; background: #2d7d46; color: white; border: none; border-radius: 3px; cursor: pointer; font-weight: bold;';
            filterBtn.onclick = () => {
                const userListWrapper = filterContainer.closest('.userlist-wrapper');
                if(userListWrapper) {
                    applyFilters(userListWrapper)
                }else {
                    const travelPeopleWrapper = filterContainer.closest('.travel-people');
                    if(travelPeopleWrapper) applyFilters(travelPeopleWrapper)
                }
            };
            content.appendChild(filterBtn);

            return filterContainer;
        }

        function applyFilters(wrapper) {
            if (!wrapper) return;
            const minNetworth = parseFloat(GM_getValue(FILTER_KEYS.MIN_NETWORTH, 0)) || 0;
            const minLife = parseFloat(GM_getValue(FILTER_KEYS.MIN_LIFE, 0)) || 0;
            const maxLife = parseFloat(GM_getValue(FILTER_KEYS.MAX_LIFE, 100)) || 100;
            const minLastAction = parseFloat(GM_getValue(FILTER_KEYS.MIN_LAST_ACTION, 0)) || 0;
            const maxLastAction = parseFloat(GM_getValue(FILTER_KEYS.MAX_LAST_ACTION, 999999)) || 999999;

            const nowTimestamp = Math.floor(Date.now() / 1000);
            let listWrap = wrapper.querySelector('ul.user-info-list-wrap');
            if (!listWrap) {
                listWrap = wrapper.querySelector('ul.users-list');
                if (!listWrap) return;
            }
            console.log('nw - applyFilters - user-info-list-wrap', listWrap);

            const listItems = listWrap.querySelectorAll('li');
            console.log('nw - applyFilters - listItems', listItems.length);
            listItems.forEach(li => {
                if(li.closest('ul#iconTray')) return;
                const ttHidden = li.dataset.hideReason !== undefined;
                if (ttHidden && li.classList.contains('tt-hidden')) return;

                const honorWrap = li.querySelector('.honor-text-wrap');
                const networth = parseFloat(honorWrap?.dataset.networth) || 0;
                const lifePercentage = parseFloat(honorWrap?.dataset.lifePercentage) || 100;
                const lastActionTimestamp = parseInt(honorWrap?.dataset.lastAction) || nowTimestamp;
                const lastActionMinutes = (nowTimestamp - lastActionTimestamp) / 60;

                let visible = true;
                if (networth < minNetworth) visible = false;
                if (lifePercentage < minLife || lifePercentage > maxLife) visible = false;
                if (lastActionMinutes < minLastAction || lastActionMinutes > maxLastAction) visible = false;

                if (visible) {
                    if (li.classList.contains('tt-hidden')) {
                        li.classList.remove('tt-hidden');
                    }
                } else {
                    if (!li.classList.contains('tt-hidden')) {
                        li.classList.add('tt-hidden');
                    }
                }
            });
        }

        function injectFilterAreaIfNeeded(node) {
            let wrapper = node.closest ? node.closest('.userlist-wrapper') : null;
            if (wrapper && !wrapper.querySelector('.mugger-filter-area')) {
                const filterArea = createFilterArea();
                wrapper.prepend(filterArea);
            }
            wrapper = node.closest ? node.closest('.travel-people') : null;
            if (wrapper && !wrapper.querySelector('.mugger-filter-area')) {
                const filterArea = createFilterArea();
                wrapper.prepend(filterArea);
            }
        }

        function isGreenOrBlueScouterArrow(imgElement) {
            if (!imgElement || !imgElement.src) return false;
            return imgElement.src.toLowerCase().endsWith('green-arrow.svg') || imgElement.src.toLowerCase().endsWith('blue-arrow.svg');
        }

        /** Find honor-text-wrap and its user link; return { honorWrap, userId } or null. Only matches wraps with green/blue scouter arrow. */
        function getHonorWrapAndUserIdFromArrow(node) {
            console.log('nw - getHonorWrapAndUserIdFromArrow', node);
            const honorWrap = node.closest('.honor-text-wrap');
            if (!honorWrap || !honorWrap.closest) return null;
            const userLink = honorWrap.closest('a[href*="profiles.php"]');
            if (!userLink) return null;
            const href = userLink.getAttribute('href') || '';
            const xidMatch = href.match(/XID=(\d+)/);
            if (!xidMatch) return null;
            return { honorWrap, userId: xidMatch[1] };
        }

        /** Collect all honor-text-wrap elements in root that have a user link ancestor, green/blue arrow, and are not yet processed */
        function scanArrows(root) {
            if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
            const arrows = root.querySelectorAll('img[src*="green-arrow.svg"], img[src*="blue-arrow.svg"]');
            console.log('nw - scanArrows', arrows);
            for (const arrow of arrows) {
                handleAddedArrow(arrow);
            }
        }

        function formatLastActionRelative(lastActionRelative) {
            if (typeof lastActionRelative !== 'string') return lastActionRelative;
            const secondsMatch = lastActionRelative.match(/^(\d+)\s*second/);
            if (secondsMatch) return `${secondsMatch[1]}s`;
            const minuteMatch = lastActionRelative.match(/^(\d+)\s*minute/);
            if (minuteMatch) return `${minuteMatch[1]}m`;
            const hourMatch = lastActionRelative.match(/^(\d+)\s*hour/);
            if (hourMatch) return `${hourMatch[1]}h`;
            const dayMatch = lastActionRelative.match(/^(\d+)\s*day/);
            if (dayMatch) return `${dayMatch[1]}d`;
            const weekMatch = lastActionRelative.match(/^(\d+)\s*week/);
            if (weekMatch) return `${weekMatch[1]}w`;
            const monthMatch = lastActionRelative.match(/^(\d+)\s*month/);
            if (monthMatch) return `${monthMatch[1]}m`;
            const yearMatch = lastActionRelative.match(/^(\d+)\s*year/);
            if (yearMatch) return `${yearMatch[1]}y`;
            return lastActionRelative;
        }

        function processRow(honorWrap, userId) {
            console.log('nw - processRow', honorWrap, userId);
            
            if (honorWrap.dataset.networthDone === '1') return;
            honorWrap.dataset.networthDone = '1';
            
            console.log('nw - processRow marked done', honorWrap, userId);


            if (getComputedStyle(honorWrap).position === 'static') {
                honorWrap.style.position = 'relative';
            }

            const overlayRight = document.createElement('div');
            overlayRight.style.cssText = OVERLAY_STYLE_RIGHT;
            honorWrap.appendChild(overlayRight);

            const overlayLeft = document.createElement('div');
            overlayLeft.style.cssText = OVERLAY_STYLE_LEFT;
            honorWrap.appendChild(overlayLeft);

            (async () => {
                const nwValue = await getNetworth(userId);
                const asdf = formatNetworth(nwValue, userId);
                overlayRight.appendChild(asdf);
                honorWrap.dataset.networth = nwValue ? `${nwValue}` : null;
                
                if (asdf.dataset.networthPiggy !== '1') {
                    return;
                }
                
                const profileRes = await fetch(`https://api.torn.com/user/${userId}?key=${PUBLIC_ACCESS_TOKEN}`).then(r => r.json()).catch(() => null);
                const userProfileData = profileRes || {};

                if (userProfileData.basicicons?.icon72 === 'Newbie') {
                    const newPlayerSpan = document.createElement('span');
                    newPlayerSpan.textContent = '👶';
                    newPlayerSpan.title = 'New player';
                    overlayLeft.appendChild(newPlayerSpan);
                }

                const lifeCurrent = userProfileData.life?.current;
                const lifeMax = userProfileData.life?.maximum;
                if (typeof lifeCurrent === 'number' && typeof lifeMax === 'number' && lifeMax > 0 && lifeCurrent !== lifeMax) {
                    const lifePercentage = Math.floor(lifeCurrent / lifeMax * 100);
                    const lifeSpan = document.createElement('span');
                    lifeSpan.textContent = '❤️' + lifePercentage + '%';
                    lifeSpan.title = 'Life percentage: ' + lifePercentage + '%';
                    honorWrap.dataset.lifePercentage = `${lifePercentage}`;
                    overlayLeft.appendChild(lifeSpan);
                }

                if (userProfileData.status?.description === 'Returning to Torn from Cayman Islands') {
                    const pigSpan = document.createElement('span');
                    pigSpan.textContent = '🐷';
                    pigSpan.title = 'Returning to Torn from Cayman Islands';
                    overlayLeft.appendChild(pigSpan);
                }

                const lastActionRelative = userProfileData.last_action?.relative;
                if (lastActionRelative != null) {
                    honorWrap.dataset.lastAction = userProfileData.last_action?.timestamp; //1772893224
                    const lastActionSpan = document.createElement('span');
                    lastActionSpan.textContent = formatLastActionRelative(lastActionRelative);
                    lastActionSpan.style.border = '1px dashed #666';
                    lastActionSpan.style.marginLeft = '4px';
                    lastActionSpan.title = 'Last action: ' + lastActionRelative;
                    overlayRight.appendChild(lastActionSpan);
                }
            })();
        }

        function handleAddedArrow(arrow) {
            console.log('nw - handleAddedArrow', arrow);
            const found = getHonorWrapAndUserIdFromArrow(arrow);
            if (found) {
                processRow(found.honorWrap, found.userId);
            }else{
                console.log('nw - honor wrap not found for arrow');
            }
        }

        function observeMutations() {
            const observer = new MutationObserver(mutations => {
                for (const mut of mutations) {
                    if (mut.type !== 'childList' || !mut.addedNodes.length) continue;
                    for (const node of mut.addedNodes) {
                        if (node.nodeType !== Node.ELEMENT_NODE) continue;
                        
                        injectFilterAreaIfNeeded(node);

                        if (!isGreenOrBlueScouterArrow(node)) {
                            // Also check children for arrows if node is a container
                            scanArrows(node);
                            continue;
                        }
                        handleAddedArrow(node);
                    }
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            injectFilterAreaIfNeeded(document.body);
            scanArrows(document.body);
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
