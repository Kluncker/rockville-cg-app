// Firebase Emulator Configuration
// Only emulates Functions for testing calendar/email functionality

// Check if we're running locally
const isLocalhost = window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1' ||
                    window.location.hostname === '[::1]';

// Functions emulator port
const FUNCTIONS_EMULATOR_PORT = 5001;

// Initialize Functions emulator ONLY if running locally
if (isLocalhost) {
    console.log('🔧 Local development mode detected');
    console.log('🚀 Connecting to Functions emulator...');
    
    // Track if emulator has been initialized
    let functionsEmulatorInitialized = false;
    
    // Wait for Firebase to be initialized
    const initializeFunctionsEmulator = () => {
        if (functionsEmulatorInitialized) {
            return;
        }
        
        if (typeof firebase === 'undefined' || !firebase.apps || firebase.apps.length === 0) {
            setTimeout(initializeFunctionsEmulator, 100);
            return;
        }
        
        try {
            // Setup selective function routing without affecting global functions
            if (!window.functionsConfigured) {
                // Helper function to get the right functions instance
                window.getFirebaseFunctions = function(functionName) {
                    const emulatorFunctionNames = [
                        'createCalendarEvent',
                        'syncCalendarEvent', 
                        'deleteCalendarEvent',
                        'checkCalendarDiscrepancies'
                    ];
                    
                    // Always use production by default
                    const functions = firebase.functions();
                    
                    // Only create emulator connection for specific functions
                    if (emulatorFunctionNames.includes(functionName)) {
                        console.log(`🔧 Using emulator for ${functionName}`);
                        // Create a new instance specifically for this emulator call
                        const emulatorFunctions = firebase.app().functions();
                        emulatorFunctions.useEmulator('localhost', FUNCTIONS_EMULATOR_PORT);
                        return emulatorFunctions;
                    } else {
                        console.log(`🌐 Using production for ${functionName}`);
                        return functions;
                    }
                };
                
                window.functionsConfigured = true;
                console.log(`✅ Selective Functions routing configured`);
                console.log('📌 Calendar functions → Emulator (localhost:5001)');
                console.log('📌 All other functions → Production');
                console.log('💡 Auth checks will use production');
            }
        } catch (e) {
            // Functions might not be initialized yet, will retry
            console.error('Error initializing emulator functions:', e);
        }
        
        // Add visual indicator for development mode
        addEmulatorIndicator();
        
        functionsEmulatorInitialized = true;
        console.log('🎉 Functions emulator connected!');
        console.log('📊 View function logs at http://localhost:4000/functions');
    };
    
    // Start initialization
    initializeFunctionsEmulator();
    
    // Also try again after DOM is loaded in case Firebase initializes later
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initializeFunctionsEmulator, 500);
        });
    } else {
        setTimeout(initializeFunctionsEmulator, 500);
    }
}

// Add visual indicator showing emulator mode
function addEmulatorIndicator() {
    // Create indicator element
    const indicator = document.createElement('div');
    indicator.id = 'emulator-indicator';
    indicator.innerHTML = `
        <div style="
            position: fixed;
            bottom: 20px;
            left: 20px;
            background: #ff6b6b;
            color: white;
            padding: 10px 20px;
            border-radius: 25px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(255, 107, 107, 0.3);
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
        " 
        onmouseover="this.style.transform='scale(1.05)'" 
        onmouseout="this.style.transform='scale(1)'"
        onclick="window.open('http://localhost:4000', '_blank')"
        title="Click to open Emulator UI">
            <span style="font-size: 20px;">🔧</span>
            <span>DEV MODE: Functions Emulator Active</span>
        </div>
    `;
    
    // Add to page when DOM is ready
    if (document.body) {
        document.body.appendChild(indicator);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            document.body.appendChild(indicator);
        });
    }
    
    // Also add a console warning
    console.warn(
        '%c⚠️ DEVELOPMENT MODE ⚠️\n' +
        'Functions running locally on emulator.\n' +
        'Auth & Firestore using PRODUCTION.',
        'background: #ff6b6b; color: white; font-size: 14px; padding: 10px; border-radius: 5px;'
    );
}

// Export configuration for use in other modules
window.FUNCTIONS_EMULATOR_PORT = FUNCTIONS_EMULATOR_PORT;
window.isRunningWithLocalFunctions = isLocalhost;
