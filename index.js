const express = require('express');
const cors = require('cors');

const extractThumbnailRoute = require('./functions/extract-frames');
const uploadRoute = require('./functions/upload-gcs');

const corsOptions = {
    origin: '*', // or '*' to allow all origins
    methods: ['GET', 'POST', 'OPTIONS'], // methods allowed
    allowedHeaders: ['Content-Type', 'Authorization'],
  };
  

const app = express();
app.use(cors(corsOptions));
app.use(express.json({ limit: '150mb' })); // Increase JSON Body limit
app.use(express.urlencoded({ limit: '150mb', extended: true })); // Increase URL-Encoded Body limit

const PORT = 3000; // 443 for HTTPS, 80 for HTTP

// Use the video processing route
app.use('/', extractThumbnailRoute);
app.use('/upload-gcs', uploadRoute);

app.listen(PORT, () => {
    console.log(`Video processing server is running on port ${PORT}`);
});
