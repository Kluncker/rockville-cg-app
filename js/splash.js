// Splash Page JavaScript

// Canvas Background Animation
class GradientAnimation {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.time = 0;
        this.colors = [
            { r: 135, g: 206, b: 235 }, // Sky blue
            { r: 255, g: 248, b: 220 }, // Cornsilk
            { r: 255, g: 228, b: 225 }  // Misty rose
        ];
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    animate() {
        this.time += 0.001;
        
        // Create gradient
        const gradient = this.ctx.createLinearGradient(
            0, 0, 
            this.canvas.width, this.canvas.height
        );
        
        // Animate gradient stops
        const offset1 = Math.sin(this.time) * 0.2 + 0.3;
        const offset2 = Math.sin(this.time * 1.3) * 0.2 + 0.5;
        
        gradient.addColorStop(0, `rgb(${this.colors[0].r}, ${this.colors[0].g}, ${this.colors[0].b})`);
        gradient.addColorStop(offset1, `rgb(${this.colors[1].r}, ${this.colors[1].g}, ${this.colors[1].b})`);
        gradient.addColorStop(offset2, `rgb(${this.colors[2].r}, ${this.colors[2].g}, ${this.colors[2].b})`);
        gradient.addColorStop(1, `rgb(${this.colors[0].r}, ${this.colors[0].g}, ${this.colors[0].b})`);
        
        // Fill canvas
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Add subtle overlay
        this.ctx.fillStyle = `rgba(255, 255, 255, ${Math.sin(this.time * 2) * 0.05 + 0.05})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
}

// Parallax Effect for Floating Elements
class ParallaxController {
    constructor() {
        this.elements = document.querySelectorAll('.floating-element');
        this.mouseX = 0;
        this.mouseY = 0;
        this.targetX = 0;
        this.targetY = 0;
        
        document.addEventListener('mousemove', (e) => {
            this.mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
            this.mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
        });
    }

    animate() {
        // Smooth lerp to target position
        this.targetX += (this.mouseX - this.targetX) * 0.1;
        this.targetY += (this.mouseY - this.targetY) * 0.1;
        
        this.elements.forEach(element => {
            const speed = parseFloat(element.dataset.speed) || 0.5;
            const x = this.targetX * speed * 50;
            const y = this.targetY * speed * 50;
            
            element.style.transform = `translate(${x}px, ${y}px)`;
        });
    }
}

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDovxZ_1MSHZBgRddtl7TWPBMtafttbmPs",
    authDomain: "wz-rockville-cg-app.firebaseapp.com",
    projectId: "wz-rockville-cg-app",
    storageBucket: "wz-rockville-cg-app.firebasestorage.app",
    messagingSenderId: "619957877461",
    appId: "1:619957877461:web:153a70ae036bac5147405c"
};

// Initialize Firebase (will be done when config is added)
let app, auth, db;

function initializeFirebase() {
    if (firebaseConfig.apiKey) {
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        
        // Check if user is already signed in
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                console.log('🔐 User already signed in:', user.email);
                // Check if user is allowed before redirecting
                const isAllowed = await isEmailAllowed(user.email);
                if (isAllowed) {
                    // User is signed in and allowed, redirect to dashboard
                    transitionToDashboard();
                } else {
                    // User is signed in but not allowed
                    console.error('⛔ Already signed-in user not authorized!');
                    await auth.signOut();
                    showNotification('Access denied. You are not authorized to use this app.', 'error');
                }
            }
        });
    }
}

// Check if email is allowed using Cloud Function
async function isEmailAllowed(email) {
    try {
        console.log('🔍 Checking if email is allowed:', email);
        
        // Call the Cloud Function
        const checkUserAuthorization = firebase.functions().httpsCallable('checkUserAuthorization');
        const result = await checkUserAuthorization();
        
        console.log('📡 Authorization check result:', result.data);
        
        if (result.data.authorized) {
            console.log('✅ User authorized:', result.data.message);
            return true;
        } else {
            console.log('❌ User not authorized:', result.data.message);
            return false;
        }
    } catch (error) {
        console.error('❌ Error checking authorization:', error);
        console.error('Error details:', {
            code: error.code,
            message: error.message,
            details: error.details
        });
        return false;
    }
}

// Google Sign In
async function signInWithGoogle() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        
        // Check if user is allowed
        const isAllowed = await isEmailAllowed(user.email);
        if (!isAllowed) {
            // Sign out the user immediately
            await auth.signOut();
            showNotification('Access denied. You are not authorized to use this app. Please contact an administrator.', 'error');
            return;
        }
        
        // Check if user document exists
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (!userDoc.exists) {
            // Create new user document
            await db.collection('users').doc(user.uid).set({
                displayName: user.displayName,
                email: user.email,
                photoURL: user.photoURL,
                role: 'member', // Default role for new users
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            // Update lastLogin for existing user
            await db.collection('users').doc(user.uid).update({
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        // Transition to dashboard
        transitionToDashboard();
    } catch (error) {
        console.error('Error signing in:', error);
        showNotification('Error signing in. Please try again.', 'error');
    }
}

// Page Transition
function transitionToDashboard() {
    const welcomeCard = document.querySelector('.welcome-card');
    welcomeCard.classList.add('page-exit-active');
    
    setTimeout(() => {
        window.location.href = 'dashboard.html';
    }, 500);
}

// Notification System
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type} fade-in`;
    notification.textContent = message;
    
    const style = document.createElement('style');
    style.textContent = `
        .notification {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
            z-index: 1000;
            font-size: 0.9rem;
        }
        .notification.error {
            border-left: 4px solid #ff5252;
            color: #ff5252;
        }
        .notification.success {
            border-left: 4px solid #4caf50;
            color: #4caf50;
        }
    `;
    
    if (!document.querySelector('style[data-notification]')) {
        style.setAttribute('data-notification', 'true');
        document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Initialize Everything
document.addEventListener('DOMContentLoaded', () => {
    // Start canvas animation
    const canvas = document.getElementById('backgroundCanvas');
    const gradientAnimation = new GradientAnimation(canvas);
    
    // Start parallax
    const parallax = new ParallaxController();
    
    // Animation loop
    function animate() {
        gradientAnimation.animate();
        parallax.animate();
        requestAnimationFrame(animate);
    }
    animate();
    
    // Initialize Firebase
    initializeFirebase();
    
    // Sign in button
    const signInButton = document.getElementById('googleSignIn');
    if (signInButton) {
        signInButton.addEventListener('click', () => {
            if (auth) {
                signInWithGoogle();
            } else {
                showNotification('Please configure Firebase settings first', 'error');
            }
        });
    }
    
    // Add entrance animations
    const elements = document.querySelectorAll('.welcome-title, .church-name, .tagline, .sign-in-button');
    elements.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            el.style.transition = 'all 0.6s ease';
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }, 200 + (index * 100));
    });
});
