# Medicine Reminder API

A Node.js backend application for medicine reminder management, with features for parent-child relationship tracking and various notification methods.

## Core Features

- **Medicine Reminders & Notifications**

  - Schedule medicine dose reminders with flexible timing options
  - Multiple medicines per reminder
  - Frequency options (once, twice, thrice daily, or custom times)
  - Regular scheduling (morning, afternoon, evening)
  - Precise time control for each reminder
  - Get push notifications, emails, or SMS alerts
  - Mark doses as "Taken" or "Missed"
  - Support for recurring reminders (daily, weekly, monthly)
  - Snooze option for reminders

- **Medicine Stack System**

  - Central repository of medicines
  - Search and filter medicines
  - Usage statistics to highlight popular medicines
  - Medicine categorization
  - User-specific medicine customization

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

- **Subscription System**
  - 30-day free trial for new users
  - Premium subscription with auto-renewal
  - Multiple payment methods (Card, UPI, Net Banking)
  - Email notifications for subscription events
  - Graceful handling of expired subscriptions

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

### Subscription Endpoints

#### Get Subscription Status

- **URL**: `/api/subscription/status`
- **Method**: `GET`
- **Auth Required**: Yes
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "subscription": {
        "status": "free",
        "startDate": "2024-03-15T10:00:00.000Z",
        "endDate": "2024-04-15T10:00:00.000Z",
        "autoRenew": false,
        "paymentMethod": "none"
      }
    }
  }
  ```

#### Upgrade to Premium

- **URL**: `/api/subscription/upgrade`
- **Method**: `POST`
- **Auth Required**: Yes
- **Body**:
  ```json
  {
    "paymentMethod": "card"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "message": "Subscription upgraded successfully",
    "data": {
      "subscription": {
        "status": "premium",
        "startDate": "2024-03-15T10:00:00.000Z",
        "endDate": "2025-03-15T10:00:00.000Z",
        "autoRenew": true,
        "paymentMethod": "card"
      }
    }
  }
  ```

#### Cancel Subscription

- **URL**: `/api/subscription/cancel`
- **Method**: `POST`
- **Auth Required**: Yes
- **Response**:
  ```json
  {
    "success": true,
    "message": "Subscription cancelled successfully",
    "data": {
      "subscription": {
        "status": "free",
        "startDate": "2024-03-15T10:00:00.000Z",
        "endDate": "2024-04-15T10:00:00.000Z",
        "autoRenew": false,
        "paymentMethod": "none"
      }
    }
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

### Medicine Stack Endpoints

#### Get All Medicines in Stack

- **URL**: `/api/medicine-stack`
- **Method**: `GET`
- **Auth Required**: Yes
- **Query Parameters**:
  - `category`: Filter by medicine category (e.g., "tablet", "capsule", "syrup")
  - `search`: Search by medicine name
  - `sort`: Sort options ("usage", "name", "-name", "createdAt", "-createdAt")
  - `page`: Page number for pagination
  - `limit`: Number of items per page

#### Example Query Parameters

Here are some example query parameter combinations:

- Get all medicines: `/api/medicine-stack`
- Filter by category: `/api/medicine-stack?category=tablet`
- Search by name: `/api/medicine-stack?search=para`
- Sort by name (ascending): `/api/medicine-stack?sort=name`
- Sort by name (descending): `/api/medicine-stack?sort=-name`
- Sort by most used: `/api/medicine-stack?sort=usage`
- Pagination: `/api/medicine-stack?page=2&limit=10`
- Combined filters: `/api/medicine-stack?category=tablet&search=para&sort=usage&page=2&limit=6`
- **Response**:
  ```json
  {
    "success": true,
    "count": 10,
    "pagination": {
      "total": 100,
      "page": 1,
      "pages": 10
    },
    "data": [
      {
        "_id": "medicineStackId1",
        "name": "Paracetamol",
        "description": "Pain reliever and fever reducer",
        "category": "tablet",
        "usage": 120,
        "createdAt": "2024-03-01T10:00:00.000Z"
      }
    ]
  }
  ```

#### Get Single Medicine from Stack

- **URL**: `/api/medicine-stack/:id`
- **Method**: `GET`
- **Auth Required**: Yes
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "_id": "medicineStackId1",
      "name": "Paracetamol",
      "description": "Pain reliever and fever reducer",
      "category": "tablet",
      "usage": 120,
      "createdAt": "2024-03-01T10:00:00.000Z"
    }
  }
  ```

#### Add Medicine to Stack

- **URL**: `/api/medicine-stack`
- **Method**: `POST`
- **Auth Required**: Yes
- **Body**:
  ```json
  {
    "name": "Ibuprofen",
    "description": "Non-steroidal anti-inflammatory drug",
    "category": "tablet"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "_id": "medicineStackId2",
      "name": "Ibuprofen",
      "description": "Non-steroidal anti-inflammatory drug",
      "category": "tablet",
      "usage": 0,
      "createdAt": "2024-04-05T10:00:00.000Z"
    }
  }
  ```

#### Update Medicine in Stack

- **URL**: `/api/medicine-stack/:id`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Body**:
  ```json
  {
    "description": "Updated description",
    "category": "capsule"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "_id": "medicineStackId2",
      "name": "Ibuprofen",
      "description": "Updated description",
      "category": "capsule",
      "usage": 0,
      "createdAt": "2024-04-05T10:00:00.000Z"
    }
  }
  ```

### User Medicine Endpoints

#### Get User Medicines

- **URL**: `/api/medicines`
- **Method**: `GET`
- **Auth Required**: Yes
- **Query Parameters**:
  - `active`: Filter by active status ("true" or "false")
- **Response**:
  ```json
  {
    "success": true,
    "count": 2,
    "data": [
      {
        "_id": "userMedicineId1",
        "medicineStack": {
          "_id": "medicineStackId1",
          "name": "Paracetamol",
          "description": "Pain reliever and fever reducer",
          "category": "tablet"
        },
        "dosage": "500mg",
        "instructions": "Take with water",
        "startDate": "2024-04-01T00:00:00.000Z",
        "endDate": "2024-05-01T00:00:00.000Z",
        "active": true
      }
    ]
  }
  ```

#### Add User Medicine

- **URL**: `/api/medicines`
- **Method**: `POST`
- **Auth Required**: Yes
- **Body**:
  ```json
  {
    "medicineStackId": "medicineStackId1",
    "dosage": "500mg",
    "instructions": "Take with water",
    "startDate": "2024-04-01T00:00:00.000Z",
    "endDate": "2024-05-01T00:00:00.000Z"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "_id": "userMedicineId1",
      "medicineStack": {
        "_id": "medicineStackId1",
        "name": "Paracetamol",
        "description": "Pain reliever and fever reducer",
        "category": "tablet"
      },
      "dosage": "500mg",
      "instructions": "Take with water",
      "startDate": "2024-04-01T00:00:00.000Z",
      "endDate": "2024-05-01T00:00:00.000Z",
      "active": true
    }
  }
  ```

#### Get User Medicine

- **URL**: `/api/medicines/:id`
- **Method**: `GET`
- **Auth Required**: Yes
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "_id": "userMedicineId1",
      "medicineStack": {
        "_id": "medicineStackId1",
        "name": "Paracetamol",
        "description": "Pain reliever and fever reducer",
        "category": "tablet"
      },
      "dosage": "500mg",
      "instructions": "Take with water",
      "startDate": "2024-04-01T00:00:00.000Z",
      "endDate": "2024-05-01T00:00:00.000Z",
      "active": true
    }
  }
  ```

