const express = require("express");
require("dotenv").config();
const Path = require('path')

const app = express();
app.use(express.json());

const uploadRoutes = require("./routes/upload");
app.use(express.static("public"));
app.use("/api", uploadRoutes);


app.get("/", (req, res) => {
    const imagesFilePath = Path.join(__dirname, "public", "index.html");
    res.sendFile(imagesFilePath);
});
app.get("/admin", (req, res) => {
    const adminFile = Path.join(__dirname, "public", "admin.html");
    res.sendFile(adminFile);
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});