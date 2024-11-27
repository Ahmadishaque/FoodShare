// src/routes/listings.js
const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { 
  client: esClient, 
  indexFoodListing, 
  FOOD_LISTINGS_INDEX 
} = require('../config/elasticsearch');

// Middleware function defined inline instead of importing
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

// Validation middleware for creating/updating listings
const validateListing = [
  body('title').trim().notEmpty(),
  body('description').trim().notEmpty(),
  body('categoryId').isInt(),
  body('quantityKg').isFloat({ min: 0 }),
  body('feedsPeople').isInt({ min: 0 }),
  body('bestBefore').isISO8601(),
  body('addressId').isInt(),
];

// Create new food listing
// router.post('/', authenticateToken, validateListing, async (req, res) => {
//   try {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({ errors: errors.array() });
//     }

//     // Verify user is a donor
//     if (req.user.userType !== 'donor') {
//       return res.status(403).json({ error: 'Only donors can create listings' });
//     }

//     const {
//       title,
//       description,
//       categoryId,
//       quantityKg,
//       feedsPeople,
//       bestBefore,
//       addressId
//     } = req.body;

//     // Verify address belongs to user
//     const addressCheck = await pool.query(
//       'SELECT * FROM addresses WHERE address_id = $1 AND user_id = $2',
//       [addressId, req.user.userId]
//     );

//     if (addressCheck.rows.length === 0) {
//       return res.status(400).json({ error: 'Invalid address' });
//     }

//     const result = await pool.query(
//       `INSERT INTO food_listings (
//         donor_id, address_id, title, description, category_id,
//         quantity_kg, feeds_people, best_before, status
//       )
//       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'available')
//       RETURNING *`,
//       [
//         req.user.userId,
//         addressId,
//         title,
//         description,
//         categoryId,
//         quantityKg,
//         feedsPeople,
//         bestBefore
//       ]
//     );

//     res.status(201).json(result.rows[0]);
//   } catch (error) {
//     console.error('Create listing error:', error);
//     res.status(500).json({ error: 'Server error creating listing' });
//   }
// });

// Store the original handler logic in a separate function
async function originalCreateListing(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // Verify user is a donor
  if (req.user.userType !== 'donor') {
    return res.status(403).json({ error: 'Only donors can create listings' });
  }

  const {
    title,
    description,
    categoryId,
    quantityKg,
    feedsPeople,
    bestBefore,
    addressId
  } = req.body;

  // Verify address belongs to user
  const addressCheck = await pool.query(
    'SELECT * FROM addresses WHERE address_id = $1 AND user_id = $2',
    [addressId, req.user.userId]
  );

  if (addressCheck.rows.length === 0) {
    return res.status(400).json({ error: 'Invalid address' });
  }

  // Insert the new listing into the database
  const result = await pool.query(
    `INSERT INTO food_listings (
      donor_id, address_id, title, description, category_id,
      quantity_kg, feeds_people, best_before, status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'available')
    RETURNING *`,
    [
      req.user.userId,
      addressId,
      title,
      description,
      categoryId,
      quantityKg,
      feedsPeople,
      bestBefore
    ]
  );

  return result.rows[0]; // Return the created listing
}

// Wrap the original handler to add Elasticsearch indexing
router.post('/', authenticateToken, validateListing, async (req, res) => {
  try {
    // Call the original logic
    const result = await originalCreateListing(req, res);

    // Index the created listing in Elasticsearch
    await indexFoodListing(result);

    // Return the created listing as the response
    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating and indexing listing:', error);
    res.status(500).json({ error: 'Server error creating listing' });
  }
});


// Search food listings with filters
// router.get('/search', authenticateToken, async (req, res) => {
//   try {
//     const {
//       query: searchQuery,
//       latitude,
//       longitude,
//       radius = 10, // default 10km radius
//       category,
//       minQuantity,
//       maxQuantity,
//       sort = 'best_before' // default sort by expiration
//     } = req.query;

