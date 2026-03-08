// ==UserScript==
// @name         Torn Hide the non profitable
// @namespace    http://tampermonkey.net/
// @version      2026-03-08_02
// @description  Hide all the things that are not sellable with a profit
// @author       You
// @match        https://www.torn.com/page.php?sid=ItemMarket*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    GM_addStyle(`
        .jensim-hidden { display: none !important; }
        .jensim-no-price { background-color: rgba(195, 35, 35, 0.2) !important; }
        .jensim-bad-price { background-color: rgba(255, 0, 0, 0.2) !important; }
    `);

    const STORAGE_KEY_HIDE = 'market_filter_hide_without_profit';
    const STORAGE_KEY_MIN_AMOUNT = 'market_filter_min_amount_profit';
    const STORAGE_KEY_MIN_PERCENT = 'market_filter_min_percent_profit';
    const STORAGE_KEY_PRICES = 'market_item_sell_prices';

    let hideWithoutProfit = GM_getValue(STORAGE_KEY_HIDE, false);
    let minAmountProfit = GM_getValue(STORAGE_KEY_MIN_AMOUNT, 0);
    let minPercentProfit = GM_getValue(STORAGE_KEY_MIN_PERCENT, 0);
    let sellPrices = JSON.parse(GM_getValue(STORAGE_KEY_PRICES, '{}'));

    function saveSellPrice(itemId, price) {
        if (sellPrices[itemId] === price) return;
        sellPrices[itemId] = price;
        GM_setValue(STORAGE_KEY_PRICES, JSON.stringify(sellPrices));
        filterAllItemsWithId(itemId);
        console.log('Saved sell price for item', itemId, price);
    }

    function getItemIdFromSrc(src) {
        //console.log('getItemIdFromSrc', src);
        const match = src.match(/\/items\/(\d+)\//);
        return match ? match[1] : null;
    }

    function parsePrice(priceStr) {
        return parseInt(priceStr.replace(/[$,]/g, ''), 10);
    }

    function filterLi(li) {
        if (li.matches('[class*="itemInfoWrapper"]')) return;

        const img = li.querySelector('img.torn-item');
        if (!img) return;

        const itemId = getItemIdFromSrc(img.getAttribute('src'));
        if (!itemId) return;

        const priceWrapper = li.querySelector('[class^="priceAndTotal___"] span');
        if (!priceWrapper) return;

        const marketPrice = parsePrice(priceWrapper.textContent);
        const sellPrice = sellPrices[itemId];

        if (sellPrice === undefined) {
            li.classList.add('jensim-no-price');
            li.classList.remove('jensim-hidden');
        } else {
            li.classList.remove('jensim-no-price');
            const profit = sellPrice - marketPrice;
            const profitPercent = (profit / marketPrice) * 100;
            const buyButton = li.querySelectorAll('button[class^="buyButton___"]')[1];
            if (hideWithoutProfit && (profit < minAmountProfit || profitPercent < minPercentProfit)) {
                li.classList.add('jensim-bad-price');
                buyButton.classList.add('jensim-hidden');
            } else {
                console.log('Item', itemId, 'profit', profit, 'profitPercent', profitPercent, 'marketPrice', marketPrice, 'sellPrice', sellPrice);
                li.classList.remove('jensim-bad-price');
                buyButton.classList.remove('jensim-hidden');
            }
        }
    }

    function filterAllItemsWithId(itemId) {
        document.querySelectorAll('ul[class^="itemList___"] li').forEach(li => {
            const img = li.querySelector('img.torn-item');
            if (img && getItemIdFromSrc(img.getAttribute('src')) === itemId) {
                filterLi(li);
            }
        });
    }

    function filterAllItems() {
        document.querySelectorAll('ul[class^="itemList___"] li').forEach(filterLi);
    }

    function injectFilters() {
        const wrapper = document.querySelector('div[class^="filtersWrapper___"]');
        if (!wrapper || wrapper.querySelector('#tt-hide-no-profit-checkbox')) return;

        const container = document.createElement('div');
        container.style.display = 'inline-flex';
        container.style.alignItems = 'center';
        container.style.gap = '10px';
        container.style.marginLeft = '10px';

        const label = document.createElement('label');
        label.style.display = 'inline-flex';
        label.style.alignItems = 'center';
        label.style.cursor = 'pointer';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'tt-hide-no-profit-checkbox';
        checkbox.checked = hideWithoutProfit;
        checkbox.style.marginRight = '5px';

        checkbox.addEventListener('change', (e) => {
            hideWithoutProfit = e.target.checked;
            GM_setValue(STORAGE_KEY_HIDE, hideWithoutProfit);
            filterAllItems();
        });

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode('Hide without profit'));
        container.appendChild(label);

        // Min Amount Input
        const minAmountLabel = document.createElement('label');
        minAmountLabel.style.display = 'inline-flex';
        minAmountLabel.style.alignItems = 'center';
        minAmountLabel.appendChild(document.createTextNode('Min $ profit:'));
        const minAmountInput = document.createElement('input');
        minAmountInput.type = 'number';
        minAmountInput.value = minAmountProfit;
        minAmountInput.style.width = '80px';
        minAmountInput.style.marginLeft = '5px';
        minAmountInput.addEventListener('input', (e) => {
            minAmountProfit = parseInt(e.target.value, 10) || 0;
            GM_setValue(STORAGE_KEY_MIN_AMOUNT, minAmountProfit);
            filterAllItems();
        });
        minAmountLabel.appendChild(minAmountInput);
        container.appendChild(minAmountLabel);

        // Min Percent Input
        const minPercentLabel = document.createElement('label');
        minPercentLabel.style.display = 'inline-flex';
        minPercentLabel.style.alignItems = 'center';
        minPercentLabel.appendChild(document.createTextNode('Min % profit:'));
        const minPercentInput = document.createElement('input');
        minPercentInput.type = 'number';
        minPercentInput.value = minPercentProfit;
        minPercentInput.style.width = '50px';
        minPercentInput.style.marginLeft = '5px';
        minPercentInput.addEventListener('input', (e) => {
            minPercentProfit = parseFloat(e.target.value) || 0;
            GM_setValue(STORAGE_KEY_MIN_PERCENT, minPercentProfit);
            filterAllItems();
        });
        minPercentLabel.appendChild(minPercentInput);
        container.appendChild(minPercentLabel);

        wrapper.appendChild(container);
    }

    function handleItemInfo(infoLi) {
        console.log('handleItemInfo', infoLi);
        infoLi.childNodes.forEach(node => {
            console.log('node', node);
        })
        const divWithItemId = infoLi.querySelector('div[class*="item-info"]'); //id="wai-itemInfo-487-16652481851"
        if (!divWithItemId) {
            console.log('No div with item ID found');
            return;
        }
        console.log('divWithItemId', divWithItemId);
        if (!divWithItemId.id) {
            console.log('No div with item ID found');
            return;
        }
        const itemIdArr = divWithItemId.id.match(/itemInfo-(\d+)-\d+/);
        if (!itemIdArr) {
            console.log('Invalid item ID format');
            return;
        }
        const itemId = itemIdArr[1];
        if (!itemId) {
            console.log('No item ID found');
            return;
        }
        console.log('itemId', itemId);

        // If we already have the price, we might still want to check if it's there to be sure
        // But the requirement says: "find the item id, if the sale price is already stored, ignore it"
        if (sellPrices[itemId] !== undefined) return;

        console.log('Sell price already known for item', itemId);

        // Find "Sell:" price
        const properties = infoLi.querySelectorAll('li[class^="propertyWrapper___"]');
        for (const prop of properties) {
            const title = prop.querySelector('[class^="title___"]');
            if (title && title.textContent.trim() === 'Sell:') {
                const valueSpan = prop.querySelector('[class^="valueWrapper___"] span span[aria-hidden="true"]');
                if (valueSpan) {
                    if (valueSpan.textContent === 'N/A'){
                        saveSellPrice(itemId, 0);
                        continue
                    }
                    const price = parsePrice(valueSpan.textContent);
                    if (!isNaN(price)) {
                        console.log('Found sell price for item', itemId, price);
                        saveSellPrice(itemId, price);
                    }
                }
                break;
            }
        }
    }

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType !== Node.ELEMENT_NODE) return;

                // Check for itemList
                if (node.matches('li') && node.closest('ul[class^="itemList___"]')) {
                    filterLi(node);
                } else {
                    node.querySelectorAll('li').forEach(li => {
                        if (li.closest('ul[class^="itemList___"]')) {
                            filterLi(li);
                        }
                    });
                }

                // Check for itemInfoWrapper
                // The description says "Ignore <li> with the class itemInfoWrapper" for filtering,
                // but we use it to get the price.
                if (node.matches('li[class*="itemInfoWrapper"]')) {
                    //console.log('handleItemInfoWrapper_1', node);
                    handleItemInfo(node);
                } else if (node.matches('div[class^="item-info"]')) {
                    const itemInfoWrapper = node.closest('li[class^="itemInfoWrapper"]');
                    if (itemInfoWrapper) {
                        //console.log('handleItemInfoWrapper_2', node);
                        handleItemInfo(itemInfoWrapper);
                    }
                } else {
                    //console.log('handleItemInfoWrapper_3', node);
                    node.querySelectorAll('li[class*="itemInfoWrapper"]').forEach(handleItemInfo);
                }

                // Re-inject filters if filtersWrapper appears
                if (node.matches('div[class^="filtersWrapper___"]') || node.querySelector('div[class^="filtersWrapper___"]')) {
                    injectFilters();
                }
            });
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Initial run
    injectFilters();
    filterAllItems();

})();