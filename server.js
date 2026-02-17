const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8080;

app.use((req, res, next) => {
    res.setHeader('Referrer-Policy', 'origin');
    next();
});

app.get('/', (req, res) => {
    const videoId = req.query.v || 'vncJqnVBcHA';
    const origin = req.protocol + '://' + req.get('host');
    
    let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    html = html.replace('VIDEO_ID_PLACEHOLDER', videoId);
    html = html.replace('ORIGIN_PLACEHOLDER', origin);
    
    res.send(html);
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Try: http://localhost:${PORT}?v=dQw4w9WgXcQ`);
});
