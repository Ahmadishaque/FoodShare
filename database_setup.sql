-- Users table to store both donors and recipients
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('donor', 'recipient')),
    name VARCHAR(255) NOT NULL,
    organization_type VARCHAR(50), -- e.g., restaurant, food bank, individual
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Addresses table (users can have multiple addresses)
CREATE TABLE addresses (
    address_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id),
    street_address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Food categories and types
CREATE TABLE food_categories (
    category_id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL, -- e.g., canned, fresh, cooked
    description TEXT,
    storage_requirements TEXT
);

-- Food listings table
CREATE TABLE food_listings (
    listing_id SERIAL PRIMARY KEY,
    donor_id INTEGER REFERENCES users(user_id),
    address_id INTEGER REFERENCES addresses(address_id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category_id INTEGER REFERENCES food_categories(category_id),
    quantity_kg DECIMAL(10, 2),
    feeds_people INTEGER,
    best_before TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'available' 
        CHECK (status IN ('available', 'reserved', 'completed', 'expired')),
    -- Predicted nutritional information
    predicted_calories_per_kg INTEGER,
    predicted_protein_per_kg DECIMAL(5, 2),
    predicted_carbs_per_kg DECIMAL(5, 2),
    predicted_fat_per_kg DECIMAL(5, 2)
);

-- Search history for better matching
CREATE TABLE search_history (
    search_id SERIAL PRIMARY KEY,
    recipient_id INTEGER REFERENCES users(user_id),
    search_query TEXT,
    quantity_needed DECIMAL(10, 2),
    location_lat DECIMAL(10, 8),
    location_lng DECIMAL(11, 8),
    search_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Matches/Reservations table
CREATE TABLE reservations (
    reservation_id SERIAL PRIMARY KEY,
    listing_id INTEGER REFERENCES food_listings(listing_id),
    recipient_id INTEGER REFERENCES users(user_id),
    quantity_reserved DECIMAL(10, 2),
    status VARCHAR(20) DEFAULT 'pending' 
        CHECK (status IN ('pending', 'accepted', 'declined', 'completed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    pickup_time TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX idx_listings_status ON food_listings(status);
CREATE INDEX idx_listings_best_before ON food_listings(best_before);
CREATE INDEX idx_listings_location ON addresses(latitude, longitude);
CREATE INDEX idx_food_description_gin ON food_listings USING gin(to_tsvector('english', description));