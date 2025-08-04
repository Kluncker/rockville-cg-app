// SendGrid Email Integration Functions

const sgMail = require('@sendgrid/mail');
const admin = require('firebase-admin');

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

// Email templates
const emailTemplates = {
    discrepancyAlert: {
        subject: 'Calendar Sync Issue - Action Required',
        generateHtml: (eventTitle, discrepancies) => `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #ff5252;">Calendar Sync Issue Detected</h2>
                <p>A discrepancy has been detected between the Firebase event and Google Calendar for:</p>
                <h3 style="color: #333;">${eventTitle}</h3>
                
                <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <h4>Discrepancies Found:</h4>
                    <ul>
                        ${discrepancies.map(d => `<li>${d}</li>`).join('')}
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
        subject: 'New Event Created - [EVENT_TITLE]',
        generateHtml: (event) => `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #0b57d0;">New Event Created</h2>
                <h3 style="color: #333;">${event.title}</h3>
                
                <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Date:</strong> ${new Date(event.date).toLocaleDateString()}</p>
                    <p><strong>Time:</strong> ${event.time || 'TBD'}</p>
                    <p><strong>Location:</strong> ${event.location || 'TBD'}</p>
                    ${event.description ? `<p><strong>Description:</strong> ${event.description}</p>` : ''}
                </div>
                
                <p>A calendar invitation has been sent to your email. Please check your calendar for more details.</p>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
                    <p>This is an automated message from Rockville CG App.</p>
                </div>
            </div>
        `
    },
    
    locationChange: {
        subject: 'Location Change - [EVENT_TITLE]',
        generateHtml: (event, oldLocation) => `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #ff9800;">Event Location Changed</h2>
                <h3 style="color: #333;">${event.title}</h3>
                
                <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff9800;">
                    <p><strong>New Location:</strong> ${event.location}</p>
                    <p style="text-decoration: line-through; color: #666;"><strong>Old Location:</strong> ${oldLocation}</p>
                </div>
                
                <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Date:</strong> ${new Date(event.date).toLocaleDateString()}</p>
                    <p><strong>Time:</strong> ${event.time || 'TBD'}</p>
                </div>
                
                <p>Please note the location change. Your calendar has been updated automatically.</p>
                
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
            email: 'noreply@mosaic-rockville-cg.com',
            name: 'Rockville CG App'
        },
        subject: template.subject,
        html: template.generateHtml(event.title, discrepancies)
    };
    
    try {
        await sgMail.sendMultiple(msg);
        console.log('Discrepancy alert sent to:', recipients);
        return { success: true };
    } catch (error) {
        console.error('Error sending discrepancy alert:', error);
        return { success: false, error: error.message };
    }
}

// Send event creation confirmation
async function sendEventCreatedEmail(event, recipients) {
    const template = emailTemplates.eventCreated;
    
    const msg = {
        to: recipients,
        from: {
            email: 'noreply@mosaic-rockville-cg.com',
            name: 'Rockville CG App'
        },
        subject: template.subject.replace('[EVENT_TITLE]', event.title),
        html: template.generateHtml(event)
    };
    
    try {
        await sgMail.sendMultiple(msg);
        console.log('Event created email sent to:', recipients.length, 'recipients');
        return { success: true };
    } catch (error) {
        console.error('Error sending event created email:', error);
        return { success: false, error: error.message };
    }
}

// Send location change notification
async function sendLocationChangeEmail(event, oldLocation, recipients) {
    const template = emailTemplates.locationChange;
    
    const msg = {
        to: recipients,
        from: {
            email: 'noreply@mosaic-rockville-cg.com',
            name: 'Rockville CG App'
        },
        subject: template.subject.replace('[EVENT_TITLE]', event.title),
        html: template.generateHtml(event, oldLocation)
    };
    
    try {
        await sgMail.sendMultiple(msg);
        console.log('Location change email sent to:', recipients.length, 'recipients');
        return { success: true };
    } catch (error) {
        console.error('Error sending location change email:', error);
        return { success: false, error: error.message };
    }
}

// Get email addresses for attendees
async function getAttendeeEmails(attendeeIds) {
    if (!attendeeIds || attendeeIds.length === 0) return [];
    
    const db = admin.firestore();
    const emails = [];
    
    // Batch get users
    const userRefs = attendeeIds.map(id => db.collection('users').doc(id));
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
    
    const leadersSnapshot = await db.collection('users')
        .where('role', 'in', ['leader', 'admin'])
        .get();
    
    leadersSnapshot.forEach(doc => {
        const userData = doc.data();
        if (userData.email) {
            emails.push(userData.email);
        }
    });
    
    return emails;
}

module.exports = {
    sendDiscrepancyAlert,
    sendEventCreatedEmail,
    sendLocationChangeEmail,
    getAttendeeEmails,
    getLeaderEmails
};
