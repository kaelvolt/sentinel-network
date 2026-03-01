import axios from 'axios';

// List of sources to monitor
const sources = [
    'https://api.example.com/data', // Example API
    'https://another-source.com/info' // Another example
];

// Function to fetch data from sources
const fetchData = async () => {
    const results = [];
    for (const source of sources) {
        try {
            const response = await axios.get(source);
            results.push(response.data);
        } catch (error) {
            console.error(`Error fetching from ${source}:`, error.message);
        }
    }
    return results;
};

export { fetchData };