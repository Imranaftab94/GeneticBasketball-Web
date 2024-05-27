import express from "express";
import colors from "colors";
import dotenv from "dotenv";
import { connectDB } from "./config/db.config.js";
import cors from "cors";
import userRoutes from "./routes/user.route.js";
import communityRoutes from "./routes/community.route.js";
import matchesRoutes from "./routes/match.route.js";
import tournamentRoutes from "./routes/tournament.route.js";

dotenv.config();
connectDB();

const app = express();

app.use(express.json());
app.use(cors());

app.use("/api/v1/users", userRoutes);
app.use("/api/v1/community", communityRoutes);
app.use("/api/v1/matches", matchesRoutes);
app.use("/api/v1/tournaments", tournamentRoutes);

const PORT = process.env.PORT || 9000;

app.listen(PORT, console.log(`Server is listening on port ${PORT}  `.bgBlue));
