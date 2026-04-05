const express = require("express");
const multer = require("multer");
const { PutObjectCommand, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const sharp = require("sharp");
const s3 = require("../config/s3");

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    // limits: { fileSize: 5 * 1024 * 1024 }
});

router.post("/process-image", async (req, res) => {
    try {
        const { key } = req.body;

        // 1. Get uploaded file
        const data = await s3.send(new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key
        }));

        const chunks = [];
        for await (const chunk of data.Body) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        const fileName = key.split("/").pop().split(".")[0];

        // 🟡 OPTIMIZED (MAIN IMAGE)
        const optimized = await sharp(buffer)
            .webp({ quality: 80 })
            .toBuffer();

        // 🟢 THUMBNAIL
        const thumbnail = await sharp(buffer)
            .resize(200)
            .webp({ quality: 60 })
            .toBuffer();

        // upload optimized
        await s3.send(new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `optimized/${fileName}.webp`,
            Body: optimized,
            ContentType: "image/webp",
            ACL: "public-read"
        }));

        // upload thumbnail
        await s3.send(new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `thumbnails/${fileName}.webp`,
            Body: thumbnail,
            ContentType: "image/webp",
            ACL: "public-read"
        }));

        // 🧹 DELETE original upload (IMPORTANT)
        await s3.send(new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key
        }));

        res.json({ message: "Processed successfully" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get("/thumbnails", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;

        const data = await s3.send(new ListObjectsV2Command({
            Bucket: process.env.AWS_BUCKET_NAME,
            Prefix: "thumbnails/"
        }));

        const filtered = (data.Contents || [])
            .filter(item => item.Key && !item.Key.endsWith("/"));

        const start = (page - 1) * limit;
        const paginated = filtered.slice(start, start + limit);

        const images = paginated.map(item => {
            const fileName = item.Key.replace("thumbnails/", "").replace(".webp", "");

            return {
                thumbnailUrl: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${item.Key}`,
                originalUrl: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/optimized/${fileName}.webp`
            };
        });

        res.json(images);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get("/download", async (req, res) => {
    try {
        const key = req.query.key;

        const command = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key
        });

        const data = await s3.send(command);

        res.setHeader("Content-Disposition", `attachment; filename="${key.split('/').pop()}"`);
        res.setHeader("Content-Type", data.ContentType);

        data.Body.pipe(res);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/get-upload-url", async (req, res) => {
    try {
        const { fileName } = req.body;

        const key = `uploads/${Date.now()}-${fileName}`;

        const command = new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key
        });

        const url = await getSignedUrl(s3, command, { expiresIn: 60 });

        res.json({ uploadUrl: url, key });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;