const express = require("express");
const multer = require("multer");
const { PutObjectCommand, ListObjectsV2Command, GetObjectCommand } = require("@aws-sdk/client-s3");

const sharp = require("sharp");
const s3 = require("../config/s3");

const router = express.Router();
const upload = multer({
    storage: multer.memoryStorage(),
    // limits: { fileSize: 5 * 1024 * 1024 }
});

router.post("/upload", upload.array("images", 10), async (req, res) => {
    try {
        const files = req.files;

        for (const file of files) {
            const fileName = `${Date.now()}-${file.originalname}`;

            // original
            await s3.send(new PutObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: `original/${fileName}`,
                Body: file.buffer,
                ContentType: file.mimetype,
                ACL: "public-read"
            }));

            // thumbnail
            const thumb = await sharp(file.buffer).resize(200, 200).toBuffer();

            await s3.send(new PutObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: `thumbnails/${fileName}`,
                Body: thumb,
                ContentType: file.mimetype,
                ACL: "public-read"
            }));
        }

        res.json({ message: "All files uploaded" });

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

module.exports = router;