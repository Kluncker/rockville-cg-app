// Firebase Cloud Functions

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp();

// Firestore instance
const db = admin.firestore();

// Function to check if a user is authorized to access the app
exports.checkUserAuthorization = functions.https.onCall(async (data, context) => {
    // Check authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const userEmail = context.auth.token.email?.toLowerCase();
    
    if (!userEmail) {
        throw new functions.https.HttpsError('invalid-argument', 'No email found for authenticated user');
    }
    
    try {
        console.log(`Checking authorization for email: ${userEmail}`);
        
        // Check primary emails
        const primaryQuery = await db.collection('allowedUsers')
            .where('primaryEmail', '==', userEmail)
            .limit(1)
            .get();
        
        if (!primaryQuery.empty) {
            console.log(`User ${userEmail} found in primary emails`);
            // Check if user document exists, create if not
            await ensureUserDocument(context.auth.uid, context.auth.token);
            return { 
                authorized: true, 
                email: userEmail,
                message: 'User authorized via primary email' 
            };
        }
        
        // Check alternative emails
        const alternativeQuery = await db.collection('allowedUsers')
            .where('alternativeEmails', 'array-contains', userEmail)
            .limit(1)
            .get();
        
        if (!alternativeQuery.empty) {
            console.log(`User ${userEmail} found in alternative emails`);
            // Check if user document exists, create if not
            await ensureUserDocument(context.auth.uid, context.auth.token);
            return { 
                authorized: true, 
                email: userEmail,
                message: 'User authorized via alternative email' 
            };
        }
        
        console.log(`User ${userEmail} not found in allowed users`);
        return { 
            authorized: false, 
            email: userEmail,
            message: 'User not found in authorized users list' 
        };
        
    } catch (error) {
        console.error('Error checking user authorization:', error);
        throw new functions.https.HttpsError('internal', 'Failed to check authorization');
    }
});

// Helper function to ensure user document exists
async function ensureUserDocument(uid, authToken) {
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
        // Create new user document
        await userRef.set({
            displayName: authToken.name || 'Unknown User',
            email: authToken.email,
            photoURL: authToken.picture || null,
            role: 'member', // Default role
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
