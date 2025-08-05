// Google Calendar OAuth Authentication Module

// Get configuration from config.js
const GOOGLE_CLIENT_ID = window.appConfig?.google?.oauthClientId || 'YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com';
const GOOGLE_CALENDAR_SCOPES = window.appConfig?.google?.calendarScopes || 'https://www.googleapis.com/auth/calendar.events';

// Token storage keys
const TOKEN_STORAGE_KEY = 'google_calendar_token';
const TOKEN_EXPIRY_KEY = 'google_calendar_token_expiry';

// Google Identity Services client
let tokenClient;
let accessToken = null;

// Initialize Google Identity Services
function initializeGoogleAuth() {
    // Load the Google Identity Services library
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
        // Initialize the token client
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: GOOGLE_CALENDAR_SCOPES,
            callback: handleAuthResponse,
        });
        
        // Check for existing token
        loadStoredToken();
    };
    document.head.appendChild(script);
}

// Handle OAuth response
function handleAuthResponse(response) {
    if (response.error) {
        console.error('OAuth error:', response);
        showNotification('Failed to authorize Google Calendar access', 'error');
        return;
    }
    
    // Store the access token
    accessToken = response.access_token;
    const expiryTime = new Date().getTime() + (response.expires_in * 1000);
    
    // Store in localStorage for persistence
    localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime);
    
    console.log('Google Calendar authorized successfully');
    showNotification('Google Calendar authorized successfully!', 'success');
    
    // Update UI to show authorized state
    updateAuthUI(true);
    
    // If there's a pending calendar action, execute it
    if (window.pendingCalendarAction) {
        window.pendingCalendarAction();
        window.pendingCalendarAction = null;
    }
}

// Load stored token if available
function loadStoredToken() {
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    const tokenExpiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
    
    if (storedToken && tokenExpiry) {
        const now = new Date().getTime();
        if (now < parseInt(tokenExpiry)) {
            accessToken = storedToken;
            updateAuthUI(true);
            return true;
        } else {
            // Token expired, clear it
            clearStoredToken();
        }
    }
    return false;
}

// Clear stored token
function clearStoredToken() {
    accessToken = null;
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    updateAuthUI(false);
}

// Request authorization
function requestGoogleCalendarAuth(callback) {
    if (accessToken && isTokenValid()) {
        // Already authorized
        if (callback) callback();
        return;
    }
    
    // Store the callback to execute after auth
    if (callback) {
        window.pendingCalendarAction = callback;
    }
    
    // Request authorization
    if (tokenClient) {
        tokenClient.requestAccessToken();
    } else {
        showNotification('Google authentication not initialized', 'error');
    }
}

// Check if token is valid
function isTokenValid() {
    if (!accessToken) return false;
    
    const tokenExpiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
    if (!tokenExpiry) return false;
    
    const now = new Date().getTime();
    return now < parseInt(tokenExpiry);
}

// Update UI based on auth state
function updateAuthUI(isAuthorized) {
    // Update calendar action buttons to show auth state
    const calendarButtons = document.querySelectorAll('.create-calendar-btn, .sync-calendar-btn');
    calendarButtons.forEach(button => {
        if (isAuthorized) {
            button.classList.add('authorized');
            button.title = button.title.replace(' (Authorization required)', '');
        } else {
            button.classList.remove('authorized');
            if (!button.title.includes('Authorization required')) {
                button.title += ' (Authorization required)';
            }
        }
    });
}

// Revoke Google Calendar access
function revokeGoogleCalendarAccess() {
    if (accessToken) {
        // Revoke the token
        fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }).then(() => {
            clearStoredToken();
            showNotification('Google Calendar access revoked', 'success');
        }).catch(error => {
            console.error('Error revoking token:', error);
            clearStoredToken();
        });
    }
}

// Get current access token
function getGoogleCalendarToken() {
    if (isTokenValid()) {
        return accessToken;
    }
    return null;
}

// Export functions
window.googleCalendarAuth = {
    initialize: initializeGoogleAuth,
    requestAuth: requestGoogleCalendarAuth,
    getToken: getGoogleCalendarToken,
    isAuthorized: isTokenValid,
    revoke: revokeGoogleCalendarAccess
};
