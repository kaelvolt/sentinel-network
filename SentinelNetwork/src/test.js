const { monitorSources, detectSignals, runMonitoring } = require('./index');

// Mocking axios for testing
jest.mock('axios');
const axios = require('axios');

describe('Sentinel Network Tests', () => {
    test('monitorSources fetches data', async () => {
        const data = [{ relevant: true }, { relevant: false }];
        axios.get.mockResolvedValue({ data });
        await monitorSources();
        expect(axios.get).toHaveBeenCalledWith('https://api.example.com/data');
    });

    test('detectSignals filters relevant signals', () => {
        const data = [{ relevant: true }, { relevant: false }];
        const signals = detectSignals(data);
        expect(signals).toEqual([{ relevant: true }]);
    });

    test('runMonitoring orchestrates monitoring and detection', async () => {
        const data = [{ relevant: true }, { relevant: false }];
        axios.get.mockResolvedValue({ data });
        await runMonitoring();
        expect(axios.get).toHaveBeenCalled();
    });
});