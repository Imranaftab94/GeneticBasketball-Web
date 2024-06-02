import mongoose from "mongoose";
import colors from "colors";

export const connectDB = async () => {
  try {
    let mongoURI = process.env.ENVIRONMENT === 'Production' ? process.env.PROD_MONGODB_URI : process.env.ENVIRONMENT === 'Development' && process.env.DEV_MONGODB_URI;
    const conn = await mongoose.connect(mongoURI);

    console.log(`MongoDB Connected: ${conn.connection.host}`.bgMagenta);
  } catch (error) {
    console.error(`Error: ${error.message}`.red.underline.bold);
    process.exit(1);
  }
};
