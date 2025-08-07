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
let selectedAttendees = []; // Store selected attendees for the event
let locationAutocomplete = null; // Store location autocomplete instance

// Loading state management
let loadingStates = {
    auth: false,
    userData: false,
    availableUsers: false,
    calendar: false,
    tasks: false,
    upcomingEvents: false
};

// Expose to global scope for other modules
window.auth = null;
window.db = null;
window.currentUser = null;

// Check if email is allowed using Cloud Function
async function isEmailAllowed(email) {
    try {
        console.log('🔍 [Dashboard] Checking if email is allowed:', email);
        
        // Call the Cloud Function (always use production)
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
    // Add loading class to body
    document.body.classList.add('loading');
    
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
                loadingStates.auth = true;
                
                await loadUserData();
                loadingStates.userData = true;
                
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
        
        // Get user role from Firestore or create/migrate user document if needed
        try {
            const userDoc = await db.collection('users').doc(currentUser.uid).get();
            
            if (userDoc.exists) {
                const userData = userDoc.data();
                currentUser.role = userData.role || 'member';
                
                // Update lastLogin and photo if changed
                const updates = {
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                // Update photo URL if it has changed
                if (currentUser.photoURL && currentUser.photoURL !== userData.photoURL) {
                    updates.photoURL = currentUser.photoURL;
                }
                
                await db.collection('users').doc(currentUser.uid).update(updates);
            } else {
                // Check if there's a prepopulated document using email-based ID
                const emailBasedId = currentUser.email.replace('@', '_').replace('.', '_');
                const prepopulatedDoc = await db.collection('users').doc(emailBasedId).get();
                
                if (prepopulatedDoc.exists) {
                    // Migrate prepopulated data to proper UID-based document
                    console.log('Migrating prepopulated user document:', currentUser.email);
                    const prepopulatedData = prepopulatedDoc.data();
                    
                    // Create new document with proper UID
                    await db.collection('users').doc(currentUser.uid).set({
                        ...prepopulatedData,
                        displayName: currentUser.displayName || prepopulatedData.displayName,
                        email: currentUser.email,
                        photoURL: currentUser.photoURL || null,
                        lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                        migratedFrom: emailBasedId,
                        migratedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    
                    // Delete old email-based document
                    await db.collection('users').doc(emailBasedId).delete();
                    
                    currentUser.role = prepopulatedData.role || 'member';
                    console.log('✅ Successfully migrated user data with family:', prepopulatedData.familyId);
                } else {
                    // Create new user document from scratch
                    console.log('Creating new user document:', currentUser.uid);
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
            }
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }
}

// Initialize main app
async function initializeApp() {
    setupEventListeners();
    
    // Load all data in parallel
    const loadingPromises = [
        loadCalendar().then(() => { loadingStates.calendar = true; }),
        loadTasks().then(() => { loadingStates.tasks = true; }),
        loadUpcomingEvents().then(() => { loadingStates.upcomingEvents = true; }),
        checkNotifications(),
        loadAvailableUsers().then(() => { 
            loadingStates.availableUsers = true;
            console.log('✓ Available users loaded:', availableUsers.length);
        })
    ];
    
    // Wait for all critical data to load
    await Promise.all(loadingPromises);
    
    // Hide loading overlay and show content
    hideLoadingOverlay();
    
    // Handle URL hash navigation after content is loaded
    handleUrlHash();
}

// Hide loading overlay and show content
function hideLoadingOverlay() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    const body = document.body;
    
    // Check if all critical states are loaded
    const criticalStatesLoaded = 
        loadingStates.auth && 
        loadingStates.userData && 
        loadingStates.availableUsers &&
        loadingStates.calendar;
    
    if (criticalStatesLoaded && loadingOverlay) {
        // Fade out loading overlay
        loadingOverlay.classList.add('fade-out');
        
        // Show main content with animation
        setTimeout(() => {
            body.classList.remove('loading');
            
            // Add fade-in animation to header and content
            const header = document.querySelector('.app-header');
            const content = document.querySelector('.main-content');
            
            if (header) {
                header.style.opacity = '0';
                header.style.visibility = 'visible';
                header.style.transition = 'opacity 0.5s ease';
                setTimeout(() => { header.style.opacity = '1'; }, 50);
            }
            
            if (content) {
                content.style.opacity = '0';
                content.style.visibility = 'visible';
                content.style.transition = 'opacity 0.5s ease';
                setTimeout(() => { content.style.opacity = '1'; }, 100);
            }
        }, 300);
    }
}

// Setup event listeners
function setupEventListeners() {
    // Add Event button
    const addEventBtn = document.getElementById('addEventBtn');
    if (addEventBtn) {
        addEventBtn.addEventListener('click', () => showEventModal());
    }
    
    // Event legend is now always visible, no toggle needed
    
    // Event Preview Modal controls
    const closePreviewModal = document.getElementById('closePreviewModal');
    const addEventFromPreview = document.getElementById('addEventFromPreview');
    const eventPreviewModal = document.getElementById('eventPreviewModal');
    
    if (closePreviewModal) {
        closePreviewModal.addEventListener('click', () => hideEventPreviewModal());
    }
    
    if (addEventFromPreview) {
        addEventFromPreview.addEventListener('click', () => {
            const previewDate = document.getElementById('previewDate').dataset.date;
            hideEventPreviewModal();
            showEventModal(previewDate);
        });
    }
    
    // Close preview modal on background click
    if (eventPreviewModal) {
        eventPreviewModal.addEventListener('click', (e) => {
            if (e.target === eventPreviewModal) {
                hideEventPreviewModal();
            }
        });
    }
    
    // Notification bell
    const notificationBtn = document.getElementById('notificationBtn');
    if (notificationBtn) {
        notificationBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleNotificationDropdown();
        });
    }
    
    // User menu
    const menuBtn = document.getElementById('menuBtn');
    const userDropdown = document.getElementById('userDropdown');
    if (menuBtn && userDropdown) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('Menu button clicked'); // Debug log
            const currentDisplay = userDropdown.style.display;
            console.log('Current dropdown display:', currentDisplay); // Debug log
            userDropdown.style.display = currentDisplay === 'none' || !currentDisplay ? 'block' : 'none';
            console.log('New dropdown display:', userDropdown.style.display); // Debug log
            // Close notification dropdown when opening user menu
            const notificationDropdown = document.getElementById('notificationDropdown');
            if (notificationDropdown) {
                notificationDropdown.style.display = 'none';
            }
        });
    } else {
        console.error('Menu button or dropdown not found:', { menuBtn, userDropdown }); // Debug log
    }
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        // Don't close if clicking inside the dropdowns
        const clickedInsideUserDropdown = userDropdown && userDropdown.contains(e.target);
        const clickedInsideNotificationDropdown = document.getElementById('notificationDropdown')?.contains(e.target);
        
        if (!clickedInsideUserDropdown && userDropdown) {
            userDropdown.style.display = 'none';
        }
        
        const notificationDropdown = document.getElementById('notificationDropdown');
        if (!clickedInsideNotificationDropdown && notificationDropdown) {
            notificationDropdown.style.display = 'none';
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
    
    // View/Edit attendees button
    const viewAttendeesBtn = document.getElementById('viewAttendeesBtn');
    if (viewAttendeesBtn) {
        viewAttendeesBtn.addEventListener('click', toggleAttendeesView);
    }
    
    // Calendar invite modal buttons
    const sendNowBtn = document.getElementById('sendNowBtn');
    const sendLaterBtn = document.getElementById('sendLaterBtn');
    if (sendNowBtn) {
        sendNowBtn.addEventListener('click', handleSendCalendarNow);
    }
    if (sendLaterBtn) {
        sendLaterBtn.addEventListener('click', handleSendCalendarLater);
    }
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
        
        // Reset attendee selections
        selectedAttendees = [];
        document.getElementById('attendeesList').style.display = 'none';
        
        // Set up attendee count display
        const attendeeCount = document.querySelector('.attendee-count');
        if (attendeeCount) {
            attendeeCount.textContent = '0 attendees selected';
        }
        
        // Remove any existing event type change listeners
        const eventTypeSelect = document.getElementById('eventType');
        if (eventTypeSelect) {
            const newEventTypeSelect = eventTypeSelect.cloneNode(true);
            eventTypeSelect.parentNode.replaceChild(newEventTypeSelect, eventTypeSelect);
        }
        
        if (eventData) {
            // Edit mode - check permissions first
            if (!canEditEvent(eventData)) {
                showNotification('You do not have permission to edit this event', 'error');
                return;
            }
            modalTitle.textContent = 'Edit Event';
            populateEventForm(eventData);
            // Store event ID for update
            form.dataset.eventId = eventData.id;
        } else {
            // Add mode
            modalTitle.textContent = 'Add New Event';
            if (date) {
                document.getElementById('eventDate').value = date;
            }
            // Clear event ID to indicate new event
            delete form.dataset.eventId;
            
            // Set up event type change listener for auto-selecting attendees (only for new events)
            const newEventTypeSelect = document.getElementById('eventType');
            if (newEventTypeSelect) {
                newEventTypeSelect.addEventListener('change', handleEventTypeChange);
                // Also hide attendees list initially
                document.getElementById('attendeesList').style.display = 'none';
            }
        }
        
        modal.style.display = 'flex';
        setTimeout(() => {
            modal.classList.add('show');
            
            // Initialize location autocomplete
            const locationInput = document.getElementById('eventLocation');
            if (locationInput && window.LocationAutocomplete) {
                if (locationAutocomplete) {
                    locationAutocomplete.clear();
                }
                locationAutocomplete = new window.LocationAutocomplete(locationInput);
                
                // If editing, set the existing location value
                if (eventData && eventData.location) {
                    locationAutocomplete.setValue(eventData.location);
                }
            }
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
    
    // Populate duration
    if (eventData.duration) {
        const hours = Math.floor(eventData.duration / 60);
        const minutes = eventData.duration % 60;
        document.getElementById('eventDurationHours').value = hours;
        document.getElementById('eventDurationMinutes').value = minutes;
    }
    
    // Populate attendees if they exist - preserve original selection
    if (eventData.attendees && eventData.attendees.length > 0) {
        selectedAttendees = eventData.attendees || [];
        updateAttendeeCount();
        
        // Populate the attendees list with ALL users but only check the original attendees
        populateAttendeesListForEdit(availableUsers, selectedAttendees);
    } else {
        // No attendees were selected originally
        selectedAttendees = [];
        updateAttendeeCount();
    }
    
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
                gender: userData.gender || null,
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
    
    const form = e.target;
    const eventId = form.dataset.eventId; // Get event ID if editing
    const isEditing = !!eventId;
    
    // Get the time value and convert to Eastern Time format
    const timeValue = document.getElementById('eventTime').value;
    const dateValue = document.getElementById('eventDate').value;
    
    // Store the time as-is since we're treating it as Eastern Time
    const formData = {
        title: document.getElementById('eventTitle').value,
        type: document.getElementById('eventType').value,
        date: dateValue,
        time: timeValue,
        timeZone: 'America/New_York', // Explicitly store timezone
        duration: parseInt(document.getElementById('eventDurationHours').value || 0) * 60 + parseInt(document.getElementById('eventDurationMinutes').value || 0), // Duration in minutes
        location: document.getElementById('eventLocation').value,
        description: document.getElementById('eventDescription').value,
        attendees: selectedAttendees,
        tasks: []
    };
    
    // Only add createdBy and createdAt for new events
    if (!isEditing) {
        formData.createdBy = currentUser.uid;
        formData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    } else {
        // For updates, add an updatedAt timestamp
        formData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        formData.updatedBy = currentUser.uid;
    }
    
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
        let eventIdToUse = eventId;
        
        if (isEditing) {
            // Check if event has calendar event and mark as discrepancy
            const eventDoc = await db.collection('events').doc(eventId).get();
            const eventData = eventDoc.data();
            
            if (eventData.googleCalendarEventId) {
                // Mark as having discrepancy since we're editing
                formData['calendarSyncStatus.hasDiscrepancy'] = true;
                formData['calendarSyncStatus.discrepancyDetails'] = ['Event modified in app'];
                formData['calendarSyncStatus.lastChecked'] = firebase.firestore.FieldValue.serverTimestamp();
            }
            
            // Update existing event
            await db.collection('events').doc(eventId).update(formData);
            
            // Delete existing tasks for this event
            const existingTasksSnapshot = await db.collection('tasks')
                .where('eventId', '==', eventId)
                .get();
            
            const batch = db.batch();
            existingTasksSnapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            
        } else {
            // Create new event
            const eventRef = await db.collection('events').add(formData);
            eventIdToUse = eventRef.id;
        }
        
        // Create tasks (for both new and updated events)
        for (const task of formData.tasks) {
            // Get assigned user's display name for the task
            const assignedUser = availableUsers.find(u => u.uid === task.assignedTo);
            await db.collection('tasks').add({
                ...task,
                assignedUserName: assignedUser ? assignedUser.displayName : 'Unknown',
                eventId: eventIdToUse,
                eventTitle: formData.title,
                eventDate: formData.date,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: currentUser.uid,
                notificationSent: false
            });
        }
        
        showNotification(isEditing ? 'Event updated successfully!' : 'Event created successfully!', 'success');
        hideEventModal();
        
        // Store the event ID for calendar creation
        window.lastCreatedEventId = eventIdToUse;
        
        // Reload data
        loadCalendar();
        loadUpcomingEvents();
        loadTasks();
        
        // Show calendar invite popup only for new events and if user is a leader
        if (!isEditing && isLeader()) {
            setTimeout(() => {
                showCalendarInviteModal();
            }, 500);
        }
        
    } catch (error) {
        console.error(isEditing ? 'Error updating event:' : 'Error creating event:', error);
        showNotification(isEditing ? 'Error updating event' : 'Error creating event', 'error');
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
            .where('status', '==', 'pending')
            .where('eventDate', '<=', threeWeeksFromNow.toISOString().split('T')[0])
            .get();
        
        const notificationCount = tasksSnapshot.size;
        const badge = document.querySelector('.notification-badge');
        if (badge) {
            badge.textContent = notificationCount;
            badge.style.display = notificationCount > 0 ? 'block' : 'none';
        }
        
        // Store notifications for dropdown
        window.pendingNotifications = [];
        tasksSnapshot.forEach(doc => {
            const task = { id: doc.id, ...doc.data() };
            window.pendingNotifications.push(task);
        });
        
    } catch (error) {
        console.error('Error checking notifications:', error);
    }
}

// Toggle notification dropdown
function toggleNotificationDropdown() {
    let notificationDropdown = document.getElementById('notificationDropdown');
    
    // Create dropdown if it doesn't exist
    if (!notificationDropdown) {
        notificationDropdown = document.createElement('div');
        notificationDropdown.id = 'notificationDropdown';
        notificationDropdown.className = 'notification-dropdown';
        
        // Append to body for better positioning control
        document.body.appendChild(notificationDropdown);
    }
    
    // Toggle visibility
    if (notificationDropdown.style.display === 'none' || !notificationDropdown.style.display) {
        // Close user dropdown if open
        const userDropdown = document.getElementById('userDropdown');
        if (userDropdown) {
            userDropdown.style.display = 'none';
        }
        
        // Position the dropdown relative to the notification button
        const notificationBtn = document.getElementById('notificationBtn');
        const btnRect = notificationBtn.getBoundingClientRect();
        
        // Calculate position
        notificationDropdown.style.position = 'fixed';
        notificationDropdown.style.top = (btnRect.bottom + 8) + 'px';
        notificationDropdown.style.right = (window.innerWidth - btnRect.right) + 'px';
        
        // Ensure dropdown doesn't go off-screen on mobile
        const dropdownWidth = 360;
        if (window.innerWidth - btnRect.left < dropdownWidth) {
            notificationDropdown.style.right = '1rem';
        }
        
        // Show notification dropdown
        displayNotifications(notificationDropdown);
        notificationDropdown.style.display = 'block';
    } else {
        notificationDropdown.style.display = 'none';
    }
}

// Display notifications in dropdown
function displayNotifications(dropdown) {
    dropdown.innerHTML = '';
    
    // Add header
    const header = document.createElement('div');
    header.className = 'notification-header';
    header.innerHTML = `
        <h4>Notifications</h4>
        ${window.pendingNotifications && window.pendingNotifications.length > 0 ? 
            '<button class="clear-all-btn" onclick="clearAllNotifications()">Clear All</button>' : ''}
    `;
    dropdown.appendChild(header);
    
    // Add notification items
    if (window.pendingNotifications && window.pendingNotifications.length > 0) {
        const notificationList = document.createElement('div');
        notificationList.className = 'notification-list';
        
        window.pendingNotifications.forEach(task => {
            const notificationItem = createNotificationItem(task);
            notificationList.appendChild(notificationItem);
        });
        
        dropdown.appendChild(notificationList);
    } else {
        const emptyState = document.createElement('div');
        emptyState.className = 'notification-empty';
        emptyState.innerHTML = `
            <span class="material-icons">notifications_none</span>
            <p>No new notifications</p>
        `;
        dropdown.appendChild(emptyState);
    }
}

// Create notification item
function createNotificationItem(task) {
    const item = document.createElement('div');
    item.className = 'notification-item';
    
    const eventDate = new Date(task.eventDate);
    const daysUntil = Math.ceil((eventDate - new Date()) / (1000 * 60 * 60 * 24));
    
    item.innerHTML = `
        <div class="notification-content">
            <h5>${task.title}</h5>
            <p class="notification-event">${task.eventTitle}</p>
            <p class="notification-date">
                <span class="material-icons">schedule</span>
                ${daysUntil > 0 ? `Due in ${daysUntil} days` : 'Due today'}
            </p>
        </div>
        <button class="notification-action" onclick="confirmTask('${task.id}')">
            <span class="material-icons">check</span>
        </button>
    `;
    
    return item;
}

// Confirm task
async function confirmTask(taskId) {
    try {
        await db.collection('tasks').doc(taskId).update({
            status: 'confirmed',
            confirmedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showNotification('Task confirmed!', 'success');
        
        // Refresh notifications
        await checkNotifications();
        const dropdown = document.getElementById('notificationDropdown');
        if (dropdown && dropdown.style.display === 'block') {
            displayNotifications(dropdown);
        }
        
        // Refresh tasks list
        loadTasks();
        
    } catch (error) {
        console.error('Error confirming task:', error);
        showNotification('Error confirming task', 'error');
    }
}

// Clear all notifications
async function clearAllNotifications() {
    try {
        const batch = db.batch();
        
        window.pendingNotifications.forEach(task => {
            const taskRef = db.collection('tasks').doc(task.id);
            batch.update(taskRef, { notificationSent: true });
        });
        
        await batch.commit();
        
        showNotification('All notifications cleared', 'success');
        
        // Refresh
        await checkNotifications();
        const dropdown = document.getElementById('notificationDropdown');
        if (dropdown) {
            displayNotifications(dropdown);
        }
        
    } catch (error) {
        console.error('Error clearing notifications:', error);
        showNotification('Error clearing notifications', 'error');
    }
}

// Show event preview modal
function showEventPreviewModal(date, events) {
    const modal = document.getElementById('eventPreviewModal');
    const previewDate = document.getElementById('previewDate');
    const eventPreviewList = document.getElementById('eventPreviewList');
    
    if (!modal || !previewDate || !eventPreviewList) return;
    
    // Format date for display
    const dateObj = new Date(date + 'T00:00:00');
    const formattedDate = dateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    previewDate.textContent = formattedDate;
    previewDate.dataset.date = date;
    
    // Clear previous events
    eventPreviewList.innerHTML = '';
    
    // Sort events by time
    events.sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
    
    // Create event cards
    events.forEach(event => {
        const eventCard = createPreviewEventCard(event);
        eventPreviewList.appendChild(eventCard);
    });
    
    // Show modal
    modal.style.display = 'flex';
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
}

// Hide event preview modal
function hideEventPreviewModal() {
    const modal = document.getElementById('eventPreviewModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
}

// Create preview event card
function createPreviewEventCard(event) {
    const card = document.createElement('div');
    card.className = `preview-event-card ${event.type}`;
    
    // Format time
    const eventTime = event.time ? 
        new Date('1970-01-01T' + event.time).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
        }) : 'All day';
    
    // Check if user can delete this event
    const showDeleteButton = canDeleteEvent(event);
    
    // Check if user is leader for calendar actions
    const isUserLeader = isLeader();
    
    // Check calendar sync status
    const hasCalendarEvent = !!event.googleCalendarEventId;
    const hasDiscrepancy = event.calendarSyncStatus?.hasDiscrepancy || false;
    
    card.innerHTML = `
        <div class="preview-event-header">
            <div>
                <h3 class="preview-event-title">${event.title}</h3>
                <span class="event-type-label ${event.type}">${getEventTypeLabel(event.type)}</span>
                <div class="preview-event-time">
                    <span class="material-icons">schedule</span>
                    <span>${eventTime}</span>
                </div>
                ${event.location ? `
                    <div class="preview-event-location">
                        <span class="material-icons">location_on</span>
                        <span>${event.location}</span>
                    </div>
                ` : ''}
                ${hasCalendarEvent ? `
                    <div class="calendar-sync-status ${hasDiscrepancy ? 'has-discrepancy' : 'synced'}">
                        <span class="material-icons">${hasDiscrepancy ? 'sync_problem' : 'event_available'}</span>
                        <span>${hasDiscrepancy ? 'Sync needed' : 'Calendar synced'}</span>
                    </div>
                ` : ''}
            </div>
            <div class="preview-event-actions">
                ${showDeleteButton ? `
                    <button class="delete-event-btn" onclick="event.stopPropagation(); deleteEvent('${event.id}')">
                        <span class="material-icons">delete</span>
                    </button>
                ` : ''}
            </div>
        </div>
        ${event.description ? `<p class="preview-event-description">${event.description}</p>` : ''}
        ${hasDiscrepancy && event.calendarSyncStatus?.discrepancyDetails ? `
            <div class="discrepancy-details">
                <p class="discrepancy-title">Sync Issues:</p>
                <ul>
                    ${event.calendarSyncStatus.discrepancyDetails.map(d => `<li>${d}</li>`).join('')}
                </ul>
            </div>
        ` : ''}
        ${isUserLeader ? `
            <div class="calendar-actions-bottom">
                ${!hasCalendarEvent ? `
                    <button class="calendar-action-btn create" onclick="event.stopPropagation(); createCalendarEvent('${event.id}')">
                        <span class="material-icons">event</span>
                        <span>Create Calendar Event</span>
                    </button>
                ` : `
                    <div class="calendar-action-buttons">
                        <button class="calendar-action-btn check-updates" onclick="event.stopPropagation(); checkCalendarUpdates('${event.id}')">
                            <span class="material-icons">sync_alt</span>
                            <span>Check for Updates</span>
                        </button>
                        <button class="calendar-action-btn sync ${!hasDiscrepancy ? 'synced' : ''}" onclick="event.stopPropagation(); syncCalendarEvent('${event.id}')">
                            <span class="material-icons">sync</span>
                            <span>Sync to Calendar</span>
                        </button>
                        ${event.calendarLink ? `
                            <a href="${event.calendarLink}" target="_blank" class="calendar-action-btn view" onclick="event.stopPropagation();">
                                <span class="material-icons">open_in_new</span>
                                <span>View in Calendar</span>
                            </a>
                        ` : ''}
                    </div>
                `}
            </div>
        ` : ''}
    `;
    
    // Add click handler to edit event
    card.addEventListener('click', (e) => {
        // Don't trigger edit if clicking on buttons or links
        if (!e.target.closest('.delete-event-btn') && 
            !e.target.closest('.calendar-btn') && 
            !e.target.closest('a')) {
            hideEventPreviewModal();
            showEventModal(null, event);
        }
    });
    
    return card;
}

// Handle attendee template change
async function handleAttendeeTemplateChange(e) {
    const template = e.target.value;
    const attendeePreview = document.getElementById('attendeePreview');
    const attendeesList = document.getElementById('attendeesList');
    
    if (!template) {
        attendeePreview.style.display = 'none';
        attendeesList.style.display = 'none';
        selectedAttendees = [];
        return;
    }
    
    // Show preview
    attendeePreview.style.display = 'block';
    
    // Filter users based on template
    let filteredUsers = [];
    
    switch(template) {
        case 'everyone':
            filteredUsers = availableUsers;
            break;
        case 'men':
            filteredUsers = await getUsersByGender('male');
            break;
        case 'women':
            filteredUsers = await getUsersByGender('female');
            break;
        case 'custom':
            filteredUsers = availableUsers;
            break;
    }
    
    // Update attendee count
    const attendeeCount = attendeePreview.querySelector('.attendee-count');
    attendeeCount.textContent = `${filteredUsers.length} attendees selected`;
    
    // Store selected attendees
    selectedAttendees = filteredUsers.map(user => user.uid);
    
    // Populate attendees list
    populateAttendeesList(filteredUsers, template);
}

// Get users by gender
async function getUsersByGender(gender) {
    try {
        const usersSnapshot = await db.collection('users')
            .where('gender', '==', gender)
            .get();
        
        const users = [];
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            users.push({
                uid: doc.id,
                displayName: userData.displayName || 'Unknown User',
                email: userData.email,
                gender: userData.gender,
                photoURL: userData.photoURL
            });
        });
        
        return users;
    } catch (error) {
        console.error('Error getting users by gender:', error);
        return [];
    }
}

