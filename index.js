const express = require('express');
const cors = require('cors');

const extractThumbnailRoute = require('./functions/extract-frames');
const uploadRoute = require('./functions/upload-gcs');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 443; // 443 for HTTPS, 80 for HTTP

// Use the video processing route
app.use('/extract-frames', extractThumbnailRoute);
app.use('/upload-gcs', uploadRoute);

app.listen(PORT, () => {
    console.log(`Video processing server is running on port ${PORT}`);
});
