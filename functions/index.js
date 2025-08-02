// Firebase Cloud Functions for Email Notifications

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');

// Initialize Firebase Admin
admin.initializeApp();

// Set SendGrid API key from environment configuration
// Set this in Firebase: firebase functions:config:set sendgrid.key="YOUR_SENDGRID_API_KEY"
sgMail.setApiKey(functions.config().sendgrid?.key || 'YOUR_SENDGRID_API_KEY');

// Firestore instance
const db = admin.firestore();

// Function to send task reminder emails (runs daily)
exports.sendTaskReminders = functions.pubsub
    .schedule('every day 09:00')
    .timeZone('America/New_York')
    .onRun(async (context) => {
        console.log('Running daily task reminder check');
        
        try {
            // Calculate date 3 weeks from now
            const threeWeeksFromNow = new Date();
            threeWeeksFromNow.setDate(threeWeeksFromNow.getDate() + 21);
            const threeWeeksStr = threeWeeksFromNow.toISOString().split('T')[0];
            
            // Get tasks that need reminders
            const tasksSnapshot = await db.collection('tasks')
                .where('notificationSent', '==', false)
                .where('eventDate', '<=', threeWeeksStr)
                .where('status', '==', 'pending')
                .get();
            
            const emailPromises = [];
            
            for (const taskDoc of tasksSnapshot.docs) {
                const task = taskDoc.data();
                
                // Get user email
                const userDoc = await db.collection('users').doc(task.assignedTo).get();
                if (!userDoc.exists) continue;
                
                const user = userDoc.data();
                
                // Prepare email
                const msg = {
                    to: user.email,
                    from: 'noreply@churchcommunityhub.com', // Update with your verified sender
                    subject: `Task Reminder: ${task.title}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <div style="background: linear-gradient(135deg, #87CEEB, #FFD700); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
                                <h1 style="color: white; margin: 0;">Rockville CG</h1>
                            </div>
                            <div style="padding: 30px; background: #f5f5f5;">
                                <h2 style="color: #333;">Task Reminder</h2>
                                <p style="font-size: 16px; color: #666;">Hello ${user.displayName},</p>
                                <p style="font-size: 16px; color: #666;">This is a reminder that you have an upcoming task:</p>
                                
                                <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #FFD700;">
                                    <h3 style="margin-top: 0; color: #333;">${task.title}</h3>
                                    <p style="color: #666;"><strong>Event:</strong> ${task.eventTitle}</p>
                                    <p style="color: #666;"><strong>Date:</strong> ${new Date(task.eventDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                </div>
                                
                                <p style="font-size: 16px; color: #666;">Please log in to confirm your availability for this task.</p>
                                
                                <div style="text-align: center; margin: 30px 0;">
                                    <a href="https://rockville-cg-planning.web.app/dashboard.html" style="background: linear-gradient(135deg, #0b57d0, #5B21B6); color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; display: inline-block;">Confirm Task</a>
                                </div>
                                
                                <p style="font-size: 14px; color: #999; text-align: center;">If you have any questions, please contact your event coordinator.</p>
                            </div>
                        </div>
                    `,
                    text: `
                        Task Reminder: ${task.title}
                        
                        Hello ${user.displayName},
                        
                        This is a reminder that you have an upcoming task:
                        
                        Task: ${task.title}
                        Event: ${task.eventTitle}
                        Date: ${new Date(task.eventDate).toLocaleDateString()}
                        
                        Please log in to confirm your availability for this task.
                    `
                };
                
                // Send email and update notification status
                emailPromises.push(
                    sgMail.send(msg)
                        .then(() => {
                            return taskDoc.ref.update({ 
                                notificationSent: true,
                                notificationSentAt: admin.firestore.FieldValue.serverTimestamp()
                            });
                        })
                        .catch(error => {
                            console.error(`Error sending email for task ${taskDoc.id}:`, error);
                        })
                );
            }
            
            await Promise.all(emailPromises);
            console.log(`Sent ${emailPromises.length} reminder emails`);
            
        } catch (error) {
            console.error('Error in sendTaskReminders:', error);
        }
        
        return null;
    });

