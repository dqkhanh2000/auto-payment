//library
require('@tensorflow/tfjs-node');
const faceapi = require('face-api.js')
const canvas = require('canvas');
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const md5 = require('md5');
const { Canvas, Image, ImageData } = canvas;
//end library

faceapi.env.monkeyPatch({ Canvas, Image, ImageData })
const MODELS_URL = path.join(__dirname, './model');
const viewPath = path.join(__dirname, 'views');
const imagePath = path.join(__dirname, 'image');
const dataPath = path.join(__dirname, 'data');
const app = express();
const PORT = 8000;
const conn = mysql.createConnection({
  host: "127.0.0.1",
  user: "root",
  password: "87654321",
  database: "bank"
});

var labelData;
app.use(express.static('dist'));
app.use(express.static('model'));
app.use(express.static('public'));
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use((req, res, next)=>{
  res.set("Access-Control-Allow-Origin", '*');
  next();
})

app.post('/', function(req, res){
  let time = (new Date()).getTime().toString();
  let rd = Math.random();
  let id = req.body.id + "" + req.body.money + "" +time+""+rd;
  let hash = md5(id);
  conn.query("insert into `transactions` (id, value, id_customer_recive) value('"+hash+"',"+req.body.money+" , "+req.body.id+")");
  res.send(hash+"?v="+req.body.money);
    
});

app.get('/create', function(req, res){
  res.sendFile(path.join(viewPath, 'create-customer.html'));
});

app.post('/verify-payment', function(req, res){
    let sql = "Select * from customers where id = ? and password = ?";
    conn.query(sql, [req.body.id, req.body.password], function(err, result){
      if(err) throw err;
      else {
          if(result.length < 1) res.send("wrong password");
          else{
            doTransaction(req.body.transaction_id, req.body.id)
            .then(result => result ? res.send('success') : res.send('error'))
            .catch(result => result ? res.send(result) : console.log("Something was wrong"));
          }
      }
    })
});

app.get("/:id", function(req, res){
  getTransactionByID(req.params.id)
  .then(transaction => {
    if(transaction.length < 1) res.status(400).send('ID TRANSACTION NOT MATCH WITH ANY TRANSACTION!');
    else if(transaction[0].id_customer_send) res.status(400).send('TRANSACTION EXPIRED');
    else res.sendFile(path.join(viewPath, 'faceRecognition.html'));   
  }); 
});

app.post('/transaction', function(req, res){
    compareDataFace(req.body).then((customerID) => {
        if(customerID === "unknown")
          res.send("not found");
        else{
          conn.query("SELECT id, name FROM `customers` WHERE id = "+customerID, (error, rs) =>{
            if(error) throw error;
            return res.send(JSON.stringify(rs));
          });
          
        }
          
    })
});

app.post('/create-customer', function(req, res){
  console.log(req.body);
  res.send(req.body);
})

app.listen(PORT, () => {
    console.log('Preparing for run..............');
    conn.connect(function(err) {err ? console.error(err) : console.log('Connected database!')});
    console.log("Application is running on port "+PORT);
    labelData = loadFaceData();
});

async function extractFaceImageToVector(){
    await loadModel();
    var labels = fs.readdirSync(imagePath);
    return Promise.all(
        labels.map(async label => {
          const descriptions = [];
          let dirPath = path.join(imagePath, label);
          let imgNames = fs.readdirSync(dirPath);

          for (let i = 0; i < imgNames.length; i++) {
            let imgPath = path.join(dirPath, imgNames[i]);
            try {
                const img = await canvas.loadImage(imgPath);
                const detections = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
                if(detections) descriptions.push(detections.descriptor);
            } catch (error) {
            }
          }
          return new faceapi.LabeledFaceDescriptors(label, descriptions);
        })
      )
}

async function loadModel() {
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_URL);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_URL);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_URL);
}

function compareDataFace(fullFaceDescriptions){
  return new Promise((resolve, reject) =>{
    let mapResult = new Map();
    var result;
    const faceMatcher = new faceapi.FaceMatcher(labelData, 0.5);
    fullFaceDescriptions.forEach(aFace => {
        const displaySize = { width: 320, height: 240 };
        const resizedDetections = faceapi.resizeResults(aFace, displaySize);
        const recoged = faceMatcher.findBestMatch((new Float32Array(resizedDetections.labeledDescriptors[0].descriptors[0])));
        // console.log(recoged);
        if(mapResult.get(recoged._label))
            mapResult.set(recoged._label, mapResult.get(recoged._label)+1);
        else mapResult.set(recoged._label, 1);
        result = recoged._label;
    });
     
    mapResult.forEach((value, key) =>{
      if(mapResult.get(result) < value)
        result = key;
    });

    // console.log(mapResult);
    resolve(result);
  })  
}

function trainData() {
  extractFaceImageToVector().then(data => {
    labelData = data;
    fs.writeFile(path.join(dataPath, 'facedata.dat'), JSON.stringify(data), (err) =>{
      if(err) throw err;
      else console.log('Write done!');
    });
  });
}

function loadFaceData(){
  let readFromFile = fs.readFileSync(path.join(dataPath, "facedata.dat"));
  let data =  JSON.parse(readFromFile);
  let labeledFaceDescriptors = data.map(element =>{
    let descriptions = element.descriptors.map(arr => {
      return new Float32Array(arr);
    });
    return new faceapi.LabeledFaceDescriptors(element.label, descriptions);
  });
  return labeledFaceDescriptors;
}

function getTransactionByID(id) {
  let query = "Select * from transactions where id = ?";
  
  return new Promise((resolve, reject) =>{
    conn.query(query, id, function(err, rows) {
      if(err) reject(err);
      else{
        resolve(rows);
        return;
      }
    });
  })  
}

function doTransaction(idTransaction, idSend) {
  return new Promise((resolve, reject) =>{
    getTransactionByID(idTransaction)
    .then(transaction =>{
    // console.log(transaction[0]);
    conn.query('UPDATE transactions SET id_customer_send = ? WHERE id = ?', [idSend, transaction[0].id], (err, value) => {
      if(err) throw err;
      else console.log(value.message);
    });
    conn.query("SELECT * FROM customers WHERE id = ?", idSend, (err, result) => {
      if(err) throw err;
      else{
        if(result[0].balance < transaction[0].value) {
          reject("not enough");
          return;
        }
        else{
          conn.query('UPDATE customers SET balance = balance + ? where id = ?', [transaction[0].value, transaction[0].id_customer_recive],
          (err, result) => {if(err) throw err; else console.log(result.message)});

          conn.query('UPDATE customers SET balance = balance - ? where id = ?', [transaction[0].value, idSend],
          (err, result) => {if(err) throw err; else console.log(result.message)});
          resolve(true);
        }
      }
    })
  })
  })
}