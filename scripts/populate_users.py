#!/usr/bin/env python3
"""
Populate allowed users in Firestore using Firebase Admin SDK
"""

import json
import firebase_admin
from firebase_admin import credentials, firestore
import os

# Try different authentication methods
def initialize_firebase():
    try:
        # Method 1: Try Application Default Credentials (gcloud auth)
        cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred, {
            'projectId': 'wz-rockville-cg-app',
        })
        print("✅ Initialized with Application Default Credentials")
        return True
    except Exception as e:
        print(f"❌ Failed with ADC: {e}")
        
    try:
        # Method 2: Try service account key if exists
        key_path = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')
        if os.path.exists(key_path):
            cred = credentials.Certificate(key_path)
            firebase_admin.initialize_app(cred)
            print("✅ Initialized with Service Account Key")
            return True
    except Exception as e:
        print(f"❌ Failed with service account key: {e}")
    
    return False

def load_allowed_users():
    """Load allowed users from JSON file"""
    json_path = os.path.join(os.path.dirname(__file__), 'allowedUsers.json')
    with open(json_path, 'r') as f:
        return json.load(f)

def populate_firestore():
    """Populate allowed users in Firestore"""
    if not initialize_firebase():
        print("\n❌ Failed to initialize Firebase!")
        print("\nTo fix this, use one of these methods:")
        print("1. Set up Application Default Credentials:")
        print("   gcloud auth application-default login")
        print("\n2. Or download a service account key:")
        print("   - Go to Firebase Console > Project Settings > Service Accounts")
        print("   - Generate new private key")
        print("   - Save as scripts/serviceAccountKey.json")
        return
    
    db = firestore.client()
    users = load_allowed_users()
    
    print(f"\n📋 Found {len(users)} users to populate...")
    
    success_count = 0
    error_count = 0
    
    # Use batch for efficiency
    batch = db.batch()
    batch_count = 0
    
    for user in users:
        try:
            # Create document ID from email
            doc_id = user['primaryEmail'].replace('@', '_').replace('.', '_')
            doc_ref = db.collection('allowedUsers').document(doc_id)
            
            # Prepare data
            user_data = {
                'displayName': user['displayName'],
                'primaryEmail': user['primaryEmail'].lower(),
                'alternativeEmails': [email.lower() for email in user['alternativeEmails']],
                'createdAt': firestore.SERVER_TIMESTAMP
            }
            
            batch.set(doc_ref, user_data)
            batch_count += 1
            
            print(f"✅ Queued: {user['displayName']} ({user['primaryEmail']})")
            
            # Commit batch every 500 operations (Firestore limit)
            if batch_count >= 500:
                batch.commit()
                batch = db.batch()
                batch_count = 0
                
            success_count += 1
            
        except Exception as e:
            print(f"❌ Error with {user['displayName']}: {e}")
            error_count += 1
    
    # Commit remaining batch operations
    if batch_count > 0:
        batch.commit()
    
    print(f"\n=== SUMMARY ===")
    print(f"✅ Successfully added: {success_count} users")
    print(f"❌ Errors: {error_count}")
    
    # Create composite index note
    print("\n📝 Note: You may need to create a composite index for the alternativeEmails array-contains query.")
    print("   If you see index errors, follow the link in the error message to create the index.")

if __name__ == "__main__":
    populate_firestore()