//     let sqlQuery = `
//       SELECT 
//         fl.*,
//         u.name as donor_name,
//         fc.name as category_name,
//         a.city,
//         a.state,
//         a.latitude,
//         a.longitude,
//         point(a.longitude, a.latitude) <-> point($1, $2) as distance_km
//       FROM food_listings fl
//       JOIN users u ON fl.donor_id = u.user_id
//       JOIN addresses a ON fl.address_id = a.address_id
//       JOIN food_categories fc ON fl.category_id = fc.category_id
//       WHERE fl.status = 'available'
//       AND fl.best_before > CURRENT_TIMESTAMP
//     `;

//     const params = [longitude || 0, latitude || 0];
//     let paramCount = 3;

//     // Add text search if query provided
//     if (searchQuery) {
//       sqlQuery += ` AND to_tsvector('english', fl.description || ' ' || fl.title) @@ to_tsquery($${paramCount})`;
//       params.push(searchQuery.split(' ').join(' & '));
//       paramCount++;
//     }

//     // Add category filter
//     if (category) {
//       sqlQuery += ` AND fc.name = $${paramCount}`;
//       params.push(category);
//       paramCount++;
//     }

//     // Add quantity filters
//     if (minQuantity) {
//       sqlQuery += ` AND fl.quantity_kg >= $${paramCount}`;
//       params.push(minQuantity);
//       paramCount++;
//     }
//     if (maxQuantity) {
//       sqlQuery += ` AND fl.quantity_kg <= $${paramCount}`;
//       params.push(maxQuantity);
//       paramCount++;
//     }

//     // Add location filter if coordinates provided
//     if (latitude && longitude) {
//       sqlQuery += ` AND point(a.longitude, a.latitude) <-> point($1, $2) <= $${paramCount}`;
//       params.push(radius);
//       paramCount++;
//     }

//     // Add sorting
//     sqlQuery += ` ORDER BY ${
//       sort === 'distance' && latitude && longitude ? 'distance_km' :
//       sort === 'quantity' ? 'quantity_kg DESC' :
//       'best_before ASC'
//     }`;

//     const result = await pool.query(sqlQuery, params);
//     res.json(result.rows);
//   } catch (error) {
//     console.error('Search error:', error);
//     res.status(500).json({ error: 'Server error during search' });
//   }
// });

// Modify the search endpoint in listings.js
// router.get('/search', authenticateToken, async (req, res) => {
//   try {
//     const {
//       query: searchQuery,
//       latitude,
//       longitude,
//       radius = 10,
//       category,
//       minQuantity,
//       maxQuantity,
//       sort = 'best_before'
//     } = req.query;

//     // Build Elasticsearch query
//     const esQuery = {
//       bool: {
//         must: [
//           { term: { status: 'available' } }
//         ],
//         should: searchQuery ? [
//           {
//             multi_match: {
//               query: searchQuery,
//               fields: ['title^3', 'description^2', 'category_name'],
//               fuzziness: 'AUTO'
//             }
//           }
//         ] : undefined,
//         filter: []
//       }
//     };

//     // Add location filter if coordinates provided
//     if (latitude && longitude) {
//       esQuery.bool.filter.push({
//         geo_distance: {
//           distance: `${radius}km`,
//           location: {
//             lat: parseFloat(latitude),
//             lon: parseFloat(longitude)
//           }
//         }
//       });
//     }

//     // Add category filter
//     if (category) {
//       esQuery.bool.filter.push({
//         term: { 'category_name.keyword': category }
//       });
//     }

//     // Add quantity filter
//     if (minQuantity || maxQuantity) {
//       const rangeFilter = { range: { quantity_kg: {} } };
//       if (minQuantity) rangeFilter.range.quantity_kg.gte = parseFloat(minQuantity);
//       if (maxQuantity) rangeFilter.range.quantity_kg.lte = parseFloat(maxQuantity);
//       esQuery.bool.filter.push(rangeFilter);
//     }

