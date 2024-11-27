# Food Donation Platform // This app is still under development and many features will not work as expected. I am working on this and iteratively improve the functionality and user experiance.

A platform that connects food donors (restaurants, individuals, etc.) with recipients (food banks, charities, etc.) to reduce food waste and help those in need.

## Features

- **User Authentication**
  - Separate interfaces for donors and recipients
  - JWT-based authentication

- **For Donors**
  - Create and manage food listings
  - Track donations and their status
  - Manage reservations from recipients
  - View donation statistics

- **For Recipients**
  - Search available food listings
  - Location-based search
  - Make reservations
  - Track reservation status

- **Search Features**
  - Semantic search using Elasticsearch
  - Filter by category, location, and quantity
  - Sort by expiration date or distance

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v13 or higher)
- Elasticsearch (v8 or higher)

## Setup Instructions

### 1. PostgreSQL Setup

1. Start PostgreSQL server
2. Create a new database:
```sql
CREATE DATABASE food_donation;
```
3. Open psql or your preferred PostgreSQL client and connect to the database
4. Run the database schema queries provided in `database_setup.sql` (these are the queries we ran earlier)
5. I have also included a testsetup.py file which insert a some test donors and recipients for testing the web app.

### 2. Elasticsearch Setup

1. Download and extract Elasticsearch
2. Navigate to Elasticsearch directory
3. Run Elasticsearch:
   - For Windows: `bin\elasticsearch.bat`
   - For Linux/Mac: `./bin/elasticsearch`
4. Verify Elasticsearch is running:
```bash
curl http://localhost:9200
```

### 3. Project Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd food-donation-platform
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the project root:
```env
DB_USER=your_postgres_username
DB_PASSWORD=your_postgres_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME=food_donation
JWT_SECRET=your_secret_key_here
ELASTICSEARCH_URL=http://localhost:9200
PORT=3000
```

4. Start the server:
```bash
npm start
```

### 4. Directory Structure

```
food-donation-platform/
├── public/                 # Static files
│   ├── css/
│   │   └── style.css      # Main stylesheet
│   ├── login.html         # Login page
│   ├── signup.html        # Registration page
│   ├── donor-dashboard.html
│   ├── create-listing.html
│   ├── edit-listing.html
│   ├── recipient-dashboard.html
│   └── browse-listings.html
├── src/                   # Server-side code
│   ├── server.js         # Main server file
│   └── routes/
│       └── listings.js    # API routes
├── package.json
├── .env
└── README.md
```

## API Endpoints

### Authentication
- POST `/api/auth/register` - Register new user
- POST `/api/auth/login` - User login

### Listings
- GET `/api/listings/search` - Search listings
- POST `/api/listings` - Create new listing
- PUT `/api/listings/:id` - Update listing
- DELETE `/api/listings/:id` - Delete listing
- POST `/api/listings/reserve/:listingId` - Make reservation
- GET `/api/listings/my-listings` - Get donor's listings
- GET `/api/listings/my-reservations` - Get recipient's reservations

## Usage

1. Access the application at `http://localhost:3000`
2. Register as either a donor or recipient
3. For donors:
   - Create food listings from the dashboard
   - Manage reservations
4. For recipients:
   - Browse available food listings
   - Make reservations
   - Track reservation status

## Technical Features

- Real-time search using Elasticsearch
- PostgreSQL for robust data storage
- JWT for secure authentication
- Location-based search with PostGIS
- Responsive frontend design

## Security Features

- Password hashing using bcrypt
- JWT token authentication
- SQL injection protection
- Input validation
- CORS enabled

## Known Issues

- Location services require HTTPS in production
- Some browsers may block geolocation in HTTP

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
