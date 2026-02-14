I want the script to also work on the https://www.torn.com/factions.php*-page
it has a differnt structure, but the idea is the same.
When the green arrow image loads, find the <li class="table-row"> parent,
find the userID in the link to the user profile
<a rel="noopener noreferrer" class="linkWrap___ZS6r9 flexCenter___bV1QP" href="/profiles.php?XID=3340588" data-is-tooltip-opened="false" i-data="i_284_2229_200_19">
From that link, extract the userid
fetch networth, then append the div with networth under the <li class="table-row">