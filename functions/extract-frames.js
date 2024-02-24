const express = require('express');
const router = express.Router();
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const keyFilePath = './agile-bonbon-403122-7dc5bb47ff54.json';
const gcStorage = new Storage({ keyFilename: keyFilePath });
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
    const localOutputDir = path.join('/tmp', uniqueFolder); // Use /tmp for temporary storage
    if (!fs.existsSync(localOutputDir)) {
        fs.mkdirSync(localOutputDir, { recursive: true });
    }

    try {
        // Get video duration
        const metadata = await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(videoPath, (err, metadata) => {
                if (err) return reject(err);
                resolve(metadata);
            });
        });

        const videoDuration = metadata.format.duration;
        const interval = videoDuration / frameNumber;

        const frames = [];
        for (let i = 0; i < frameNumber; i++) {
            const timestamp = interval * i;
            const outputFilename = `thumb_${String(i + 1).padStart(4, '0')}.png`;
            const outputPath = path.join(localOutputDir, outputFilename);

            await new Promise((resolve, reject) => {
                ffmpeg(videoPath)
                    .seekInput(timestamp)
                    .outputOption('-vframes', '1') // Capture only 1 frame
                    .outputOption('-q:v', '2') // Specify the quality of the output
                    .output(outputPath)
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
            });

            // Upload the thumbnail to GCS
            await gcStorage.bucket(bucketName).upload(outputPath, {
                destination: `${uniqueFolder}/${outputFilename}`,
            });

            const publicUrl = `https://storage.googleapis.com/${bucketName}/${uniqueFolder}/${outputFilename}`;
            frames.push(publicUrl);

            // Optionally, remove the local file after upload
            fs.unlinkSync(outputPath);
        }

        res.json({ frames });
    } catch (error) {
        console.error('Error processing video:', error);
        res.status(500).send('Error processing video');
    } finally {
        // Optionally, clean up the local output directory
        fs.rmdirSync(localOutputDir, { recursive: true });
    }
});

module.exports = router;
