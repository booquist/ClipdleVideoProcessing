const express = require('express');
const cors = require('cors');
const multer = require('multer');

const extractThumbnailRoute = require('./functions/extract-frames');
const uploadRoute = require('./functions/upload-gcs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(multer({ dest: 'uploads/' }).single('video'));

const PORT = process.env.PORT || 3000;

// Use the video processing route
app.use('/', extractThumbnailRoute);
app.use('/', uploadRoute);

app.listen(PORT, () => {
    console.log(`Video processing server is running on port ${PORT}`);
});
