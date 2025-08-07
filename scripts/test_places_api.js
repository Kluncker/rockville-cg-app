// Test script for Google Places API functions
// This tests the API directly without requiring Firebase Admin SDK

// Test queries
const testQueries = [
    "Rockville Town Square",
    "1 Church Street Rockville MD",
    "Starbucks near Rockville",
    "NIH Bethesda",
    "Montgomery College Rockville"
];

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    red: '\x1b[31m',
    cyan: '\x1b[36m'
};

async function testPlacesAPI() {
    console.log(`${colors.bright}${colors.blue}Testing Google Places API Functions${colors.reset}\n`);
    
    // First, set the API key in Firebase config if not already set
    console.log(`${colors.yellow}Note: Make sure you've set the API key with:${colors.reset}`);
    console.log(`firebase functions:config:set google.maps_key="YOUR_API_KEY"\n`);
    
    // Test direct API call (simulating what the function does)
    const { Client } = require('@googlemaps/google-maps-services-js');
    const googleMapsClient = new Client({});
    
    // You'll need to set this to test locally
    const MAPS_API_KEY = process.env.GOOGLE_MAPS_KEY || 'AIzaSyCye3kY42jWrlD4fBO-hQ0j2LyNffRKJ20';
    
    if (!MAPS_API_KEY || MAPS_API_KEY === 'YOUR_API_KEY') {
        console.error(`${colors.red}Error: Google Maps API key not set!${colors.reset}`);
        console.log('Set it with: export GOOGLE_MAPS_KEY="your-key-here"');
        process.exit(1);
    }
    
    for (const query of testQueries) {
        console.log(`\n${colors.cyan}Testing query: "${query}"${colors.reset}`);
        console.log('─'.repeat(50));
        
        try {
            // Test autocomplete
            const response = await googleMapsClient.placeAutocomplete({
                params: {
                    input: query,
                    key: MAPS_API_KEY,
                    location: { lat: 39.0840, lng: -77.1528 }, // Rockville, MD
                    radius: 50000, // 50km
                    components: ["country:us"]
                    // types parameter removed - allows all types
                }
            });
            
            if (response.data.status === 'OK') {
                console.log(`${colors.green}✓ Autocomplete successful${colors.reset}`);
                console.log(`Found ${response.data.predictions.length} suggestions:\n`);
                
                response.data.predictions.slice(0, 3).forEach((prediction, index) => {
                    console.log(`  ${index + 1}. ${colors.bright}${prediction.description}${colors.reset}`);
                    console.log(`     Place ID: ${prediction.place_id}`);
                    if (prediction.structured_formatting) {
                        console.log(`     Main: ${prediction.structured_formatting.main_text}`);
                        console.log(`     Secondary: ${prediction.structured_formatting.secondary_text}`);
                    }
                });
                
                // Test place details for the first result
                if (response.data.predictions.length > 0) {
                    const firstPlaceId = response.data.predictions[0].place_id;
                    console.log(`\n  ${colors.yellow}Testing place details for first result...${colors.reset}`);
                    
                    const detailsResponse = await googleMapsClient.placeDetails({
                        params: {
                            place_id: firstPlaceId,
                            key: MAPS_API_KEY,
                            fields: ["name", "formatted_address", "geometry", "place_id", "url"]
                        }
                    });
                    
                    if (detailsResponse.data.status === 'OK') {
                        const place = detailsResponse.data.result;
                        console.log(`  ${colors.green}✓ Place details retrieved${colors.reset}`);
                        console.log(`    Name: ${place.name}`);
                        console.log(`    Address: ${place.formatted_address}`);
                        if (place.geometry?.location) {
                            console.log(`    Coordinates: ${place.geometry.location.lat}, ${place.geometry.location.lng}`);
                        }
                        if (place.url) {
                            console.log(`    Google Maps URL: ${place.url}`);
                        }
                    }
                }
                
            } else {
                console.log(`${colors.red}✗ API returned status: ${response.data.status}${colors.reset}`);
                if (response.data.error_message) {
                    console.log(`  Error: ${response.data.error_message}`);
                }
            }
            
        } catch (error) {
            console.error(`${colors.red}✗ Error:${colors.reset}`, error.message);
            if (error.response?.data) {
                console.error('API Response:', error.response.data);
            }
        }
    }
    
    console.log(`\n${colors.bright}${colors.green}Test complete!${colors.reset}`);
    console.log('\nNext steps:');
    console.log('1. Deploy the functions: firebase deploy --only functions');
    console.log('2. The frontend can call these functions to get place suggestions');
    process.exit(0);
}

// Run the test
testPlacesAPI().catch(error => {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error);
    process.exit(1);
});
