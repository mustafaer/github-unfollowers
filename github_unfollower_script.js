// ==UserScript==
// @name         GitHub Unfollower Viewer
// @version      1.2
// @description  Detect and view users who don't follow you back.
// @author       Mustafa ER
// @match        https://github.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // --- UI AND STYLE INJECTION ---

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #unfollower-ui-modal {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 400px;
                max-height: 80vh;
                background-color: #1c2128;
                color: #adbac7;
                border: 1px solid #444c56;
                border-radius: 8px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                box-shadow: 0 8px 24px rgba(0,0,0,0.4);
            }
            #unfollower-ui-header {
                padding: 12px 16px;
                border-bottom: 1px solid #444c56;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            #unfollower-ui-header h2 {
                margin: 0;
                font-size: 16px;
            }
            #unfollower-ui-close {
                background: none;
                border: none;
                color: #adbac7;
                font-size: 20px;
                cursor: pointer;
            }
            #unfollower-ui-body {
                padding: 16px;
                overflow-y: auto;
            }
            #unfollower-ui-progress-container {
                width: 100%;
                background: #2d333b;
                border-radius: 4px;
                height: 8px;
                margin-bottom: 10px;
            }
            #unfollower-ui-progress-bar {
                width: 0%;
                height: 100%;
                background: #316dca;
                transition: width 0.2s;
            }
            #unfollower-ui-list {
                list-style: none;
                padding: 0;
                margin: 0;
            }
            .unfollower-ui-item {
                display: flex;
                align-items: center;
                padding: 8px 0;
                border-bottom: 1px solid #2d333b;
            }
            .unfollower-ui-item:last-child {
                border-bottom: none;
            }
            .unfollower-ui-item img {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                margin-right: 10px;
            }
            #unfollower-scan-btn {
                margin-left: 8px;
            }
        `;
        document.head.appendChild(style);
    }

    function createModal() {
        const modal = document.createElement('div');
        modal.id = 'unfollower-ui-modal';
        modal.style.display = 'none'; // Hidden by default
        modal.innerHTML = `
            <div id="unfollower-ui-header">
                <h2 id="unfollower-ui-title">Scan Results</h2>
                <button id="unfollower-ui-close">&times;</button>
            </div>
            <div id="unfollower-ui-body">
                <div id="unfollower-ui-progress-container" style="display: none;">
                    <div id="unfollower-ui-progress-bar"></div>
                </div>
                <div id="unfollower-ui-message"></div>
                <ul id="unfollower-ui-list"></ul>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('unfollower-ui-close').onclick = () => {
            modal.style.display = 'none';
        };
        return modal;
    }

    function injectTriggerButton() {
        const actionsContainer = document.querySelector('.vcard-details');
        if (!actionsContainer) return;

        const scanButton = document.createElement('button');
        scanButton.textContent = 'Scan Unfollowers';
        scanButton.id = 'unfollower-scan-btn';
        scanButton.className = 'btn btn-sm';

        // Find the container for user metadata and append the button there.
        const metaDataContainer = document.querySelector('.vcard-details');
        if(metaDataContainer){
             metaDataContainer.insertAdjacentElement('beforeend', scanButton);
        }
        return scanButton;
    }


    console.log("GitHub follower difference script loaded.");

    // 1. Get username from the current GitHub page URL
    const username = window.location.pathname.split('/')[1];
    if (!username || window.location.pathname.split('/').length > 2) {
        console.error("Script stopped. Please navigate to a GitHub user's main profile page (e.g., https://github.com/username) and run the script again.");
        return;
    }
    console.log(`Scanning user: ${username}`);

    // 2. Helper function to fetch all pages from GitHub API
    async function fetchAllPages(url, entity) {
        let results = [];
        let page = 1;
        console.log(`Fetching ${entity}...`);
        while (true) {
            try {
                const response = await fetch(`${url}?page=${page}&per_page=100`);
                if (response.status === 403) {
                    const resetDate = new Date(response.headers.get('x-ratelimit-reset') * 1000);
                    console.warn(`GitHub API rate limit exceeded. Please wait until ${resetDate.toLocaleTimeString()} before trying again.`);
                    throw new Error("Rate limit exceeded");
                }
                if (!response.ok) {
                    throw new Error(`API request failed with status ${response.status}`);
                }
                const data = await response.json();
                if (data.length === 0) {
                    break; // No more data
                }
                results = results.concat(data);
                page++;
            } catch (error) {
                console.error(`Error fetching page ${page} of ${entity}:`, error);
                throw error;
            }
        }
        console.log(`Found ${results.length} ${entity}.`);
        return results;
    }

    // 3. Core function to detect the difference
    async function detectDiff(username, modal) {
        const progressBar = document.getElementById('unfollower-ui-progress-bar');
        const messageEl = document.getElementById('unfollower-ui-message');
        const listEl = document.getElementById('unfollower-ui-list');
        const progressContainer = document.getElementById('unfollower-ui-progress-container');
        const titleEl = document.getElementById('unfollower-ui-title');

        // Reset and show modal
        modal.style.display = 'flex';
        listEl.innerHTML = '';
        messageEl.textContent = '';
        progressBar.style.width = '0%';
        progressContainer.style.display = 'block';
        titleEl.textContent = `Scanning ${username}...`;

        try {
            messageEl.textContent = 'Fetching followers...';
            const followers = await fetchAllPages(`https://api.github.com/users/${username}/followers`, 'followers');
            progressBar.style.width = '50%';

            messageEl.textContent = 'Fetching following...';
            const following = await fetchAllPages(`https://api.github.com/users/${username}/following`, 'following');
            progressBar.style.width = '100%';

            const followerLogins = new Set(followers.map(f => f.login));
            const nonFollowers = following.filter(f => !followerLogins.has(f.login));

            progressContainer.style.display = 'none';
            messageEl.textContent = '';

            if (nonFollowers.length === 0) {
                titleEl.textContent = 'All good!';
                messageEl.textContent = 'Everyone you follow also follows you back.';
                return;
            }

            titleEl.textContent = `${nonFollowers.length} users don't follow back`;
            listEl.innerHTML = nonFollowers.map(user => `
                <li class="unfollower-ui-item">
                    <img src="${user.avatar_url}" alt="${user.login}">
                    <a href="${user.html_url}" target="_blank">${user.login}</a>
                </li>
            `).join('');

        } catch (error) {
            progressContainer.style.display = 'none';
            titleEl.textContent = 'Error';
            messageEl.textContent = `An error occurred during the scan: ${error.message}`;
        }
    }

    // 4. Run the script
    function initialize() {
        const username = window.location.pathname.split('/')[1];
        if (!username || window.location.pathname.split('/').length > 2) {
            return; // Don't run on non-profile pages
        }

        injectStyles();
        const modal = createModal();
        const scanButton = injectTriggerButton();

        if (scanButton) {
            scanButton.onclick = () => detectDiff(username, modal);
        }
    }

    initialize();

})();
