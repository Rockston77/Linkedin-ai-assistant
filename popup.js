// --- Configuration & Constants ---
// Updated to use the actual Gemini API endpoint and structure for LLM calls
const API_KEY = ""; // Placeholder for the API Key. Canvas will provide this during runtime.
const MODEL_NAME = 'gemini-2.5-flash-preview-09-2025';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;
const MAX_POST_CHARS = 300;

// --- DOM Elements ---
const postTextDisplay = document.getElementById('postTextDisplay');
const toneSelect = document.getElementById('tone');
const commentButton = document.getElementById('generateComments');
const commentSuggestionsDiv = document.getElementById('commentSuggestions');
const postTopicInput = document.getElementById('postTopic');
const charCountSpan = document.getElementById('charCount');
const generatePostButton = document.getElementById('generatePost');
const postOutputDiv = document.getElementById('postOutput');
const statusMessage = document.getElementById('statusMessage');

// --- State and Utility Functions ---

/**
 * Shows a status message to the user.
 * @param {string} message The message to display.
 * @param {boolean} isError If true, styles as an error.
 */
function showStatus(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.style.display = 'block';
    statusMessage.style.backgroundColor = isError ? '#ffe8e8' : '#e6f7ff';
    statusMessage.style.color = isError ? '#b00000' : '#005691';
    
    setTimeout(() => {
        statusMessage.style.display = 'none';
    }, 5000);
}

/**
 * Copies the provided text to the user's clipboard.
 * @param {string} text The text content to copy.
 */
function copyToClipboard(text) {
    // navigator.clipboard works in the extension popup environment
    navigator.clipboard.writeText(text)
        .then(() => showStatus('Copied to clipboard! Ready to paste.', false))
        .catch(err => {
            console.error('Copy failed:', err);
            showStatus('Failed to copy. Please select and copy manually.', true);
        });
}

/**
 * Generates the HTML for a single suggestion card.
 * @param {string} text The comment or post text.
 * @returns {string} The HTML string.
 */
function createSuggestionCard(text) {
    return `
        <div class="suggestion-card">
            <p>${text.replace(/\n/g, '<br>')}</p>
            <button class="copy-button" data-text="${text.replace(/"/g, '&quot;')}" title="Copy to Clipboard">
                Copy
            </button>
        </div>
    `;
}

/**
 * Handles exponential backoff for API retries.
 * @param {Function} fn The function to retry.
 * @param {number} maxRetries The maximum number of retries.
 * @param {number} delay Initial delay in milliseconds.
 * @returns {Promise<any>}
 */
async function withRetry(fn, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            console.warn(`API call failed, retrying in ${delay / 1000}s...`, error.message);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
        }
    }
}


// --- API Call Logic (Updated for Gemini API with JSON Schema) ---

/**
 * Fetches suggestions from the Gemini API using structured JSON output.
 * @param {object} payload - Contains type (comment/post), input, and tone.
 * @returns {Promise<object | null>} The parsed JSON response object or null on error.
 */
async function generateContent(payload) {
    const targetDiv = payload.type === 'comment' ? commentSuggestionsDiv : postOutputDiv;
    targetDiv.innerHTML = '<div class="loading">Generating authentic suggestions using Gemini...</div>';

    // Disable buttons
    commentButton.disabled = true;
    generatePostButton.disabled = true;

    const tone = toneSelect.value;
    const isComment = payload.type === 'comment';
    
    // 1. Define System Instruction based on tone and requirements
    const systemPrompt = `You are a world-class LinkedIn engagement assistant. Your goal is to generate human-like, authentic, and value-driven content.
    The output MUST strictly follow the provided JSON schema.
    Current Tone Profile: ${tone}.
    Rules:
    - Never use generic praise like "Great post!" or "Agree 100%."
    - Always provide insight, a thoughtful extension, or a gentle, high-value question.`;

    // 2. Define User Query
    let userQuery;
    if (isComment) {
        userQuery = `Based on the following LinkedIn post, provide exactly 3 distinct, high-quality comment suggestions that fit the system instructions.
        POST TEXT: "${payload.input}"`;
    } else { // Post
        userQuery = `Write a short, professional LinkedIn post on the following topic. The post MUST NOT exceed ${MAX_POST_CHARS} characters in length. Include a thoughtful hook and a clear call to action or insight.
        TOPIC: "${payload.input}"`;
    }
    
    // 3. Define JSON Schema for structured output
    let responseSchema;
    if (isComment) {
        responseSchema = {
            type: "OBJECT",
            properties: {
                "suggestions": {
                    "type": "ARRAY",
                    "description": "Exactly three distinct, professional comment suggestions.",
                    "items": { "type": "STRING" }
                }
            }
        };
    } else { // Post
         responseSchema = {
            type: "OBJECT",
            properties: {
                "output": {
                    "type": "STRING",
                    "description": "The final LinkedIn post content, strictly under 300 characters."
                }
            }
        };
    }

    const apiCall = async () => {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: userQuery }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: responseSchema
                },
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const result = await response.json();
        
        // Extract the raw JSON string from the response
        const jsonText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonText) {
            throw new Error('Could not parse text response from API.');
        }

        // Parse the JSON string
        return JSON.parse(jsonText);
    };

    try {
        const data = await withRetry(apiCall);
        return data;
    } catch (error) {
        console.error('AI Generation Error:', error);
        targetDiv.innerHTML = '<div class="alert-box">Error generating content. The AI service may be unavailable or the response format was invalid.</div>';
        showStatus('Generation failed.', true);
        return null;
    } finally {
        // Re-enable buttons regardless of success/failure
        commentButton.disabled = false;
        generatePostButton.disabled = false;
    }
}


