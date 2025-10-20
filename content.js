// --- Configuration ---
const BUTTON_CLASS = 'ai-reply-button-injected';
const LINKEDIN_POST_SELECTOR = '.feed-shared-update-v2'; // Common selector for a feed post
const INTERACTION_BAR_SELECTOR = '.feed-shared-social-actions'; // Where Like/Comment/Share buttons live

// --- Core Logic ---

/**
 * Creates the "✨ AI Reply" button element.
 * @returns {HTMLButtonElement} The button element.
 */
function createAIButton() {
    const button = document.createElement('button');
    button.textContent = '✨ AI Reply';
    button.className = BUTTON_CLASS;
    
    // Style the button to fit LinkedIn's aesthetic
    button.style.backgroundColor = 'transparent';
    button.style.border = 'none';
    button.style.color = '#0073B1'; // LinkedIn blue
    button.style.cursor = 'pointer';
    button.style.fontWeight = '600';
    button.style.fontSize = '14px';
    button.style.marginLeft = '10px';
    button.style.padding = '8px 12px';
    button.style.borderRadius = '20px';
    button.style.transition = 'background-color 0.2s';
    
    // Hover effect
    button.onmouseover = () => button.style.backgroundColor = 'rgba(0, 115, 177, 0.1)';
    button.onmouseout = () => button.style.backgroundColor = 'transparent';

    return button;
}

/**
 * Finds the main text content of a post element.
 * @param {HTMLElement} postElement The root element of the LinkedIn post.
 * @returns {string} The concatenated text of the post.
 */
function getPostText(postElement) {
    // Select common elements that hold the main content text
    const textBlocks = postElement.querySelectorAll('.feed-shared-update-v2__description-wrapper, .update-components-text');
    
    let fullText = '';
    textBlocks.forEach(block => {
        // Use textContent to get all text, including "see more" expanded content if available
        fullText += (block.textContent || '').trim() + ' ';
    });
    return fullText.trim();
}

/**
 * Injects the AI button into a single post element.
 * @param {HTMLElement} post The LinkedIn post element.
 */
function injectButton(post) {
    // 1. Find the social actions bar to place the button next to the default actions
    const interactionBar = post.querySelector(INTERACTION_BAR_SELECTOR);

    // 2. Ensure the button hasn't been injected already
    if (interactionBar && !post.querySelector(`.${BUTTON_CLASS}`)) {
        const aiButton = createAIButton();
        
        // 3. Attach click handler
        aiButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();

            const postText = getPostText(post);
            
            if (postText.length < 5) {
                 console.warn("Could not extract meaningful post text.");
                 // Optionally, you could use a temporary flash message on screen here instead of console.warn
            }

            // 4. Save the post text to storage so the extension popup can read it
            chrome.storage.local.set({ activePostText: postText, clicked: Date.now() }, () => {
                console.log('Post text saved to storage:', postText.substring(0, 100) + '...');
                // Note: content.js cannot programmatically open the popup. 
                // The user must click the extension icon in the toolbar.
            });
        });

        // 5. Inject the button (placing it before the last child of the interaction bar usually works well)
        if (interactionBar.lastElementChild) {
             interactionBar.insertBefore(aiButton, interactionBar.lastElementChild);
        } else {
             interactionBar.appendChild(aiButton);
        }
    }
}

/**
 * Processes the DOM to find all posts and inject the button.
 * @param {HTMLElement} root The root element to search within (usually document.body).
 */
function processNewNodes(root) {
    const posts = root.querySelectorAll(LINKEDIN_POST_SELECTOR);
    posts.forEach(injectButton);
}

// --- Mutation Observer Setup ---

// Watch the entire body for nodes being added/removed
const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === 1) { // Element node
                    // Process the added node itself and its descendants
                    processNewNodes(node);
                }
            });
        }
    });
});

// Start observing the document body for changes
observer.observe(document.body, { childList: true, subtree: true });

// Initial scan for posts already loaded
processNewNodes(document.body);
