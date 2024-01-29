"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAndUploadThumbnail = exports.deleteProfilePictureFromGCS = exports.uploadProfilePictureToGCS = exports.uploadVideoToGCS = void 0;
const storage_1 = require("@google-cloud/storage");
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const fs_1 = __importDefault(require("fs"));
const sharp_1 = __importDefault(require("sharp")); // For image processing
const child_process_1 = require("child_process");
// Path to your key file
const keyFilePath = './agile-bonbon-403122-7dc5bb47ff54.json';
const gcStorage = new storage_1.Storage({ keyFilename: keyFilePath });
const videosBucketName = 'clipdle_temp_videos';
const imagesBucketName = 'clipdle-profile-pics';
const thumbnailBucketName = 'clipdle_videos_thumbnails';
function logFFmpegVersion() {
    (0, child_process_1.exec)('ffmpeg -version', (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return;
        }
        if (stderr) {
            console.error(`stderr: ${stderr}`);
        }
    });
}
function uploadVideoToGCS(file) {
    return __awaiter(this, void 0, void 0, function* () {
        const filename = `${Date.now()}.mp4`;
        const tmpFilePath = `./tmp_${filename}`; // Temporary file path for input
        const outputTmpFilePath = `./output_tmp_${filename}`; // Temporary file path for output
        try {
            fs_1.default.writeFileSync(tmpFilePath, file.buffer); // Writing the buffer to a temporary file
            const thumbnailFilename = yield createAndUploadThumbnail(tmpFilePath, filename);
            const metadata = yield new Promise((resolve, reject) => {
                fluent_ffmpeg_1.default.ffprobe(tmpFilePath, (err, metadata) => {
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
            yield new Promise((resolve, reject) => {
                (0, fluent_ffmpeg_1.default)()
                    .on('stderr', console.error)
                    .input(tmpFilePath)
                    .outputOptions([
                    '-b:v 2M', // Set bitrate to 2 Mbps
                    '-crf 28', // Set constant rate factor to 28
                    '-r 30', // Set frame rate to 30 fps
                    '-c:v libx264', // Use H.264 codec for faster processing
                    '-c:a aac', // Use AAC for audio
                    '-b:a 128k', // Set audio bitrate to 128 kbps
                    '-strict -2' // Necessary for some versions of FFmpeg
                ])
                    .toFormat('mp4')
                    .on('end', resolve)
                    .on('error', reject)
                    .save(outputTmpFilePath);
            });
            const bucketFile = gcStorage.bucket(videosBucketName).file(filename);
            yield new Promise((resolve, reject) => {
                fs_1.default.createReadStream(outputTmpFilePath)
                    .pipe(bucketFile.createWriteStream())
                    .on('finish', resolve)
                    .on('error', reject);
            });
            return { filename, aspectRatio };
        }
        catch (err) {
            console.error('Error during video processing:', err);
            throw err; // Rethrow the error to be handled by the caller
        }
        finally {
            // Clean up temporary files
            if (fs_1.default.existsSync(tmpFilePath))
                fs_1.default.unlinkSync(tmpFilePath);
            if (fs_1.default.existsSync(outputTmpFilePath))
                fs_1.default.unlinkSync(outputTmpFilePath);
        }
    });
}
exports.uploadVideoToGCS = uploadVideoToGCS;
function uploadProfilePictureToGCS(file, username) {
    return __awaiter(this, void 0, void 0, function* () {
        const filename = username + ".jpeg";
        const thumbnail_filename = username + "_thumbnail.jpeg";
        // Process the image: resize and compress using sharp
        const processedImage = yield (0, sharp_1.default)(file.buffer)
            .resize(256, 256) // Resize to 256x256 pixels
            .jpeg({ quality: 80 }) // Compress with 80% quality
            .toBuffer();
        const processedImageThumbnail = yield (0, sharp_1.default)(file.buffer)
            .resize(64, 64) // Resize to 256x256 pixels
            .jpeg({ quality: 80 }) // Compress with 80% quality
            .toBuffer();
        const bucketFile = gcStorage.bucket(imagesBucketName).file(filename);
        const bucketFileThumbnail = gcStorage.bucket(imagesBucketName).file(thumbnail_filename);
        // Uploading the processed image to GCS
        yield new Promise((resolve, reject) => {
            const writeStream = bucketFile.createWriteStream();
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
            writeStream.end(processedImage);
        });
        // Uploading the processed thumbnail image to GCS
        yield new Promise((resolve, reject) => {
            const writeStream = bucketFileThumbnail.createWriteStream();
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
            writeStream.end(processedImage);
        });
        // Return public URL for the uploaded image
        return `https://storage.googleapis.com/${imagesBucketName}/${filename}`;
    });
}
exports.uploadProfilePictureToGCS = uploadProfilePictureToGCS;
function deleteProfilePictureFromGCS(pictureUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!pictureUrl)
            return;
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
            yield file.delete();
        }
        catch (error) {
            console.error('Failed to delete profile picture from GCS:', error);
            // Consider whether you want to rethrow the error or handle it here
            throw error;
        }
    });
}
exports.deleteProfilePictureFromGCS = deleteProfilePictureFromGCS;
function createAndUploadThumbnail(videoFilePath, videoId) {
    return __awaiter(this, void 0, void 0, function* () {
        // Generate a unique filename for the thumbnail
        const thumbnailFilename = `${videoId}_thumbnail.jpeg`;
        return new Promise((resolve, reject) => {
            // Extract a frame from the video using ffmpeg
            (0, fluent_ffmpeg_1.default)(videoFilePath)
                .on('end', () => __awaiter(this, void 0, void 0, function* () {
                const thumbnailFilePath = `./tmp/${thumbnailFilename}`;
                try {
                    // Resize and convert the image to jpeg using sharp
                    yield (0, sharp_1.default)(`./tmp/${videoId}.png`)
                        .resize(256, 256) // Resize to 256x256 pixels
                        .toFormat('jpeg')
                        .toFile(thumbnailFilePath);
                    // Upload the thumbnail to Google Cloud Storage
                    yield gcStorage.bucket(thumbnailBucketName).upload(thumbnailFilePath);
                    // Clean up temporary files
                    fs_1.default.unlinkSync(`./tmp/${videoId}.png`);
                    fs_1.default.unlinkSync(thumbnailFilePath);
                    // Resolve the promise with the filename of the uploaded thumbnail
                    resolve(thumbnailFilename);
                }
                catch (err) {
                    // Clean up temporary files in case of error
                    fs_1.default.unlinkSync(`./tmp/${videoId}.png`);
                    if (fs_1.default.existsSync(thumbnailFilePath)) {
                        fs_1.default.unlinkSync(thumbnailFilePath);
                    }
                    reject(err);
                }
            }))
                .on('error', (err) => {
                reject(err);
            })
                .screenshots({
                count: 1,
                folder: './tmp',
                filename: `${videoId}.png`
            });
        });
    });
}
exports.createAndUploadThumbnail = createAndUploadThumbnail;
