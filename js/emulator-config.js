// Firebase Emulator Configuration
// Include this file when testing locally with emulators

// Point Firebase Functions to local emulator
if (window.location.hostname === 'localhost') {
    firebase.functions().useEmulator('localhost', 5001);
    console.log('🔧 Using Firebase Functions Emulator at localhost:5001');
}
