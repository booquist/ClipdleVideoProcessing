const express = require('express');
const router = express.Router();
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
const bucketName = 'clipdle_timeline_thumbnails';
const uuid = require('uuid');

const upload = multer({ dest: 'uploads/' });

router.post('/extract-frames', upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded');
    }

    const videoPath = req.file.path;
    const frameNumber = parseInt(req.body.frameNumber || "0", 10);
    const uniqueFolder = `thumbnails_${uuid.v4()}`;

    // Get video duration
    let videoDuration = 0;
    try {
        await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(videoPath, (err, metadata) => {
                if (err) reject(err);
                videoDuration = metadata.format.duration;
                resolve();
            });
        });
    } catch (error) {
        console.error('Error getting video duration:', error);
        return res.status(500).send('Failed to get video duration');
    }

    const interval = videoDuration / frameNumber; // Calculate interval between frames

    const frames = [];
    try {
        for (let i = 0; i < frameNumber; i++) {
            const timestamp = i * interval;
            const outputFilename = `thumb_${String(i + 1).padStart(4, '0')}.png`;
            const outputPath = path.join('/tmp', outputFilename); // Temporarily store in /tmp

            await new Promise((resolve, reject) => {
                ffmpeg(videoPath)
                    .seekInput(timestamp)
                    .outputFrames(1)
                    .output(outputPath)
                    .on('end', () => resolve())
                    .on('error', (err) => reject(err))
                    .run();
            });

            // Upload each thumbnail to GCS
            const destination = `${uniqueFolder}/${outputFilename}`;
            await storage.bucket(bucketName).upload(outputPath, { destination });

            // Assuming public access, construct URL for each uploaded thumbnail
            const publicUrl = `https://storage.googleapis.com/${bucketName}/${destination}`;
            frames.push(publicUrl);

            // Clean up local file
            fs.unlinkSync(outputPath);
        }

        res.json({ frames });
    } catch (error) {
        console.error('Error processing video:', error);
        res.status(500).send('Error processing video');
    }
});

module.exports = router;
