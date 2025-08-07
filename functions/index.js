// Firebase Cloud Functions

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentDeleted, onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");
const { Client } = require("@googlemaps/google-maps-services-js");
// Legacy calendar module removed - using user OAuth only
const calendarUserAuth = require("./src/calendar-user-auth");
const email = require("./src/email");

// Initialize Firebase Admin
admin.initializeApp();

// Firestore instance
const db = admin.firestore();

// Function to check if a user is authorized to access the app
exports.checkUserAuthorization = onCall({
    region: "us-central1",
    cors: [
        "http://localhost:3000",
        "http://localhost:5000",
        "https://wz-rockville-cg-app.web.app",
        "https://wz-rockville-cg-app.firebaseapp.com",
        "https://rockville-cg-planning.web.app"
    ]
}, async (request) => {
    const context = request;
    // Check authentication
    if (!context.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
    }
    
    const userEmail = context.auth.token.email?.toLowerCase();
    
    if (!userEmail) {
        throw new HttpsError("invalid-argument", "No email found for authenticated user");
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
        throw new HttpsError("internal", "Failed to check authorization");
    }
});

// Get place suggestions for autocomplete
exports.getPlaceSuggestions = onCall({
    region: "us-central1",
    cors: [
        "http://localhost:3000",
        "http://localhost:5000",
        "https://wz-rockville-cg-app.web.app",
        "https://wz-rockville-cg-app.firebaseapp.com",
        "https://rockville-cg-planning.web.app"
    ]
}, async (request) => {
    const context = request;
    
    // Check authentication
    if (!context.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
    }
    
    const { query } = request.data;
    
    if (!query || query.trim().length < 2) {
        throw new HttpsError("invalid-argument", "Query must be at least 2 characters");
    }
    
    try {
        // Initialize Google Maps client
        const googleMapsClient = new Client({});
        
        // Get the API key from environment variable
        // Set this in .env file or Firebase Secret Manager
        const mapsApiKey = process.env.GOOGLE_MAPS_KEY;
        
        if (!mapsApiKey) {
            console.error("Google Maps API key not configured");
            throw new HttpsError("failed-precondition", "Maps API not configured");
        }
        
        // Perform place autocomplete search
        const response = await googleMapsClient.placeAutocomplete({
            params: {
                input: query,
                key: mapsApiKey,
                // Bias results to Rockville, MD area
                location: { lat: 39.0840, lng: -77.1528 },
                radius: 50000, // 50km radius
                components: ["country:us"]
                // types parameter removed to allow all types
            }
        });
        
        if (response.data.status !== "OK" && response.data.status !== "ZERO_RESULTS") {
            console.error("Places API error:", response.data.status);
            throw new HttpsError("internal", "Failed to fetch suggestions");
        }
        
        // Transform the results to a simpler format
        const suggestions = (response.data.predictions || []).map(prediction => ({
            placeId: prediction.place_id,
            description: prediction.description,
            mainText: prediction.structured_formatting?.main_text || prediction.description,
            secondaryText: prediction.structured_formatting?.secondary_text || "",
            terms: prediction.terms || []
        }));
        
        return {
            success: true,
            suggestions: suggestions.slice(0, 8) // Return max 8 suggestions
        };
        
    } catch (error) {
        console.error("Error in getPlaceSuggestions:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", "Failed to get place suggestions");
    }
});

