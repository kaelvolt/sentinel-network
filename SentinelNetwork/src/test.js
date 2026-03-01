const { monitorSources, detectSignals } = require('./index');

// Mock data for testing
const mockData = [
    { relevant: true },
    { relevant: false },
    { relevant: true },
];

// Test for monitorSources function
test('monitorSources should log data fetching', async () => {
    console.log = jest.fn(); // Mock console.log
    await monitorSources();
    expect(console.log).toHaveBeenCalledWith('Monitoring sources...');
});

// Test for detectSignals function
test('detectSignals should return relevant signals', async () => {
    const signals = await detectSignals(mockData);
    expect(signals).toEqual([{ relevant: true }, { relevant: true }]);
});
