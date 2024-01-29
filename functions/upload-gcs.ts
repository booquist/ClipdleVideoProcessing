import { Storage } from '@google-cloud/storage';
import ffmpeg from 'fluent-ffmpeg';
import { Readable } from 'stream';
import fs from 'fs';
import sharp from 'sharp'; // For image processing
import { v4 as uuidv4 } from 'uuid'; // For generating unique file names
import { exec } from 'child_process';

// Path to your key file
const keyFilePath = './agile-bonbon-403122-7dc5bb47ff54.json'

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

export async function uploadVideoToGCS(file: Express.Multer.File): Promise<{ filename: string, aspectRatio: string }> {

    const filename = `${Date.now()}.mp4`;
    const tmpFilePath = `./tmp_${filename}`; // Temporary file path for input
    const outputTmpFilePath = `./output_tmp_${filename}`; // Temporary file path for output

    try {
        fs.writeFileSync(tmpFilePath, file.buffer); // Writing the buffer to a temporary file
        const thumbnailFilename = await createAndUploadThumbnail(tmpFilePath, filename);

        const metadata: any = await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(tmpFilePath, (err, metadata) => {
                if (err) {
                    return reject(err);
                }
                resolve(metadata);
            });
        });

        const videoStream = metadata.streams.find((s: any) => s.codec_type === 'video');
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


export async function uploadProfilePictureToGCS(file: Express.Multer.File, username: string): Promise<string> {

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
    await new Promise<void>((resolve, reject) => {
        const writeStream = bucketFile.createWriteStream();
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        writeStream.end(processedImage);
    });

    // Uploading the processed thumbnail image to GCS
    await new Promise<void>((resolve, reject) => {
        const writeStream = bucketFileThumbnail.createWriteStream();
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        writeStream.end(processedImage);
    });

    // Return public URL for the uploaded image
    return `https://storage.googleapis.com/${imagesBucketName}/${filename}`;
}

export async function deleteProfilePictureFromGCS(pictureUrl: string): Promise<void> {
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

export async function createAndUploadThumbnail(videoFilePath: string, videoId: string): Promise<string> {
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
