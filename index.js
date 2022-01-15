const aws = require('aws-sdk');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require("cors");
const app = express();
const winston = require('winston');
const expressWinston = require("express-winston");
const requestIp = require('request-ip');
const { google } = require('googleapis');

require("dotenv").config();

// Remove localhost in non-dev environments
const corsOptions = {
  origin: ['http://camping.jarrodcallum.com', 'http://jarrodcallum.com'],
  optionsSuccessStatus: 200,  // For legacy browser support
  methods: "GET"
}

// YouTube library
const youtube = google.youtube({
    version: "v3",
    auth: process.env.GOOGLE_API_KEY
});

// Winston logger
const expressFormat = winston.format.combine(
  winston.format.timestamp({
    format: new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })
  }),
  winston.format.printf(info => {
      return `{"timestamp": "${info.timestamp}", "message": "${info.message}", "clientIp": "${info.meta.httpRequest.clientIp}", "userAgent": "${info.meta.httpRequest.userAgent}", "referrer": "${info.meta.httpRequest.referrer}"}`;
  })
)

// AWS config
aws.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_KEY,
})
const s3 = new aws.S3({ });

app.use(cors(corsOptions));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(expressWinston.logger({
  transports: [
    new winston.transports.File({ filename: 'combined.log' })
  ],
  format: expressFormat,
  meta: true,
  msg: "HTTP  ",
  expressFormat: true,
  colorize: false,
  dynamicMeta: (req, res) => {
    const httpRequest = {}
    const meta = {}
    if (req) {
      meta.httpRequest = httpRequest
      httpRequest.clientIp = requestIp.getClientIp(req)
      httpRequest.userAgent = req.get('User-Agent')
      httpRequest.referrer = req.get('Referrer')
    }
    return meta
  }
}));

// Verify access token function
function verifyToken(req, res, next) {
  const validAccessCodes = process.env.ACCESS_CODE.split(',');
  
  const bearerHeader = req.headers['authorization'];
  if (bearerHeader) {
    const bearer = bearerHeader.split(' ');
    const bearerToken = bearer[1];
    if (validAccessCodes.includes(bearerToken)) {
      req.token = bearerToken;
      next();
      return;
    } 
  }

  const token = req.query.token;
  if (validAccessCodes.includes(token)) {
    req.token = token;
    next();
    return;
  } else {
    res.sendStatus(403);
    res.end();
  }
}

// Fetch YouTube playlist function
async function fetchPlaylist(playlistName, pageToken, prevResult) {
  const result = [];
  if (prevResult) result = prevResult;

  let playlistId
  const playlists = await youtube.playlists.list({
    channelId: 'UClP1OioTUXbsn-HJDZZLrmg',
    part: 'snippet'
  });
  playlists.data.items.forEach(playlist => {
    if (playlist.snippet.title === playlistName) {
      playlistId = playlist.id
    }
  })

  if (playlistId) {
    const response = await youtube.playlistItems.list({
      playlistId: playlistId,
      part: "snippet",
      pageToken: pageToken,
      maxResults: 50
    });
  
    response.data.items.forEach(video => {
      result.push({
        "type": "youtube",
        "id": video.snippet.resourceId.videoId,
        "thumb": video.snippet.thumbnails.high.url,
        "caption": video.snippet.title
      });
    });
  }

  if (response.data.nextPageToken) {
    return await fetchPlaylist(playlistName, response.data.nextPageToken, result);
  } else {
    return result;
  }
}

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

app.get('/api/listfolders', verifyToken, async (req, res, next) => {
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
          if (val.Key.split('.')[0] === `${folder}/${folder}`) {
            result.push({folder, image: `${val.Key}?token=${req.token}`})
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

app.get('/api/:media', verifyToken, async (req, res, next) => {
  const params = { Bucket: process.env.AWS_BUCKET_NAME };

  s3.listObjectsV2(params, async function (err, data) {
    if (err) {
      res.status(404);
      res.json([]);
      res.end(err.message);
    } else {
      const result = await fetchPlaylist(req.params.media);

      const files = data.Contents.filter(k => k.Size !== 0)
      let mp4Thumbnail = null
      files.map(val => {
        const file = val.Key
        const fileExt = val.Key.split('.')
        const regExPattern = /_|\+/g  // _ or + character
        if (file.includes(req.params.media)
          && ['mp4', 'jpg', 'jpeg', 'png', 'gif'].find(ext => ext === fileExt[fileExt.length - 1].toLowerCase())) {
          if ('mp4' === fileExt[fileExt.length - 1].toLowerCase()) {
            result.push({
              thumb: `${process.env.BASE_URI}/api/${file.split('.')[0]}.png?token=${req.token}`,
              sources: [
                {
                  src: `${process.env.BASE_URI}/api/${file}?token=${req.token}`,
                  type: 'video/mp4'
                }
              ],
              type: 'video',
              caption: file.split('/')[1].split('.')[0].replace(regExPattern, ' '),
              width: 800,
              height: 600,
              autoplay: true
            })
            mp4Thumbnail = `${file.split('.')[0]}.png`
          } else if (file !== mp4Thumbnail) {
            result.push({
              thumb: `${process.env.BASE_URI}/api/${file}?token=${req.token}`,
              src: `${process.env.BASE_URI}/api/${file}?token=${req.token}`,
              caption: file.split('/')[1].split('.')[0].replace(regExPattern, ' ')
            })
            mp4Thumbnail = null
          }
        }
      });

      result.sort((r1, r2) => {
        var textA = r1.caption.toLowerCase()
        var textB = r2.caption.toLowerCase()
        return textA < textB ? -1 : textA > textB ? 1 : 0
      })

      res.status(200);
      res.json(result);
      res.end();
    }
  });
})

app.get('/api/:folder/:filename', verifyToken, async (req, res, next) => {
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
