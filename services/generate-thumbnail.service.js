import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { AwsKey } from '../models/Aws_key.model.js';



async function getAwsConfiguration () {
    const awsConfiguration = await AwsKey.find({}).select('-_id -createdAt -updatedAt')
    return awsConfiguration[0]
}

// Create an S3 client instance

 
async function generateThumbnailAndUpload(videoBuffer, outputFileName) {
    try {
      const awsConfiguration = await getAwsConfiguration();
      const s3Client = new S3Client({
        region: 'us-east-1',
        credentials: {
          accessKeyId: awsConfiguration.accessKeyId,
          secretAccessKey: awsConfiguration.secretAccessKey
        }
      });
  
      // Generate the thumbnail
      let thumbnailKey = process.env.Environment === 'Development'
        ? `thumbnails/development/${new Date().toISOString()+'-'+Math.floor(Math.random() * 10)}-${outputFileName}`
        : `thumbnails/production/${new Date().toISOString()+'-'+Math.floor(Math.random() * 10)}-${outputFileName}`;
  
      const thumbnailBuffer = await sharp(videoBuffer)
        .resize({ width: 200 }) // Adjust width as needed
        .toBuffer();
  
      // Logging thumbnail buffer and params for debugging
      console.log('Thumbnail Buffer Length:', thumbnailBuffer.length);
      console.log('Thumbnail Key:', thumbnailKey);
  
      // Upload to S3
      const params = {
        Bucket: awsConfiguration.bucketName,
        Key: thumbnailKey,
        Body: thumbnailBuffer,
        ContentType: 'image/png' // Adjust content type based on the actual file type
      };
  
      const data = await s3Client.send(new PutObjectCommand(params));
      let thumbnailUrl = `https://${awsConfiguration.bucketName}.s3.amazonaws.com/${thumbnailKey}`
      console.log(`File uploaded successfully at ${thumbnailUrl}`);
      return thumbnailUrl
    } catch (error) {
      console.error('Error generating thumbnail and uploading to S3:', error);
    }
  }

 export { generateThumbnailAndUpload }