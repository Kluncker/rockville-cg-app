// Main App JavaScript

// Firebase Configuration (same as splash.js)
const firebaseConfig = {
    apiKey: "AIzaSyDovxZ_1MSHZBgRddtl7TWPBMtafttbmPs",
    authDomain: "wz-rockville-cg-app.firebaseapp.com",
    projectId: "wz-rockville-cg-app",
    storageBucket: "wz-rockville-cg-app.firebasestorage.app",
    messagingSenderId: "619957877461",
    appId: "1:619957877461:web:153a70ae036bac5147405c"
};

// Global variables
let auth, db, currentUser;
let availableUsers = []; // Store list of users for task assignment

// Expose to global scope for other modules
window.auth = null;
window.db = null;
window.currentUser = null;

// Check if email is allowed using Cloud Function
async function isEmailAllowed(email) {
    try {
        console.log('🔍 [Dashboard] Checking if email is allowed:', email);
        
        // Call the Cloud Function
        const checkUserAuthorization = firebase.functions().httpsCallable('checkUserAuthorization');
        const result = await checkUserAuthorization();
        
        console.log('📡 [Dashboard] Authorization check result:', result.data);
        
        if (result.data.authorized) {
            console.log('✅ [Dashboard] User authorized:', result.data.message);
            return true;
        } else {
            console.log('❌ [Dashboard] User not authorized:', result.data.message);
            return false;
        }
    } catch (error) {
        console.error('❌ [Dashboard] Error checking authorization:', error);
        console.error('Error details:', {
            code: error.code,
            message: error.message,
            details: error.details
        });
        return false;
    }
}

// Initialize Firebase
function initializeFirebase() {
    if (firebaseConfig.apiKey) {
        const app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        
        // Expose to global scope
        window.auth = auth;
        window.db = db;
        
        // Check authentication
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                console.log('🔐 User authenticated:', user.email);
                
                // Check if user is allowed
                const isAllowed = await isEmailAllowed(user.email);
                if (!isAllowed) {
                    console.error('⛔ User not authorized!');
                    showNotification('Access denied. Check console for details. Redirecting in 5 seconds...', 'error');
                    
                    // Add delay before redirecting to see errors
                    setTimeout(async () => {
                        // Sign out unauthorized user
                        await auth.signOut();
                        window.location.href = 'index.html';
                    }, 5000); // 5 second delay
                    return;
                }
                
                currentUser = user;
                window.currentUser = user;
                await loadUserData();
                initializeApp();
            } else {
                // Redirect to login
                console.log('🔒 No user authenticated, redirecting to login...');
                window.location.href = 'index.html';
            }
        });
    } else {
        showNotification('Please configure Firebase settings', 'error');
    }
}

// Load user data
async function loadUserData() {
    if (currentUser) {
        // Update UI with user info
        const userAvatar = document.getElementById('userAvatar');
        const userName = document.getElementById('userName');
        
        if (userAvatar && currentUser.photoURL) {
            userAvatar.src = currentUser.photoURL;
        }
        if (userName) {
            userName.textContent = currentUser.displayName || 'User';
        }
        
        // Get user role from Firestore or create user document if it doesn't exist
        try {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                currentUser.role = userData.role || 'member';
                
                // Update lastLogin
                await db.collection('users').doc(currentUser.uid).update({
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                // Create user document for existing authenticated user
                console.log('Creating user document for existing user:', currentUser.uid);
                await db.collection('users').doc(currentUser.uid).set({
                    displayName: currentUser.displayName || 'Unknown User',
                    email: currentUser.email,
                    photoURL: currentUser.photoURL || null,
                    role: 'member', // Default role
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                });
                currentUser.role = 'member';
            }
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }
}

// Initialize main app
function initializeApp() {
    setupEventListeners();
    loadCalendar();
    loadTasks();
    loadUpcomingEvents();
    checkNotifications();
    loadAvailableUsers(); // Load users for task assignment
}

// Setup event listeners
function setupEventListeners() {
    // Add Event button
    const addEventBtn = document.getElementById('addEventBtn');
    if (addEventBtn) {
        addEventBtn.addEventListener('click', () => showEventModal());
    }
    
    // User menu
    const menuBtn = document.getElementById('menuBtn');
    const userDropdown = document.getElementById('userDropdown');
    if (menuBtn && userDropdown) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.style.display = userDropdown.style.display === 'none' ? 'block' : 'none';
        });
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        if (userDropdown) {
            userDropdown.style.display = 'none';
        }
    });
    
    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await auth.signOut();
                window.location.href = 'index.html';
            } catch (error) {
                console.error('Error signing out:', error);
                showNotification('Error signing out', 'error');
            }
        });
    }
    
    // Modal controls
    const eventModal = document.getElementById('eventModal');
    const closeModal = document.getElementById('closeModal');
    const cancelBtn = document.getElementById('cancelBtn');
    
    if (closeModal) {
        closeModal.addEventListener('click', () => hideEventModal());
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => hideEventModal());
    }
    
    // Close modal on background click
    if (eventModal) {
        eventModal.addEventListener('click', (e) => {
            if (e.target === eventModal) {
                hideEventModal();
            }
        });
    }
    
    // Event form submission
    const eventForm = document.getElementById('eventForm');
    if (eventForm) {
        eventForm.addEventListener('submit', handleEventSubmit);
    }
    
    // Add task button
    const addTaskBtn = document.getElementById('addTaskBtn');
    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', addTaskInput);
    }
    
    // Task filters
    const filterChips = document.querySelectorAll('.filter-chip');
    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            filterChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            filterTasks(chip.dataset.filter);
        });
    });
}

