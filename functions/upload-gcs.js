const { Storage } = require('@google-cloud/storage');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { exec } = require('child_process');
const express = require('express');
const router = express.Router();

const keyFilePath = './agile-bonbon-403122-7dc5bb47ff54.json';
const gcStorage = new Storage({ keyFilename: keyFilePath });

const videosBucketName = 'clipdle_temp_videos';
const imagesBucketName = 'clipdle-profile-pics';
const thumbnailBucketName = 'clipdle_videos_thumbnails';

function logFFmpegVersion() {
    exec('ffmpeg -version', (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return;
        }
        if (stderr) {
            console.error(`stderr: ${stderr}`);
        }
    });
}

async function uploadVideoToGCS(file) {

    const filename = `${Date.now()}.mp4`;
    const tmpFilePath = `./tmp_${filename}`; // Temporary file path for input
    const outputTmpFilePath = `./output_tmp_${filename}`; // Temporary file path for output

    try {
        fs.writeFileSync(tmpFilePath, file.buffer); // Writing the buffer to a temporary file
        const thumbnailFilename = await createAndUploadThumbnail(tmpFilePath, filename);

        const metadata = await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(tmpFilePath, (err, metadata) => {
                if (err) {
                    return reject(err);
                }
                resolve(metadata);
            });
        });

        const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
        if (!videoStream) {
            throw new Error('No video stream found');
        }

        const aspectRatio = `${videoStream.width}:${videoStream.height}`;

        await new Promise((resolve, reject) => {
            ffmpeg()
                .on('stderr', console.error)
                .input(tmpFilePath)
                .outputOptions([
                    '-b:v 2M',           // Set bitrate to 2 Mbps
                    '-crf 28',           // Set constant rate factor to 28
                    '-r 30',             // Set frame rate to 30 fps
                    '-c:v libx264',      // Use H.264 codec for faster processing
                    '-c:a aac',          // Use AAC for audio
                    '-b:a 128k',         // Set audio bitrate to 128 kbps
                    '-strict -2'         // Necessary for some versions of FFmpeg

                ])
                .toFormat('mp4')
                .on('end', resolve)
                .on('error', reject)
                .save(outputTmpFilePath);
        });

        const bucketFile = gcStorage.bucket(videosBucketName).file(filename);
        await new Promise((resolve, reject) => {
            fs.createReadStream(outputTmpFilePath)
                .pipe(bucketFile.createWriteStream())
                .on('finish', resolve)
                .on('error', reject);
        });

        return { filename, aspectRatio };
    } catch (err) {
        console.error('Error during video processing:', err);
        throw err; // Rethrow the error to be handled by the caller
    } finally {
        // Clean up temporary files
        if (fs.existsSync(tmpFilePath)) fs.unlinkSync(tmpFilePath);
        if (fs.existsSync(outputTmpFilePath)) fs.unlinkSync(outputTmpFilePath);
    }
}


async function uploadProfilePictureToGCS(file, username) {

    const filename = username + ".jpeg";
    const thumbnail_filename = username + "_thumbnail.jpeg";

    // Process the image: resize and compress using sharp
    const processedImage = await sharp(file.buffer)
        .resize(256, 256) // Resize to 256x256 pixels
        .jpeg({ quality: 80 }) // Compress with 80% quality
        .toBuffer();

    const processedImageThumbnail = await sharp(file.buffer)
        .resize(64, 64) // Resize to 256x256 pixels
        .jpeg({ quality: 80 }) // Compress with 80% quality
        .toBuffer();

    const bucketFile = gcStorage.bucket(imagesBucketName).file(filename);
    const bucketFileThumbnail = gcStorage.bucket(imagesBucketName).file(thumbnail_filename);

    // Uploading the processed image to GCS
    await new Promise((resolve, reject) => {
        const writeStream = bucketFile.createWriteStream();
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        writeStream.end(processedImage);
    });

    // Uploading the processed thumbnail image to GCS
    await new Promise((resolve, reject) => {
        const writeStream = bucketFileThumbnail.createWriteStream();
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        writeStream.end(processedImageThumbnail); // Note: This should be processedImageThumbnail, not processedImage
    });

    // Return public URL for the uploaded image
    return `https://storage.googleapis.com/${imagesBucketName}/${filename}`;
}

async function deleteProfilePictureFromGCS(pictureUrl) {
    if (!pictureUrl) return;

    try {
        // Extract the filename from the URL
        const filename = pictureUrl.split('/').pop();

        // If filename is not found or URL is incorrect, throw an error
        if (!filename) {
            throw new Error('Invalid picture URL');
        }

        // Get a reference to the file in the bucket
        const file = gcStorage.bucket(imagesBucketName).file(filename);

        // Deletes the file from the bucket
        await file.delete();
    } catch (error) {
        console.error('Failed to delete profile picture from GCS:', error);
        // Consider whether you want to rethrow the error or handle it here
        throw error;
    }
}

async function createAndUploadThumbnail(videoFilePath, videoId) {
    // Generate a unique filename for the thumbnail
    const thumbnailFilename = `${videoId}_thumbnail.jpeg`;

    return new Promise((resolve, reject) => {
        // Extract a frame from the video using ffmpeg
        ffmpeg(videoFilePath)
            .on('end', async () => {
                const thumbnailFilePath = `./tmp/${thumbnailFilename}`;

                try {
                    // Resize and convert the image to jpeg using sharp
                    await sharp(`./tmp/${videoId}.png`)
                        .resize(256, 256) // Resize to 256x256 pixels
                        .toFormat('jpeg')
                        .toFile(thumbnailFilePath);

                    // Upload the thumbnail to Google Cloud Storage
                    await gcStorage.bucket(thumbnailBucketName).upload(thumbnailFilePath);

                    // Clean up temporary files
                    fs.unlinkSync(`./tmp/${videoId}.png`);
                    fs.unlinkSync(thumbnailFilePath);

                    // Resolve the promise with the filename of the uploaded thumbnail
                    resolve(thumbnailFilename);
                } catch (err) {
                    // Clean up temporary files in case of error
                    fs.unlinkSync(`./tmp/${videoId}.png`);
                    if (fs.existsSync(thumbnailFilePath)) {
                        fs.unlinkSync(thumbnailFilePath);
                    }
                    reject(err);
                }
            })
            .on('error', (err) => {
                reject(err);
            })
            .screenshots({
                count: 1,
                folder: './tmp',
                filename: `${videoId}.png`
            });
    });
}

// Function to handle video uploads
async function handleVideoUpload(req, res) {
    try {
        const file = req.file; // Assuming file is passed in request
        const response = await uploadVideoToGCS(file);
        res.json(response);
    } catch (error) {
        console.error('Error in handleVideoUpload:', error);
        res.status(500).send('Internal server error');
    }
}

// Function to handle profile picture uploads
async function handleProfilePictureUpload(req, res) {
    try {
        const file = req.file; // Assuming file is passed in request
        const username = req.body.username; // Assuming username is passed in request body
        const url = await uploadProfilePictureToGCS(file, username);
        res.json({ url });
    } catch (error) {
        console.error('Error in handleProfilePictureUpload:', error);
        res.status(500).send('Internal server error');
    }
}

// Define your routes
uploadGcsRouter.post('/upload-video', handleVideoUpload);
uploadGcsRouter.post('/upload-profile-picture', handleProfilePictureUpload);

// Export the uploadGcsRouter
module.exports = uploadGcsRouter;