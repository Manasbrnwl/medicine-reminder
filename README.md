# Medicine Reminder API

A Node.js backend application for medicine reminder management, with features for parent-child relationship tracking and various notification methods.

## Core Features

- **Medicine Reminders & Notifications**

  - Schedule medicine dose reminders
  - Get push notifications, emails, or SMS alerts
  - Mark doses as "Taken" or "Missed"
  - Support for different reminder frequencies
  - Snooze option for reminders

- **Parent-Child Relationship**

  - Link parent/guardian with child/dependent accounts
  - Parents receive notifications for missed doses
  - Parents can view medication adherence history
  - Parents can mark doses as "Taken" on behalf of dependents

- **Adherence Dashboard**
  - View adherence score (1 point per dose taken)
  - Track adherence rate as a percentage
  - Monitor streaks of consecutive days with all doses taken
  - Get medicine-specific adherence statistics
  - Parents can view dependent adherence stats

## Technologies Used

- Node.js & Express.js
- MongoDB & Mongoose
- Socket.IO for real-time notifications
- JWT for authentication
- Node-schedule for reminder scheduling
- Nodemailer for email notifications
- Twilio for SMS notifications

## Setup Instructions

### Prerequisites

- Node.js (v22.11.0)
- MongoDB (Atlas)
- Twilio account (for SMS notifications)

### Installation

1. Clone the repository

   ```
   git clone https://github.com/Manasbrnwl/medicine-reminder.git
   cd medicine-reminder
   ```

2. Install dependencies

   ```
   npm install
   ```

3. Configure environment variables

   - Create a `.env` file in the root directory based on the `.env.example` file
   - Set your MongoDB URI, JWT Secret, and email configuration
   - Add your Twilio credentials (Account SID, Auth Token, and Phone Number)

4. Run the server

   ```
   # Development mode
   npm run dev

   # Production mode
   npm start
   ```

### Twilio Setup

1. Create a [Twilio account](https://www.twilio.com/try-twilio)
2. Get your Account SID and Auth Token from the Twilio dashboard
3. Purchase a Twilio phone number for sending SMS
4. Add the following to your `.env` file:
   ```
   TWILIO_ACCOUNT_SID=your_account_sid
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE_NUMBER=your_twilio_phone_number
   ```

## API Documentation

### Authentication Endpoints

#### Register User

- **URL**: `/api/users`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "name": "User Name",
    "email": "user@example.com",
    "password": "password123",
    "phone": "1234567890",
    "notificationPreferences": {
      "email": true,
      "push": true,
      "sms": false
    }
  }
  ```

#### Login User

- **URL**: `/api/users/login`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```

### User Management Endpoints

#### Get User Profile

- **URL**: `/api/users/profile`
- **Method**: `GET`
- **Auth Required**: Yes

#### Update User Profile

- **URL**: `/api/users/profile`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Body**:
  ```json
  {
    "name": "Updated Name",
    "notificationPreferences": {
      "sms": true
    }
  }
  ```

#### Link Dependent

- **URL**: `/api/users/link-dependent`
- **Method**: `POST`
- **Auth Required**: Yes
- **Body**:
  ```json
  {
    "dependentEmail": "dependent@example.com"
  }
  ```

#### Get Dependents

- **URL**: `/api/users/dependents`
- **Method**: `GET`
- **Auth Required**: Yes

### Medicine Endpoints

#### Create Medicine

- **URL**: `/api/medicines`
- **Method**: `POST`
- **Auth Required**: Yes
- **Body**:
  ```json
  {
    "name": "Medicine Name",
    "description": "Description of medicine",
    "dosage": "10mg",
    "frequency": "twice",
    "startDate": "2023-07-01T00:00:00.000Z",
    "endDate": "2023-08-01T00:00:00.000Z",
    "instructions": "Take with water"
  }
  ```

#### Get All Medicines

- **URL**: `/api/medicines`
- **Method**: `GET`
- **Auth Required**: Yes

### Reminder Endpoints

#### Create Reminder

- **URL**: `/api/reminders`
- **Method**: `POST`
- **Auth Required**: Yes
- **Body**:
  ```json
  {
    "medicine": "medicineId",
    "time": "2023-07-10T08:00:00.000Z",
    "repeat": "daily"
  }
  ```

#### Mark Reminder as Taken

- **URL**: `/api/reminders/:id/take`
- **Method**: `PUT`
- **Auth Required**: Yes

#### Snooze Reminder

- **URL**: `/api/reminders/:id/snooze`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Body**:
  ```json
  {
    "minutes": 15
  }
  ```

### Dashboard Endpoints

#### Get User Dashboard Stats

- **URL**: `/api/reminders/dashboard`
- **Method**: `GET`
- **Auth Required**: Yes
- **Query Parameters**:
  - `startDate`: (optional) Start date for stats in ISO format (default: 30 days ago)
  - `endDate`: (optional) End date for stats in ISO format (default: today)
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "overview": {
        "totalReminders": 30,
        "takenCount": 25,
        "missedCount": 3,
        "pendingCount": 1,
        "snoozedCount": 1,
        "adherenceScore": 25,
        "adherenceRate": 83.33,
        "currentStreak": 7
      },
      "medicineStats": [
        {
          "id": "medicineId1",
          "name": "Medicine Name 1",
          "total": 15,
          "taken": 14,
          "missed": 1,
          "adherenceRate": 93.33
        },
        {
          "id": "medicineId2",
          "name": "Medicine Name 2",
          "total": 15,
          "taken": 11,
          "missed": 2,
          "adherenceRate": 73.33
        }
      ]
    }
  }
  ```

#### Get Dependent Dashboard Stats

- **URL**: `/api/reminders/dashboard/dependent/:dependentId`
- **Method**: `GET`
- **Auth Required**: Yes
- **Query Parameters**:
  - `startDate`: (optional) Start date for stats in ISO format (default: 30 days ago)
  - `endDate`: (optional) End date for stats in ISO format (default: today)
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "dependent": {
        "id": "dependentId",
        "name": "Dependent Name"
      },
      "overview": {
        "totalReminders": 30,
        "takenCount": 20,
        "missedCount": 5,
        "pendingCount": 3,
        "snoozedCount": 2,
        "adherenceScore": 20,
        "adherenceRate": 66.67,
        "currentStreak": 3
      },
      "medicineStats": [
        {
          "id": "medicineId1",
          "name": "Medicine Name 1",
          "total": 15,
          "taken": 12,
          "missed": 2,
          "adherenceRate": 80.0
        },
        {
          "id": "medicineId2",
          "name": "Medicine Name 2",
          "total": 15,
          "taken": 8,
          "missed": 3,
          "adherenceRate": 53.33
        }
      ]
    }
  }
  ```

## WebSocket Events

- `connection`: Client connects to Socket.IO server
- `join`: Client joins a personal notification room by user ID
- `notification`: Server sends reminder notification to client
- `disconnect`: Client disconnects from Socket.IO server
