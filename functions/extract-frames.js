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

    // Ensure local directory for FFmpeg output exists
    const localOutputDir = path.join(__dirname, 'extracted_frames', uniqueFolder);
    if (!fs.existsSync(localOutputDir)) {
        fs.mkdirSync(localOutputDir, { recursive: true });
    }

    try {
        const frames = [];

        // Assuming a constant framerate for simplicity
        const selectOption = `select=not(mod(n\\,10))`; // For example, take a frame every 10 frames
        const scaleOption = `scale=-1:120`; // For example, scale the height to 120px and keep aspect ratio

        for (let i = 1; i <= frameNumber; i++) {
            const outputFilename = `thumb_${String(i).padStart(4, '0')}.png`;
            const outputPath = path.join(localOutputDir, outputFilename);

            await new Promise((resolve, reject) => {
                ffmpeg(videoPath)
                    .outputOptions([`-vf ${selectOption},${scaleOption}`, `-vframes 1`])
                    .output(outputPath)
                    .on('end', () => resolve(outputPath))
                    .on('error', (err) => reject(err))
                    .run();
            });

            // Upload each thumbnail to GCS
            const destination = `${uniqueFolder}/${outputFilename}`;
            await storage.bucket(bucketName).upload(outputPath, { destination });

            // Assuming public access, construct URL for each uploaded thumbnail
            const publicUrl = `https://storage.googleapis.com/${bucketName}/${destination}`;
            frames.push(publicUrl);
        }

        res.json({ frames });
    } catch (error) {
        console.error('Error processing video:', error);
        res.status(500).send('Error processing video');
    } finally {
        // Clean up local directory
        fs.rmSync(localOutputDir, { recursive: true, force: true });
    }
});

module.exports = router;
