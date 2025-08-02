# Rockville CG

A collaborative church activities planning app for organizing events, delegating responsibilities, and managing task assignments with automated email notifications.

## Features

- **Month View Calendar**: Visual calendar to see all church events at a glance
- **Event Management**: Create and manage different types of church events:
  - Bible Studies
  - Men's Fellowship
  - Women's Fellowship
  - Sunday Service
  - Community Events
- **Task Assignment**: Delegate responsibilities to members with confirmation tracking
- **Email Notifications**: Automated reminders sent 3 weeks in advance via SendGrid
- **Google Calendar Integration**: Sync events with Google Calendar (coming soon)
- **Beautiful UI**: Bright, welcoming design with glossy effects and smooth animations

## Technology Stack

- **Frontend**: HTML, CSS, JavaScript (Vanilla)
- **Backend**: Firebase (Authentication, Firestore, Hosting, Cloud Functions)
- **Email Service**: SendGrid
- **Hosting**: Firebase Hosting (rockville-cg-planning.web.app)

## Setup Instructions

### 1. Prerequisites

- Node.js (v18 or higher)
- Firebase CLI (`npm install -g firebase-tools`)
- SendGrid account and API key

### 2. Firebase Setup

1. The Firebase project is already configured with ID: `wz-rockville-cg-app`
2. Login to Firebase CLI:
   ```bash
   firebase login
   ```

### 3. SendGrid Configuration

1. Get your SendGrid API key from your SendGrid dashboard
2. Set the API key in Firebase Functions config:
   ```bash
   firebase functions:config:set sendgrid.key="YOUR_SENDGRID_API_KEY"
   ```
3. Update the `from` email address in `functions/index.js` with your verified sender email

### 4. Install Dependencies

Install Cloud Functions dependencies:
```bash
cd functions
npm install
cd ..
```

### 5. Deploy

Deploy everything to Firebase:
```bash
firebase deploy
```

Or deploy specific components:
```bash
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules
```

### 6. Initial Admin Setup

After first deployment:
1. Sign in with Google at https://rockville-cg-planning.web.app
2. In Firestore console, find your user document in the `users` collection
3. Add a field `role: "admin"` to give yourself admin privileges

## Development

### Fast Development with Vite (NEW!)

For instant hot module replacement and lightning-fast development:

1. Install dependencies (after installing Node.js):
   ```bash
   npm install
   ```

2. Start the Vite dev server:
   ```bash
   npm run dev
   ```

3. Your app will open at http://localhost:3000 with:
   - **Instant hot module replacement** - see changes without page refresh
   - **Lightning-fast cold starts** - dev server starts in milliseconds
   - **CSS hot reloading** - styles update without losing app state
   - **Better error messages** with clear stack traces

### Local Testing with Firebase Emulators

1. Start Firebase emulators:
   ```bash
   firebase emulators:start
   ```

2. For production-like testing without Vite:
   ```bash
   start index.html
   ```

### Project Structure

```
/
├── index.html          # Login/splash page
├── dashboard.html      # Main app dashboard
├── css/
│   ├── material.css    # Material design styles
│   ├── app.css        # Main app styles
│   ├── splash.css     # Splash page styles
│   └── animations.css # Animation definitions
├── js/
│   ├── splash.js      # Splash page logic
│   ├── app.js         # Main app logic
│   ├── calendar.js    # Calendar component
│   └── tasks.js       # Task management
├── functions/         # Cloud Functions
│   ├── index.js       # Email notification functions
│   └── package.json   # Dependencies
├── firebase.json      # Firebase configuration
├── firestore.rules    # Security rules
└── firestore.indexes.json # Database indexes
```

## Features in Detail

### Event Types
- **Bible Studies**: Light blue theme (#4FC3F7)
- **Men's Fellowship**: Cyan theme (#26C6DA)
- **Women's Fellowship**: Coral theme (#FF8A80)
- **Sunday Service**: Gold theme (#FFD54F)
- **Community Events**: Purple theme (#BA68C8)

### Task Management Flow
1. Event creators assign tasks to members
2. Members receive email notification 3 weeks before the event
3. Members confirm their availability through the app
4. Confirmation emails are sent to both the member and event creator
5. Tasks can be tracked with status: Pending, Confirmed, or Completed

### Email Notifications
- **3-Week Reminder**: Automated daily check for upcoming tasks
- **Task Confirmation**: Sent when a member confirms their task
- **Ad-hoc Reminders**: Event creators can send manual reminders

## Security

- Authentication required for all features
- Users can only modify their own data
- Admins have full access to all events and tasks
- Firestore security rules enforce proper access control

## Future Enhancements

- Google Calendar API integration
- Recurring events support
- Task templates for common responsibilities
- Mobile app version
- SMS notifications option
- Event attendance tracking

## Support

For issues or questions, please contact your church IT administrator.