// Populate attendees list
function populateAttendeesList(users, template) {
    const attendeesList = document.getElementById('attendeesList');
    attendeesList.innerHTML = '';
    
    // Add header
    const header = document.createElement('h4');
    header.textContent = 'Attendees';
    attendeesList.appendChild(header);
    
    // Create checkbox list
    const checkboxList = document.createElement('div');
    checkboxList.className = 'attendee-checkboxes';
    
    users.forEach(user => {
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'attendee-checkbox';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `attendee-${user.uid}`;
        checkbox.value = user.uid;
        checkbox.checked = selectedAttendees.includes(user.uid);
        
        // All checkboxes are always editable
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                if (!selectedAttendees.includes(user.uid)) {
                    selectedAttendees.push(user.uid);
                }
            } else {
                selectedAttendees = selectedAttendees.filter(id => id !== user.uid);
            }
            updateAttendeeCount();
        });
        
        const label = document.createElement('label');
        label.htmlFor = `attendee-${user.uid}`;
        label.textContent = user.displayName;
        
        checkboxDiv.appendChild(checkbox);
        checkboxDiv.appendChild(label);
        checkboxList.appendChild(checkboxDiv);
    });
    
    attendeesList.appendChild(checkboxList);
}

// Populate attendees list for edit mode - preserves original selection
function populateAttendeesListForEdit(allUsers, originalAttendees) {
    const attendeesList = document.getElementById('attendeesList');
    attendeesList.innerHTML = '';
    
    // Add header
    const header = document.createElement('h4');
    header.textContent = 'Attendees';
    attendeesList.appendChild(header);
    
    // Create checkbox list
    const checkboxList = document.createElement('div');
    checkboxList.className = 'attendee-checkboxes';
    
    allUsers.forEach(user => {
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'attendee-checkbox';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `attendee-${user.uid}`;
        checkbox.value = user.uid;
        // Check only if user was in the original attendees
        checkbox.checked = originalAttendees.includes(user.uid);
        
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                if (!selectedAttendees.includes(user.uid)) {
                    selectedAttendees.push(user.uid);
                }
            } else {
                selectedAttendees = selectedAttendees.filter(id => id !== user.uid);
            }
            updateAttendeeCount();
        });
        
        const label = document.createElement('label');
        label.htmlFor = `attendee-${user.uid}`;
        label.textContent = user.displayName;
        
        checkboxDiv.appendChild(checkbox);
        checkboxDiv.appendChild(label);
        checkboxList.appendChild(checkboxDiv);
    });
    
    attendeesList.appendChild(checkboxList);
}

