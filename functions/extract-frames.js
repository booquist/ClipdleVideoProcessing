const express = require('express');
const router = express.Router();
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

const upload = multer({ dest: 'uploads/' });

router.post('/extract-frames', upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded');
    }

    console.log('File uploaded:', req.file.path); // Confirm file upload

    const videoPath = req.file.path; // The path to the uploaded video file
    const frameNumber = req.body.frameNumber;

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

        const frames = [];
        for (let i = 1; i <= frameNumber; i++) {
            const filePath = outputImagePath.replace('%04d', String(i).padStart(4, '0'));
            if (fs.existsSync(filePath)) {
                console.log(`Frame ${i} exists at: ${filePath}`);
                frames.push(filePath);
            } else {
                console.log(`Frame ${i} missing at: ${filePath}`);
            }
        }

        if (frames.length === 0) {
            console.log('No frames were extracted');
        }

        res.json({ frames });
    } catch (error) {
        console.error('Error extracting frames:', error);
        res.status(500).send('Error extracting frames: ' + error.message);
    }
});

module.exports = router;
