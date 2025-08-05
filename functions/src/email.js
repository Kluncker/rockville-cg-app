// SendGrid Email Integration Functions

const sgMail = require("@sendgrid/mail");
const admin = require("firebase-admin");
const functions = require("firebase-functions");

// Initialize SendGrid
// Use environment variable as fallback when config is unavailable
sgMail.setApiKey(
    process.env.SENDGRID_API_KEY || 
    functions.config().sendgrid?.api_key || 
    ""
);

// Email templates
const emailTemplates = {
    discrepancyAlert: {
        subject: "Calendar Sync Issue - Action Required",
        generateHtml: (eventTitle, discrepancies) => `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #ff5252;">Calendar Sync Issue Detected</h2>
                <p>A discrepancy has been detected between the Firebase event and Google Calendar for:</p>
                <h3 style="color: #333;">${eventTitle}</h3>
                
                <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <h4>Discrepancies Found:</h4>
                    <ul>
                        ${discrepancies.map(d => `<li>${d}</li>`).join("")}
                    </ul>
                </div>
                
                <p>Please log in to the Rockville CG app to sync the event with Google Calendar.</p>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
                    <p>This is an automated message from Rockville CG App.</p>
                </div>
            </div>
        `
    },
    
    eventCreated: {
        subject: "New Event Created - [EVENT_TITLE]",
        generateHtml: (event) => `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #0b57d0;">New Event Created</h2>
                <h3 style="color: #333;">${event.title}</h3>
                
                <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Date:</strong> ${new Date(event.date).toLocaleDateString()}</p>
                    <p><strong>Time:</strong> ${event.time || "TBD"}</p>
                    <p><strong>Location:</strong> ${event.location || "TBD"}</p>
                    ${event.description ? `<p><strong>Description:</strong> ${event.description}</p>` : ""}
                </div>
                
                <p>A calendar invitation has been sent to your email. Please check your calendar for more details.</p>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
                    <p>This is an automated message from Rockville CG App.</p>
                </div>
            </div>
        `
    },
    
    taskAssigned: {
        subject: "New Task Assigned: [TASK_TITLE] - Due [DUE_DATE]",
        generateHtml: (task, event) => `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #FF6F00;">New Task Assigned to You</h2>
                <h3 style="color: #333;">${task.title}</h3>
                
                <div style="background: #FFF3E0; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #FF9800;">
                    <p><strong>Event:</strong> ${event.title}</p>
                    <p><strong>Event Date:</strong> ${new Date(event.date).toLocaleDateString()}</p>
                    <p><strong>Task Due Date:</strong> ${new Date(task.eventDate).toLocaleDateString()}</p>
                    ${task.description ? `<p><strong>Description:</strong> ${task.description}</p>` : ""}
                </div>
                
                <div style="margin: 20px 0;">
                    <a href="https://rockville-cg-planning.web.app/dashboard.html" style="display: inline-block; padding: 12px 24px; background: #FF9800; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">View Task in Dashboard</a>
                </div>
                
                <p style="color: #666;">Please confirm this task when you're ready to commit to completing it.</p>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
                    <p>This is an automated message from Rockville CG App.</p>
                </div>
            </div>
        `
    },
    
    taskReminder: {
        subject: "Task Reminder ([TIME_FRAME]): [TASK_TITLE]",
        generateHtml: (task, event, timeFrame) => {
            const daysUntil = Math.ceil((new Date(task.eventDate) - new Date()) / (1000 * 60 * 60 * 24));
            const urgencyColor = timeFrame === "1 week" || timeFrame === "Day of" ? "#FF5252" : "#FF9800";
            
            return `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: ${urgencyColor};">Task Reminder - ${timeFrame}</h2>
                <h3 style="color: #333;">${task.title}</h3>
                
                <div style="background: #FFF3E0; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${urgencyColor};">
                    <p><strong>Event:</strong> ${event.title}</p>
                    <p><strong>Due Date:</strong> ${new Date(task.eventDate).toLocaleDateString()}</p>
                    <p><strong>Days Until Due:</strong> ${daysUntil} days</p>
                    ${task.description ? `<p><strong>Description:</strong> ${task.description}</p>` : ""}
                    <p><strong>Status:</strong> ${task.status === "confirmed" ? "✅ Confirmed" : "⏳ Pending Confirmation"}</p>
                </div>
                
                ${task.status !== "confirmed" ? `
                <div style="margin: 20px 0;">
                    <a href="https://rockville-cg-planning.web.app/dashboard.html" style="display: inline-block; padding: 12px 24px; background: #4CAF50; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Confirm Task Now</a>
                </div>
                <p style="color: #666;">Please confirm this task if you haven't already.</p>
                ` : `
                <p style="color: #4CAF50; font-weight: bold;">✅ You have already confirmed this task.</p>
                `}
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
                    <p>This is an automated reminder from Rockville CG App.</p>
                </div>
            </div>
            `;
        }
    },
    
    taskConfirmed: {
        subject: "Task Confirmed: [TASK_TITLE]",
        generateHtml: (task, event, confirmedBy) => `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4CAF50;">Task Confirmed</h2>
                <h3 style="color: #333;">${task.title}</h3>
                
                <div style="background: #E8F5E9; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4CAF50;">
                    <p><strong>Event:</strong> ${event.title}</p>
                    <p><strong>Due Date:</strong> ${new Date(task.eventDate).toLocaleDateString()}</p>
                    <p><strong>Confirmed By:</strong> ${confirmedBy.displayName || confirmedBy.email}</p>
                    <p><strong>Confirmed At:</strong> ${new Date().toLocaleString()}</p>
                    ${task.description ? `<p><strong>Description:</strong> ${task.description}</p>` : ""}
                </div>
                
                <p style="color: #666;">Thank you for confirming this task. The event organizers have been notified.</p>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
                    <p>This is an automated message from Rockville CG App.</p>
                </div>
            </div>
        `
    }
};

