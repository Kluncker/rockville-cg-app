// Tasks JavaScript

// Get global variables from app.js
let db = window.db || null;
let currentUser = window.currentUser || null;

// Load user tasks
async function loadUserTasks() {
    // Update references to global variables
    db = window.db || null;
    currentUser = window.currentUser || null;
    
    if (!currentUser || !db) {
        console.warn('Database or current user not initialized yet');
        return;
    }
    
    const tasksList = document.getElementById('tasksList');
    if (!tasksList) return;
    
    try {
        // First, get current user's family ID
        let familyMemberIds = [currentUser.uid];
        
        const currentUserDoc = await db.collection('users').doc(currentUser.uid).get();
        if (currentUserDoc.exists) {
            const userData = currentUserDoc.data();
            
            // If user has a family, get all family members
            if (userData.familyId) {
                const familyMembersSnapshot = await db.collection('users')
                    .where('familyId', '==', userData.familyId)
                    .get();
                
                familyMemberIds = [];
                familyMembersSnapshot.forEach(doc => {
                    familyMemberIds.push(doc.id);
                });
            }
        }
        
        // Query tasks for all family members
        const tasksSnapshot = await db.collection('tasks')
            .where('assignedTo', 'in', familyMemberIds)
            .orderBy('eventDate', 'asc')
            .get();
        
        tasksList.innerHTML = '';
        
        if (tasksSnapshot.empty) {
            tasksList.innerHTML = `
                <div class="no-tasks">
                    <span class="material-icons" style="font-size: 3rem; color: var(--text-secondary); opacity: 0.5;">task_alt</span>
                    <p style="color: var(--text-secondary); margin-top: 1rem;">No tasks assigned to you or your family</p>
                </div>
            `;
            return;
        }
        
        // Create task cards
        tasksSnapshot.forEach(doc => {
            const task = { id: doc.id, ...doc.data() };
            const taskCard = createTaskCard(task);
            tasksList.appendChild(taskCard);
        });
        
    } catch (error) {
        console.error('Error loading tasks:', error);
        tasksList.innerHTML = '<p class="error">Error loading tasks</p>';
    }
}

// Create task card
function createTaskCard(task) {
    const card = document.createElement('div');
    card.className = 'task-card fade-in';
    card.dataset.status = task.status || 'pending';
    card.dataset.taskId = task.id; // Add task ID for URL navigation
    
    // Check if this is a family member's task
    const isOwnTask = task.assignedTo === currentUser.uid;
    const assigneeName = isOwnTask ? 'Your task' : `${task.assignedUserName}'s task`;
    
    // Format date
    const taskDate = new Date(task.eventDate);
    const isOverdue = taskDate < new Date() && task.status === 'pending';
    const daysUntil = Math.ceil((taskDate - new Date()) / (1000 * 60 * 60 * 24));
    
    card.innerHTML = `
        <div class="task-info">
            <h4>${task.title}</h4>
            <p class="task-assignee" style="font-size: 0.875rem; color: ${isOwnTask ? '#2196F3' : '#9C27B0'}; font-weight: 500;">${assigneeName}</p>
            <p class="task-event">${task.eventTitle || 'Event'}</p>
            <p class="task-date ${isOverdue ? 'overdue' : ''}">
                <span class="material-icons">event</span>
                ${taskDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                ${daysUntil >= 0 ? `(${daysUntil} days)` : '(Overdue)'}
            </p>
        </div>
        <div class="task-status">
            <span class="status-badge ${task.status || 'pending'}">${formatStatus(task.status)}</span>
            ${task.status === 'pending' ? `
                <div class="task-actions">
                    <button class="confirm-task-btn" onclick="confirmTask('${task.id}')">
                        <span class="material-icons">check_circle</span>
                        Confirm
                    </button>
                    <button class="decline-task-btn" onclick="declineTask('${task.id}')">
                        <span class="material-icons">cancel</span>
                        Decline
                    </button>
                </div>
            ` : ''}
        </div>
    `;
    
    // Add style for overdue
    if (isOverdue) {
        card.style.borderLeftColor = '#FF5252';
    } else if (!isOwnTask) {
        // Add different border color for family member tasks
        card.style.borderLeftColor = '#9C27B0';
    }
    
    return card;
}

// Format status
function formatStatus(status) {
    const statusLabels = {
        'pending': 'Pending',
        'confirmed': 'Confirmed',
        'completed': 'Completed',
        'declined': 'Declined'
    };
    return statusLabels[status] || status;
}

// Confirm task
async function confirmTask(taskId) {
    if (!confirm('Confirm that you will complete this task?')) return;
    
    // Get current references
    db = window.db || null;
    currentUser = window.currentUser || null;
    
    if (!db || !currentUser) {
        showNotification('Database not initialized', 'error');
        return;
    }
    
    try {
        await db.collection('tasks').doc(taskId).update({
            status: 'confirmed',
            confirmedAt: firebase.firestore.FieldValue.serverTimestamp(),
            confirmedBy: currentUser.uid
        });
        
        showNotification('Task confirmed successfully!', 'success');
        loadUserTasks(); // Reload tasks
        
        // Email notification is now handled automatically by Cloud Function trigger
        
    } catch (error) {
        console.error('Error confirming task:', error);
        showNotification('Error confirming task', 'error');
    }
}

