const axios = require('axios');

async function monitorSources() {
    console.log('Monitoring sources...');
    // Mocked data for testing
    const mockResponse = { data: [{ relevant: true }, { relevant: false }] };
    try {
        // Simulate fetching data from an API
        const response = mockResponse; // Replace axios.get with mock data
        console.log('Data fetched:', response.data);
        return response.data; // Return data for further processing
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

async function detectSignals(data) {
    console.log('Detecting signals...');
    if (!data) return []; // Handle undefined data
    const signals = data.filter(item => item.relevant);
    console.log('Detected signals:', signals);
    return signals; // Return signals for testing
}

module.exports = { monitorSources, detectSignals };

console.log('Sentinel Network is running');

// New functionality to monitor and detect signals
async function run() {
    const data = await monitorSources();
    const signals = await detectSignals(data);
    console.log('Final detected signals:', signals);
}

run();
