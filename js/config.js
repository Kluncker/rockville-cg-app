// Application Configuration
// This file contains configuration values for the Rockville CG app

// Google OAuth Configuration
// Replace this with your actual OAuth 2.0 Client ID from Google Cloud Console
// You can find it at: https://console.cloud.google.com/apis/credentials
const GOOGLE_OAUTH_CLIENT_ID = '619957877461-na835fa34dtiuvf8to91t3f2cfen8hdc.apps.googleusercontent.com';

// Export configuration
window.appConfig = {
    google: {
        oauthClientId: GOOGLE_OAUTH_CLIENT_ID,
        calendarScopes: 'https://www.googleapis.com/auth/calendar.events'
    }
};
