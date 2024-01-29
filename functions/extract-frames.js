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
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const fs_1 = __importDefault(require("fs"));
const router = express_1.default.Router();
const upload = (0, multer_1.default)({ dest: 'uploads/' });
router.post('/extract-frames', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
    if (!fs_1.default.existsSync(outputDir)) {
        fs_1.default.mkdirSync(outputDir, { recursive: true });
    }
    console.log('Output Image Path:', outputImagePath); // Log the output path
    try {
        yield new Promise((resolve, reject) => {
            (0, fluent_ffmpeg_1.default)(videoPath) // Use the path of the uploaded file
                .inputOptions('-ss 0')
                .outputOptions([
                `-vf fps=${FRAME_PER_SEC}/1:round=up,scale=${FRAME_WIDTH}:-2`,
                `-vframes ${frameNumber}`
            ])
                .on('end', () => resolve())
                .on('error', (err) => {
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
    }
    catch (error) {
        console.error('Error extracting frames:', error);
        let errorMessage = "";
        res.status(500).send('Error extracting frames: ' + error);
    }
}));
module.exports = router;
