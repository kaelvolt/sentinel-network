const { monitorSources } = require('./src/index');

// Test the monitorSources function
monitorSources();

// Additional test to verify the function
if (typeof monitorSources === 'function') {
    console.log('monitorSources is a function.');
} else {
    console.error('monitorSources is not a function.');
}

// Jest test case
describe('monitorSources', () => {
    it('should be a function', () => {
        expect(typeof monitorSources).toBe('function');
    });
});