// Get place details
exports.getPlaceDetails = onCall({
    region: "us-central1",
    cors: [
        "http://localhost:3000",
        "http://localhost:5000",
        "https://wz-rockville-cg-app.web.app",
        "https://wz-rockville-cg-app.firebaseapp.com",
        "https://rockville-cg-planning.web.app"
    ]
}, async (request) => {
    const context = request;
    
    // Check authentication
    if (!context.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
    }
    
    const { placeId } = request.data;
    
    if (!placeId) {
        throw new HttpsError("invalid-argument", "Place ID is required");
    }
    
    try {
        // Initialize Google Maps client
        const googleMapsClient = new Client({});
        
        // Get the API key from environment variable
        const mapsApiKey = process.env.GOOGLE_MAPS_KEY;
        
        if (!mapsApiKey) {
            console.error("Google Maps API key not configured");
            throw new HttpsError("failed-precondition", "Maps API not configured");
        }
        
        // Get place details
        const response = await googleMapsClient.placeDetails({
            params: {
                place_id: placeId,
                key: mapsApiKey,
                fields: ["name", "formatted_address", "geometry", "place_id", "url"]
            }
        });
        
        if (response.data.status !== "OK") {
            console.error("Place Details API error:", response.data.status);
            throw new HttpsError("internal", "Failed to fetch place details");
        }
        
        const place = response.data.result;
        
        return {
            success: true,
            place: {
                placeId: place.place_id,
                name: place.name,
                address: place.formatted_address,
                location: place.geometry?.location,
                url: place.url // Google Maps URL
            }
        };
        
    } catch (error) {
        console.error("Error in getPlaceDetails:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", "Failed to get place details");
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

// Legacy createCalendarEvent removed - use createCalendarEventWithUserAuth instead

// Trigger for when a task is created
exports.onTaskCreated = onDocumentCreated({
    document: "tasks/{taskId}",
    region: "us-central1"
}, async (event) => {
    const task = event.data.data();
    const taskId = event.params.taskId;
    
    // Skip if no assignee
    if (!task.assignedTo) {
        console.log("Task created without assignee, skipping email");
        return null;
    }
    
    try {
        // Get assignee email
        const assigneeDoc = await db.collection("users").doc(task.assignedTo).get();
        if (!assigneeDoc.exists) {
            console.error("Assignee user not found:", task.assignedTo);
            return null;
        }
        
        const assigneeEmail = assigneeDoc.data().email;
        if (!assigneeEmail) {
            console.error("Assignee has no email:", task.assignedTo);
            return null;
        }
        
        // Get event data
        const eventDoc = await db.collection("events").doc(task.eventId).get();
        if (!eventDoc.exists) {
            console.error("Event not found for task:", task.eventId);
            return null;
        }
        
        const event = eventDoc.data();
        
        // Get CC recipients (leaders + event creator)
        const ccRecipients = await email.getTaskEmailCCRecipients(event.createdBy);
        
        // Generate action tokens for this task
        const tokens = await generateTaskActionTokens(taskId, task.assignedTo, assigneeEmail);
        
        // Send task assigned email with tokens
        const result = await email.sendTaskAssignedEmail(
            { ...task, id: taskId },
            event,
            assigneeEmail,
            ccRecipients,
            tokens
        );
        
        if (result.success) {
            // Mark email as sent
            await db.collection("tasks").doc(taskId).update({
                "emailReminders.assignmentSent": true,
                "emailReminders.lastEmailSent": admin.firestore.FieldValue.serverTimestamp()
            });
            
            console.log(`Task assignment email sent for task: ${task.title}`);
        } else {
            console.error("Failed to send task assignment email:", result.error);
        }
        
        return null;
        
    } catch (error) {
        console.error("Error in onTaskCreated:", error);
        return null;
    }
});

// Trigger for when a task is updated
exports.onTaskUpdated = onDocumentUpdated({
    document: "tasks/{taskId}",
    region: "us-central1"
}, async (event) => {
    const taskBefore = event.data.before.data();
    const taskAfter = event.data.after.data();
    const taskId = event.params.taskId;
    
    try {
        // Check if task was just confirmed
        if (taskBefore.status !== "confirmed" && taskAfter.status === "confirmed") {
            // Get assignee email
            const assigneeDoc = await db.collection("users").doc(taskAfter.assignedTo).get();
            if (!assigneeDoc.exists) {
                console.error("Assignee user not found:", taskAfter.assignedTo);
                return null;
            }
            
            const assigneeEmail = assigneeDoc.data().email;
            if (!assigneeEmail) {
                console.error("Assignee has no email:", taskAfter.assignedTo);
                return null;
            }
            
            // Get event data
            const eventDoc = await db.collection("events").doc(taskAfter.eventId).get();
            if (!eventDoc.exists) {
                console.error("Event not found for task:", taskAfter.eventId);
                return null;
            }
            
            const event = eventDoc.data();
            
            // Get confirming user data
            const confirmingUserDoc = await db.collection("users").doc(taskAfter.confirmedBy).get();
            const confirmingUser = confirmingUserDoc.exists ? confirmingUserDoc.data() : { email: "Unknown" };
            
            // Get CC recipients (leaders + event creator)
            const ccRecipients = await email.getTaskEmailCCRecipients(event.createdBy);
            
            // Send task confirmed email
            const result = await email.sendTaskConfirmedEmail(
                { ...taskAfter, id: taskId },
                event,
                assigneeEmail,
                ccRecipients,
                confirmingUser
            );
            
            if (result.success) {
                console.log(`Task confirmation email sent for task: ${taskAfter.title}`);
            } else {
                console.error("Failed to send task confirmation email:", result.error);
            }
        }
        
        // Check if task was just declined
        if (taskBefore.status !== "declined" && taskAfter.status === "declined") {
            // Get event data
            const eventDoc = await db.collection("events").doc(taskAfter.eventId).get();
            if (!eventDoc.exists) {
                console.error("Event not found for task:", taskAfter.eventId);
                return null;
            }
            
            const event = eventDoc.data();
            
            // Get recipients for decline notification (leaders + event creator)
            const leaderEmails = await email.getLeaderEmails();
            const creatorEmail = await email.getEventCreatorEmail(event.createdBy);
            const notificationRecipients = [...new Set([...leaderEmails, creatorEmail].filter(Boolean))];
            
            // Get declining user info
            const decliningUserDoc = await db.collection("users").doc(taskAfter.declinedBy).get();
            const decliningUser = decliningUserDoc.exists ? decliningUserDoc.data() : { displayName: "User", email: "Unknown" };
            
            // Send decline notification email
            await sendTaskDeclinedEmail({ ...taskAfter, id: taskId }, event, decliningUser, notificationRecipients);
            
            console.log(`Task decline notification sent for task: ${taskAfter.title}`);
        }
        
        // Check if assignee changed
        if (taskBefore.assignedTo !== taskAfter.assignedTo && taskAfter.assignedTo) {
            // Get new assignee email
            const assigneeDoc = await db.collection("users").doc(taskAfter.assignedTo).get();
            if (!assigneeDoc.exists) {
                console.error("New assignee user not found:", taskAfter.assignedTo);
                return null;
            }
            
            const assigneeEmail = assigneeDoc.data().email;
            if (!assigneeEmail) {
                console.error("New assignee has no email:", taskAfter.assignedTo);
                return null;
            }
            
            // Get event data
            const eventDoc = await db.collection("events").doc(taskAfter.eventId).get();
            if (!eventDoc.exists) {
                console.error("Event not found for task:", taskAfter.eventId);
                return null;
            }
            
            const event = eventDoc.data();
            
            // Get CC recipients (leaders + event creator)
            const ccRecipients = await email.getTaskEmailCCRecipients(event.createdBy);
            
            // Send task assigned email to new assignee
            const result = await email.sendTaskAssignedEmail(
                { ...taskAfter, id: taskId },
                event,
                assigneeEmail,
                ccRecipients
            );
            
            if (result.success) {
                // Reset email reminders for new assignee
                await db.collection("tasks").doc(taskId).update({
                    "emailReminders.assignmentSent": true,
                    "emailReminders.threeWeekSent": false,
                    "emailReminders.twoWeekSent": false,
                    "emailReminders.oneWeekSent": false,
                    "emailReminders.dayOfSent": false,
                    "emailReminders.lastEmailSent": admin.firestore.FieldValue.serverTimestamp()
                });
                
                console.log(`Task reassignment email sent for task: ${taskAfter.title}`);
            } else {
                console.error("Failed to send task reassignment email:", result.error);
            }
        }
        
        return null;
        
    } catch (error) {
        console.error("Error in onTaskUpdated:", error);
        return null;
    }
});

// Legacy syncCalendarEvent removed - use syncCalendarEventWithUserAuth instead

// Calendar discrepancy check removed - no longer needed with user OAuth approach

// Scheduled function to send task reminders (runs daily at 9 AM EST)
exports.sendTaskReminders = onSchedule({
    schedule: "0 9 * * *",
    timeZone: "America/New_York",
    region: "us-central1"
}, async () => {
    console.log("Starting daily task reminder check...");
    
    try {
        const now = new Date();
        now.setHours(0, 0, 0, 0); // Start of today
        
        // Define reminder intervals
        const reminderIntervals = [
            { days: 21, label: "3 weeks", field: "threeWeekSent" },
            { days: 14, label: "2 weeks", field: "twoWeekSent" },
            { days: 7, label: "1 week", field: "oneWeekSent" },
            { days: 0, label: "Day of", field: "dayOfSent" }
        ];
        
        // Get all pending tasks
        const tasksSnapshot = await db.collection("tasks")
            .where("status", "in", ["pending", "confirmed"])
            .get();
        
        let remindersSent = 0;
        
        for (const taskDoc of tasksSnapshot.docs) {
            const task = { id: taskDoc.id, ...taskDoc.data() };
            
            // Skip if no assignee
            if (!task.assignedTo) continue;
            
            // Get event data
            const eventDoc = await db.collection("events").doc(task.eventId).get();
            if (!eventDoc.exists) continue;
            
            const event = eventDoc.data();
            const taskDate = new Date(task.eventDate);
            taskDate.setHours(0, 0, 0, 0);
            
            // Calculate days until task
            const daysUntil = Math.floor((taskDate - now) / (1000 * 60 * 60 * 24));
            
            // Check each reminder interval
            for (const interval of reminderIntervals) {
                // Check if this reminder should be sent
                if (daysUntil === interval.days) {
                    // Check if already sent
                    const emailReminders = task.emailReminders || {};
                    if (!emailReminders[interval.field]) {
                        // Get assignee email
                        const assigneeDoc = await db.collection("users").doc(task.assignedTo).get();
                        const assigneeEmail = assigneeDoc.data()?.email;
                        
                        if (assigneeEmail) {
                            // Get CC recipients
                            const ccRecipients = await email.getTaskEmailCCRecipients(event.createdBy);
                            
                            // Send reminder email
                            const result = await email.sendTaskReminderEmail(
                                task,
                                event,
                                assigneeEmail,
                                ccRecipients,
                                interval.label
                            );
                            
                            if (result.success) {
                                // Update task to mark reminder as sent
                                await db.collection("tasks").doc(task.id).update({
                                    [`emailReminders.${interval.field}`]: true,
                                    "emailReminders.lastReminderSent": admin.firestore.FieldValue.serverTimestamp()
                                });
                                
                                remindersSent++;
                                console.log(`Sent ${interval.label} reminder for task: ${task.title}`);
                            }
                        }
                    }
                }
            }
        }
        
        console.log(`Task reminder check complete. Sent ${remindersSent} reminders.`);
        return null;
        
    } catch (error) {
        console.error("Error sending task reminders:", error);
        return null;
    }
});

// Delete calendar event with user's OAuth token
exports.deleteCalendarEventWithUserAuth = onCall({
    region: "us-central1",
    cors: [
        "http://localhost:3000",
        "http://localhost:5000",
        "https://wz-rockville-cg-app.web.app",
        "https://wz-rockville-cg-app.firebaseapp.com",
        "https://rockville-cg-planning.web.app"
    ]
}, async (request) => {
    const data = request.data;
    const context = request;
    
    // Check authentication
    if (!context.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
    }
    
    const { eventId, token } = data;
    
    if (!eventId) {
        throw new HttpsError("invalid-argument", "Event ID is required");
    }
    
    if (!token) {
        throw new HttpsError("invalid-argument", "OAuth token is required");
    }
    
    try {
        // Get event data
        const eventDoc = await db.collection("events").doc(eventId).get();
        if (!eventDoc.exists) {
            throw new HttpsError("not-found", "Event not found");
        }
        
        const eventData = eventDoc.data();
        
        // Check if user can delete this event
        const userDoc = await db.collection("users").doc(context.auth.uid).get();
        const userRole = userDoc.data()?.role;
        const canDelete = (context.auth.uid === eventData.createdBy) || 
                          (userRole === "leader" || userRole === "admin");
        
        if (!canDelete) {
            throw new HttpsError("permission-denied", "You don't have permission to delete this event");
        }
        
        if (!eventData.googleCalendarEventId) {
            throw new HttpsError("failed-precondition", "No calendar event associated with this event");
        }
        
        // Delete the calendar event with user's auth
        const result = await calendarUserAuth.deleteCalendarEventWithUserAuth(
            token,
            eventData.googleCalendarEventId
        );
        
        if (result.success) {
            // Clear calendar info from event (in case deletion happens before event deletion)
            await db.collection("events").doc(eventId).update({
                googleCalendarEventId: admin.firestore.FieldValue.delete(),
                calendarLink: admin.firestore.FieldValue.delete(),
                calendarSyncStatus: admin.firestore.FieldValue.delete()
            }).catch(() => {
                // Event might already be deleted, that's ok
            });
            
            return { success: true };
        } else {
            if (result.requiresReauth) {
                throw new HttpsError("unauthenticated", result.error);
            }
            throw new HttpsError("internal", result.error || "Failed to delete calendar event");
        }
        
    } catch (error) {
        console.error("Error deleting calendar event with user auth:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", error.message);
    }
});

// Confirm task by token (no auth required)
exports.confirmTaskByToken = onCall({
    region: "us-central1",
    cors: [
        "http://localhost:3000",
        "http://localhost:5000",
        "https://wz-rockville-cg-app.web.app",
        "https://wz-rockville-cg-app.firebaseapp.com",
        "https://rockville-cg-planning.web.app"
    ]
}, async (request) => {
    const { token } = request.data;
    
    if (!token) {
        throw new HttpsError("invalid-argument", "Token is required");
    }
    
    try {
        // Look up token in database
        const tokenSnapshot = await db.collection("taskTokens")
            .where("token", "==", token)
            .where("used", "==", false)
            .limit(1)
            .get();
        
        if (tokenSnapshot.empty) {
            throw new HttpsError("not-found", "Invalid or expired token");
        }
        
        const tokenDoc = tokenSnapshot.docs[0];
        const tokenData = tokenDoc.data();
        
        // Check if token is expired (30 days)
        const expirationDate = tokenData.expiresAt.toDate();
        if (new Date() > expirationDate) {
            throw new HttpsError("failed-precondition", "Token has expired");
        }
        
        // Get task data
        const taskDoc = await db.collection("tasks").doc(tokenData.taskId).get();
        if (!taskDoc.exists) {
            throw new HttpsError("not-found", "Task not found");
        }
        
        const task = { id: taskDoc.id, ...taskDoc.data() };
        
        // Check if task is already confirmed
        if (task.status === "confirmed") {
            // Mark token as used anyway
            await tokenDoc.ref.update({ used: true });
            return { 
                success: true, 
                message: "Task was already confirmed",
                alreadyConfirmed: true 
            };
        }
        
        // Get user data for the confirming user
        const userDoc = await db.collection("users").doc(tokenData.userId).get();
        const confirmingUser = userDoc.exists ? userDoc.data() : { email: tokenData.userEmail };
        
        // Update task status
        await db.collection("tasks").doc(tokenData.taskId).update({
            status: "confirmed",
            confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
            confirmedBy: tokenData.userId
        });
        
        // Mark token as used (one-time use)
        await tokenDoc.ref.update({ used: true });
        
        // Get event data for email
        const eventDoc = await db.collection("events").doc(task.eventId).get();
        if (eventDoc.exists) {
            const event = eventDoc.data();
            const assigneeEmail = tokenData.userEmail;
            const ccRecipients = await email.getTaskEmailCCRecipients(event.createdBy);
            
            // Send confirmation email
            await email.sendTaskConfirmedEmail(
                task,
                event,
                assigneeEmail,
                ccRecipients,
                confirmingUser
            );
        }
        
        return { 
            success: true, 
            message: "Task confirmed successfully",
            taskTitle: task.title
        };
        
    } catch (error) {
        console.error("Error confirming task by token:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", error.message);
    }
});

// Decline task by token (no auth required)
exports.declineTaskByToken = onCall({
    region: "us-central1",
    cors: [
        "http://localhost:3000",
        "http://localhost:5000",
        "https://wz-rockville-cg-app.web.app",
        "https://wz-rockville-cg-app.firebaseapp.com",
        "https://rockville-cg-planning.web.app"
    ]
}, async (request) => {
    const { token } = request.data;
    
    if (!token) {
        throw new HttpsError("invalid-argument", "Token is required");
    }
    
    try {
        // Look up token in database
        const tokenSnapshot = await db.collection("taskTokens")
            .where("token", "==", token)
            .where("used", "==", false)
            .limit(1)
            .get();
        
        if (tokenSnapshot.empty) {
            throw new HttpsError("not-found", "Invalid or expired token");
        }
        
        const tokenDoc = tokenSnapshot.docs[0];
        const tokenData = tokenDoc.data();
        
        // Check if token is expired (30 days)
        const expirationDate = tokenData.expiresAt.toDate();
        if (new Date() > expirationDate) {
            throw new HttpsError("failed-precondition", "Token has expired");
        }
        
        // Get task data
        const taskDoc = await db.collection("tasks").doc(tokenData.taskId).get();
        if (!taskDoc.exists) {
            throw new HttpsError("not-found", "Task not found");
        }
        
        const task = { id: taskDoc.id, ...taskDoc.data() };
        
        // Check if task is already confirmed
        if (task.status === "confirmed") {
            // Mark token as used anyway
            await tokenDoc.ref.update({ used: true });
            throw new HttpsError("failed-precondition", "Cannot decline a confirmed task");
        }
        
        // Update task status to declined
        await db.collection("tasks").doc(tokenData.taskId).update({
            status: "declined",
            declinedAt: admin.firestore.FieldValue.serverTimestamp(),
            declinedBy: tokenData.userId
        });
        
        // Mark token as used (one-time use)
        await tokenDoc.ref.update({ used: true });
        
        // Get event data for notification
        const eventDoc = await db.collection("events").doc(task.eventId).get();
        if (eventDoc.exists) {
            const event = eventDoc.data();
            
            // Get recipients for decline notification (leaders + event creator)
            const leaderEmails = await email.getLeaderEmails();
            const creatorEmail = await email.getEventCreatorEmail(event.createdBy);
            const notificationRecipients = [...new Set([...leaderEmails, creatorEmail].filter(Boolean))];
            
            // Get declining user info
            const userDoc = await db.collection("users").doc(tokenData.userId).get();
            const decliningUser = userDoc.exists ? userDoc.data() : { displayName: "User", email: tokenData.userEmail };
            
            // Send decline notification email
            await sendTaskDeclinedEmail(task, event, decliningUser, notificationRecipients);
        }
        
        return { 
            success: true, 
            message: "Task declined successfully",
            taskTitle: task.title
        };
        
    } catch (error) {
        console.error("Error declining task by token:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", error.message);
    }
});

// Helper function to generate secure token
function generateSecureToken() {
    // Use Node.js crypto module for cryptographically secure random tokens
    const crypto = require("crypto");
    return crypto.randomBytes(32).toString("hex");
}

// Generate task action tokens when task is created
async function generateTaskActionTokens(taskId, userId, userEmail) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now
    
    // Generate confirm token
    const confirmToken = generateSecureToken();
    await db.collection("taskTokens").add({
        token: confirmToken,
        taskId: taskId,
        userId: userId,
        userEmail: userEmail,
        action: "confirm",
        used: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt)
    });
    
    // Generate decline token
    const declineToken = generateSecureToken();
    await db.collection("taskTokens").add({
        token: declineToken,
        taskId: taskId,
        userId: userId,
        userEmail: userEmail,
        action: "decline",
        used: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt)
    });
    
    return { confirmToken, declineToken };
}

