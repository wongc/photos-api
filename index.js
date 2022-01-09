const aws = require('aws-sdk');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require("cors");
const app = express();
const corsOptions = {
  origin: ['http://camping.jarrodcallum.com'],
  optionsSuccessStatus: 200,  // For legacy browser support
  methods: "GET"
}

require("dotenv").config();

app.use(cors(corsOptions));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.get('/', function (req, res) {
  res.send('Invalid API call');
});

app.post('/api/validateAccessCode', async (req, res, next) => {
  const validAccessCodes = process.env.ACCESS_CODE.split(',');
  const accessCode = req.body.accessCode
  if (validAccessCodes.includes(accessCode)) {
    res.status(200);
    res.send({ result: 'ok'});
    res.end();
  } else {
    res.status(404);
    res.send({ error: 'Invalid access code!' });
    res.end();
  }
})

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
        files.every(val => { 
          const fileExt = val.Key.split('.')
          if (fileExt[0] === `${folder}/${folder}` && fileExt[1].toLowerCase() !== 'json') {
            result.push({folder, image: val.Key})
            return false
          }
          return true
        });
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

  let mediaJson = []
  let s3 = new aws.S3({ });
  let params = { Bucket: process.env.AWS_BUCKET_NAME, Key: `${req.params.media}/${req.params.media}.json` };
  s3.getObject(params, function (err, data) {
    if (data) {
      mediaJson = JSON.parse(data.Body.toString())
    }

    params = { Bucket: process.env.AWS_BUCKET_NAME };
    s3.listObjectsV2(params, function (err, data) {
      if (err) {
        res.status(404);
        res.json([]);
        res.end(err.message);
      } else {
        const result = []
        const files = data.Contents.filter(k => k.Size !== 0)
        files.map(val => {
          const file = val.Key
          const fileExt = val.Key.split('.')
          if (file.includes(req.params.media) && ['jpg', 'jpeg', 'png', 'gif'].find(ext => ext === fileExt[fileExt.length - 1].toLowerCase())) {
            result.push({
              thumb: `${process.env.BASE_URI}/api/${val.Key}`,
              src: `${process.env.BASE_URI}/api/${val.Key}`,
              // caption: val.Key.split('/')[1].split('.')[0].replace(/_|\+/g, ' ')
              caption: val.Key.split('/')[1].split('.')[0]
            })
          }
        })
        res.status(200);
        res.json(mediaJson.concat(result));
        res.end();
      }
    });
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