// Toggle attendees view
function toggleAttendeesView() {
    const attendeesList = document.getElementById('attendeesList');
    if (attendeesList.style.display === 'none' || !attendeesList.style.display) {
        // If the list hasn't been populated yet, populate it with all users
        if (!attendeesList.innerHTML || attendeesList.innerHTML.trim() === '') {
            populateAttendeesList(availableUsers, 'custom');
        }
        attendeesList.style.display = 'block';
    } else {
        attendeesList.style.display = 'none';
    }
}

// Update attendee count
function updateAttendeeCount() {
    const attendeePreview = document.getElementById('attendeePreview');
    const attendeeCount = attendeePreview.querySelector('.attendee-count');
    attendeeCount.textContent = `${selectedAttendees.length} attendees selected`;
}

// Handle event type change to auto-select attendees
async function handleEventTypeChange(e) {
    const eventType = e.target.value;
    
    if (!eventType) {
        selectedAttendees = [];
        updateAttendeeCount();
        return;
    }
    
    // Map event types to attendee templates
    const templateMap = {
        'bible-study': 'everyone',
        'mens-fellowship': 'men',
        'womens-fellowship': 'women',
        'sunday-service': 'everyone',
        'community': 'everyone'
    };
    
    const template = templateMap[eventType] || 'everyone';
    
    // Determine which users should be selected by default based on template
    let defaultSelectedUsers = [];
    
    switch(template) {
        case 'everyone':
            defaultSelectedUsers = availableUsers;
            break;
        case 'men':
            defaultSelectedUsers = await getUsersByGender('male');
            break;
        case 'women':
            defaultSelectedUsers = await getUsersByGender('female');
            break;
    }
    
    // Always include leaders regardless of template
    const leaders = await getLeaders();
    const leaderUids = leaders.map(user => user.uid);
    
    // Merge default selected users with leaders
    const mergedUids = [...new Set([...defaultSelectedUsers.map(u => u.uid), ...leaderUids])];
    selectedAttendees = mergedUids;
    
    // Update attendee count
    updateAttendeeCount();
    
    // Always populate with ALL users, but check the merged selection
    populateAttendeesList(availableUsers, template);
}