//     // Perform Elasticsearch search with updated API
//     const esResult = await esClient.search({
//       index: FOOD_LISTINGS_INDEX,
//       query: esQuery,
//       sort: [
//         sort === 'distance' && latitude && longitude
//           ? {
//               _geo_distance: {
//                 location: {
//                   lat: parseFloat(latitude),
//                   lon: parseFloat(longitude)
//                 },
//                 order: 'asc',
//                 unit: 'km'
//               }
//             }
//           : sort === 'best_before'
//           ? { best_before: 'asc' }
//           : { _score: 'desc' }
//       ]
//     });

//     // Get listing IDs from Elasticsearch results using the current API structure
//     const listingIds = esResult.hits.hits.map(hit => hit._id);

//     // Fetch full listing details from PostgreSQL
//     if (listingIds.length > 0) {
//       const pgResult = await pool.query(`
//         SELECT 
//           fl.*,
//           u.name as donor_name,
//           fc.name as category_name,
//           a.city,
//           a.state,
//           a.latitude,
//           a.longitude
//         FROM food_listings fl
//         JOIN users u ON fl.donor_id = u.user_id
//         JOIN addresses a ON fl.address_id = a.address_id
//         JOIN food_categories fc ON fl.category_id = fc.category_id
//         WHERE fl.listing_id = ANY($1)
//         ORDER BY array_position($1::varchar[], fl.listing_id::varchar)
//       `, [listingIds]);

//       res.json({
//         total: esResult.hits.total.value,
//         listings: pgResult.rows
//       });
//     } else {
//       res.json({
//         total: 0,
//         listings: []
//       });
//     }
//   } catch (error) {
//     console.error('Search error:', error);
//     console.error('Error details:', error.meta?.body?.error || error);
//     res.status(500).json({ error: 'Server error during search' });
//   }
// });

