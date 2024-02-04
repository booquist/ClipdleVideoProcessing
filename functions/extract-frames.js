const express = require('express');
const router = express.Router();
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
const bucketName = 'clipdle_timeline_thumbnails';

const upload = multer({ dest: 'uploads/' });

router.post('/extract-frames', upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded');
    }

    console.log('File uploaded:', req.file.path); // Confirm file upload

    const videoPath = req.file.path;
    const frameNumber = req.body.frameNumber;
    const uniqueFolder = `thumbnails_${Date.now()}`; // Create a unique folder name

    console.log('Extracting frames from:', videoPath);
    console.log('Requested frame number:', frameNumber);

    const FRAME_PER_SEC = 1;
    const FRAME_WIDTH = 80;

    const outputDir = './extracted_frames';
    const filenamePattern = 'thumb_%04d.png';

    if (!fs.existsSync(outputDir)) {
        console.log('Creating output directory:', outputDir);
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputImagePath = path.join(outputDir, filenamePattern);
    console.log('Output Image Path:', outputImagePath);

    try {
        await new Promise((resolve, reject) => {
            ffmpeg(videoPath) // Use the path of the uploaded file
                .inputOptions('-ss 0')
                .outputOptions([
                    `-vf fps=${FRAME_PER_SEC}/1:round=up,scale=${FRAME_WIDTH}:-2`,
                    `-vframes ${frameNumber}`
                ])
                .on('end', () => {
                    console.log('FFmpeg processing finished');
                    resolve();
                })
                .on('error', (err) => {
                    console.error('FFmpeg error:', err);
                    reject(err);
                })
                .save(outputImagePath);
        });

        // After thumbnails are generated, upload them to GCS
        const frames = [];
        for (let i = 1; i <= frameNumber; i++) {
            const filePath = `${uniqueFolder}/thumb_${String(i).padStart(4, '0')}.png`;
            const destination = `${uniqueFolder}/thumb_${String(i).padStart(4, '0')}.png`;

            // Upload file to GCS
            await storage.bucket(bucketName).upload(filePath, { destination });

            // Assuming public access is set up for the bucket, construct the URL
            const publicUrl = `https://storage.googleapis.com/${bucketName}/${destination}`;
            frames.push(publicUrl);
        }

        if (frames.length === 0) {
            console.log('No frames were extracted');
        }

        res.json({ frames });
    } catch (error) {
        console.error('Error extracting frames:', error);
        res.status(500).send('Error extracting frames: ' + error.message);
    } finally {
        // Optionally, clean up local files
        fs.rmSync(uniqueFolder, { recursive: true, force: true });
    }
});

module.exports = router;