// Get all leaders
async function getLeaders() {
    try {
        const leadersSnapshot = await db.collection('users')
            .where('role', 'in', ['leader', 'admin'])
            .get();
        
        const leaders = [];
        leadersSnapshot.forEach(doc => {
            const userData = doc.data();
            leaders.push({
                uid: doc.id,
                displayName: userData.displayName || 'Unknown User',
                email: userData.email,
                gender: userData.gender,
                photoURL: userData.photoURL
            });
        });
        
        return leaders;
    } catch (error) {
        console.error('Error getting leaders:', error);
        return [];
    }
}

// Expose functions to global scope
window.confirmTask = confirmTask;
window.clearAllNotifications = clearAllNotifications;
window.showEventPreviewModal = showEventPreviewModal;

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
    return new Promise((resolve) => {
        if (typeof initCalendar === 'function') {
            initCalendar();
            // Give calendar time to initialize
            setTimeout(resolve, 100);
        } else {
            resolve();
        }
    });
}

// Load tasks (stub - implemented in tasks.js)
function loadTasks() {
    return new Promise((resolve) => {
        if (typeof loadUserTasks === 'function') {
            loadUserTasks();
            // Give tasks time to load
            setTimeout(resolve, 100);
        } else {
            resolve();
        }
    });
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
        'sunday-service': 'Sunday Service Hosting',
        'community': 'Community Event'
    };
    return labels[type] || type;
}