// Show event modal
function showEventModal(date = null, eventData = null) {
    const modal = document.getElementById('eventModal');
    const modalTitle = document.getElementById('modalTitle');
    const form = document.getElementById('eventForm');
    
    if (modal && form) {
        // Reset form
        form.reset();
        document.getElementById('taskInputs').innerHTML = '';
        
        if (eventData) {
            // Edit mode
            modalTitle.textContent = 'Edit Event';
            populateEventForm(eventData);
        } else {
            // Add mode
            modalTitle.textContent = 'Add New Event';
            if (date) {
                document.getElementById('eventDate').value = date;
            }
        }
        
        modal.style.display = 'flex';
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
    }
}

// Hide event modal
function hideEventModal() {
    const modal = document.getElementById('eventModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
}

// Populate event form for editing
function populateEventForm(eventData) {
    if (!eventData) return;
    
    // Populate basic fields
    document.getElementById('eventTitle').value = eventData.title || '';
    document.getElementById('eventType').value = eventData.type || '';
    document.getElementById('eventDate').value = eventData.date || '';
    document.getElementById('eventTime').value = eventData.time || '';
    document.getElementById('eventLocation').value = eventData.location || '';
    document.getElementById('eventDescription').value = eventData.description || '';
    
    // Populate tasks if they exist
    if (eventData.tasks && eventData.tasks.length > 0) {
        eventData.tasks.forEach(task => {
            addTaskInput(task);
        });
    }
}

// Add task input
function addTaskInput(taskData = null) {
    const taskInputs = document.getElementById('taskInputs');
    const taskGroup = document.createElement('div');
    taskGroup.className = 'task-input-group';
    
    taskGroup.innerHTML = `
        <input type="text" placeholder="Task description" value="${taskData?.title || ''}" required>
        <select required>
            <option value="">Assign to...</option>
            ${getAvailableUsers()}
        </select>
        <button type="button" class="remove-task-btn" onclick="this.parentElement.remove()">
            <span class="material-icons">delete</span>
        </button>
    `;
    
    if (taskData?.assignedTo) {
        taskGroup.querySelector('select').value = taskData.assignedTo;
    }
    
    taskInputs.appendChild(taskGroup);
}

// Load available users from Firestore
async function loadAvailableUsers() {
    try {
        const usersSnapshot = await db.collection('users').get();
        availableUsers = [];
        
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            availableUsers.push({
                uid: doc.id,
                displayName: userData.displayName || 'Unknown User',
                email: userData.email,
                photoURL: userData.photoURL
            });
        });
        
        console.log('Loaded users:', availableUsers.length);
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

// Get available users for task assignment
function getAvailableUsers() {
    if (availableUsers.length === 0) {
        return '<option value="">No users available</option>';
    }
    
    return availableUsers.map(user => 
        `<option value="${user.uid}">${user.displayName}</option>`
    ).join('');
}

// Handle event form submission
async function handleEventSubmit(e) {
    e.preventDefault();
    
    const formData = {
        title: document.getElementById('eventTitle').value,
        type: document.getElementById('eventType').value,
        date: document.getElementById('eventDate').value,
        time: document.getElementById('eventTime').value,
        location: document.getElementById('eventLocation').value,
        description: document.getElementById('eventDescription').value,
        createdBy: currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        tasks: []
    };
    
    // Get tasks
    const taskGroups = document.querySelectorAll('.task-input-group');
    taskGroups.forEach(group => {
        const taskTitle = group.querySelector('input').value;
        const assignedTo = group.querySelector('select').value;
        if (taskTitle && assignedTo) {
            formData.tasks.push({
                title: taskTitle,
                assignedTo: assignedTo,
                status: 'pending'
            });
        }
    });
    
    try {
        // Save to Firestore and get the created event reference
        const eventRef = await db.collection('events').add(formData);
        const eventId = eventRef.id;
        
        // Create tasks
        for (const task of formData.tasks) {
            // Get assigned user's display name for the task
            const assignedUser = availableUsers.find(u => u.uid === task.assignedTo);
            await db.collection('tasks').add({
                ...task,
                assignedUserName: assignedUser ? assignedUser.displayName : 'Unknown',
                eventId: eventId,
                eventTitle: formData.title,
                eventDate: formData.date,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: currentUser.uid,
                notificationSent: false
            });
        }
        
        showNotification('Event created successfully!', 'success');
        hideEventModal();
        
        // Reload data
        loadCalendar();
        loadUpcomingEvents();
        
    } catch (error) {
        console.error('Error creating event:', error);
        showNotification('Error creating event', 'error');
    }
}

// Check for notifications
async function checkNotifications() {
    if (!currentUser) return;
    
    try {
        // Check for tasks that need notification (3 weeks before)
        const threeWeeksFromNow = new Date();
        threeWeeksFromNow.setDate(threeWeeksFromNow.getDate() + 21);
        
        const tasksSnapshot = await db.collection('tasks')
            .where('assignedTo', '==', currentUser.uid)
            .where('notificationSent', '==', false)
            .where('eventDate', '<=', threeWeeksFromNow.toISOString().split('T')[0])
            .get();
        
        const notificationCount = tasksSnapshot.size;
        const badge = document.querySelector('.notification-badge');
        if (badge) {
            badge.textContent = notificationCount;
            badge.style.display = notificationCount > 0 ? 'block' : 'none';
        }
        
    } catch (error) {
        console.error('Error checking notifications:', error);
    }
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type} fade-in`;
    notification.innerHTML = `
        <span class="material-icons">${type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info'}</span>
        <span>${message}</span>
    `;
    
    const style = document.createElement('style');
    style.textContent = `
        .notification {
            position: fixed;
            bottom: 2rem;
            right: 2rem;
            padding: 1rem 1.5rem;
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            z-index: 2000;
            display: flex;
            align-items: center;
            gap: 0.75rem;
            font-size: 0.95rem;
            min-width: 250px;
        }
        .notification.error {
            border-left: 4px solid #ff5252;
            color: #ff5252;
        }
        .notification.success {
            border-left: 4px solid #4caf50;
            color: #4caf50;
        }
        .notification.info {
            border-left: 4px solid #2196f3;
            color: #2196f3;
        }
    `;
    
    if (!document.querySelector('style[data-notification]')) {
        style.setAttribute('data-notification', 'true');
        document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Filter tasks
function filterTasks(filter) {
    const taskCards = document.querySelectorAll('.task-card');
    taskCards.forEach(card => {
        if (filter === 'all') {
            card.style.display = 'flex';
        } else {
            const status = card.dataset.status;
            card.style.display = status === filter ? 'flex' : 'none';
        }
    });
}

// Load calendar (stub - implemented in calendar.js)
function loadCalendar() {
    if (typeof initCalendar === 'function') {
        initCalendar();
    }
}

// Load tasks (stub - implemented in tasks.js)
function loadTasks() {
    if (typeof loadUserTasks === 'function') {
        loadUserTasks();
    }
}

// Load upcoming events
async function loadUpcomingEvents() {
    const container = document.getElementById('upcomingEvents');
    if (!container) return;
    
    try {
        const today = new Date().toISOString().split('T')[0];
        const eventsSnapshot = await db.collection('events')
            .where('date', '>=', today)
            .orderBy('date')
            .limit(6)
            .get();
        
        container.innerHTML = '';
        
        eventsSnapshot.forEach(doc => {
            const event = { id: doc.id, ...doc.data() };
            const eventCard = createEventCard(event);
            container.appendChild(eventCard);
        });
        
        if (eventsSnapshot.empty) {
            container.innerHTML = '<p class="no-events">No upcoming events</p>';
        }
        
    } catch (error) {
        console.error('Error loading upcoming events:', error);
        container.innerHTML = '<p class="error">Error loading events</p>';
    }
}

// Create event card
function createEventCard(event) {
    const card = document.createElement('div');
    card.className = `event-card ${event.type} card-hover`;
    
    const eventDate = new Date(event.date + 'T' + event.time);
    const formattedDate = eventDate.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
    });
    const formattedTime = eventDate.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit' 
    });
    
    card.innerHTML = `
        <div class="event-header">
            <div>
                <h3>${event.title}</h3>
                <p class="event-datetime">${formattedDate} at ${formattedTime}</p>
                ${event.location ? `<p class="event-location"><span class="material-icons">location_on</span> ${event.location}</p>` : ''}
            </div>
            <span class="event-type-badge ${event.type}">${getEventTypeLabel(event.type)}</span>
        </div>
        ${event.description ? `<p class="event-description">${event.description}</p>` : ''}
        ${event.tasks?.length ? `<p class="event-tasks"><span class="material-icons">task_alt</span> ${event.tasks.length} tasks</p>` : ''}
    `;
    
    card.addEventListener('click', () => showEventModal(null, event));
    
    return card;
}

// Get event type label
function getEventTypeLabel(type) {
    const labels = {
        'bible-study': 'Bible Study',
        'mens-fellowship': "Men's Fellowship",
        'womens-fellowship': "Women's Fellowship",
        'sunday-service': 'Sunday Service',
        'community': 'Community Event'
    };
    return labels[type] || type;
}

// Expose functions to global scope for other modules
window.showNotification = showNotification;
window.showEventModal = showEventModal;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    initializeFirebase();
});
