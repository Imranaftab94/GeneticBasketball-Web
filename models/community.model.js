import mongoose from "mongoose";
const Schema = mongoose.Schema;

// Define schema for timeslot
const timeslotSchema = mongoose.Schema({
  day: {
    type: String,
    required: true,
  },
  startTime: {
    type: String,
    required: true,
  },
  endTime: {
    type: String,
    required: true,
  },
  available: {
    type: Boolean,
    default: true,
  },
});

// Define Community Center Schema
const communityCenterSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    image: {
      type: String, // Assuming you store the image URL
      required: true,
    },
    location: {
      latitude: {
        type: Number,
      },
      longitude: {
        type: Number,
      },
    },
    address: {
      type: String,
      required: true,
    },
    radius: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
    },
    timeSlots: [timeslotSchema],
    community_user: {
      type: Schema.Types.ObjectId,
      ref: "User",
    }, // Reference to a single User model
  },
  {
    timestamps: true,
  }
);

const CommunityCenter = mongoose.model(
  "CommunityCenter",
  communityCenterSchema
);

export { CommunityCenter };