// Send task declined email (helper function)
async function sendTaskDeclinedEmail(task, event, decliningUser, recipients) {
    const msg = {
        to: recipients,
        from: {
            email: "admin@mosaic-rockville-cg.com",
            name: "Rockville CG App"
        },
        subject: `Task Declined: ${task.title}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #ff5252;">Task Declined</h2>
                <h3 style="color: #333;">${task.title}</h3>
                
                <div style="background: #ffebee; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff5252;">
                    <p><strong>Event:</strong> ${event.title}</p>
                    <p><strong>Task:</strong> ${task.title}</p>
                    <p><strong>Declined By:</strong> ${decliningUser.displayName || decliningUser.email}</p>
                    <p><strong>Declined At:</strong> ${new Date().toLocaleString()}</p>
                </div>
                
                <p style="color: #666;">This task needs to be reassigned to another member.</p>
                
                <div style="margin: 20px 0; text-align: center;">
                    <a href="https://rockville-cg-planning.web.app/dashboard.html#event-${event.id}" style="display: inline-block; padding: 12px 24px; background: #0b57d0; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">View Event & Reassign Task</a>
                </div>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
                    <p>This is an automated message from Rockville CG App.</p>
                </div>
            </div>
        `
    };
    
    try {
        await sgMail.sendMultiple(msg);
        console.log("Task declined notification sent to:", recipients);
    } catch (error) {
        console.error("Error sending task declined email:", error);
    }
}

