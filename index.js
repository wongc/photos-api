const aws = require('aws-sdk');
const express = require('express');
const cors = require("cors");
const app = express();
const corsOptions = {
  origin: 'http://localhost:8080',
  optionsSuccessStatus: 200,  // For legacy browser support
  methods: "GET"
}

require("dotenv").config();

app.use(cors(corsOptions));

app.get('/', function (req, res) {
  res.send('Invalid API call');
});

app.get('/api/listfolders', async (req, res, next) => {
  aws.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  })

  const s3 = new aws.S3({ });
  const params = { Bucket: process.env.AWS_BUCKET_NAME };

  s3.listObjectsV2(params, function (err, data) {
    if (err) {
      res.status(404);
      res.end(err.message);
    } else {
      const folders = data.Contents.filter(k => k.Size === 0)
      const resultFolders = []
      folders.map(val => resultFolders.push(val.Key.split('/')[0]));
      
      const result = []
      resultFolders.map(folder => {
        const files = data.Contents.filter(k => k.Size !== 0)
        const imageFiles = []
        files.map(val => {
          const file = val.Key
          const fileExt = val.Key.split('.')
          if (file.includes(folder) && ['jpg', 'jpeg', 'png', 'gif'].find(ext => ext === fileExt[fileExt.length - 1].toLowerCase())) {
            imageFiles.push(val.Key);
          }
        })
        const shuffledImageFiles = imageFiles.sort((a, b) => 0.5 - Math.random());
        result.push({folder, image: shuffledImageFiles[0]})
      })

      res.status(200);
      res.json(result);
      res.end();
    }
  });
})

app.get('/api/:media', async (req, res, next) => {
  aws.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  })

  const s3 = new aws.S3({ });
  const params = { Bucket: process.env.AWS_BUCKET_NAME, Key: `${req.params.media}/${req.params.media}.json` };

  s3.getObject(params, function (err, data) {
    if (err) {
      res.status(404);
      res.end(err.message);
    } else {
      res.status(200);
      res.attachment(params.Key); // Set Filename
      res.type(data.ContentType); // Set FileType
      res.send(data.Body);        // Send File Buffer
      res.end();
    }
  });
})

app.get('/api/:folder/:filename', async (req, res, next) => {
  aws.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  })

  const s3 = new aws.S3({ });
  const params = { Bucket: process.env.AWS_BUCKET_NAME, Key: `${req.params.folder}/${req.params.filename}` };

  s3.getObject(params, function (err, data) {
    if (err) {
      res.status(404);
      res.end(err.message);
    } else {
      res.status(200);
      res.attachment(params.Key); // Set Filename
      res.type(data.ContentType); // Set FileType
      res.send(data.Body);        // Send File Buffer
      res.end();
    }
  });
})

app.listen(8000, function () {
  console.log('Listening to Port 8000');
});
