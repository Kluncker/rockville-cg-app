#!/usr/bin/env python3
"""
Update specific users to have leader role in Firestore
"""

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

def update_user_roles():
    """Update specific users to have leader role"""
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
    
    # Leaders to update
    leaders = [
        {
            'name': '',
            'emails': ['']
        }
    ]
    
    print("\n🔄 Updating user roles to 'leader'...\n")
    
    success_count = 0
    error_count = 0
    
    for leader in leaders:
        print(f"Looking for {leader['name']}...")
        user_found = False
        
        # Query users collection for matching emails
        for email in leader['emails']:
            try:
                # Query for users with matching email
                users_ref = db.collection('users')
                query = users_ref.where('email', '==', email.lower())
                docs = query.get()
                
                for doc in docs:
                    user_data = doc.to_dict()
                    print(f"  Found user: {user_data.get('displayName', 'Unknown')} ({email})")
                    
                    # Update role to leader
                    doc.reference.update({
                        'role': 'leader',
                        'updatedAt': firestore.SERVER_TIMESTAMP
                    })
                    
                    print(f"  ✅ Updated role to 'leader'")
                    user_found = True
                    success_count += 1
                    
            except Exception as e:
                print(f"  ❌ Error updating {email}: {e}")
                error_count += 1
        
        if not user_found:
            print(f"  ⚠️  No user found for {leader['name']} - they may need to log in first")
            print(f"     to create their user document")
    
    print(f"\n=== SUMMARY ===")
    print(f"✅ Successfully updated: {success_count} users")
    print(f"❌ Errors: {error_count}")
    print(f"\n📝 Note: Users need to log in at least once to have a user document created.")
    print(f"   If a user wasn't found, ask them to log in first, then run this script again.")

if __name__ == "__main__":
    update_user_roles()
