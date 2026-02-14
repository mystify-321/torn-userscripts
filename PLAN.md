# Userscript to load networth for torn users on any page with a userList

The userscript is inside the index.js file. All additional code must be there.

On pager where a <div class="userlist-wrapper"> element appears,
and <ul class="user-info-list-wrap ..."> inside of that
and <li class="user3865129 ..."> inside of that, the class user______ is important here,
as the number is the userID, which we'll need later.

Trigger on the loading of an image inside the <li> tag that looks like this
<img class="tt-ff-scouter-arrow" src=".../green-arrow.svg">, do not trigger no other images loading!

Fetch the user networth from the torn API
GET https://api.torn.com/v2/user/3865129/personalstats?stat=networth
Authorization: ApiKey ${PUBLIC_ACCESS_TOKEN}

the response looks like this
{"personalstats": [{
"name": "networth",
"value": 1947662955,
"timestamp": 1770940800
}]}

The result of these API calls need to be stored in local storage to avoid heavy api usage,
and the result should be cached there for 1 week before it expires. Check the cache before making API calls.

Add a <li> to the <ul id="iconTray"> inside of the <li class="user3865129 ..."> tag.
This new <li> tag should contain that users networth, rounded to use B,M,k short-form