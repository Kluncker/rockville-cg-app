// Google Calendar Integration Functions

const { google } = require("googleapis");
const functions = require("firebase-functions");

// Get calendar ID - forced to use primary calendar for proper email invitations
const CALENDAR_ID = "primary";

// Get impersonation email from environment or config
const IMPERSONATION_EMAIL = process.env.GOOGLE_IMPERSONATION_EMAIL || 
                            functions.config().google?.impersonation_email;

// Initialize calendar client with domain-wide delegation for attendee support
async function getCalendarClient() {
    try {
        console.log(`Setting up calendar client with domain-wide delegation for: ${IMPERSONATION_EMAIL}`);
        
        if (!IMPERSONATION_EMAIL) {
            throw new Error("GOOGLE_IMPERSONATION_EMAIL is not configured");
        }
        
        // Use JWT for domain-wide delegation (impersonating a Google Workspace user)
        const { JWT } = require("google-auth-library");
        const path = require("path");
        
        // Load service account key from file
        const keyFilePath = path.join(__dirname, "key.json");
        const serviceAccountKey = require(keyFilePath);
        
        console.log(`Using service account: ${serviceAccountKey.client_email}`);
        
        // Create JWT client with subject for domain-wide delegation
        const jwtClient = new JWT({
            email: serviceAccountKey.client_email,
            key: serviceAccountKey.private_key,
            scopes: [
                "https://www.googleapis.com/auth/calendar",
                "https://www.googleapis.com/auth/calendar.events"
            ],
            subject: IMPERSONATION_EMAIL // This specifies the user to impersonate
        });
        
        // Authorize the JWT client
        await jwtClient.authorize();
        
        // Create calendar instance with JWT client
        const calendar = google.calendar({ version: "v3", auth: jwtClient });
        
        console.log(`Calendar client configured for domain-wide delegation as ${IMPERSONATION_EMAIL}`);
        
        return calendar;
    } catch (error) {
        console.error("Error setting up calendar client:", error);
        
        // If domain-wide delegation fails, provide more context about the error
        if (error.message?.includes("unauthorized_client")) {
            throw new Error("Domain-wide delegation not properly configured. Ensure the service account's client ID (108389820683819853847) has been authorized in Google Workspace Admin Console with the calendar scopes.");
        }
        
        if (error.message?.includes("Not found") || error.message?.includes("Gaia id")) {
            throw new Error(`Failed to impersonate ${IMPERSONATION_EMAIL}. Ensure this is a valid Google Workspace user in your domain and domain-wide delegation is properly configured.`);
        }
        
        throw new Error(`Failed to set up calendar authentication: ${error.message}`);
    }
}

// Create calendar event
async function createCalendarEvent(eventData, attendeeEmails) {
    const calendar = await getCalendarClient();
    
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
    
    try {
        const response = await calendar.events.insert({
            calendarId: CALENDAR_ID,
            resource: calendarEvent,
            sendUpdates: "all" // Send invitations to attendees
        });
        
        return {
            success: true,
            calendarEventId: response.data.id,
            calendarLink: response.data.htmlLink
        };
    } catch (error) {
        console.error("Error creating calendar event:", error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Update calendar event
async function updateCalendarEvent(calendarEventId, eventData, attendeeEmails) {
    const calendar = await getCalendarClient();
    
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
    
    try {
        const response = await calendar.events.update({
            calendarId: CALENDAR_ID,
            eventId: calendarEventId,
            resource: calendarEvent,
            sendUpdates: "all"
        });
        
        return {
            success: true,
            calendarLink: response.data.htmlLink
        };
    } catch (error) {
        console.error("Error updating calendar event:", error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Delete calendar event
async function deleteCalendarEvent(calendarEventId) {
    const calendar = await getCalendarClient();
    
    try {
        await calendar.events.delete({
            calendarId: CALENDAR_ID,
            eventId: calendarEventId,
            sendUpdates: "all"
        });
        
        return { success: true };
    } catch (error) {
        console.error("Error deleting calendar event:", error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Check calendar discrepancies
async function checkCalendarDiscrepancies(firebaseEvent) {
    if (!firebaseEvent.googleCalendarEventId) {
        return { hasDiscrepancy: false };
    }
    
    const calendar = await getCalendarClient();
    
    try {
        const response = await calendar.events.get({
            calendarId: CALENDAR_ID,
            eventId: firebaseEvent.googleCalendarEventId
        });
        
        const calendarEvent = response.data;
        const discrepancies = [];
        
        // Check title
        if (calendarEvent.summary !== firebaseEvent.title) {
            discrepancies.push(`Title: "${calendarEvent.summary}" vs "${firebaseEvent.title}"`);
        }
        
        // Check location
        if (calendarEvent.location !== (firebaseEvent.location || "")) {
            discrepancies.push(`Location: "${calendarEvent.location}" vs "${firebaseEvent.location || ""}"`);
        }
        
        // Check date/time
        const calendarStart = new Date(calendarEvent.start.dateTime || calendarEvent.start.date);
        const firebaseStart = new Date(`${firebaseEvent.date}T${firebaseEvent.time || "09:00"}:00`);
        
        if (Math.abs(calendarStart - firebaseStart) > 60000) { // More than 1 minute difference
            discrepancies.push("Start time differs");
        }
        
        // Check if event was cancelled
        if (calendarEvent.status === "cancelled") {
            discrepancies.push("Event was cancelled in Google Calendar");
        }
        
        return {
            hasDiscrepancy: discrepancies.length > 0,
            discrepancies: discrepancies,
            calendarEvent: calendarEvent
        };
        
    } catch (error) {
        if (error.code === 404) {
            return {
                hasDiscrepancy: true,
                discrepancies: ["Event not found in Google Calendar"],
                error: "not_found"
            };
        }
        
        console.error("Error checking calendar:", error);
        return {
            hasDiscrepancy: false,
            error: error.message
        };
    }
}

module.exports = {
    createCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
    checkCalendarDiscrepancies
};
