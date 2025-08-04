// Firebase Cloud Functions

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const calendar = require("./src/calendar");
const email = require("./src/email");

// Initialize Firebase Admin
admin.initializeApp();

// Firestore instance
const db = admin.firestore();

// Function to check if a user is authorized to access the app
exports.checkUserAuthorization = functions.https.onCall(async (data, context) => {
    // Check authentication
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    
    const userEmail = context.auth.token.email?.toLowerCase();
    
    if (!userEmail) {
        throw new functions.https.HttpsError("invalid-argument", "No email found for authenticated user");
    }
    
    try {
        console.log(`Checking authorization for email: ${userEmail}`);
        
        // Check primary emails
        const primaryQuery = await db.collection("allowedUsers")
            .where("primaryEmail", "==", userEmail)
            .limit(1)
            .get();
        
        if (!primaryQuery.empty) {
            console.log(`User ${userEmail} found in primary emails`);
            // Check if user document exists, create if not
            await ensureUserDocument(context.auth.uid, context.auth.token);
            return { 
                authorized: true, 
                email: userEmail,
                message: "User authorized via primary email" 
            };
        }
        
        // Check alternative emails
        const alternativeQuery = await db.collection("allowedUsers")
            .where("alternativeEmails", "array-contains", userEmail)
            .limit(1)
            .get();
        
        if (!alternativeQuery.empty) {
            console.log(`User ${userEmail} found in alternative emails`);
            // Check if user document exists, create if not
            await ensureUserDocument(context.auth.uid, context.auth.token);
            return { 
                authorized: true, 
                email: userEmail,
                message: "User authorized via alternative email" 
            };
        }
        
        console.log(`User ${userEmail} not found in allowed users`);
        return { 
            authorized: false, 
            email: userEmail,
            message: "User not found in authorized users list" 
        };
        
    } catch (error) {
        console.error("Error checking user authorization:", error);
        throw new functions.https.HttpsError("internal", "Failed to check authorization");
    }
});

// Helper function to ensure user document exists
async function ensureUserDocument(uid, authToken) {
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
        // Create new user document
        await userRef.set({
            displayName: authToken.name || "Unknown User",
            email: authToken.email,
            photoURL: authToken.picture || null,
            role: "member", // Default role
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastLogin: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`Created user document for ${authToken.email}`);
    } else {
        // Update lastLogin
        await userRef.update({
            lastLogin: admin.firestore.FieldValue.serverTimestamp()
        });
    }
}

