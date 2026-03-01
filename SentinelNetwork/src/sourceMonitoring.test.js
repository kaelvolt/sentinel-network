const axios = require('axios');

jest.mock('axios');

describe('Source Monitoring', () => {
  it('should fetch data successfully', async () => {
    const data = { data: { message: 'success' } };
    axios.get.mockResolvedValue(data);

    const response = await axios.get('/some-endpoint');
    expect(response).toEqual(data);
  });
});