// Check if current user is a leader
function isLeader() {
    return currentUser && currentUser.role === 'leader';
}

// Check if user can delete an event
function canDeleteEvent(event) {
    // User can delete if they created it OR if they're a leader
    return (currentUser && currentUser.uid === event.createdBy) || isLeader();
}

// Check if user can edit an event
function canEditEvent(event) {
    if (!currentUser || !event) return false;
    
    // Check if user is the creator
    if (currentUser.uid === event.createdBy) return true;
    
    // Check if user is a leader
    if (isLeader()) return true;
    
    // Check if user has a task assigned in this event
    if (event.tasks && event.tasks.length > 0) {
        return event.tasks.some(task => task.assignedTo === currentUser.uid);
    }
    
    return false;
}

// Delete event
async function deleteEvent(eventId) {
    try {
        // Get event data to check for calendar event and permissions
        const eventDoc = await db.collection('events').doc(eventId).get();
        if (!eventDoc.exists) {
            showNotification('Event not found', 'error');
            return;
        }
        
        const eventData = eventDoc.data();
        
        // Double-check permissions
        if (!canDeleteEvent(eventData)) {
            showNotification('You do not have permission to delete this event', 'error');
            return;
        }
        
        // Build confirmation message based on who's deleting
        let confirmMessage = '';
        let deleteCalendar = false;
        
        if (currentUser.uid === eventData.createdBy) {
            // User is the creator
            confirmMessage = 'Are you sure you want to delete your event';
        } else {
            // User is a leader deleting someone else's event
            const creatorDoc = await db.collection('users').doc(eventData.createdBy).get();
            const creatorName = creatorDoc.exists ? creatorDoc.data().displayName : 'Unknown User';
            confirmMessage = `Are you sure you want to delete this event created by ${creatorName}`;
        }
        
        // Check if event has Google Calendar event
        if (eventData.googleCalendarEventId) {
            confirmMessage += ' and cancel the calendar event for all attendees?';
            confirmMessage += '\n\nThis will send cancellation emails to all attendees.';
            deleteCalendar = confirm(confirmMessage);
            if (!deleteCalendar && !confirm('Delete the event from the app only (keep calendar event)?')) {
                return;
            }
        } else {
            confirmMessage += '?';
            if (!confirm(confirmMessage)) {
                return;
            }
        }
        
        // Delete calendar event first if requested
        if (deleteCalendar && eventData.googleCalendarEventId) {
            // Request Google Calendar authorization if not already authorized
            if (!window.googleCalendarAuth || !window.googleCalendarAuth.isAuthorized()) {
                showNotification('Please authorize Google Calendar access to delete the event', 'info');
                window.googleCalendarAuth.requestAuth(() => deleteEvent(eventId));
                return;
            }
            
            try {
                showNotification('Deleting calendar event...', 'info');
                
                // Get the OAuth token
                const token = window.googleCalendarAuth.getToken();
                
                // Call the new cloud function that uses user's OAuth token
                const deleteCalendarEventFn = firebase.functions().httpsCallable('deleteCalendarEventWithUserAuth');
                const result = await deleteCalendarEventFn({ eventId, token });
                
                if (result.data.success) {
                    showNotification('Calendar event cancelled and notifications sent to all attendees', 'success');
                } else {
                    // Ask if they still want to delete the app event
                    if (!confirm('Failed to delete calendar event. Delete the event from the app anyway?')) {
                        return;
                    }
                }
            } catch (error) {
                console.error('Error deleting calendar event:', error);
                
                // Handle auth errors specifically
                if (error.message?.includes('re-authorize')) {
                    showNotification('Please re-authorize Google Calendar access', 'error');
                    window.googleCalendarAuth.requestAuth(() => deleteEvent(eventId));
                    return;
                }
                
                // Ask if they still want to delete the app event
                if (!confirm('Error deleting calendar event. Delete the event from the app anyway?')) {
                    return;
                }
            }
        }
        
        // Start a batch operation for Firestore deletion
        const batch = db.batch();
        
        // Delete the event
        const eventRef = db.collection('events').doc(eventId);
        batch.delete(eventRef);
        
        // Delete all associated tasks
        const tasksSnapshot = await db.collection('tasks')
            .where('eventId', '==', eventId)
            .get();
        
        tasksSnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        // Commit the batch
        await batch.commit();
        
        showNotification('Event deleted successfully', 'success');
        
        // Refresh the calendar and close the preview modal
        hideEventPreviewModal();
        loadCalendar();
        loadUpcomingEvents();
        loadTasks(); // Also refresh tasks
        
    } catch (error) {
        console.error('Error deleting event:', error);
        showNotification('Error deleting event', 'error');
    }
}

