// ==UserScript==
// @name         Load FF score on weav3r bazaar listings
// @namespace    http://tampermonkey.net/
// @version      2026-07-08_1
// @description  try to take over the world!
// @author       You
// @match        https://weav3r.dev/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=weav3r.dev
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
    const CACHE_KEY_PREFIX = 'ff_score_';
    const staggerRequestTimeoutMs = 500;
    let staggeredRequestTimeEpoch = Date.now();

    function getStaggeredRequestTime(){
        const now = Date.now();
        if (staggeredRequestTimeEpoch < now){
            staggeredRequestTimeEpoch = now + staggerRequestTimeoutMs;
            return null;
        } else {
            const time =  staggeredRequestTimeEpoch;
            staggeredRequestTimeEpoch += staggerRequestTimeoutMs;
            return time - now;
        }
    }

    function awaitStaggeredRequestTime(){
        const time = getStaggeredRequestTime();
        if (time == null) Promise.resolve();
        return new Promise(resolve => setTimeout(resolve, time));
    }

    function loadCachedFfScore(userId){
        const cached = localStorage.getItem(CACHE_KEY_PREFIX + userId);
        if (!cached) return null;
        const {score, timestamp} = JSON.parse(cached);
        if (Date.now() - timestamp >= CACHE_TTL_MS) return null;
        return score;
    }

    function setCachedFfScore(userId, score){
        localStorage.setItem(CACHE_KEY_PREFIX + userId, JSON.stringify({score, timestamp: Date.now()}));
    }

    async function getFfScore(userId){
        const cached = loadCachedFfScore(userId);
        if (cached != null) return cached;

        await awaitStaggeredRequestTime();
        const key = GM_getValue('FF_SCOUTER_API_KEY');
        if (!key) return null;
        const url = `https://ffscouter.com/api/v1/get-stats?key=${key}&targets=${userId}`;
        console.log('getFfScore: url', url);
        const response = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                onload: resolve,
                onerror: () => reject(new Error('GM_xmlhttpRequest failed'))
            });
        });
        if (response.status < 200 || response.status >= 300) {
            console.log('bad response', response);
            if(response.status === 401 || response.status === 403){
                GM_setValue('FF_SCOUTER_API_KEY', null);
            }
            return null;
        }
        let data;
        try {
            data = JSON.parse(response.responseText);
        } catch (_) {
            return null;
        }
        const score = data[0]?.fair_fight;
        if (score && typeof score === 'number') {
            setCachedFfScore(userId, score);
            return score;
        }
        return null;
    }

    const BAZAAR_PATH = 'bazaar.php';
    function getUserIdFromBazaarLink(link) {
        if (!link || link.tagName !== 'A' || !link.href) return null;
        try {
            const url = new URL(link.href, document.baseURI);
            if (!url.pathname.endsWith(BAZAAR_PATH)) return null;
            const userId = url.searchParams.get('userId');
            return userId || null;
        } catch (_) {
            return null;
        }
    }

    function isBazaarUserLink(link) {
        return link && link.tagName === 'A' && getUserIdFromBazaarLink(link) != null;
    }

    async function decorateLinkWithFfScore(link, userId) {
        const score = await getFfScore(userId);
        const base = (link.textContent || '').trim();
        if (score != null && typeof score === 'number') {
            const scoreSpan = document.createElement('span');
            scoreSpan.textContent = ' (FF: ' + score + ')';
            if (score > 3.7) {
                scoreSpan.style.color = '#F33';
            } else if (score > 2.7) {
                scoreSpan.style.color = '#3F3';
            } else {
                scoreSpan.style.color = '#33F';
            }
            link.appendChild(scoreSpan);
            const userProfileLink = document.createElement('a');
            userProfileLink.target = '_blank';
            userProfileLink.href = `https://www.torn.com/profiles.php?XID=${userId}`;
            userProfileLink.textContent = userId;
            link.insertAdjacentElement('afterend', userProfileLink);
        } else {
            link.textContent = base + ' (FF: —)';
        }
        link.dataset.ffProcessed = '1';
    }

    async function processRootForBazaarLinks() {
        if(Date.now() < staggeredRequestTimeEpoch + 2000) return;
        staggeredRequestTimeEpoch = Date.now();

        const root = document.body;
        if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
        const links = root.tagName === 'A' ? [root] : [];
        const desc = root.querySelectorAll ? root.querySelectorAll('a[href*="bazaar.php?userId="]') : [];
        const seen = new Set(links);
        for (const a of desc) {
            if (!seen.has(a)) {
                seen.add(a);
                links.push(a);
            }
        }
        for (const link of links) {
            if (link.dataset.ffProcessed) continue;
            const userId = getUserIdFromBazaarLink(link);
            if (userId == null) continue;
            await decorateLinkWithFfScore(link, userId);
        }
    }

    function showApiKeyModal(onSaved) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:999999;';
        const box = document.createElement('div');
        box.style.cssText = 'background:#1a1a1a;color:#eee;padding:20px;border-radius:8px;min-width:320px;box-shadow:0 4px 20px rgba(0,0,0,0.4);';
        box.innerHTML = `
            <p style="margin:0 0 12px;font-weight:600;">FF Scouter API key not set</p>
            <p style="margin:0 0 12px;font-size:13px;color:#aaa;">Enter your API key to show Fair Fight scores on bazaar links.</p>
            <input type="password" id="ff-scouter-api-key-input" placeholder="API key" style="width:100%;box-sizing:border-box;padding:8px 10px;margin-bottom:12px;border:1px solid #444;border-radius:4px;background:#2a2a2a;color:#eee;">
            <div style="display:flex;gap:8px;justify-content:flex-end;">
                <button type="button" id="ff-scouter-api-key-save" style="padding:8px 16px;background:#0a7;color:#fff;border:none;border-radius:4px;cursor:pointer;">Save</button>
                <button type="button" id="ff-scouter-api-key-close" style="padding:8px 16px;background:#444;color:#eee;border:none;border-radius:4px;cursor:pointer;">Close</button>
            </div>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        const input = box.querySelector('#ff-scouter-api-key-input');
        const close = () => {
            overlay.remove();
        };
        box.querySelector('#ff-scouter-api-key-save').addEventListener('click', () => {
            const value = (input.value || '').trim();
            if (value) {
                GM_setValue('FF_SCOUTER_API_KEY', value);
                close();
                if (typeof onSaved === 'function') onSaved();
            }
        });
        box.querySelector('#ff-scouter-api-key-close').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        input.focus();
    }

    function startObserver() {
        const apiKey = GM_getValue('FF_SCOUTER_API_KEY');
        if (!apiKey || (typeof apiKey === 'string' && !apiKey.trim())) {
            showApiKeyModal(() => {
                window.location.reload();
            });
            return;
        }

        const observer = new MutationObserver(() => {
            processRootForBazaarLinks();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        try{
            processRootForBazaarLinks();
        } catch (error) {
            console.error('startObserver: error', error);
        }

        setInterval(() => {
            processRootForBazaarLinks();
        }, 3000);
    }

    if (document.readyState === 'loading' || !document.body) {
        console.log('startObserver while loading: document.readyState', document.readyState);
        document.addEventListener('DOMContentLoaded', startObserver);
    } else {
        console.log('startObserver: document.readyState', document.readyState);
        startObserver();
    }
})();
