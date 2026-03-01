const { monitorSources, detectSignals } = require('./src/index');

// Test the monitorSources function
monitorSources();

// Test the detectSignals function
detectSignals();

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