// Create calendar event
async function createCalendarEvent(eventId) {
    // Request Google Calendar authorization if not already authorized
    if (!window.googleCalendarAuth || !window.googleCalendarAuth.isAuthorized()) {
        window.googleCalendarAuth.requestAuth(() => createCalendarEvent(eventId));
        return;
    }
    
    // Confirm creation
    if (!confirm('Create a Google Calendar event in your personal calendar? Invitations will be sent to all attendees.')) {
        return;
    }
    
    try {
        showNotification('Creating calendar event...', 'info');
        
        // Get the OAuth token
        const token = window.googleCalendarAuth.getToken();
        
        // Call the new cloud function that uses user's OAuth token
        const createCalendarEventFn = firebase.functions().httpsCallable('createCalendarEventWithUserAuth');
        const result = await createCalendarEventFn({ eventId, token });
        
        if (result.data.success) {
            showNotification('Calendar event created successfully in your calendar!', 'success');
            
            // Update the event in Firestore with calendar info
            await db.collection('events').doc(eventId).update({
                googleCalendarEventId: result.data.calendarEventId,
                calendarLink: result.data.calendarLink,
                lastCalendarSync: firebase.firestore.FieldValue.serverTimestamp(),
                calendarCreatedBy: currentUser.uid
            });
            
            // Open calendar link in new tab
            if (result.data.calendarLink) {
                window.open(result.data.calendarLink, '_blank');
            }
            
            // Refresh the event list to show updated status
            loadCalendar();
            loadUpcomingEvents();
            
            // Refresh the preview modal if it's open
            const eventPreviewModal = document.getElementById('eventPreviewModal');
            if (eventPreviewModal && eventPreviewModal.style.display !== 'none') {
                const date = document.getElementById('previewDate').dataset.date;
                const eventsSnapshot = await db.collection('events')
                    .where('date', '==', date)
                    .get();
                
                const events = [];
                eventsSnapshot.forEach(doc => {
                    events.push({ id: doc.id, ...doc.data() });
                });
                
                showEventPreviewModal(date, events);
            }
        } else {
            showNotification('Failed to create calendar event', 'error');
        }
    } catch (error) {
        console.error('Error creating calendar event:', error);
        showNotification(error.message || 'Error creating calendar event', 'error');
    }
}