// --- Event Handlers (Modified to handle JSON output) ---

/** Handles the generation of comments. */
async function handleGenerateComments() {
    const postText = postTextDisplay.value;
    if (!postText || postText.length < 10) {
        showStatus('Please click the "✨ AI Reply" button on a LinkedIn post first.', true);
        return;
    }

    const data = await generateContent({
        type: 'comment',
        input: postText
    });

    if (data && data.suggestions && Array.isArray(data.suggestions)) {
        let html = data.suggestions.map(createSuggestionCard).join('');
        commentSuggestionsDiv.innerHTML = html;
    } else if (data) {
         // Handle case where API response is unexpected but successful (e.g., missing 'suggestions' key)
         commentSuggestionsDiv.innerHTML = '<div class="alert-box">AI returned an unexpected format. Could not find suggestions array.</div>';
    }
}

/** Handles the generation of a post. */
async function handleGeneratePost() {
    const topic = postTopicInput.value.trim();
    if (!topic) {
        showStatus('Please enter a topic for your post.', true);
        return;
    }

    const data = await generateContent({
        type: 'post',
        input: topic
    });

    if (data && data.output) {
        // Check character limit, although LLM is instructed to respect it
        if (data.output.length > MAX_POST_CHARS) {
             showStatus(`Warning: Generated post is ${data.output.length} characters (over ${MAX_POST_CHARS} limit). Please shorten it manually.`, true);
        }
        postOutputDiv.innerHTML = createSuggestionCard(data.output);
    } else if (data) {
         // Handle case where API response is unexpected but successful (e.g., missing 'output' key)
         postOutputDiv.innerHTML = '<div class="alert-box">AI returned an unexpected format. Could not find output key.</div>';
    }
}


/** Handles tab switching. */
function switchTab(targetId) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.getElementById(targetId).style.display = 'block';

    document.querySelectorAll('.tab-button').forEach(el => el.classList.remove('active'));
    document.querySelector(`[data-tab="${targetId}"]`).classList.add('active');

    // Clear status when switching tabs
    statusMessage.style.display = 'none';
    
    // Automatically attempt generation if the tab is switched and conditions are met
    if (targetId === 'commentTab' && postTextDisplay.value && commentSuggestionsDiv.children.length === 0) {
        handleGenerateComments();
    }
}

// --- Initialization and Storage ---

/** Saves the currently selected tone to storage. */
function saveTone() {
    chrome.storage.local.set({ userTone: toneSelect.value });
}

/** Loads saved tone and post text when the popup opens. */
function initializePopup() {
    chrome.storage.local.get(['userTone', 'activePostText'], (result) => {
        // 1. Load Tone
        if (result.userTone) {
            toneSelect.value = result.userTone;
        }

        // 2. Load Post Text
        if (result.activePostText) {
            postTextDisplay.value = result.activePostText;
            commentButton.disabled = false;
            
            // Immediately attempt generation if we have text and haven't generated yet
            if (commentSuggestionsDiv.children.length === 0) {
                handleGenerateComments();
            }
        } else {
            postTextDisplay.value = 'No post selected. Go to LinkedIn and click "✨ AI Reply" on a post.';
        }
        
        // 3. Update character counter for Post tab
        postTopicInput.dispatchEvent(new Event('input'));
    });
}

// --- Main Setup ---
document.addEventListener('DOMContentLoaded', () => {
    initializePopup();

    // Setup Tab Handlers
    document.getElementById('commentButton').addEventListener('click', () => switchTab('commentTab'));
    document.getElementById('postButton').addEventListener('click', () => switchTab('postTab'));

    // Setup Generation Handlers
    commentButton.addEventListener('click', handleGenerateComments);
    generatePostButton.addEventListener('click', handleGeneratePost);
    
    // Setup Tone Saver
    toneSelect.addEventListener('change', saveTone);

    // Setup Post Topic Character Counter
    postTopicInput.addEventListener('input', () => {
        const len = postTopicInput.value.length;
        charCountSpan.textContent = len;
        charCountSpan.style.color = len > MAX_POST_CHARS ? '#b00000' : '#333';
        generatePostButton.disabled = len === 0 || len > MAX_POST_CHARS;
    });

    // Setup Dynamic Copy Buttons Listener (Delegation)
    document.addEventListener('click', (event) => {
        const copyBtn = event.target.closest('.copy-button');
        if (copyBtn) {
            const textToCopy = copyBtn.getAttribute('data-text');
            if (textToCopy) {
                copyToClipboard(textToCopy);
            }
        }
    });
});
