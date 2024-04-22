import express from "express";
import colors from "colors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 9000;

app.listen(PORT, console.log(`Server running on port ${PORT}  `.bgBlue));
