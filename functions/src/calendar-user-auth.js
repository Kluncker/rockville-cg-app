// Google Calendar Integration Functions with User OAuth

const { google } = require("googleapis");

// Create calendar event using user's OAuth token
async function createCalendarEventWithUserAuth(token, eventData, attendeeEmails) {
    try {
        // Create OAuth2 client with the user's access token
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: token });
        
        // Create calendar instance with OAuth client
        const calendar = google.calendar({ version: "v3", auth: oauth2Client });
        
        // Convert event data to Google Calendar format
        const startDateTime = new Date(`${eventData.date}T${eventData.time || "09:00"}:00`);
        const endDateTime = new Date(startDateTime);
        endDateTime.setHours(startDateTime.getHours() + 2); // Default 2-hour duration
        
        const calendarEvent = {
            summary: eventData.title,
            description: eventData.description || "",
            location: eventData.location || "",
            start: {
                dateTime: startDateTime.toISOString(),
                timeZone: "America/New_York"
            },
            end: {
                dateTime: endDateTime.toISOString(),
                timeZone: "America/New_York"
            },
            attendees: attendeeEmails.map(email => ({ email })),
            guestsCanModify: true, // Allow attendees to modify the event
            reminders: {
                useDefault: false,
                overrides: [
                    { method: "email", minutes: 24 * 60 }, // 1 day before
                    { method: "popup", minutes: 60 } // 1 hour before
                ]
            }
        };
        
        // Create the event in user's primary calendar
        const response = await calendar.events.insert({
            calendarId: "primary", // User's primary calendar
            resource: calendarEvent,
            sendUpdates: "all" // Send invitations to attendees
        });
        
        return {
            success: true,
            calendarEventId: response.data.id,
            calendarLink: response.data.htmlLink
        };
    } catch (error) {
        console.error("Error creating calendar event with user auth:", error);
        
        // Handle specific OAuth errors
        if (error.message?.includes("invalid_grant") || error.message?.includes("Token has been expired")) {
            return {
                success: false,
                error: "Your Google Calendar authorization has expired. Please re-authorize to continue.",
                requiresReauth: true
            };
        }
        
        if (error.message?.includes("insufficient")) {
            return {
                success: false,
                error: "Insufficient permissions to create calendar events. Please re-authorize with calendar permissions.",
                requiresReauth: true
            };
        }
        
        return {
            success: false,
            error: error.message || "Failed to create calendar event"
        };
    }
}

// Update calendar event using user's OAuth token
async function updateCalendarEventWithUserAuth(token, calendarEventId, eventData, attendeeEmails) {
    try {
        // Create OAuth2 client with the user's access token
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: token });
        
        // Create calendar instance with OAuth client
        const calendar = google.calendar({ version: "v3", auth: oauth2Client });
        
        const startDateTime = new Date(`${eventData.date}T${eventData.time || "09:00"}:00`);
        const endDateTime = new Date(startDateTime);
        endDateTime.setHours(startDateTime.getHours() + 2);
        
        const calendarEvent = {
            summary: eventData.title,
            description: eventData.description || "",
            location: eventData.location || "",
            start: {
                dateTime: startDateTime.toISOString(),
                timeZone: "America/New_York"
            },
            end: {
                dateTime: endDateTime.toISOString(),
                timeZone: "America/New_York"
            },
            attendees: attendeeEmails.map(email => ({ email })),
            guestsCanModify: true // Allow attendees to modify the event
        };
        
        // Update the event in user's primary calendar
        const response = await calendar.events.update({
            calendarId: "primary", // User's primary calendar
            eventId: calendarEventId,
            resource: calendarEvent,
            sendUpdates: "all"
        });
        
        return {
            success: true,
            calendarLink: response.data.htmlLink
        };
    } catch (error) {
        console.error("Error updating calendar event with user auth:", error);
        
        // Handle specific OAuth errors
        if (error.message?.includes("invalid_grant") || error.message?.includes("Token has been expired")) {
            return {
                success: false,
                error: "Your Google Calendar authorization has expired. Please re-authorize to continue.",
                requiresReauth: true
            };
        }
        
        if (error.code === 404) {
            return {
                success: false,
                error: "Calendar event not found. It may have been deleted from Google Calendar."
            };
        }
        
        return {
            success: false,
            error: error.message || "Failed to update calendar event"
        };
    }
}

// Delete calendar event using user's OAuth token
async function deleteCalendarEventWithUserAuth(token, calendarEventId) {
    try {
        // Create OAuth2 client with the user's access token
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: token });
        
        // Create calendar instance with OAuth client
        const calendar = google.calendar({ version: "v3", auth: oauth2Client });
        
        await calendar.events.delete({
            calendarId: "primary", // User's primary calendar
            eventId: calendarEventId,
            sendUpdates: "all"
        });
        
        return { success: true };
    } catch (error) {
        console.error("Error deleting calendar event with user auth:", error);
        
        if (error.code === 404) {
            // Event already deleted, consider it a success
            return { success: true };
        }
        
        return {
            success: false,
            error: error.message || "Failed to delete calendar event"
        };
    }
}

module.exports = {
    createCalendarEventWithUserAuth,
    updateCalendarEventWithUserAuth,
    deleteCalendarEventWithUserAuth
};
