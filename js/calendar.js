// Calendar JavaScript

let currentMonth = new Date();
let calendarEvents = [];

// Get global variables from app.js
let db = window.db || null;
let currentUser = window.currentUser || null;

// Initialize calendar
function initCalendar() {
    // Update references to global variables
    db = window.db || null;
    currentUser = window.currentUser || null;
    renderCalendar();
    loadCalendarEvents();
    setupCalendarEventListeners();
}

// Setup calendar event listeners
function setupCalendarEventListeners() {
    const prevMonthBtn = document.getElementById('prevMonth');
    const nextMonthBtn = document.getElementById('nextMonth');
    
    if (prevMonthBtn) {
        prevMonthBtn.addEventListener('click', () => {
            currentMonth.setMonth(currentMonth.getMonth() - 1);
            renderCalendar();
            loadCalendarEvents();
        });
    }
    
    if (nextMonthBtn) {
        nextMonthBtn.addEventListener('click', () => {
            currentMonth.setMonth(currentMonth.getMonth() + 1);
            renderCalendar();
            loadCalendarEvents();
        });
    }
}

// Render calendar
function renderCalendar() {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    // Update month display
    const monthDisplay = document.getElementById('currentMonth');
    if (monthDisplay) {
        monthDisplay.textContent = currentMonth.toLocaleDateString('en-US', { 
            month: 'long', 
            year: 'numeric' 
        });
    }
    
    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    // Get calendar grid
    const calendarGrid = document.getElementById('calendarGrid');
    if (!calendarGrid) return;
    
    calendarGrid.innerHTML = '';
    
    // Today's date for comparison
    const today = new Date();
    const todayStr = formatDateString(today);
    
    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        const date = new Date(year, month - 1, day);
        const dayElement = createCalendarDay(date, true);
        calendarGrid.appendChild(dayElement);
    }
    
    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dayElement = createCalendarDay(date, false);
        
        // Mark today
        if (formatDateString(date) === todayStr) {
            dayElement.classList.add('today');
        }
        
        calendarGrid.appendChild(dayElement);
    }
    
    // Next month days to fill the grid
    const totalCells = calendarGrid.children.length;
    const remainingCells = 42 - totalCells; // 6 weeks * 7 days
    
    for (let day = 1; day <= remainingCells; day++) {
        const date = new Date(year, month + 1, day);
        const dayElement = createCalendarDay(date, true);
        calendarGrid.appendChild(dayElement);
    }
}

// Create calendar day element
function createCalendarDay(date, isOtherMonth) {
    const dayElement = document.createElement('div');
    dayElement.className = 'calendar-day';
    if (isOtherMonth) {
        dayElement.classList.add('other-month');
    }
    
    const dayNumber = document.createElement('div');
    dayNumber.className = 'calendar-day-number';
    dayNumber.textContent = date.getDate();
    dayElement.appendChild(dayNumber);
    
    const eventsContainer = document.createElement('div');
    eventsContainer.className = 'calendar-day-events';
    dayElement.appendChild(eventsContainer);
    
    // Store date for click handler
    dayElement.dataset.date = formatDateString(date);
    
    // Add click handler
    dayElement.addEventListener('click', () => {
        if (!isOtherMonth) {
            showEventModal(formatDateString(date));
        }
    });
    
    return dayElement;
}

// Load calendar events
async function loadCalendarEvents() {
    // Get current db reference
    db = window.db || null;
    if (!db) {
        console.warn('Database not initialized yet');
        return;
    }
    
    try {
        const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
        
        const startStr = formatDateString(startOfMonth);
        const endStr = formatDateString(endOfMonth);
        
        const eventsSnapshot = await db.collection('events')
            .where('date', '>=', startStr)
            .where('date', '<=', endStr)
            .get();
        
        calendarEvents = [];
        eventsSnapshot.forEach(doc => {
            calendarEvents.push({ id: doc.id, ...doc.data() });
        });
        
        // Update calendar with events
        updateCalendarEvents();
        
    } catch (error) {
        console.error('Error loading calendar events:', error);
    }
}

// Update calendar with events
function updateCalendarEvents() {
    // Clear all event dots
    document.querySelectorAll('.calendar-day-events').forEach(container => {
        container.innerHTML = '';
    });
    
    // Group events by date
    const eventsByDate = {};
    calendarEvents.forEach(event => {
        if (!eventsByDate[event.date]) {
            eventsByDate[event.date] = [];
        }
        eventsByDate[event.date].push(event);
    });
    
    // Add event dots to calendar days
    Object.entries(eventsByDate).forEach(([date, events]) => {
        const dayElement = document.querySelector(`[data-date="${date}"]`);
        if (dayElement) {
            const eventsContainer = dayElement.querySelector('.calendar-day-events');
            
            // Show up to 3 event dots
            events.slice(0, 3).forEach(event => {
                const dot = document.createElement('div');
                dot.className = `event-dot ${event.type}`;
                dot.title = event.title;
                eventsContainer.appendChild(dot);
            });
            
            // If more than 3 events, show a "+X" indicator
            if (events.length > 3) {
                const more = document.createElement('div');
                more.className = 'event-more';
                more.textContent = `+${events.length - 3}`;
                more.style.fontSize = '0.7rem';
                more.style.color = 'var(--text-secondary)';
                eventsContainer.appendChild(more);
            }
        }
    });
}

// Format date string for consistency
function formatDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Expose initCalendar to global scope
window.initCalendar = initCalendar;
