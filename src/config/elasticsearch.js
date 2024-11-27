// Create a new file: src/config/elasticsearch.js
const { Client } = require('@elastic/elasticsearch');

const client = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200'
});

// Index name constant
const FOOD_LISTINGS_INDEX = 'food_listings';

// Create index with mappings
async function setupElasticsearch() {
  try {
    const indexExists = await client.indices.exists({
      index: FOOD_LISTINGS_INDEX
    });

    if (!indexExists) {
      await client.indices.create({
        index: FOOD_LISTINGS_INDEX,
        body: {
          settings: {
            analysis: {
              analyzer: {
                food_analyzer: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: [
                    'lowercase',
                    'stop',
                    'snowball',
                    'synonym'
                  ]
                }
              },
              filter: {
                synonym: {
                  type: 'synonym',
                  synonyms: [
                    'vegetable, vegetables, veggies',
                    'fruit, fruits',
                    'bread, breads, baked goods',
                    'meal, food, dish',
                    'soup, broth',
                    'rice, grain'
                  ]
                }
              }
            }
          },
          mappings: {
            properties: {
              listing_id: { type: 'keyword' },
              title: {
                type: 'text',
                analyzer: 'food_analyzer',
                fields: {
                  keyword: { type: 'keyword' }
                }
              },
              description: {
                type: 'text',
                analyzer: 'food_analyzer'
              },
              category_name: {
                type: 'text',
                fields: {
                  keyword: { type: 'keyword' }
                }
              },
              quantity_kg: { type: 'float' },
              feeds_people: { type: 'integer' },
              best_before: { type: 'date' },
              status: { type: 'keyword' },
              location: { type: 'geo_point' },
              donor_name: { type: 'text' },
              created_at: { type: 'date' }
            }
          }
        }
      });
    }

    console.log('Elasticsearch setup completed');
  } catch (error) {
    console.error('Elasticsearch setup error:', error);
    throw error;
  }
}

// Function to index a food listing
// async function indexFoodListing(listing) {
//   try {
//     await client.index({
//       index: FOOD_LISTINGS_INDEX,
//       id: listing.listing_id.toString(),
//       body: {
//         listing_id: listing.listing_id,
//         title: listing.title,
//         description: listing.description,
//         category_name: listing.category_name,
//         quantity_kg: listing.quantity_kg,
//         feeds_people: listing.feeds_people,
//         best_before: listing.best_before,
//         status: listing.status,
//         location: {
//           lat: listing.latitude,
//           lon: listing.longitude
//         },
//         donor_name: listing.donor_name,
//         created_at: listing.created_at
//       }
//     });
//   } catch (error) {
//     console.error('Error indexing listing:', error);
//     throw error;
//   }
// }

// Also update the indexing function to ensure proper text analysis
async function indexFoodListing(listing) {
  try {
    const document = {
      listing_id: listing.listing_id,
      title: listing.title,
      description: listing.description,
      category_name: listing.category_name,
      quantity_kg: listing.quantity_kg,
      feeds_people: listing.feeds_people,
      best_before: listing.best_before,
      status: listing.status,
      location: listing.latitude && listing.longitude ? {
        lat: listing.latitude,
        lon: listing.longitude
      } : undefined,
      donor_name: listing.donor_name,
      created_at: listing.created_at
    };

    console.log('Indexing document:', document);

    await client.index({
      index: FOOD_LISTINGS_INDEX,
      id: listing.listing_id.toString(),
      document: document,
      refresh: true // Ensure the document is immediately searchable
    });
  } catch (error) {
    console.error('Error indexing listing:', error);
    throw error;
  }
}

// Add a function to verify the index contents
async function verifyIndexContents() {
  try {
    const result = await client.search({
      index: FOOD_LISTINGS_INDEX,
      query: { match_all: {} }
    });
    
    console.log('Index contents:', {
      total: result.hits.total.value,
      samples: result.hits.hits.slice(0, 3).map(hit => ({
        id: hit._id,
        title: hit._source.title,
        description: hit._source.description
      }))
    });
  } catch (error) {
    console.error('Error verifying index:', error);
  }
}

// Function to sync existing listings from PostgreSQL to Elasticsearch
async function syncListingsToElasticsearch(pool) {
  try {
    const { rows } = await pool.query(`
      SELECT 
        fl.*,
        fc.name as category_name,
        u.name as donor_name,
        a.latitude,
        a.longitude
      FROM food_listings fl
      JOIN food_categories fc ON fl.category_id = fc.category_id
      JOIN users u ON fl.donor_id = u.user_id
      JOIN addresses a ON fl.address_id = a.address_id
      WHERE fl.status = 'available'
    `);

    for (const listing of rows) {
      await indexFoodListing(listing);
    }

    console.log(`Synced ${rows.length} listings to Elasticsearch`);
  } catch (error) {
    console.error('Error syncing listings:', error);
    throw error;
  }
}

module.exports = {
  client,
  setupElasticsearch,
  indexFoodListing,
  syncListingsToElasticsearch,
  FOOD_LISTINGS_INDEX
};
