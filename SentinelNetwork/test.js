const { monitorSources, detectSignals } = require('./src/index');

// Test the monitorSources function
monitorSources();

// Test the detectSignals function
const testData = [{ relevant: true }, { relevant: false }];
detectSignals(testData);

// Additional test to verify the functions
if (typeof monitorSources === 'function') {
    console.log('monitorSources is a function.');
} else {
    console.error('monitorSources is not a function.');
}

if (typeof detectSignals === 'function') {
    console.log('detectSignals is a function.');
} else {
    console.error('detectSignals is not a function.');
}

// Jest test cases
describe('monitorSources', () => {
    it('should be a function', () => {
        expect(typeof monitorSources).toBe('function');
    });
});

describe('detectSignals', () => {
    it('should be a function', () => {
        expect(typeof detectSignals).toBe('function');
    });
});

// Define run function here for testing
async function run() {
    const data = await monitorSources();
    const signals = await detectSignals(data);
    console.log('Final detected signals:', signals);
}

describe('run', () => {
    it('should log final detected signals', async () => {
        console.log = jest.fn(); // Mock console.log
        await run();
        expect(console.log).toHaveBeenCalledWith('Final detected signals:', [{ relevant: true }]);
    });
});