// Sync calendar event
async function syncCalendarEvent(eventId) {
    // Request Google Calendar authorization if not already authorized
    if (!window.googleCalendarAuth || !window.googleCalendarAuth.isAuthorized()) {
        window.googleCalendarAuth.requestAuth(() => syncCalendarEvent(eventId));
        return;
    }
    
    try {
        // Get event data to show what will be synced
        const eventDoc = await db.collection('events').doc(eventId).get();
        const eventData = eventDoc.data();
        
        // Leaders can sync any event
        // (removed check that restricted sync to only the calendar creator)
        
        // Build sync confirmation message
        let message = 'The following information will be synced to your Google Calendar:\n\n';
        message += `Title: ${eventData.title}\n`;
        message += `Date: ${new Date(eventData.date).toLocaleDateString()}\n`;
        message += `Time: ${eventData.time || 'Not set'}\n`;
        message += `Location: ${eventData.location || 'Not set'}\n`;
        
        if (eventData.calendarSyncStatus?.discrepancyDetails && eventData.calendarSyncStatus.discrepancyDetails.length > 0) {
            message += '\nChanges detected:\n';
            eventData.calendarSyncStatus.discrepancyDetails.forEach(detail => {
                message += `• ${detail}\n`;
            });
        }
        
        message += '\nAttendees will receive email notifications about the update.';
        
        // Confirm sync
        if (!confirm(message)) {
            return;
        }
        
        showNotification('Syncing calendar event...', 'info');
        
        // Get the OAuth token
        const token = window.googleCalendarAuth.getToken();
        
        // Call the new cloud function that uses user's OAuth token
        const syncCalendarEventFn = firebase.functions().httpsCallable('syncCalendarEventWithUserAuth');
        const result = await syncCalendarEventFn({ eventId, token });
        
        if (result.data.success) {
            showNotification('Calendar event synced successfully!', 'success');
            
            // Update sync status
            await db.collection('events').doc(eventId).update({
                lastCalendarSync: firebase.firestore.FieldValue.serverTimestamp(),
                'calendarSyncStatus.hasDiscrepancy': false,
                'calendarSyncStatus.discrepancyDetails': [],
                'calendarSyncStatus.lastChecked': firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Refresh the event list to show updated status
            loadCalendar();
            loadUpcomingEvents();
            
            // Refresh the preview modal if it's open
            const eventPreviewModal = document.getElementById('eventPreviewModal');
            if (eventPreviewModal && eventPreviewModal.style.display !== 'none') {
                const date = document.getElementById('previewDate').dataset.date;
                const eventsSnapshot = await db.collection('events')
                    .where('date', '==', date)
                    .get();
                
                const events = [];
                eventsSnapshot.forEach(doc => {
                    events.push({ id: doc.id, ...doc.data() });
                });
                
                showEventPreviewModal(date, events);
            }
        } else {
            showNotification('Failed to sync calendar event', 'error');
        }
    } catch (error) {
        console.error('Error syncing calendar event:', error);
        showNotification(error.message || 'Error syncing calendar event', 'error');
    }
}

// Show calendar invite modal
function showCalendarInviteModal() {
    const modal = document.getElementById('calendarInviteModal');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
    }
}

// Hide calendar invite modal
function hideCalendarInviteModal() {
    const modal = document.getElementById('calendarInviteModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
}

// Handle send calendar now
async function handleSendCalendarNow() {
    hideCalendarInviteModal();
    
    if (window.lastCreatedEventId) {
        // Trigger calendar creation with the last created event
        await createCalendarEvent(window.lastCreatedEventId);
        window.lastCreatedEventId = null;
    }
}

// Handle send calendar later
function handleSendCalendarLater() {
    hideCalendarInviteModal();
    showNotification('You can create a calendar event later from the calendar view', 'info');
    window.lastCreatedEventId = null;
}

// Check for calendar updates
async function checkCalendarUpdates(eventId) {
    // Request Google Calendar authorization if not already authorized
    if (!window.googleCalendarAuth || !window.googleCalendarAuth.isAuthorized()) {
        window.googleCalendarAuth.requestAuth(() => checkCalendarUpdates(eventId));
        return;
    }
    
    try {
        showNotification('Checking for calendar updates...', 'info');
        
        // Get event data
        const eventDoc = await db.collection('events').doc(eventId).get();
        const eventData = eventDoc.data();
        
        if (!eventData.googleCalendarEventId) {
            showNotification('No calendar event associated with this event', 'error');
            return;
        }
        
        // Get the OAuth token
        const token = window.googleCalendarAuth.getToken();
        
        // Create a temporary cloud function call to check for updates
        // For now, we'll just mark that we need to check manually
        showNotification('Please review the calendar event and use the Sync button if changes are needed', 'info');
        
        // Mark event as needing review
        await db.collection('events').doc(eventId).update({
            'calendarSyncStatus.hasDiscrepancy': true,
            'calendarSyncStatus.discrepancyDetails': ['Manual review requested - check Google Calendar for changes'],
            'calendarSyncStatus.lastChecked': firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Refresh the display
        loadCalendar();
        loadUpcomingEvents();
        
        // Refresh the preview modal if it's open
        const eventPreviewModal = document.getElementById('eventPreviewModal');
        if (eventPreviewModal && eventPreviewModal.style.display !== 'none') {
            const date = document.getElementById('previewDate').dataset.date;
            const eventsSnapshot = await db.collection('events')
                .where('date', '==', date)
                .get();
            
            const events = [];
            eventsSnapshot.forEach(doc => {
                events.push({ id: doc.id, ...doc.data() });
            });
            
            showEventPreviewModal(date, events);
        }
        
    } catch (error) {
        console.error('Error checking calendar updates:', error);
        showNotification('Error checking for updates', 'error');
    }
}

// Expose functions to global scope for other modules
window.showNotification = showNotification;
window.showEventModal = showEventModal;
window.isLeader = isLeader;
window.canDeleteEvent = canDeleteEvent;
window.canEditEvent = canEditEvent;
window.deleteEvent = deleteEvent;
window.createCalendarEvent = createCalendarEvent;
window.syncCalendarEvent = syncCalendarEvent;
window.checkCalendarUpdates = checkCalendarUpdates;

// Handle URL hash navigation
async function handleUrlHash() {
    const hash = window.location.hash;
    if (!hash) return;
    
    // Parse hash format: #action-id
    const match = hash.match(/^#(event|task|edit|confirm-task)-(.+)$/);
    if (!match) return;
    
    const [, action, id] = match;
    
    // Give UI time to fully render
    setTimeout(async () => {
        try {
            switch (action) {
                case 'event':
                case 'edit':
                    // Load and open event in preview modal
                    const eventDoc = await db.collection('events').doc(id).get();
                    if (eventDoc.exists) {
                        const eventData = { id: eventDoc.id, ...eventDoc.data() };
                        
                        // Get the date for the preview modal
                        const date = eventData.date;
                        
                        // Load all events for that date
                        const eventsSnapshot = await db.collection('events')
                            .where('date', '==', date)
                            .get();
                        
                        const events = [];
                        eventsSnapshot.forEach(doc => {
                            events.push({ id: doc.id, ...doc.data() });
                        });
                        
                        // Show the preview modal
                        showEventPreviewModal(date, events);
                        
                        // If edit mode, also open the edit modal
                        if (action === 'edit' && canEditEvent(eventData)) {
                            setTimeout(() => {
                                showEventModal(null, eventData);
                            }, 500);
                        }
                    } else {
                        showNotification('Event not found', 'error');
                    }
                    break;
                    
                case 'task':
                case 'confirm-task':
                    // Find and highlight task
                    const taskElement = document.querySelector(`[data-task-id="${id}"]`);
                    if (taskElement) {
                        // Scroll to task
                        taskElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        
                        // Add highlight animation
                        taskElement.classList.add('highlight-pulse');
                        
                        // Remove highlight after animation
                        setTimeout(() => {
                            taskElement.classList.remove('highlight-pulse');
                        }, 3000);
                        
                        // If confirm-task, highlight the confirm button
                        if (action === 'confirm-task') {
                            const confirmBtn = taskElement.querySelector('.confirm-task-btn');
                            if (confirmBtn) {
                                confirmBtn.classList.add('pulse-button');
                                setTimeout(() => {
                                    confirmBtn.classList.remove('pulse-button');
                                }, 3000);
                            }
                        }
                    } else {
                        // Task might not be loaded yet, try loading it
                        const taskDoc = await db.collection('tasks').doc(id).get();
                        if (taskDoc.exists) {
                            showNotification('Task found. Please check your tasks list.', 'info');
                            // Reload tasks to ensure it's visible
                            await loadTasks();
                            
                            // Try again after reload
                            setTimeout(() => {
                                const reloadedTaskElement = document.querySelector(`[data-task-id="${id}"]`);
                                if (reloadedTaskElement) {
                                    reloadedTaskElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    reloadedTaskElement.classList.add('highlight-pulse');
                                }
                            }, 500);
                        } else {
                            showNotification('Task not found', 'error');
                        }
                    }
                    break;
            }
            
            // Clear the hash after handling
            window.history.pushState(null, '', window.location.pathname);
        } catch (error) {
            console.error('Error handling URL hash:', error);
            showNotification('Error navigating to content', 'error');
        }
    }, 500);
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    initializeFirebase();
    
    // Initialize Google Calendar authentication
    if (window.googleCalendarAuth) {
        window.googleCalendarAuth.initialize();
    }
});
