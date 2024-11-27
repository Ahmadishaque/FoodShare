import bcrypt
import psycopg2
from datetime import datetime, timedelta

def create_test_data():
    # Database connection parameters
    conn_params = {
        "dbname": "wohure",
        "user": "postgres",
        "password": "1985",
        "host": "localhost",
        "port": "5432"
    }

    # Connect to database
    conn = psycopg2.connect(**conn_params)
    cur = conn.cursor()

    # Create test users with known passwords
    test_users = [
        {
            'email': 'donor@test.com',
            'password': 'donor123',  # In real app, use strong passwords
            'user_type': 'donor',
            'name': 'Test Donor',
            'organization_type': 'restaurant'
        },
        {
            'email': 'recipient@test.com',
            'password': 'recipient123',
            'user_type': 'recipient',
            'name': 'Test Food Bank',
            'organization_type': 'food_bank'
        }
    ]

    # Insert users
    for user in test_users:
        # Generate salt and hash password
        salt = bcrypt.gensalt()
        password_hash = bcrypt.hashpw(user['password'].encode('utf-8'), salt)
        
        cur.execute("""
            INSERT INTO users (email, password_hash, user_type, name, organization_type)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING user_id
        """, (
            user['email'],
            password_hash.decode('utf-8'),
            user['user_type'],
            user['name'],
            user['organization_type']
        ))
        
        user_id = cur.fetchone()[0]
        
        # Add a test address for each user
        cur.execute("""
            INSERT INTO addresses (
                user_id, street_address, city, state,
                postal_code, country, latitude, longitude, is_default
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            user_id,
            '123 Test St',
            'Test City',
            'Test State',
            '12345',
            'Test Country',
            40.7128,  # Example coordinates (New York)
            -74.0060,
            True
        ))

    # Add some test food categories
    categories = [
        ('fresh', 'Fresh produce and perishables', 'Refrigeration required'),
        ('cooked', 'Prepared meals', 'Immediate consumption recommended'),
        ('canned', 'Canned goods', 'Room temperature storage'),
        ('dry', 'Dry goods and non-perishables', 'Room temperature storage')
    ]
    
    for cat in categories:
        cur.execute("""
            INSERT INTO food_categories (name, description, storage_requirements)
            VALUES (%s, %s, %s)
        """, cat)

    # Create some test food listings
    test_listings = [
        {
            'title': 'Fresh Vegetables',
            'description': 'Mixed vegetables from our restaurant',
            'quantity_kg': 10.5,
            'feeds_people': 25,
            'best_before': datetime.now() + timedelta(days=2)
        },
        {
            'title': 'Canned Soup',
            'description': 'Unused canned vegetable soup',
            'quantity_kg': 15.0,
            'feeds_people': 30,
            'best_before': datetime.now() + timedelta(days=180)
        }
    ]

    # Get donor user_id and address_id
    cur.execute("SELECT user_id FROM users WHERE user_type = 'donor' LIMIT 1")
    donor_id = cur.fetchone()[0]
    
    cur.execute("SELECT address_id FROM addresses WHERE user_id = %s LIMIT 1", (donor_id,))
    address_id = cur.fetchone()[0]

    # Insert food listings
    for listing in test_listings:
        cur.execute("""
            INSERT INTO food_listings (
                donor_id, address_id, title, description,
                category_id, quantity_kg, feeds_people, best_before
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            donor_id,
            address_id,
            listing['title'],
            listing['description'],
            1,  # Using first category
            listing['quantity_kg'],
            listing['feeds_people'],
            listing['best_before']
        ))

    # Commit all changes
    conn.commit()
    cur.close()
    conn.close()

if __name__ == "__main__":
    create_test_data()