#!/usr/bin/env python3
"""
Debug user migration issue - check for duplicate user documents
"""

import firebase_admin
from firebase_admin import credentials, firestore
import os

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

def check_duplicate_users():
    """Check for users with duplicate documents (both UID and email-based)"""
    if not initialize_firebase():
        print("\n❌ Failed to initialize Firebase!")
        return
    
    db = firestore.client()
    
    print("\n🔍 Checking for duplicate user documents...\n")
    
    # Get all users
    users_ref = db.collection('users')
    all_docs = users_ref.get()
    
    # Group by email
    users_by_email = {}
    for doc in all_docs:
        data = doc.to_dict()
        email = data.get('email', '').lower()
        if email:
            if email not in users_by_email:
                users_by_email[email] = []
            users_by_email[email].append({
                'id': doc.id,
                'data': data
            })
    
    # Find duplicates
    duplicates = []
    for email, docs in users_by_email.items():
        if len(docs) > 1:
            duplicates.append((email, docs))
    
    if duplicates:
        print(f"Found {len(duplicates)} users with duplicate documents:\n")
        
        for email, docs in duplicates:
            print(f"📧 {email}")
            for doc in docs:
                doc_id = doc['id']
                data = doc['data']
                created = data.get('createdAt', 'Unknown')
                has_family = 'familyId' in data
                has_gender = 'gender' in data
                is_prepopulated = data.get('prepopulated', False)
                is_migrated = 'migratedFrom' in data
                
                print(f"  • Document ID: {doc_id}")
                print(f"    - Created: {created}")
                print(f"    - Has familyId: {has_family}")
                print(f"    - Has gender: {has_gender}")
                print(f"    - Is prepopulated: {is_prepopulated}")
                print(f"    - Was migrated: {is_migrated}")
                print()
    else:
        print("✅ No duplicate user documents found!")
    
    print(f"\nTotal users: {len(users_by_email)}")
    print(f"Total documents: {len(all_docs)}")

if __name__ == "__main__":
    check_duplicate_users()