#### Update User Medicine

- **URL**: `/api/medicines/:id`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Body**:
  ```json
  {
    "dosage": "250mg",
    "instructions": "Take after meals",
    "active": false
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "_id": "userMedicineId1",
      "medicineStack": {
        "_id": "medicineStackId1",
        "name": "Paracetamol",
        "description": "Pain reliever and fever reducer",
        "category": "tablet"
      },
      "dosage": "250mg",
      "instructions": "Take after meals",
      "startDate": "2024-04-01T00:00:00.000Z",
      "endDate": "2024-05-01T00:00:00.000Z",
      "active": false
    }
  }
  ```

#### Delete User Medicine

- **URL**: `/api/medicines/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **Response**:
  ```json
  {
    "success": true,
    "data": {}
  }
  ```

#### Get Dependent Medicines

- **URL**: `/api/medicines/dependent/:dependentId`
- **Method**: `GET`
- **Auth Required**: Yes
- **Response**:
  ```json
  {
    "success": true,
    "count": 2,
    "data": [
      {
        "_id": "dependentMedicineId1",
        "medicineStack": {
          "_id": "medicineStackId1",
          "name": "Paracetamol",
          "description": "Pain reliever and fever reducer",
          "category": "tablet"
        },
        "dosage": "250mg",
        "instructions": "Take with water",
        "startDate": "2024-04-01T00:00:00.000Z",
        "endDate": "2024-05-01T00:00:00.000Z",
        "active": true
      }
    ]
  }
  ```

### Reminder Endpoints

#### Get User Reminders

- **URL**: `/api/reminders`
- **Method**: `GET`
- **Auth Required**: Yes
- **Query Parameters**:
  - `startDate`: Filter by start date (ISO format)
  - `endDate`: Filter by end date (ISO format)
  - `status`: Filter by status (pending, completed, partially_completed, missed, snoozed)
- **Response**:
  ```json
  {
    "success": true,
    "count": 2,
    "data": [
      {
        "_id": "reminderId1",
        "medicines": [
          {
            "medicine": {
              "_id": "userMedicineId1",
              "medicineStack": {
                "_id": "medicineStackId1",
                "name": "Paracetamol",
                "category": "tablet"
              },
              "dosage": "500mg"
            },
            "status": "pending"
          }
        ],
        "scheduleStart": "2024-04-01T00:00:00.000Z",
        "scheduleEnd": "2024-05-01T00:00:00.000Z",
        "frequency": "twice",
        "morningTime": "2024-04-05T08:00:00.000Z",
        "eveningTime": "2024-04-05T20:00:00.000Z",
        "time": "2024-04-05T08:00:00.000Z",
        "status": "pending",
        "repeat": "daily"
      }
    ]
  }
  ```

#### Create Reminder

- **URL**: `/api/reminders`
- **Method**: `POST`
- **Auth Required**: Yes
- **Body**:
  ```json
  {
    "medicines": ["userMedicineId1", "userMedicineId2"],
    "scheduleStart": "2024-04-01T00:00:00.000Z",
    "scheduleEnd": "2024-05-01T00:00:00.000Z",
    "frequency": "twice",
    "morningTime": "2024-04-05T08:00:00.000Z",
    "eveningTime": "2024-04-05T20:00:00.000Z",
    "repeat": "daily"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "_id": "reminderId1",
      "medicines": [
        {
          "medicine": {
            "_id": "userMedicineId1",
            "medicineStack": {
              "_id": "medicineStackId1",
              "name": "Paracetamol",
              "category": "tablet"
            },
            "dosage": "500mg"
          },
          "status": "pending"
        }
      ],
      "scheduleStart": "2024-04-01T00:00:00.000Z",
      "scheduleEnd": "2024-05-01T00:00:00.000Z",
      "frequency": "twice",
      "morningTime": "2024-04-05T08:00:00.000Z",
      "eveningTime": "2024-04-05T20:00:00.000Z",
      "time": "2024-04-05T08:00:00.000Z",
      "status": "pending",
      "repeat": "daily",
      "active": true
    }
  }
  ```

#### Create Reminder with Thrice Daily Frequency

- **URL**: `/api/reminders`
- **Method**: `POST`
- **Auth Required**: Yes
- **Body**:
  ```json
  {
    "medicines": ["userMedicineId1"],
    "scheduleStart": "2024-04-01T00:00:00.000Z",
    "scheduleEnd": "2024-05-01T00:00:00.000Z",
    "frequency": "thrice",
    "morningTime": "2024-04-05T08:00:00.000Z",
    "afternoonTime": "2024-04-05T13:00:00.000Z",
    "eveningTime": "2024-04-05T20:00:00.000Z",
    "repeat": "daily"
  }
  ```

#### Create Reminder with Custom Frequency

- **URL**: `/api/reminders`
- **Method**: `POST`
- **Auth Required**: Yes
- **Body**:
  ```json
  {
    "medicines": ["userMedicineId1"],
    "scheduleStart": "2024-04-01T00:00:00.000Z",
    "scheduleEnd": "2024-05-01T00:00:00.000Z",
    "frequency": "custom",
    "customTimes": [
      { "time": "2024-04-05T08:00:00.000Z", "enabled": true },
      { "time": "2024-04-05T14:00:00.000Z", "enabled": true },
      { "time": "2024-04-05T20:00:00.000Z", "enabled": true },
      { "time": "2024-04-05T23:00:00.000Z", "enabled": true }
    ],
    "repeat": "daily"
  }
  ```

#### Create Weekly Reminder

- **URL**: `/api/reminders`
- **Method**: `POST`
- **Auth Required**: Yes
- **Body**:
  ```json
  {
    "medicines": ["userMedicineId1"],
    "scheduleStart": "2024-04-01T00:00:00.000Z",
    "scheduleEnd": "2024-05-01T00:00:00.000Z",
    "frequency": "once",
    "standardTime": "2024-04-05T10:00:00.000Z",
    "repeat": "weekly",
    "daysOfWeek": [1, 3, 5]
  }
  ```

#### Create Monthly Reminder

- **URL**: `/api/reminders`
- **Method**: `POST`
- **Auth Required**: Yes
- **Body**:
  ```json
  {
    "medicines": ["userMedicineId1"],
    "scheduleStart": "2024-04-01T00:00:00.000Z",
    "scheduleEnd": "2024-07-01T00:00:00.000Z",
    "frequency": "once",
    "standardTime": "2024-04-05T10:00:00.000Z",
    "repeat": "monthly",
    "daysOfMonth": [1, 15]
  }
  ```

#### Get Reminder

- **URL**: `/api/reminders/:id`
- **Method**: `GET`
- **Auth Required**: Yes

#### Update Reminder

- **URL**: `/api/reminders/:id`
- **Method**: `PUT`
- **Auth Required**: Yes
- **Body**:
  ```json
  {
    "medicines": ["userMedicineId1", "userMedicineId3"],
    "frequency": "twice",
    "morningTime": "2024-04-05T09:00:00.000Z",
    "eveningTime": "2024-04-05T21:00:00.000Z",
    "repeat": "weekly",
    "daysOfWeek": [1, 3, 5]
  }
  ```

#### Delete Reminder

- **URL**: `/api/reminders/:id`
- **Method**: `DELETE`
- **Auth Required**: Yes
- **Response**:
  ```json
  {
    "success": true,
    "data": {}
  }
  ```

#### Mark Medicine as Taken

- **URL**: `/api/reminders/:id/take/:medicineIndex`
- **Method**: `PUT`
- **Auth Required**: Yes

#### Mark Medicine as Missed

- **URL**: `/api/reminders/:id/miss/:medicineIndex`
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

#### Get Dependent Reminders

- **URL**: `/api/reminders/dependent/:dependentId`
- **Method**: `GET`
- **Auth Required**: Yes
- **Query Parameters**:
  - `startDate`: Filter by start date (ISO format)
  - `endDate`: Filter by end date (ISO format)
  - `status`: Filter by status

#### Create Dependent Reminder

- **URL**: `/api/reminders/dependent/:dependentId`
- **Method**: `POST`
- **Auth Required**: Yes
- **Body**:
  ```json
  {
    "medicines": ["dependentMedicineId1", "dependentMedicineId2"],
    "scheduleStart": "2024-04-01T00:00:00.000Z",
    "scheduleEnd": "2024-05-01T00:00:00.000Z",
    "frequency": "twice",
    "morningTime": "2024-04-05T08:00:00.000Z",
    "eveningTime": "2024-04-05T20:00:00.000Z",
    "repeat": "daily"
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

#### Get Dependent Dashboard Stats

- **URL**: `/api/reminders/dashboard/dependent/:dependentId`
- **Method**: `GET`
- **Auth Required**: Yes
- **Query Parameters**:
  - `startDate`: (optional) Start date for stats in ISO format (default: 30 days ago)
  - `endDate`: (optional) End date for stats in ISO format (default: today)

## Frequency Options Explained

### Once Daily

- A single reminder each day at the specified `standardTime`
- Example: Once daily at 8:00 AM

### Twice Daily

- Two reminders each day at the specified `morningTime` and `eveningTime`
- Example: 8:00 AM and 8:00 PM

### Thrice Daily

- Three reminders each day at the specified `morningTime`, `afternoonTime` and `eveningTime`
- Example: 8:00 AM, 2:00 PM, and 8:00 PM

### Custom Frequency

- Multiple reminders at custom times specified in the `customTimes` array
- Example: 7:30 AM, 1:00 PM, 6:30 PM, and 10:00 PM

## Recurrence Options Explained

### Daily

- Repeats every day at the specified times

### Weekly

- Repeats on specific days of the week (0=Sunday, 1=Monday, etc.)
- Must specify `daysOfWeek` array

### Monthly

- Repeats on specific days of the month (1-31)
- Must specify `daysOfMonth` array

### Custom

- Repeats at a custom interval (hours, days, weeks, or months)
- Must specify `repeatInterval` and `repeatUnit`

## WebSocket Events

- `connection`: Client connects to Socket.IO server
- `join`: Client joins a personal notification room by user ID
- `notification`: Server sends reminder notification to client
- `disconnect`: Client disconnects from Socket.IO server

## Redis Setup for Distributed Job Queue

This application uses Redis with Bull for distributed job processing to manage medication reminders. This approach provides improved reliability, scalability, and performance for scheduling reminders when handling a large number of users.

### Installing Redis

#### On Windows:

1. Download and install Redis using Windows Subsystem for Linux (WSL) or using the Windows port from [https://github.com/tporadowski/redis/releases](https://github.com/tporadowski/redis/releases)
2. Start the Redis server: `redis-server`

#### On macOS:

```bash
brew install redis
brew services start redis
```

#### On Linux:

```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis
```

### Configuration

Add the following variables to your `.env` file:

```
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password_if_any
REDIS_URL=redis://localhost:6379
```

### Benefits of the Bull Queue Implementation

- **High Scalability**: Handles thousands of concurrent users and reminders efficiently
- **Reliability**: Jobs persist even during application restarts
- **Fault Tolerance**: Built-in retry mechanism for failed jobs
- **Delayed Jobs**: Supports scheduling reminders far in advance
- **Monitoring**: Easy monitoring of queue status through the API
- **Distributed Processing**: Can be scaled horizontally across multiple servers