// Function to send confirmation emails when a task is confirmed
exports.sendTaskConfirmation = functions.firestore
    .document('tasks/{taskId}')
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();
        
        // Check if status changed from pending to confirmed
        if (before.status === 'pending' && after.status === 'confirmed') {
            try {
                // Get user who confirmed
                const userDoc = await db.collection('users').doc(after.assignedTo).get();
                if (!userDoc.exists) return null;
                
                const user = userDoc.data();
                
                // Get event creator to notify them
                const eventDoc = await db.collection('events').doc(after.eventId).get();
                if (eventDoc.exists) {
                    const event = eventDoc.data();
                    const creatorDoc = await db.collection('users').doc(event.createdBy).get();
                    
                    if (creatorDoc.exists) {
                        const creator = creatorDoc.data();
                        
                        // Send notification to event creator
                        const msg = {
                            to: creator.email,
                            from: 'noreply@churchcommunityhub.com',
                            subject: `Task Confirmed: ${after.title}`,
                            html: `
                                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                                    <div style="background: linear-gradient(135deg, #4CAF50, #45A049); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
                                        <h1 style="color: white; margin: 0;">Task Confirmed!</h1>
                                    </div>
                                    <div style="padding: 30px; background: #f5f5f5;">
                                        <p style="font-size: 16px; color: #666;">Hello ${creator.displayName},</p>
                                        <p style="font-size: 16px; color: #666;">${user.displayName} has confirmed their task:</p>
                                        
                                        <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #4CAF50;">
                                            <h3 style="margin-top: 0; color: #333;">${after.title}</h3>
                                            <p style="color: #666;"><strong>Event:</strong> ${after.eventTitle}</p>
                                            <p style="color: #666;"><strong>Confirmed by:</strong> ${user.displayName}</p>
                                            <p style="color: #666;"><strong>Confirmed at:</strong> ${new Date().toLocaleString()}</p>
                                        </div>
                                    </div>
                                </div>
                            `
                        };
                        
                        await sgMail.send(msg);
                    }
                }
                
                // Send confirmation to the task assignee
                const confirmMsg = {
                    to: user.email,
                    from: 'noreply@churchcommunityhub.com',
                    subject: `Task Confirmation: ${after.title}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <div style="background: linear-gradient(135deg, #4CAF50, #45A049); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
                                <h1 style="color: white; margin: 0;">Thank You!</h1>
                            </div>
                            <div style="padding: 30px; background: #f5f5f5;">
                                <p style="font-size: 16px; color: #666;">Hello ${user.displayName},</p>
                                <p style="font-size: 16px; color: #666;">Thank you for confirming your task. We appreciate your service!</p>
                                
                                <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #4CAF50;">
                                    <h3 style="margin-top: 0; color: #333;">${after.title}</h3>
                                    <p style="color: #666;"><strong>Event:</strong> ${after.eventTitle}</p>
                                    <p style="color: #666;"><strong>Date:</strong> ${new Date(after.eventDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                </div>
                                
                                <p style="font-size: 16px; color: #666;">We'll send you a reminder closer to the event date.</p>
                            </div>
                        </div>
                    `
                };
                
                await sgMail.send(confirmMsg);
                
            } catch (error) {
                console.error('Error sending confirmation emails:', error);
            }
        }
        
        return null;
    });

// Function to send ad-hoc reminders (callable function)
exports.sendAdHocReminder = functions.https.onCall(async (data, context) => {
    // Check authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const { taskId, message } = data;
    
    try {
        // Get task details
        const taskDoc = await db.collection('tasks').doc(taskId).get();
        if (!taskDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Task not found');
        }
        
        const task = taskDoc.data();
        
        // Get user details
        const userDoc = await db.collection('users').doc(task.assignedTo).get();
        if (!userDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'User not found');
        }
        
        const user = userDoc.data();
        
        // Send reminder email
        const msg = {
            to: user.email,
            from: 'noreply@churchcommunityhub.com',
            subject: `Reminder: ${task.title}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #FF9800, #F57C00); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0;">Reminder</h1>
                    </div>
                    <div style="padding: 30px; background: #f5f5f5;">
                        <p style="font-size: 16px; color: #666;">Hello ${user.displayName},</p>
                        
                        <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #FF9800;">
                            <h3 style="margin-top: 0; color: #333;">${task.title}</h3>
                            <p style="color: #666;"><strong>Event:</strong> ${task.eventTitle}</p>
                            <p style="color: #666;"><strong>Date:</strong> ${new Date(task.eventDate).toLocaleDateString()}</p>
                            ${message ? `<p style="color: #666; margin-top: 15px;"><strong>Message:</strong> ${message}</p>` : ''}
                        </div>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="https://rockville-cg-planning.web.app/dashboard.html" style="background: linear-gradient(135deg, #0b57d0, #5B21B6); color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; display: inline-block;">View Task</a>
                        </div>
                    </div>
                </div>
            `
        };
        
        await sgMail.send(msg);
        
        // Log the reminder
        await db.collection('reminders').add({
            taskId,
            sentBy: context.auth.uid,
            sentTo: task.assignedTo,
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            message: message || null
        });
        
        return { success: true, message: 'Reminder sent successfully' };
        
    } catch (error) {
        console.error('Error sending ad-hoc reminder:', error);
        throw new functions.https.HttpsError('internal', 'Failed to send reminder');
    }
});
