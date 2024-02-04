const express = require('express');
const router = express.Router();
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
const bucketName = 'clipdle_timeline_thumbnails';

// Configure multer for file upload
const upload = multer({ dest: 'uploads/' });

router.post('/extract-frames', upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded');
    }

    const videoPath = req.file.path;
    const frameNumber = req.body.frameNumber;
    const uniqueFolder = `thumbnails_${Date.now()}`; // Create a unique folder name

    try {
        await new Promise((resolve, reject) => {
            ffmpeg(videoPath)
                .inputOptions('-ss 0')
                .outputOptions([`-vf fps=1,scale=${FRAME_WIDTH}:-2`, `-vframes ${frameNumber}`])
                .on('end', async () => {
                    console.log('FFmpeg processing finished');
                    resolve();
                })
                .on('error', (err) => {
                    console.error('FFmpeg error:', err);
                    reject(err);
                })
                .save(`${uniqueFolder}/thumb_%04d.png`);
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

        // Respond with the URLs of the uploaded frames
        res.json({ frames });
    } catch (error) {
        console.error('Error processing video:', error);
        res.status(500).send('Error processing video: ' + error.message);
    } finally {
        // Optionally, clean up local files
        fs.rmSync(uniqueFolder, { recursive: true, force: true });
    }
});

module.exports = router;