router.get('/search', authenticateToken, async (req, res) => {
  try {
    const {
      query: searchQuery,
      latitude,
      longitude,
      radius = 10,
      category,
      minQuantity,
      maxQuantity,
      sort = 'best_before'
    } = req.query;

    // Build base query
    let esQuery = {
      bool: {
        must: [
          { term: { status: 'available' } }
        ],
        filter: []
      }
    };

    // Add text search if query exists
    if (searchQuery) {
      esQuery.bool.must.push({
        multi_match: {
          query: searchQuery,
          fields: ['title^3', 'description^2', 'category_name'],
          type: 'best_fields',
          fuzziness: 'AUTO',
          operator: 'or'
        }
      });
    }

    // Add location filter if coordinates provided
    if (latitude && longitude) {
      esQuery.bool.filter.push({
        geo_distance: {
          distance: `${radius}km`,
          location: {
            lat: parseFloat(latitude),
            lon: parseFloat(longitude)
          }
        }
      });
    }

    // Add category filter
    if (category) {
      esQuery.bool.filter.push({
        term: { 'category_name.keyword': category }
      });
    }

    // Add quantity filter
    if (minQuantity || maxQuantity) {
      const rangeFilter = { range: { quantity_kg: {} } };
      if (minQuantity) rangeFilter.range.quantity_kg.gte = parseFloat(minQuantity);
      if (maxQuantity) rangeFilter.range.quantity_kg.lte = parseFloat(maxQuantity);
      esQuery.bool.filter.push(rangeFilter);
    }

    // Log the query for debugging
    console.log('Elasticsearch query:', JSON.stringify(esQuery, null, 2));

    // Perform Elasticsearch search
    const esResult = await esClient.search({
      index: FOOD_LISTINGS_INDEX,
      query: esQuery,
      sort: sort === 'distance' && latitude && longitude
        ? [{
            _geo_distance: {
              location: {
                lat: parseFloat(latitude),
                lon: parseFloat(longitude)
              },
              order: 'asc',
              unit: 'km'
            }
          }]
        : sort === 'best_before'
        ? [{ best_before: 'asc' }]
        : undefined,
      track_scores: true,
      min_score: searchQuery ? 0.3 : undefined // Only apply min_score when there's a search query
    });

    // Log the results for debugging
    console.log('Search results:', {
      total: esResult.hits.total.value,
      hits: esResult.hits.hits.map(hit => ({
        id: hit._id,
        score: hit._score,
        title: hit._source.title,
        description: hit._source.description
      }))
    });

    // Get listing IDs from Elasticsearch results
    const listingIds = esResult.hits.hits.map(hit => hit._id);

    // Fetch full listing details from PostgreSQL
    if (listingIds.length > 0) {
      const pgResult = await pool.query(`
              WITH relevance_calculated AS (
                  SELECT 
                      fl.*,
                      u.name AS donor_name,
                      fc.name AS category_name,
                      a.city,
                      a.state,
                      a.latitude,
                      a.longitude,
                      CASE 
                          WHEN $1::text IS NOT NULL 
                          THEN ts_rank(
                              to_tsvector('english', fl.title || ' ' || fl.description),
                              to_tsquery('english', $1)
                          )
                          ELSE 0
                      END AS relevance_score,
                      EXTRACT(EPOCH FROM fl.best_before) AS best_before_epoch  -- Convert timestamp to epoch
                  FROM food_listings fl
                  JOIN users u ON fl.donor_id = u.user_id
                  JOIN addresses a ON fl.address_id = a.address_id
                  JOIN food_categories fc ON fl.category_id = fc.category_id
                  WHERE fl.listing_id = ANY($2)
              )
              SELECT *
              FROM relevance_calculated
              ORDER BY 
                  CASE 
                      WHEN $1::text IS NOT NULL THEN relevance_score
                      WHEN $3 = 'best_before' THEN best_before_epoch  -- Use epoch time for ordering
                  END ASC NULLS LAST,
                  array_position($2::varchar[], listing_id::varchar);

      `, [
        searchQuery ? searchQuery.split(' ').join(' & ') : null,
        listingIds,
        sort
      ]);

      res.json({
        total: esResult.hits.total.value,
        listings: pgResult.rows
      });
    } else {
      res.json({
        total: 0,
        listings: []
      });
    }
  } catch (error) {
    console.error('Search error:', error);
    console.error('Error details:', error.meta?.body?.error || error);
    res.status(500).json({ error: 'Server error during search' });
  }
});


// Create reservation
router.post('/reserve/:listingId', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    // Verify user is a recipient
    if (req.user.userType !== 'recipient') {
      return res.status(403).json({ error: 'Only recipients can make reservations' });
    }

    await client.query('BEGIN');

    // Get listing details and lock the row
    const listingResult = await client.query(
      `SELECT * FROM food_listings 
       WHERE listing_id = $1 AND status = 'available'
       FOR UPDATE`,
      [req.params.listingId]
    );

    if (listingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Listing not available' });
    }

    const listing = listingResult.rows[0];
    const { quantityRequested } = req.body;

    if (quantityRequested > listing.quantity_kg) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Requested quantity not available' });
    }

    // Create reservation
    const reservationResult = await client.query(
      `INSERT INTO reservations (
        listing_id, recipient_id, quantity_reserved, status, pickup_time
      )
      VALUES ($1, $2, $3, 'pending', $4)
      RETURNING *`,
      [
        req.params.listingId,
        req.user.userId,
        quantityRequested,
        req.body.pickupTime
      ]
    );

    // Update listing quantity and status if fully reserved
    const remainingQuantity = listing.quantity_kg - quantityRequested;
    await client.query(
      `UPDATE food_listings 
       SET quantity_kg = $1, status = $2
       WHERE listing_id = $3`,
      [
        remainingQuantity,
        remainingQuantity === 0 ? 'reserved' : 'available',
        req.params.listingId
      ]
    );

    await client.query('COMMIT');
    res.status(201).json(reservationResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Reservation error:', error);
    res.status(500).json({ error: 'Server error creating reservation' });
  } finally {
    client.release();
  }
});

