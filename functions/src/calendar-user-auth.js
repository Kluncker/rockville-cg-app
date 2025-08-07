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
        
        // Parse the date and time as Eastern Time
        // The time entered by the user should be treated as Eastern Time
        const dateTimeString = `${eventData.date}T${eventData.time || "09:00"}:00`;
        
        // Calculate end time
        const [hours, minutes] = (eventData.time || "09:00").split(":").map(Number);
        const durationMinutes = eventData.duration || 120;
        const endHours = Math.floor((hours * 60 + minutes + durationMinutes) / 60);
        const endMinutes = (hours * 60 + minutes + durationMinutes) % 60;
        const endTime = `${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}:00`;
        const endDateTimeString = endHours >= 24 ? 
            // Next day
            `${new Date(new Date(eventData.date).getTime() + 86400000).toISOString().split("T")[0]}T${String(endHours % 24).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}:00` :
            // Same day
            `${eventData.date}T${endTime}`;
        
        const calendarEvent = {
            summary: eventData.title,
            description: eventData.description || "",
            location: eventData.location || "",
            start: {
                dateTime: dateTimeString,  // Use local format without 'Z'
                timeZone: "America/New_York"
            },
            end: {
                dateTime: endDateTimeString,  // Use local format without 'Z'
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
        
        // Parse the date and time as Eastern Time
        // The time entered by the user should be treated as Eastern Time
        const dateTimeString = `${eventData.date}T${eventData.time || "09:00"}:00`;
        
        // Calculate end time
        const [hours, minutes] = (eventData.time || "09:00").split(":").map(Number);
        const durationMinutes = eventData.duration || 120;
        const endHours = Math.floor((hours * 60 + minutes + durationMinutes) / 60);
        const endMinutes = (hours * 60 + minutes + durationMinutes) % 60;
        const endTime = `${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}:00`;
        const endDateTimeString = endHours >= 24 ? 
            // Next day
            `${new Date(new Date(eventData.date).getTime() + 86400000).toISOString().split("T")[0]}T${String(endHours % 24).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}:00` :
            // Same day
            `${eventData.date}T${endTime}`;
        
        const calendarEvent = {
            summary: eventData.title,
            description: eventData.description || "",
            location: eventData.location || "",
            start: {
                dateTime: dateTimeString,  // Use local format without 'Z'
                timeZone: "America/New_York"
            },
            end: {
                dateTime: endDateTimeString,  // Use local format without 'Z'
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
