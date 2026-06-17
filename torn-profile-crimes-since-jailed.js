// ==UserScript==
// @name         Torn profile crimes since last jailed
// @namespace    http://tampermonkey.net/
// @version      2026-05-26_02
// @description  Adds a "Fetch crimes" button on Torn profile pages showing crimes committed since last time jailed
// @author       mystify-321
// @match        https://www.torn.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.xmlHttpRequest
// @connect      api.torn.com
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/574010/Torn%20profile%20crimes%20since%20last%20jailed.user.js
// @updateURL https://update.greasyfork.org/scripts/574010/Torn%20profile%20crimes%20since%20last%20jailed.meta.js
// ==/UserScript==

// Set PUBLIC_ACCESS_TOKEN in Tampermonkey: Dashboard → this script → Storage (key: PUBLIC_ACCESS_TOKEN).
// Or click "Fetch crimes" on any profile page to enter it via the modal.

(function () {
    'use strict';

    const MONTH_SECONDS = 30 * 24 * 3600;

    function gmGet(url, headers) {
        return new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
                method: 'GET',
                url,
                headers,
                onload: (r) => resolve(r),
                onerror: () => reject(new Error('Network error')),
                ontimeout: () => reject(new Error('Request timed out')),
            });
        });
    }

    function getProfileUserId() {
        const url = new URL(window.location.href);
        return url.searchParams.get('XID');
    }

    async function fetchStat(userId, stat, timestamp, apiKey) {
        let url = `https://api.torn.com/v2/user/${userId}/personalstats?stat=${stat}`;
        if (timestamp != null) url += `&timestamp=${timestamp}`;
        const res = await gmGet(url, { Authorization: `ApiKey ${apiKey}` });
        if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
        const data = JSON.parse(res.responseText);
        if (data.error) throw new Error(data.error.error || 'API error');
        return data?.personalstats?.[0]?.value ?? 0;
    }

    async function computeCrimesSinceLastJailed(userId, apiKey, onStatus) {
        const nowTs = Math.floor(Date.now() / 1000);

        onStatus('Fetching current jailed count...');
        const jailedNow = await fetchStat(userId, 'jailed', nowTs, apiKey);

        if (jailedNow === 0) {
            onStatus('Player has never been jailed. Fetching current criminal offenses...');
            const offensesNow = await fetchStat(userId, 'criminaloffenses', nowTs, apiKey);
            return { crimes: offensesNow, neverJailed: true };
        }

        // 1-month steps up to 6, then every 2 months up to 12
        const steps = [1, 2, 3, 4, 5, 6, 8, 10, 12];
        let lastJailedTs = null;
        let lastJailedMonths = null;

        for (const m of steps) {
            const stepTs = nowTs - m * MONTH_SECONDS;
            onStatus(`Checking jailed count ${m} month(s) ago...`);
            const jailedAt = await fetchStat(userId, 'jailed', stepTs, apiKey);
            if (jailedAt < jailedNow) {
                lastJailedTs = stepTs;
                lastJailedMonths = m - 1;
                break;
            }
        }

        if (lastJailedMonths === 0) {
            onStatus('Player was jailed within the last month.');
            return { crimes: 0, monthsAgo: 0 };
        }

        const offsetTs = lastJailedTs ?? (nowTs - 12 * MONTH_SECONDS);
        onStatus('Fetching criminal offenses at time of last jail...');
        const offensesAtJail = await fetchStat(userId, 'criminaloffenses', offsetTs, apiKey);
        onStatus('Fetching current criminal offenses...');
        const offensesNow = await fetchStat(userId, 'criminaloffenses', nowTs, apiKey);

        return {
            crimes: offensesNow - offensesAtJail,
            monthsAgo: lastJailedMonths,
            moreThanAYear: lastJailedTs === null,
        };
    }

    function bindEscToClose(overlay) {
        const handler = (e) => {
            if (e.key !== 'Escape') return;
            document.removeEventListener('keydown', handler);
            if (overlay.isConnected) overlay.remove();
        };
        document.addEventListener('keydown', handler);
    }

    function showApiKeyModal(currentKey, onSave, onCancel) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999999;font-family:system-ui,sans-serif;';

        const box = document.createElement('div');
        box.style.cssText = 'background:#1a1a1a;color:#eee;padding:24px;border-radius:12px;width:360px;box-shadow:0 8px 32px rgba(0,0,0,.4);';
        box.innerHTML = '<p style="margin:0 0 8px;font-weight:bold;font-size:16px;">Torn API Key</p><p style="margin:0 0 14px;font-size:13px;color:#aaa;">Get a key from Torn → Profile → Preferences → API (use Public access).</p>';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentKey || '';
        input.placeholder = 'Public API key';
        input.style.cssText = 'width:100%;box-sizing:border-box;padding:10px 12px;margin-bottom:14px;border:1px solid #444;border-radius:6px;background:#2a2a2a;color:#eee;font-size:14px;';

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

        cancelBtn.addEventListener('click', () => {
            overlay.remove();
            if (onCancel) onCancel();
        });

        row.append(cancelBtn, saveBtn);
        box.append(input, row);
        overlay.append(box);
        document.body.appendChild(overlay);
        input.focus();
        bindEscToClose(overlay);
    }

    function openCrimesModal(userId, apiKey) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999998;font-family:system-ui,sans-serif;';

        const box = document.createElement('div');
        box.style.cssText = 'background:#1a1a1a;color:#eee;padding:24px;border-radius:12px;width:420px;box-shadow:0 8px 32px rgba(0,0,0,.4);';

        const titleRow = document.createElement('div');
        titleRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';

        const title = document.createElement('span');
        title.textContent = 'Crimes since last jailed';
        title.style.cssText = 'font-weight:bold;font-size:16px;';

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:6px;align-items:center;';

        const loadBtn = document.createElement('button');
        loadBtn.textContent = 'Load';
        loadBtn.style.cssText = 'padding:4px 10px;border:1px solid #555;border-radius:6px;background:transparent;color:#aaa;cursor:pointer;font-size:12px;';
        btnRow.append(loadBtn);

        if (!getProfileUserId()) {
            const loadAllBtn = document.createElement('button');
            loadAllBtn.textContent = 'Load all';
            loadAllBtn.style.cssText = 'padding:4px 10px;border:1px solid #555;border-radius:6px;background:transparent;color:#aaa;cursor:pointer;font-size:12px;';
            loadAllBtn.addEventListener('click', () => {
                overlay.remove();
                loadAllCrimes(apiKey);
            });
            btnRow.append(loadAllBtn);
        }

        const changeKeyBtn = document.createElement('button');
        changeKeyBtn.textContent = 'Change API key';
        changeKeyBtn.style.cssText = 'padding:4px 10px;border:1px solid #555;border-radius:6px;background:transparent;color:#aaa;cursor:pointer;font-size:12px;';
        changeKeyBtn.addEventListener('click', () => {
            overlay.remove();
            showApiKeyModal(GM_getValue('PUBLIC_ACCESS_TOKEN', ''), (newKey) => openCrimesModal(userId, newKey), null);
        });

        btnRow.append(changeKeyBtn);
        titleRow.append(title, btnRow);

        const statusEl = document.createElement('div');
        statusEl.style.cssText = 'font-size:14px;color:#ccc;min-height:60px;max-height:260px;overflow-y:auto;padding:12px;background:#111;border-radius:6px;line-height:1.5;white-space:pre-wrap;font-family:monospace;';
        statusEl.textContent = 'Ready.';

        const closeRow = document.createElement('div');
        closeRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-top:16px;';

        const linkStyle = 'font-size:13px;color:#7ab;text-decoration:none;margin-right:10px;';

        const linksLeft = document.createElement('div');

        const statsLink = document.createElement('a');
        statsLink.textContent = 'Stats';
        statsLink.href = `https://www.torn.com/personalstats.php?ID=${userId}&stats=criminaloffenses,jailed&from=6%20months`;
        statsLink.target = '_blank';
        statsLink.rel = 'noopener noreferrer';
        statsLink.style.cssText = linkStyle;
        linksLeft.append(statsLink);

        if (getProfileUserId() !== userId) {
            const profileLink = document.createElement('a');
            profileLink.textContent = 'Profile';
            profileLink.href = `https://www.torn.com/profiles.php?XID=${userId}`;
            profileLink.target = '_blank';
            profileLink.rel = 'noopener noreferrer';
            profileLink.style.cssText = linkStyle;
            linksLeft.append(profileLink);

        }

        const attackLink = document.createElement('a');
        attackLink.textContent = 'Attack';
        attackLink.href = `https://www.torn.com/loader.php?sid=attack&user2ID=${userId}`;
        attackLink.target = '_blank';
        attackLink.rel = 'noopener noreferrer';
        attackLink.style.cssText = linkStyle;
        linksLeft.append(attackLink);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.style.cssText = 'padding:8px 16px;border:1px solid #555;border-radius:6px;background:transparent;color:#ccc;cursor:pointer;font-size:14px;';
        closeBtn.addEventListener('click', () => overlay.remove());

        closeRow.append(linksLeft, closeBtn);
        box.append(titleRow, statusEl, closeRow);
        overlay.append(box);
        document.body.appendChild(overlay);
        bindEscToClose(overlay);

        function appendStatus(msg) {
            statusEl.textContent += '\n' + msg;
            statusEl.scrollTop = statusEl.scrollHeight;
        }

        function startLoad() {
            loadBtn.disabled = true;
            statusEl.textContent = 'Starting...';
            (async () => {
                try {
                    const result = await computeCrimesSinceLastJailed(userId, apiKey, appendStatus);
                    if (result.neverJailed) {
                        appendStatus(`ca ${result.crimes} crimes committed since last time jailed`);
                    } else if (result.moreThanAYear) {
                        appendStatus(`ca ${result.crimes} crimes committed since last time jailed more than a year ago`);
                    } else {
                        appendStatus(`ca ${result.crimes} crimes committed since last time jailed ${result.monthsAgo} months ago`);
                    }
                } catch (err) {
                    appendStatus(`Error: ${err.message}`);
                    loadBtn.disabled = false;
                }
            })();
        }

        loadBtn.addEventListener('click', startLoad);
    }

    function injectCrimesIcon(anchor, userId) {
		console.log('injectCrimesIcon')
        const honorWrap = anchor.querySelector('.honor-text-wrap');
        if (!honorWrap) return;
        if (honorWrap.querySelector('.tc-crimes-icon, .tc-crimes-result')) {
			console.log('injectCrimesIcon early return')
			return;
		}
        honorWrap.style.position = 'relative';
        const icon = document.createElement('button');
        icon.className = 'tc-crimes-icon';
        icon.dataset.userId = userId;
        icon.textContent = '🔍';
        icon.title = 'Fetch crimes since last jailed';
        icon.style.cssText = 'position:absolute;right:2px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.5);border:none;padding:1px 2px;cursor:pointer;font-size:10px;line-height:1;border-radius:2px;';
        icon.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const apiKey = GM_getValue('PUBLIC_ACCESS_TOKEN', '');
            if (!apiKey) {
                showApiKeyModal('', (key) => openCrimesModal(userId, key), null);
            } else {
                openCrimesModal(userId, apiKey);
            }
        });
        honorWrap.appendChild(icon);
    }

    function injectMiniProfileButton(wrapper, userId) {
		try {
		console.log('injectMiniProfileButton')
        const buttonWrap = wrapper.querySelector('.buttons-wrap');
        if (!buttonWrap || buttonWrap.querySelector('.tc-mini-crimes-btn')) {
			//console.log('injectMiniProfileButton early return');
			return;
		}
        const btn = document.createElement('span');
        btn.className = 'profile-button tc-mini-crimes-btn';
        const icon = document.createElement('span');
        icon.style.fontSize = '20px';
        icon.textContent = '🔍';
        btn.appendChild(icon);
        btn.style.cursor = 'pointer';
        btn.title = 'Fetch crimes since last jailed';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const apiKey = GM_getValue('PUBLIC_ACCESS_TOKEN', '');
            if (!apiKey) {
                showApiKeyModal('', (key) => openCrimesModal(userId, key), null);
            } else {
                openCrimesModal(userId, apiKey);
            }
        });
        buttonWrap.appendChild(btn);
		console.log('injectMiniProfileButton done')
		}catch(e){
			console.err('Failed injectMiniProfileButton',e);
		}
    }

    function scanForMiniProfiles(root) {
        const wrappers = document.querySelectorAll('[class*="profile-mini-_wrapper___"]');
        //console.log('scanForMiniProfiles found '+wrappers.length+' wrappers');
		for (const wrapper of wrappers) {
            const link = wrapper.querySelector('a[href*="XID="]');
            if (!link) {
				console.log('no profile link found in wrapper');
				continue;
			}
            const match = (link.getAttribute('href') || '').match(/XID=(\d+)/);
            if (!match) {
				console.log('no profile link match found in link');
				continue;
			}
            injectMiniProfileButton(wrapper, match[1]);
        }
    }

    function replaceIconWithResult(icon, crimes, statusLog) {
        const span = document.createElement('span');
        span.className = 'tc-crimes-result';
        span.style.cssText = 'position:absolute;right:2px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.5);padding:1px 2px;font-size:10px;line-height:1;border-radius:2px;cursor:default;color:#000;font-weight:bold;';
        span.textContent = String(crimes);
        span.title = statusLog;
        icon.replaceWith(span);
    }

    async function loadAllCrimes(apiKey) {
        const icons = Array.from(document.querySelectorAll('.tc-crimes-icon'));
        for (const icon of icons) {
            const userId = icon.dataset.userId;
            if (!userId || icon.dataset.loading) continue;
            icon.dataset.loading = '1';

            const statusLines = [];
            const onStatus = (msg) => {
                statusLines.push(msg);
                icon.title = statusLines.join('\n');
            };

            icon.textContent = '⏳';
            icon.disabled = true;

            try {
                const result = await computeCrimesSinceLastJailed(userId, apiKey, onStatus);

                let summary;
                if (result.neverJailed) {
                    summary = `${result.crimes} crimes (never jailed)`;
                } else if (result.moreThanAYear) {
                    summary = `${result.crimes} crimes (jailed >1yr ago)`;
                } else if (result.monthsAgo === 0) {
                    summary = `0 crimes (jailed <1mo ago)`;
                } else {
                    summary = `${result.crimes} crimes (jailed ${result.monthsAgo}mo ago)`;
                }

                const fullLog = statusLines.join('\n') + '\n\n' + summary;
                replaceIconWithResult(icon, result.crimes, fullLog);
            } catch (err) {
                statusLines.push(`Error: ${err.message}`);
                icon.textContent = '❌';
                icon.title = statusLines.join('\n');
                icon.disabled = false;
                delete icon.dataset.loading;
            }
        }
    }

    function scanForHonorWraps(root) {
        if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
        const anchors = root.querySelectorAll('a[href^="/profiles.php?XID="]');
        for (const a of anchors) {
            const match = (a.getAttribute('href') || '').match(/XID=(\d+)/);
            if (!match) continue;
            const honorWrap = a.querySelector('.honor-text-wrap');
            if (honorWrap) injectCrimesIcon(a, match[1]);
        }
    }

    function injectButton() {
        const userId = getProfileUserId();
        if (!userId) return;

        const buttonsList = document.querySelector('div.profile-container div.buttons-list');
        if (!buttonsList || buttonsList.querySelector('.tc-fetch-crimes-btn')) return;

        const btn = document.createElement('button');
        btn.className = 'tc-fetch-crimes-btn';
        btn.textContent = 'Fetch crimes';
        btn.style.cssText = 'padding:6px 14px;background:#2d7d46;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-family:system-ui,sans-serif;margin-left:6px;';
        btn.addEventListener('click', () => {
            const apiKey = GM_getValue('PUBLIC_ACCESS_TOKEN', '');
            if (!apiKey) {
                showApiKeyModal('', (key) => openCrimesModal(userId, key), null);
            } else {
                openCrimesModal(userId, apiKey);
            }
        });
        buttonsList.appendChild(btn);
    }

    function init() {
        injectButton();
        scanForHonorWraps(document.body);
        scanForMiniProfiles(document.body);
        const observer = new MutationObserver((mutations) => {
            injectButton();
            for (const mut of mutations) {
                for (const node of mut.addedNodes) {
                    scanForHonorWraps(node);
                    scanForMiniProfiles(node);
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