// Decline task
async function declineTask(taskId) {
    if (!confirm('Are you sure you want to decline this task? This will notify the event coordinators.')) return;
    
    // Get current references
    db = window.db || null;
    currentUser = window.currentUser || null;
    
    if (!db || !currentUser) {
        showNotification('Database not initialized', 'error');
        return;
    }
    
    try {
        await db.collection('tasks').doc(taskId).update({
            status: 'declined',
            declinedAt: firebase.firestore.FieldValue.serverTimestamp(),
            declinedBy: currentUser.uid
        });
        
        showNotification('Task declined. The coordinators will be notified.', 'info');
        loadUserTasks(); // Reload tasks
        
        // Email notification is now handled automatically by Cloud Function trigger
        
    } catch (error) {
        console.error('Error declining task:', error);
        showNotification('Error declining task', 'error');
    }
}

// Add styles for task-specific elements
const taskStyles = document.createElement('style');
taskStyles.textContent = `
    .no-tasks {
        text-align: center;
        padding: 3rem;
    }
    
    .task-date {
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }
    
    .task-date.overdue {
        color: #FF5252;
        font-weight: 600;
    }
    
    .task-date .material-icons {
        font-size: 1rem;
    }
    
    .confirm-task-btn {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 8px;
        background: linear-gradient(135deg, #4CAF50, #45A049);
        color: white;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.3s ease;
        margin-top: 0.5rem;
    }
    
    .confirm-task-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
    }
    
    .confirm-task-btn .material-icons {
        font-size: 1.25rem;
    }
    
    .status-badge.completed {
        background: #E8F5E9;
        color: #2E7D32;
    }
    
    .status-badge.declined {
        background: #FFEBEE;
        color: #C62828;
    }
    
    .task-actions {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .decline-task-btn {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 8px;
        background: linear-gradient(135deg, #FF5252, #F44336);
        color: white;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.3s ease;
    }
    
    .decline-task-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(255, 82, 82, 0.3);
    }
    
    .decline-task-btn .material-icons {
        font-size: 1.25rem;
    }
    
    /* Task reminder notification */
    .task-reminder {
        position: fixed;
        top: 5rem;
        right: 2rem;
        background: white;
        border-radius: 12px;
        padding: 1.5rem;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        max-width: 350px;
        z-index: 1500;
        border-left: 4px solid #FF9800;
        animation: slideInRight 0.3s ease;
    }
    
    .task-reminder h4 {
        margin-bottom: 0.5rem;
        color: #FF6F00;
    }
    
    .task-reminder-actions {
        display: flex;
        gap: 0.75rem;
        margin-top: 1rem;
    }
    
    .task-reminder-actions button {
        padding: 0.5rem 1rem;
        border: none;
        border-radius: 6px;
        font-size: 0.875rem;
        cursor: pointer;
        transition: all 0.3s ease;
    }
    
    .task-reminder-actions .confirm {
        background: #4CAF50;
        color: white;
    }
    
    .task-reminder-actions .later {
        background: #F5F5F5;
        color: #666;
    }
`;

document.head.appendChild(taskStyles);

// Check for upcoming tasks and show reminders
async function checkTaskReminders() {
    // Get current references
    db = window.db || null;
    currentUser = window.currentUser || null;
    
    if (!currentUser || !db) return;
    
    try {
        // Get tasks due in the next 3 weeks
        const threeWeeksFromNow = new Date();
        threeWeeksFromNow.setDate(threeWeeksFromNow.getDate() + 21);
        
        const reminderTasks = await db.collection('tasks')
            .where('assignedTo', '==', currentUser.uid)
            .where('status', '==', 'pending')
            .where('eventDate', '<=', threeWeeksFromNow.toISOString().split('T')[0])
            .where('notificationSent', '==', false)
            .limit(1)
            .get();
        
        if (!reminderTasks.empty) {
            const task = { id: reminderTasks.docs[0].id, ...reminderTasks.docs[0].data() };
            showTaskReminder(task);
        }
        
    } catch (error) {
        console.error('Error checking task reminders:', error);
    }
}

// Show task reminder
function showTaskReminder(task) {
    const reminder = document.createElement('div');
    reminder.className = 'task-reminder';
    
    const taskDate = new Date(task.eventDate);
    const daysUntil = Math.ceil((taskDate - new Date()) / (1000 * 60 * 60 * 24));
    
    reminder.innerHTML = `
        <h4>Task Reminder</h4>
        <p><strong>${task.title}</strong></p>
        <p>For: ${task.eventTitle}</p>
        <p>Due in ${daysUntil} days (${taskDate.toLocaleDateString()})</p>
        <div class="task-reminder-actions">
            <button class="confirm" onclick="confirmTaskFromReminder('${task.id}')">Confirm</button>
            <button class="later" onclick="dismissReminder(this)">Remind Later</button>
        </div>
    `;
    
    document.body.appendChild(reminder);
    
    // Auto-dismiss after 10 seconds
    setTimeout(() => {
        if (reminder.parentElement) {
            reminder.remove();
        }
    }, 10000);
}

// Confirm task from reminder
async function confirmTaskFromReminder(taskId) {
    await confirmTask(taskId);
    document.querySelector('.task-reminder')?.remove();
}

// Dismiss reminder
function dismissReminder(button) {
    button.closest('.task-reminder').remove();
}

// Expose functions to global scope
window.loadUserTasks = loadUserTasks;
window.confirmTask = confirmTask;
window.declineTask = declineTask;
window.confirmTaskFromReminder = confirmTaskFromReminder;
window.dismissReminder = dismissReminder;

// Check for reminders periodically
setInterval(checkTaskReminders, 60000); // Check every minute
