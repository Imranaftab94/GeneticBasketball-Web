// Import Mongoose
import mongoose from 'mongoose'

// Define the schema for AWS keys and region
const AwsKeySchema = new mongoose.Schema({
  accessKeyId: {
    type: String,
    required: true
  },
  secretAccessKey: {
    type: String,
    required: true
  },
  region: {
    type: String,
    required: true
  },
  bucketName: {
    type: String,
    required: true
  }
}, {
  timestamps: true, // This will add createdAt and updatedAt fields
})

// Create the model
const AwsKey = mongoose.model('AwsKey', AwsKeySchema)

// Export the model
export { AwsKey }
