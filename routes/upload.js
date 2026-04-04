const express = require("express");
const multer = require("multer");
const { PutObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const sharp = require("sharp");
const s3 = require("../config/s3");

const router = express.Router();

// store file in memory (needed for sharp)
const upload = multer({ storage: multer.memoryStorage() });


// 📤 Upload API (original + thumbnail)
router.post("/upload", upload.single("image"), async (req, res) => {
    try {
        const file = req.file;
        const fileName = `${Date.now()}-${file.originalname}`;

        // 👉 Upload ORIGINAL
        await s3.send(new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `original/${fileName}`,
            Body: file.buffer,
            ContentType: file.mimetype,
            ACL: "public-read"
        }));

        // 👉 Create THUMBNAIL (resize)
        const thumbnailBuffer = await sharp(file.buffer)
            .resize(200, 200) // thumbnail size
            .toBuffer();

        // 👉 Upload THUMBNAIL
        await s3.send(new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `thumbnails/${fileName}`,
            Body: thumbnailBuffer,
            ContentType: file.mimetype,
            ACL: "public-read"
        }));

        res.json({
            message: "Uploaded with thumbnail",
            original: `original/${fileName}`,
            thumbnail: `thumbnails/${fileName}`
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// 📥 Get all thumbnails
router.get("/thumbnails", async (req, res) => {
    try {
        const data = await s3.send(new ListObjectsV2Command({
            Bucket: process.env.AWS_BUCKET_NAME,
            Prefix: "thumbnails/"
        }));

        // ✅ Filter out folder & invalid files
        const images = (data.Contents || [])
            .filter(item => item.Key !== "thumbnails/") // remove folder
            .map(item => {
                const fileName = item.Key.replace("thumbnails/", "");

                return {
                    thumbnailUrl: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${item.Key}`,
                    originalUrl: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/original/${fileName}`
                };
            });

        res.json(images);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;