// Get user's listings (for donors)
router.get('/my-listings', authenticateToken, async (req, res) => {
  try {
    if (req.user.userType !== 'donor') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(
      `SELECT fl.*, 
        fc.name as category_name,
        a.city, a.state,
        COUNT(r.reservation_id) as reservation_count
       FROM food_listings fl
       JOIN food_categories fc ON fl.category_id = fc.category_id
       JOIN addresses a ON fl.address_id = a.address_id
       LEFT JOIN reservations r ON fl.listing_id = r.listing_id
       WHERE fl.donor_id = $1
       GROUP BY fl.listing_id, fc.name, a.city, a.state
       ORDER BY fl.created_at DESC`,
      [req.user.userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch listings error:', error);
    res.status(500).json({ error: 'Server error fetching listings' });
  }
});

// Get user's reservations (for recipients)
router.get('/my-reservations', authenticateToken, async (req, res) => {
  try {
    if (req.user.userType !== 'recipient') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(
      `SELECT r.*,
        fl.title, fl.description,
        u.name as donor_name,
        a.street_address, a.city, a.state
       FROM reservations r
       JOIN food_listings fl ON r.listing_id = fl.listing_id
       JOIN users u ON fl.donor_id = u.user_id
       JOIN addresses a ON fl.address_id = a.address_id
       WHERE r.recipient_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Fetch reservations error:', error);
    res.status(500).json({ error: 'Server error fetching reservations' });
  }
});

// Additional endpoints to add to listings.js

// Update a listing
router.put('/:listingId', authenticateToken, validateListing, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Verify user is a donor
    if (req.user.userType !== 'donor') {
      return res.status(403).json({ error: 'Only donors can update listings' });
    }

    const {
      title,
      description,
      categoryId,
      quantityKg,
      feedsPeople,
      bestBefore,
      addressId
    } = req.body;

    // First check if the listing belongs to this donor
    const ownerCheck = await pool.query(
      'SELECT * FROM food_listings WHERE listing_id = $1 AND donor_id = $2',
      [req.params.listingId, req.user.userId]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found or not authorized' });
    }

    // Check if the listing has any active reservations
    const reservationCheck = await pool.query(
      'SELECT * FROM reservations WHERE listing_id = $1 AND status IN (\'pending\', \'accepted\')',
      [req.params.listingId]
    );

    if (reservationCheck.rows.length > 0 && quantityKg < ownerCheck.rows[0].quantity_kg) {
      return res.status(400).json({ 
        error: 'Cannot reduce quantity below what\'s already reserved' 
      });
    }

    const result = await pool.query(
      `UPDATE food_listings
       SET title = $1,
           description = $2,
           category_id = $3,
           quantity_kg = $4,
           feeds_people = $5,
           best_before = $6,
           address_id = $7,
           updated_at = CURRENT_TIMESTAMP
       WHERE listing_id = $8 AND donor_id = $9
       RETURNING *`,
      [
        title,
        description,
        categoryId,
        quantityKg,
        feedsPeople,
        bestBefore,
        addressId,
        req.params.listingId,
        req.user.userId
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update listing error:', error);
    res.status(500).json({ error: 'Server error updating listing' });
  }
});

// Delete a listing (soft delete)
router.delete('/:listingId', authenticateToken, async (req, res) => {
  try {
    if (req.user.userType !== 'donor') {
      return res.status(403).json({ error: 'Only donors can delete listings' });
    }

    // Check for active reservations
    const reservationCheck = await pool.query(
      'SELECT * FROM reservations WHERE listing_id = $1 AND status IN (\'pending\', \'accepted\')',
      [req.params.listingId]
    );

    if (reservationCheck.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete listing with active reservations' 
      });
    }

    const result = await pool.query(
      `UPDATE food_listings 
       SET status = 'expired',
           updated_at = CURRENT_TIMESTAMP
       WHERE listing_id = $1 AND donor_id = $2
       RETURNING *`,
      [req.params.listingId, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found or not authorized' });
    }

    if (result.rows.length > 0) {
      await esClient.delete({
        index: FOOD_LISTINGS_INDEX,
        id: req.params.listingId
      });
    }

    res.json({ message: 'Listing deleted successfully' });
  } catch (error) {
    console.error('Delete listing error:', error);
    res.status(500).json({ error: 'Server error deleting listing' });
  }
});

// Manage reservations (accept/reject/complete)
router.patch('/reservations/:reservationId/status', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { status } = req.body;
    if (!['accepted', 'declined', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await client.query('BEGIN');

    // Get reservation details
    const reservationResult = await client.query(
      `SELECT r.*, fl.donor_id, fl.quantity_kg
       FROM reservations r
       JOIN food_listings fl ON r.listing_id = fl.listing_id
       WHERE r.reservation_id = $1`,
      [req.params.reservationId]
    );

    if (reservationResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Reservation not found' });
    }

    const reservation = reservationResult.rows[0];

    // Verify authorization
    if (req.user.userType === 'donor' && reservation.donor_id !== req.user.userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not authorized' });
    }

    if (req.user.userType === 'recipient' && reservation.recipient_id !== req.user.userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Update reservation status
    await client.query(
      `UPDATE reservations
       SET status = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE reservation_id = $2`,
      [status, req.params.reservationId]
    );

    // Update listing status if reservation is declined
    if (status === 'declined') {
      await client.query(
        `UPDATE food_listings
         SET quantity_kg = quantity_kg + $1,
             status = 'available',
             updated_at = CURRENT_TIMESTAMP
         WHERE listing_id = $2`,
        [reservation.quantity_reserved, reservation.listing_id]
      );
    }

    await client.query('COMMIT');
    res.json({ message: `Reservation ${status} successfully` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update reservation status error:', error);
    res.status(500).json({ error: 'Server error updating reservation status' });
  } finally {
    client.release();
  }
});

// Get listing details with reservations
router.get('/:listingId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        fl.*,
        fc.name as category_name,
        u.name as donor_name,
        a.street_address,
        a.city,
        a.state,
        a.latitude,
        a.longitude,
        COALESCE(
          json_agg(
            CASE
              WHEN r.reservation_id IS NOT NULL THEN
                json_build_object(
                  'reservation_id', r.reservation_id,
                  'status', r.status,
                  'quantity_reserved', r.quantity_reserved,
                  'pickup_time', r.pickup_time
                )
              ELSE NULL
            END
          ), '[]'
        ) as reservations
      FROM food_listings fl
      JOIN food_categories fc ON fl.category_id = fc.category_id
      JOIN users u ON fl.donor_id = u.user_id
      JOIN addresses a ON fl.address_id = a.address_id
      LEFT JOIN reservations r ON fl.listing_id = r.listing_id
      WHERE fl.listing_id = $1
      GROUP BY fl.listing_id, fc.name, u.name, a.street_address, a.city, a.state, a.latitude, a.longitude`,
      [req.params.listingId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Only show detailed reservation info to the donor
    if (req.user.userType !== 'donor' || result.rows[0].donor_id !== req.user.userId) {
      delete result.rows[0].reservations;
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get listing details error:', error);
    res.status(500).json({ error: 'Server error fetching listing details' });
  }
});

// Get food categories
router.get('/categories', authenticateToken, async (req, res) => {
  try {
      const result = await pool.query('SELECT * FROM food_categories ORDER BY name');
      res.json(result.rows);
  } catch (error) {
      console.error('Error fetching categories:', error);
      res.status(500).json({ error: 'Server error fetching categories' });
  }
});

// Get user addresses
router.get('/addresses', authenticateToken, async (req, res) => {
  try {
      const result = await pool.query(
          'SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC',
          [req.user.userId]
      );
      res.json(result.rows);
  } catch (error) {
      console.error('Error fetching addresses:', error);
      res.status(500).json({ error: 'Server error fetching addresses' });
  }
});

module.exports = router;