// Send discrepancy alert email
async function sendDiscrepancyAlert(event, discrepancies, recipients) {
    const template = emailTemplates.discrepancyAlert;
    
    const msg = {
        to: recipients,
        from: {
            email: "admin@mosaic-rockville-cg.com",
            name: "Rockville CG App"
        },
        subject: template.subject,
        html: template.generateHtml(event.title, discrepancies)
    };
    
    try {
        await sgMail.sendMultiple(msg);
        console.log("Discrepancy alert sent to:", recipients);
        return { success: true };
    } catch (error) {
        console.error("Error sending discrepancy alert:", error);
        return { success: false, error: error.message };
    }
}

// Send event creation confirmation
async function sendEventCreatedEmail(event, recipients) {
    const template = emailTemplates.eventCreated;
    
    // Debug logging
    console.log("Attempting to send event created email:");
    console.log("Recipients:", recipients);
    console.log("Number of recipients:", recipients.length);
    
    // Check if recipients array is empty
    if (!recipients || recipients.length === 0) {
        console.error("No recipients provided for event created email");
        return { success: false, error: "No recipients provided" };
    }
    
    const msg = {
        to: recipients,
        from: {
            email: "admin@mosaic-rockville-cg.com",
            name: "Rockville CG App"
        },
        subject: template.subject.replace("[EVENT_TITLE]", event.title),
        html: template.generateHtml(event)
    };
    
    try {
        await sgMail.sendMultiple(msg);
        console.log("Event created email sent to:", recipients.length, "recipients");
        return { success: true };
    } catch (error) {
        console.error("Error sending event created email:", error);
        if (error.response) {
            console.error("SendGrid error response:", JSON.stringify(error.response.body, null, 2));
        }
        return { success: false, error: error.message };
    }
}


// Get email addresses for attendees
async function getAttendeeEmails(attendeeIds) {
    if (!attendeeIds || attendeeIds.length === 0) return [];
    
    const db = admin.firestore();
    const emails = [];
    
    // Batch get users
    const userRefs = attendeeIds.map(id => db.collection("users").doc(id));
    const userDocs = await db.getAll(...userRefs);
    
    userDocs.forEach(doc => {
        if (doc.exists) {
            const userData = doc.data();
            if (userData.email) {
                emails.push(userData.email);
            }
        }
    });
    
    return emails;
}

// Get leader emails
async function getLeaderEmails() {
    const db = admin.firestore();
    const emails = [];
    
    const leadersSnapshot = await db.collection("users")
        .where("role", "in", ["leader", "admin"])
        .get();
    
    leadersSnapshot.forEach(doc => {
        const userData = doc.data();
        if (userData.email) {
            emails.push(userData.email);
        }
    });
    
    return emails;
}

