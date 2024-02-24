const express = require('express');
const cors = require('cors');

const extractThumbnailRoute = require('./functions/extract-frames');
const uploadRoute = require('./functions/upload-gcs');
const authenticateRequest = require('./middlewares/authMiddleware');

const corsOptions = {
    origin: '*', // or '*' to allow all origins
    methods: ['GET', 'POST', 'OPTIONS'], // methods allowed
    allowedHeaders: ['Content-Type', 'Authorization'],
  };
  

const app = express();
app.use(cors(corsOptions));
app.use((err, req, res, next) => {
    console.error(err.stack); // Log the stack trace for debugging
    res.status(500).send('Something broke!');
});
app.use(express.json({ limit: '150mb' })); // Increase JSON Body limit
app.use(express.urlencoded({ limit: '150mb', extended: true })); // Increase URL-Encoded Body limit

// Apply the authentication middleware to all routes
app.use(authenticateRequest); // Leave out for local requests

const PORT = process.env.PORT || 8080;

// Use the video processing route
app.use('/', extractThumbnailRoute);
app.use('/upload-gcs', uploadRoute);

app.listen(PORT, () => {
    console.log(`Video processing server is running on port ${PORT}`);
});
