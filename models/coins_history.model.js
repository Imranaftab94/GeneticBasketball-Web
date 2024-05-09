import mongoose from "mongoose";

const coinsHistorySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId, // Reference to User
      ref: "User", // Assuming 'User' is the name of your user model
      required: true, // Assuming every coins history must be linked to a user
    },
    inapp_id: {
      type: String,
      default: "", // Set default empty if not provided
    },
    platform: {
      type: String,
      default: "", // Set default empty if not provided
    },
    coins_value: {
      type: Number,
      required: true, // Assuming coin value is mandatory
    },
    payment_id: {
      type: String,
      default: "", // Default empty, provided optionally
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt timestamps
  }
);

// Create the model from the schema and export it
const Coins_History = mongoose.model("Coins_History", coinsHistorySchema);
export { Coins_History };
