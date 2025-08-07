#!/usr/bin/env python3
"""
Populate a test user in the users collection with leader role
"""

import firebase_admin
from firebase_admin import credentials, firestore
import os
import hashlib

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

def generate_uid(email):
    """Generate a consistent UID based on email"""
    # Create a hash of the email to use as UID
    # This ensures the same email always gets the same UID
    return hashlib.sha256(email.encode()).hexdigest()[:28]  # Firebase UIDs are typically 28 chars

def populate_test_user():
    """Populate test user in Firestore users collection"""
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
    
    # Test user data
    test_user = {
        'displayName': 'Test',
        'email': '',
        'photoURL': None,
        'role': 'leader',
        'createdAt': firestore.SERVER_TIMESTAMP,
        'lastLogin': firestore.SERVER_TIMESTAMP
    }
    
    # Generate consistent UID for this email
    uid = generate_uid(test_user['email'])
    
    print(f"\n📋 Creating test user...")
    print(f"   UID: {uid}")
    print(f"   Display Name: {test_user['displayName']}")
    print(f"   Email: {test_user['email']}")
    print(f"   Role: {test_user['role']}")
    
    try:
        # Create or update the user document
        db.collection('users').document(uid).set(test_user, merge=True)
        print(f"\n✅ Successfully created test user with leader role!")
        print(f"   Document ID: {uid}")
        
        # Verify the user was created
        doc = db.collection('users').document(uid).get()
        if doc.exists:
            print(f"\n✓ Verified: User document exists in Firestore")
            user_data = doc.to_dict()
            print(f"   - Display Name: {user_data.get('displayName')}")
            print(f"   - Email: {user_data.get('email')}")
            print(f"   - Role: {user_data.get('role')}")
            
    except Exception as e:
        print(f"\n❌ Error creating test user: {e}")

if __name__ == "__main__":
    populate_test_user()
