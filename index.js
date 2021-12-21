const aws = require('aws-sdk');
const express = require('express');
// const cors = require("cors");
const app = express();

// app.use(cors());

app.get('/', function (req, res) {
  res.send('Hello World!');
});

app.get('/api', async (req, res, next) => {
  aws.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_KEY,
    // signatureVersion: config.signature_version,
    // region: config.region
  })

  const s3 = new aws.S3({ });
  const filename = '1024px-Taipei_Metro_official_map_optimised.png';
  var params = { Bucket: process.env.AWS_BUCKET_NAME, Key: filename };

  s3.getObject(params, function (err, data) {
    if (err) {
      res.status(200);
      res.end('Error Fetching File');
    }
    else {
      res.attachment(params.Key); // Set Filename
      res.type(data.ContentType); // Set FileType
      res.send(data.Body);        // Send File Buffer
    }
  });
})

app.listen(8000, function () {
  console.log('Listening to Port 8000');
});