// Legacy deleteCalendarEvent removed - use deleteCalendarEventWithUserAuth instead

// Function to handle event deletion (cleanup logging)
exports.onEventDeleted = onDocumentDeleted({
    document: "events/{eventId}",
    region: "us-central1"
}, async (event) => {
    const deletedEvent = event.data.data();
    
    // Log the deletion for audit purposes
    console.log(`Event deleted: ${deletedEvent.title} (ID: ${event.params.eventId})`);
    
    // Note: Calendar event deletion is handled separately via deleteCalendarEvent function
    // which is called explicitly when the user confirms they want to delete the calendar event
    
    return null;
});

// Create Google Calendar event with user's OAuth token
exports.createCalendarEventWithUserAuth = onCall({
    region: "us-central1",
    cors: [
        "http://localhost:3000",
        "http://localhost:5000",
        "https://wz-rockville-cg-app.web.app",
        "https://wz-rockville-cg-app.firebaseapp.com",
        "https://rockville-cg-planning.web.app"
    ]
}, async (request) => {
    const data = request.data;
    const context = request;
    
    // Check authentication
    if (!context.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
    }
    
    // Check if user is leader or admin
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    const userRole = userDoc.data()?.role;
    
    if (userRole !== "leader" && userRole !== "admin") {
        throw new HttpsError("permission-denied", "Only leaders can create calendar events");
    }
    
    const { eventId, token } = data;
    
    if (!eventId) {
        throw new HttpsError("invalid-argument", "Event ID is required");
    }
    
    if (!token) {
        throw new HttpsError("invalid-argument", "OAuth token is required");
    }
    
    try {
        // Get event data
        const eventDoc = await db.collection("events").doc(eventId).get();
        if (!eventDoc.exists) {
            throw new HttpsError("not-found", "Event not found");
        }
        
        const eventData = eventDoc.data();
        
        // Get attendee emails from event
        const eventAttendees = eventData.attendees || [];
        
        // Get task assignees and merge with event attendees
        const tasksSnapshot = await db.collection("tasks")
            .where("eventId", "==", eventId)
            .get();
        
        const taskAssignees = [];
        tasksSnapshot.forEach(doc => {
            const task = doc.data();
            if (task.assignedTo && !taskAssignees.includes(task.assignedTo)) {
                taskAssignees.push(task.assignedTo);
            }
        });
        
        // Merge and deduplicate attendees
        const allAttendees = [...new Set([...eventAttendees, ...taskAssignees])];
        
        // Get all attendee emails
        const attendeeEmails = await email.getAttendeeEmails(allAttendees);
        
        // Create calendar event with user's auth
        const result = await calendarUserAuth.createCalendarEventWithUserAuth(token, eventData, attendeeEmails);
        
        if (result.success) {
            // Get leader emails and event creator email
            const leaderEmails = await email.getLeaderEmails();
            const creatorDoc = await db.collection("users").doc(eventData.createdBy).get();
            const creatorEmail = creatorDoc.data()?.email;
            
            // Combine and deduplicate email recipients (leaders + creator)
            const emailRecipients = [...new Set([...leaderEmails, creatorEmail].filter(Boolean))];
            
            // Send confirmation emails only to leaders and creator
            await email.sendEventCreatedEmail({ ...eventData, id: eventId }, emailRecipients);
            
            return {
                success: true,
                calendarEventId: result.calendarEventId,
                calendarLink: result.calendarLink
            };
        } else {
            if (result.requiresReauth) {
                throw new HttpsError("unauthenticated", result.error);
            }
            throw new HttpsError("internal", result.error || "Failed to create calendar event");
        }
        
    } catch (error) {
        console.error("Error creating calendar event with user auth:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", error.message);
    }
});