// Send task assigned email
async function sendTaskAssignedEmail(task, event, assigneeEmail, ccRecipients) {
    const template = emailTemplates.taskAssigned;
    
    if (!assigneeEmail) {
        console.error("No assignee email provided for task assigned email");
        return { success: false, error: "No assignee email provided" };
    }
    
    const msg = {
        to: assigneeEmail,
        cc: ccRecipients.filter(email => email !== assigneeEmail), // Don't CC the assignee
        from: {
            email: "admin@mosaic-rockville-cg.com",
            name: "Rockville CG App"
        },
        subject: template.subject
            .replace("[TASK_TITLE]", task.title)
            .replace("[DUE_DATE]", new Date(task.eventDate).toLocaleDateString()),
        html: template.generateHtml(task, event)
    };
    
    try {
        await sgMail.send(msg);
        console.log("Task assigned email sent to:", assigneeEmail, "CC:", ccRecipients.length, "recipients");
        return { success: true };
    } catch (error) {
        console.error("Error sending task assigned email:", error);
        if (error.response) {
            console.error("SendGrid error response:", JSON.stringify(error.response.body, null, 2));
        }
        return { success: false, error: error.message };
    }
}

// Send task reminder email
async function sendTaskReminderEmail(task, event, assigneeEmail, ccRecipients, timeFrame) {
    const template = emailTemplates.taskReminder;
    
    if (!assigneeEmail) {
        console.error("No assignee email provided for task reminder email");
        return { success: false, error: "No assignee email provided" };
    }
    
    const msg = {
        to: assigneeEmail,
        cc: ccRecipients.filter(email => email !== assigneeEmail), // Don't CC the assignee
        from: {
            email: "admin@mosaic-rockville-cg.com",
            name: "Rockville CG App"
        },
        subject: template.subject
            .replace("[TIME_FRAME]", timeFrame)
            .replace("[TASK_TITLE]", task.title),
        html: template.generateHtml(task, event, timeFrame)
    };
    
    try {
        await sgMail.send(msg);
        console.log(`Task reminder (${timeFrame}) email sent to:`, assigneeEmail, "CC:", ccRecipients.length, "recipients");
        return { success: true };
    } catch (error) {
        console.error("Error sending task reminder email:", error);
        if (error.response) {
            console.error("SendGrid error response:", JSON.stringify(error.response.body, null, 2));
        }
        return { success: false, error: error.message };
    }
}

// Send task confirmed email
async function sendTaskConfirmedEmail(task, event, assigneeEmail, ccRecipients, confirmedBy) {
    const template = emailTemplates.taskConfirmed;
    
    if (!assigneeEmail) {
        console.error("No assignee email provided for task confirmed email");
        return { success: false, error: "No assignee email provided" };
    }
    
    const msg = {
        to: assigneeEmail,
        cc: ccRecipients.filter(email => email !== assigneeEmail), // Don't CC the assignee
        from: {
            email: "admin@mosaic-rockville-cg.com",
            name: "Rockville CG App"
        },
        subject: template.subject.replace("[TASK_TITLE]", task.title),
        html: template.generateHtml(task, event, confirmedBy)
    };
    
    try {
        await sgMail.send(msg);
        console.log("Task confirmed email sent to:", assigneeEmail, "CC:", ccRecipients.length, "recipients");
        return { success: true };
    } catch (error) {
        console.error("Error sending task confirmed email:", error);
        if (error.response) {
            console.error("SendGrid error response:", JSON.stringify(error.response.body, null, 2));
        }
        return { success: false, error: error.message };
    }
}

// Get event creator email
async function getEventCreatorEmail(eventCreatorId) {
    if (!eventCreatorId) return null;
    
    const db = admin.firestore();
    const creatorDoc = await db.collection("users").doc(eventCreatorId).get();
    
    if (creatorDoc.exists) {
        return creatorDoc.data().email || null;
    }
    
    return null;
}

// Get CC recipients for task emails (leaders + event creator)
async function getTaskEmailCCRecipients(eventCreatorId) {
    const leaderEmails = await getLeaderEmails();
    const creatorEmail = await getEventCreatorEmail(eventCreatorId);
    
    // Combine and deduplicate
    const allEmails = [...leaderEmails];
    if (creatorEmail && !allEmails.includes(creatorEmail)) {
        allEmails.push(creatorEmail);
    }
    
    return allEmails;
}

module.exports = {
    sendDiscrepancyAlert,
    sendEventCreatedEmail,
    sendTaskAssignedEmail,
    sendTaskReminderEmail,
    sendTaskConfirmedEmail,
    getAttendeeEmails,
    getLeaderEmails,
    getEventCreatorEmail,
    getTaskEmailCCRecipients
};