// Create Google Calendar event
exports.createCalendarEvent = functions.https.onCall(async (data, context) => {
    // Check authentication
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    
    // Check if user is leader or admin
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    const userRole = userDoc.data()?.role;
    
    if (userRole !== "leader" && userRole !== "admin") {
        throw new functions.https.HttpsError("permission-denied", "Only leaders can create calendar events");
    }
    
    const { eventId } = data;
    
    if (!eventId) {
        throw new functions.https.HttpsError("invalid-argument", "Event ID is required");
    }
    
    try {
        // Get event data
        const eventDoc = await db.collection("events").doc(eventId).get();
        if (!eventDoc.exists) {
            throw new functions.https.HttpsError("not-found", "Event not found");
        }
        
        const eventData = eventDoc.data();
        
        // Get attendee emails
        const attendeeEmails = await email.getAttendeeEmails(eventData.attendees || []);
        
        // Create calendar event
        const result = await calendar.createCalendarEvent(eventData, attendeeEmails);
        
        if (result.success) {
            // Update event with calendar info
            await db.collection("events").doc(eventId).update({
                googleCalendarEventId: result.calendarEventId,
                calendarLink: result.calendarLink,
                lastCalendarSync: admin.firestore.FieldValue.serverTimestamp()
            });
            
            // Send confirmation emails
            await email.sendEventCreatedEmail(eventData, attendeeEmails);
            
            return {
                success: true,
                calendarLink: result.calendarLink
            };
        } else {
            throw new functions.https.HttpsError("internal", result.error || "Failed to create calendar event");
        }
        
    } catch (error) {
        console.error("Error creating calendar event:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});

// Sync calendar event (push Firebase data to Google Calendar)
exports.syncCalendarEvent = functions.https.onCall(async (data, context) => {
    // Check authentication
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }
    
    // Check if user is leader or admin
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    const userRole = userDoc.data()?.role;
    
    if (userRole !== "leader" && userRole !== "admin") {
        throw new functions.https.HttpsError("permission-denied", "Only leaders can sync calendar events");
    }
    
    const { eventId } = data;
    
    if (!eventId) {
        throw new functions.https.HttpsError("invalid-argument", "Event ID is required");
    }
    
    try {
        // Get event data
        const eventDoc = await db.collection("events").doc(eventId).get();
        if (!eventDoc.exists) {
            throw new functions.https.HttpsError("not-found", "Event not found");
        }
        
        const eventData = eventDoc.data();
        
        if (!eventData.googleCalendarEventId) {
            throw new functions.https.HttpsError("failed-precondition", "No calendar event associated with this event");
        }
        
        // Get attendee emails
        const attendeeEmails = await email.getAttendeeEmails(eventData.attendees || []);
        
        // Update calendar event
        const result = await calendar.updateCalendarEvent(
            eventData.googleCalendarEventId,
            eventData,
            attendeeEmails
        );
        
        if (result.success) {
            // Update sync timestamp and clear discrepancy
            await db.collection("events").doc(eventId).update({
                lastCalendarSync: admin.firestore.FieldValue.serverTimestamp(),
                "calendarSyncStatus.hasDiscrepancy": false,
                "calendarSyncStatus.discrepancyDetails": [],
                "calendarSyncStatus.lastChecked": admin.firestore.FieldValue.serverTimestamp()
            });
            
            return {
                success: true,
                calendarLink: result.calendarLink
            };
        } else {
            throw new functions.https.HttpsError("internal", result.error || "Failed to sync calendar event");
        }
        
    } catch (error) {
        console.error("Error syncing calendar event:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});

// Scheduled function to check calendar discrepancies (runs daily at 8 AM EST)
exports.checkCalendarDiscrepancies = functions.pubsub
    .schedule("0 8 * * *")
    .timeZone("America/New_York")
    .onRun(async () => {
        console.log("Starting daily calendar discrepancy check...");
        
        try {
            // Get all events with Google Calendar IDs
            const eventsSnapshot = await db.collection("events")
                .where("googleCalendarEventId", "!=", null)
                .get();
            
            const discrepancyAlerts = [];
            
            for (const doc of eventsSnapshot.docs) {
                const eventData = { id: doc.id, ...doc.data() };
                
                // Check for discrepancies
                const result = await calendar.checkCalendarDiscrepancies(eventData);
                
                if (result.hasDiscrepancy) {
                    // Update event with discrepancy status
                    await db.collection("events").doc(doc.id).update({
                        "calendarSyncStatus.hasDiscrepancy": true,
                        "calendarSyncStatus.discrepancyDetails": result.discrepancies,
                        "calendarSyncStatus.lastChecked": admin.firestore.FieldValue.serverTimestamp()
                    });
                    
                    discrepancyAlerts.push({
                        event: eventData,
                        discrepancies: result.discrepancies
                    });
                } else {
                    // Clear any previous discrepancy
                    await db.collection("events").doc(doc.id).update({
                        "calendarSyncStatus.hasDiscrepancy": false,
                        "calendarSyncStatus.discrepancyDetails": [],
                        "calendarSyncStatus.lastChecked": admin.firestore.FieldValue.serverTimestamp()
                    });
                }
            }
            
            // Send discrepancy alerts if any found
            if (discrepancyAlerts.length > 0) {
                console.log(`Found ${discrepancyAlerts.length} events with discrepancies`);
                
                // Get leader emails
                const leaderEmails = await email.getLeaderEmails();
                
                // Send alert for each event with discrepancies
                for (const alert of discrepancyAlerts) {
                    // Get event creator email
                    const creatorDoc = await db.collection("users").doc(alert.event.createdBy).get();
                    const creatorEmail = creatorDoc.data()?.email;
                    
                    const recipients = [...new Set([...leaderEmails, creatorEmail].filter(Boolean))];
                    
                    await email.sendDiscrepancyAlert(
                        alert.event,
                        alert.discrepancies,
                        recipients
                    );
                }
            } else {
                console.log("No calendar discrepancies found");
            }
            
            return null;
        } catch (error) {
            console.error("Error checking calendar discrepancies:", error);
            return null;
        }
    });

// Function to handle event deletion (also deletes calendar event)
exports.onEventDeleted = functions.firestore
    .document("events/{eventId}")
    .onDelete(async (snap) => {
        const deletedEvent = snap.data();
        
        if (deletedEvent.googleCalendarEventId) {
            console.log(`Deleting calendar event for: ${deletedEvent.title}`);
            await calendar.deleteCalendarEvent(deletedEvent.googleCalendarEventId);
        }
        
        return null;
    });
