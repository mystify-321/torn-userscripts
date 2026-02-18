// ==UserScript==
// @name         Landing time
// @namespace    http://tampermonkey.net/
// @version      2026-02-17
// @description  try to take over the world!
// @author       You
// @match        https://www.torn.com/profiles.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
    'use strict';

    let description;
    let baseTravelString;
    let arriveTime = null;

    const min = 60 * 1000;
    const hour = 60 * min;
    let landing_times_ms = {
        "Mexico": [
            26 * min,
            18 * min
        ],
        "Cayman Islands": [
            35 * min,
            25 * min
        ],
        "Canada": [
            41 * min,
            29 * min
        ],
        "Hawaii": [
            2 * hour + 14 * min,
            1 * hour + 34 * min
        ],
        "United Kingdom": [
            2 * hour + 39 * min,
            1 * hour + 51 * min
        ],
        "Argentina": [
            2 * hour + 47 * min,
            1 * hour + 57 * min
        ],
        "Switzerland": [
            2 * hour + 55 * min,
            2 * hour + 3 * min
        ],
        "Japan": [
            3 * hour + 45 * min,
            2 * hour + 38 * min
        ],
        "China": [
            4 * hour + 2 * min,
            2 * hour + 49 * min
        ],
        "UAE": [
            4 * hour + 31 * min,
            3 * hour + 10 * min
        ],
        "South Africa": [
            4 * hour + 57 * min,
            3 * hour + 28 * min
        ],
    }
    let PUBLIC_ACCESS_TOKEN = GM_getValue('PUBLIC_ACCESS_TOKEN');
    function getPublicKey() {
        if (!PUBLIC_ACCESS_TOKEN) {
            const input = window.prompt('Enter your Torn PUBLIC_ACCESS_TOKEN (from https://www.torn.com/preferences.php#tab=api):');
            if (!input || !input.trim()) {
                console.error('PUBLIC_ACCESS_TOKEN is required. Get one from Torn Preferences → API.');
                return;
            }
            PUBLIC_ACCESS_TOKEN = input.trim();
            GM_setValue('PUBLIC_ACCESS_TOKEN', PUBLIC_ACCESS_TOKEN);
        }
    }
    getPublicKey();

    function getUserId() {
        const url = new URL(window.location.href);
        return url.searchParams.get('XID');
    }

    async function getLandingTime(isPi, country) {
        // if the arrive time and baseTravelString are already in localStorage, use them
        const userId = getUserId();
        const arriveTimeStored = localStorage.getItem('arriveTime_' + userId);
        const baseTravelStringStored = localStorage.getItem('baseTravelString_' + userId);
        arriveTime = parseInt(arriveTimeStored)
        if (arriveTimeStored && baseTravelStringStored && baseTravelStringStored === baseTravelString && !isNaN(arriveTime) && arriveTime > Date.now()) {
            return;
        }
        localStorage.removeItem('arriveTime_' + userId);
        localStorage.removeItem('baseTravelString_' + userId);

        const userProfile = await fetch(`https://api.torn.com/user/${userId}?key=${PUBLIC_ACCESS_TOKEN}`);
        const userProfileData = await userProfile.json();
        const lastAction = userProfileData.last_action.timestamp * 1000;
        arriveTime = lastAction + landing_times_ms[country][isPi ? 1 : 0];
        // store the arrive time and baseTravelString in localStorage
        localStorage.setItem('arriveTime_' + userId, arriveTime);
        localStorage.setItem('baseTravelString_' + userId, baseTravelString);
    }

    function updateArriveTime() {
        if (!arriveTime) return;
        if (!description) return;

        if (isNaN(arriveTime)) return;
        const now = Date.now();
        const timeToLand = arriveTime - now;
        if (timeToLand > hour) {
            const hours = Math.floor(timeToLand / hour);
            const minutes = Math.floor((timeToLand % hour) / min);
            description.textContent = `${baseTravelString} (${hours}h${minutes}m)`;
        } else if (timeToLand > min) {
            const minutes = Math.floor(timeToLand / min);
            const seconds = Math.floor((timeToLand % min) / 1000);
            description.textContent = `${baseTravelString} (${minutes}m${seconds}s)`;
        } else {
            const seconds = Math.floor(timeToLand / 1000);
            description.textContent = `${baseTravelString} (${seconds}s)`;
        }
    }

    function getCountry(description) {
        const returnString = 'Returning to Torn from ';
        const travelString = 'Traveling to '
        if (!description || !description.textContent || (!description.textContent.startsWith(returnString) && !description.textContent.startsWith(travelString))) return null;
        if (description.textContent.startsWith(returnString)) {
            return description.textContent.slice(returnString.length).trim();
        } else {
            return description.textContent.slice(travelString.length).trim();
        }
        return null;
    }

    async function main() {
        try {
            description = document.querySelector('div.description div.desc-wrap span.main-desc');
            $(description).click(getPublicKey);

            baseTravelString = description?.textContent;
            if (description.dataset.laningtimeprocessed) return;
            const country = getCountry(description);

            const propertyLink = document.querySelector('a[href^="/properties.php"]')
            const idPi = propertyLink && propertyLink.textContent === 'Private Island'
            await getLandingTime(idPi, country);
            updateArriveTime();
        } catch (error) {
            console.error('main error', error);
        }
    }
    setTimeout(main, 1000);
    setInterval(updateArriveTime, 1000);
})();
