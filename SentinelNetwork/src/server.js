const express = require('express');
const { monitorSources, detectSignals } = require('./index');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/monitor', async (req, res) => {
    await monitorSources();
    res.send('Monitoring sources... Check console for logs.');
});

app.get('/signals', async (req, res) => {
    const signals = await detectSignals([{ relevant: true }, { relevant: false }]);
    res.json(signals);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
