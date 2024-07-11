import express from "express";
import colors from "colors";
import dotenv from "dotenv";
import { connectDB } from "./config/db.config.js";
import cors from "cors";
import userRoutes from "./routes/user.route.js";
import communityRoutes from "./routes/community.route.js";
import matchesRoutes from "./routes/match.route.js";
import tournamentRoutes from "./routes/tournament.route.js";
import promoRoutes from "./routes/promo.route.js";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

dotenv.config();
connectDB();

const app = express();

app.use(express.json());
app.use(cors());

app.use("/api/v1/users", userRoutes);
app.use("/api/v1/community", communityRoutes);
app.use("/api/v1/matches", matchesRoutes);
app.use("/api/v1/tournaments", tournamentRoutes);
app.use("/api/v1/promos", promoRoutes);

const PORT = process.env.PORT || 9000;

// Define __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.get('/.well-known/assetlinks.json', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'assetlinks.json');
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Error while sending file:', err);
      res.status(500).send('Error occurred while sending file');
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`.bgBlue);
  console.log(`Current environment is ${process.env.ENVIRONMENT}`.bgBlue);
});
