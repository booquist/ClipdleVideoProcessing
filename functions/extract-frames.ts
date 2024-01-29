const express = require('express');
const router = express.Router();
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');

const upload = multer({ dest: 'uploads/' });

router.post('/extract-frames', async (req: { file: { path: any; }; body: { frameNumber: any; }; }, res: { status: (arg0: number) => { (): any; new(): any; send: { (arg0: string): void; new(): any; }; }; json: (arg0: { frames: string[]; }) => void; }) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded');
    }

    const videoPath = req.file.path; // The path to the uploaded video file
    const frameNumber = req.body.frameNumber;

    const FRAME_PER_SEC = 1;
    const FRAME_WIDTH = 80;
    
    const outputDir = './extracted_frames';
    const filenamePattern = 'thumb_%04d.png';
    const outputImagePath = `${outputDir}/${filenamePattern}`;

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log('Output Image Path:', outputImagePath); // Log the output path


    try {
        await new Promise<void>((resolve, reject) => {
            ffmpeg(videoPath) // Use the path of the uploaded file
                .inputOptions('-ss 0')
                .outputOptions([
                    `-vf fps=${FRAME_PER_SEC}/1:round=up,scale=${FRAME_WIDTH}:-2`,
                    `-vframes ${frameNumber}`
                ])
                .on('end', () => resolve())
                .on('error', (err: any) => {
                    console.error('FFmpeg error:', err);
                    reject(err);
                })
                .save(outputImagePath);
        });

        const frames = [];
        for (let i = 0; i < frameNumber; i++) {
            const filePath = outputImagePath.replace('%04d', String(i + 1).padStart(4, '0'));
            frames.push(filePath);
        }

        res.json({ frames });
    } catch (error) {
        console.error('Error extracting frames:', error);
        let errorMessage = "";
        res.status(500).send('Error extracting frames: ' + error);
    }
});

module.exports = router;