// Sync calendar event with user's OAuth token
exports.syncCalendarEventWithUserAuth = onCall({
    region: "us-central1",
    cors: [
        "http://localhost:3000",
        "http://localhost:5000",
        "https://wz-rockville-cg-app.web.app",
        "https://wz-rockville-cg-app.firebaseapp.com",
        "https://rockville-cg-planning.web.app"
    ]
}, async (request) => {
    const data = request.data;
    const context = request;
    
    // Check authentication
    if (!context.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
    }
    
    // Check if user is leader or admin
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    const userRole = userDoc.data()?.role;
    
    if (userRole !== "leader" && userRole !== "admin") {
        throw new HttpsError("permission-denied", "Only leaders can sync calendar events");
    }
    
    const { eventId, token } = data;
    
    if (!eventId) {
        throw new HttpsError("invalid-argument", "Event ID is required");
    }
    
    if (!token) {
        throw new HttpsError("invalid-argument", "OAuth token is required");
    }
    
    try {
        // Get event data
        const eventDoc = await db.collection("events").doc(eventId).get();
        if (!eventDoc.exists) {
            throw new HttpsError("not-found", "Event not found");
        }
        
        const eventData = eventDoc.data();
        
        if (!eventData.googleCalendarEventId) {
            throw new HttpsError("failed-precondition", "No calendar event associated with this event");
        }
        
        // Get attendee emails from event
        const eventAttendees = eventData.attendees || [];
        
        // Get task assignees and merge with event attendees
        const tasksSnapshot = await db.collection("tasks")
            .where("eventId", "==", eventId)
            .get();
        
        const taskAssignees = [];
        tasksSnapshot.forEach(doc => {
            const task = doc.data();
            if (task.assignedTo && !taskAssignees.includes(task.assignedTo)) {
                taskAssignees.push(task.assignedTo);
            }
        });
        
        // Merge and deduplicate attendees
        const allAttendees = [...new Set([...eventAttendees, ...taskAssignees])];
        
        // Get all attendee emails
        const attendeeEmails = await email.getAttendeeEmails(allAttendees);
        
        // Update calendar event with user's auth
        const result = await calendarUserAuth.updateCalendarEventWithUserAuth(
            token,
            eventData.googleCalendarEventId,
            eventData,
            attendeeEmails
        );
        
        if (result.success) {
            return {
                success: true,
                calendarLink: result.calendarLink
            };
        } else {
            if (result.requiresReauth) {
                throw new HttpsError("unauthenticated", result.error);
            }
            throw new HttpsError("internal", result.error || "Failed to sync calendar event");
        }
        
    } catch (error) {
        console.error("Error syncing calendar event with user auth:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", error.message);
    }
});
