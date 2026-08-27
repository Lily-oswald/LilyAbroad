const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');

const BACKUP_KEY = process.env.BACKUP_KEY || 'dev-backup-key';
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const BACKUP_FILE = path.join(DATA_DIR, 'flights.json');
const PUBLIC_FILE = path.join(DATA_DIR, 'public-flights.json');

// Azure Blob settings (optional)
const AZ_CONN = process.env.AZURE_STORAGE_CONNECTION_STRING || '';
const AZ_CONTAINER = process.env.AZURE_STORAGE_CONTAINER || 'lilyabroad-backups';
let containerClient = null;
let useAzure = false;
if(AZ_CONN){
  try{
    const { BlobServiceClient } = require('@azure/storage-blob');
    const blobServiceClient = BlobServiceClient.fromConnectionString(AZ_CONN);
    containerClient = blobServiceClient.getContainerClient(AZ_CONTAINER);
    useAzure = true;
  }catch(e){ console.error('Azure Blob init failed', e.message); useAzure = false; }
}
const PUBLIC_FILE = path.join(DATA_DIR, 'public-flights.json');

if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, {recursive:true});

const app = express();
app.use(cors());
app.use(express.json({limit:'5mb'}));
app.use(morgan('dev'));

function checkKey(req){
  const key = req.headers['x-backup-key'] || req.query.key || '';
  return key === BACKUP_KEY;
}

app.post('/backup', (req,res)=>{
  if(!checkKey(req)) return res.status(401).send('Invalid backup key');
  const body = req.body || {};
  const text = JSON.stringify(body, null, 2);
  // write local copy
  try{ fs.writeFileSync(BACKUP_FILE, text); }catch(e){ console.warn('local backup write failed', e.message); }
  if(useAzure && containerClient){
    (async()=>{
      try{
        await containerClient.createIfNotExists();
        const ts = new Date().toISOString().replace(/[:.]/g,'-');
        const blobName = `backups/flights-${ts}.json`;
        const latestName = `backups/latest.json`;
        const blockClient = containerClient.getBlockBlobClient(blobName);
        await blockClient.upload(text, Buffer.byteLength(text));
        const latestClient = containerClient.getBlockBlobClient(latestName);
        await latestClient.upload(text, Buffer.byteLength(text), {overwrite:true});
        return res.json({ok:true, azure:true});
      }catch(e){ console.error('azure backup failed', e.message); return res.json({ok:true, azure:false}); }
    })();
  } else {
    return res.json({ok:true, azure:false});
  }
});

app.get('/backup', (req,res)=>{
  if(!checkKey(req)) return res.status(401).send('Invalid backup key');
  if(useAzure && containerClient){
    (async()=>{
      try{
        const latestClient = containerClient.getBlockBlobClient('backups/latest.json');
        if(await latestClient.exists()){
          const dl = await latestClient.download();
          const body = await streamToString(dl.readableStreamBody);
          return res.type('application/json').send(body);
        }
        // fallthrough to local
      }catch(e){ console.warn('azure read latest failed', e.message); }
      if(!fs.existsSync(BACKUP_FILE)) return res.status(404).send('No backup found');
      try{ const txt = fs.readFileSync(BACKUP_FILE, 'utf8'); return res.type('application/json').send(txt); }catch(e){ return res.status(500).send(e.message); }
    })();
    return;
  }
  if(!fs.existsSync(BACKUP_FILE)) return res.status(404).send('No backup found');
  try{
    const txt = fs.readFileSync(BACKUP_FILE, 'utf8');
    res.type('application/json').send(txt);
  }catch(e){ res.status(500).send(e.message); }
});

// helper to stream to string
async function streamToString(readable){
  return new Promise((resolve, reject)=>{
    const chunks = [];
    readable.on('data', (data)=>chunks.push(data.toString()));
    readable.on('end', ()=>resolve(chunks.join('')));
    readable.on('error', reject);
  });
}

// Publish official flights (writes public file and also stores a timestamped backup)
app.post('/publish', (req,res)=>{
  if(!checkKey(req)) return res.status(401).send('Invalid backup key');
  const body = req.body || {};
  try{
    const text = JSON.stringify(body, null, 2);
    // local writes
    fs.writeFileSync(PUBLIC_FILE, text);
    const ts = new Date().toISOString().replace(/[:.]/g,'-');
    const stampFile = path.join(DATA_DIR, `flights-${ts}.json`);
    fs.writeFileSync(stampFile, text);
    fs.writeFileSync(BACKUP_FILE, text);
    if(useAzure && containerClient){
      (async()=>{
        try{
          await containerClient.createIfNotExists();
          await containerClient.getBlockBlobClient('public/public-flights.json').upload(text, Buffer.byteLength(text), {overwrite:true});
          await containerClient.getBlockBlobClient(`backups/flights-${ts}.json`).upload(text, Buffer.byteLength(text));
          await containerClient.getBlockBlobClient('backups/latest.json').upload(text, Buffer.byteLength(text), {overwrite:true});
          return res.json({ok:true, azure:true});
        }catch(e){ console.error('azure publish failed', e.message); return res.json({ok:true, azure:false}); }
      })();
    } else {
      return res.json({ok:true, azure:false});
    }
  }catch(e){ res.status(500).send(e.message); }
});

// Publicly readable flights for viewers
app.get('/public/flights', (req,res)=>{
  if(useAzure && containerClient){
    (async()=>{
      try{
        const blob = containerClient.getBlockBlobClient('public/public-flights.json');
        if(await blob.exists()){
          const dl = await blob.download();
          const body = await streamToString(dl.readableStreamBody);
          return res.type('application/json').send(body);
        }
      }catch(e){ console.warn('azure public read failed', e.message); }
      if(!fs.existsSync(PUBLIC_FILE)) return res.status(404).send('No public flights available');
      try{ const txt = fs.readFileSync(PUBLIC_FILE, 'utf8'); return res.type('application/json').send(txt); }catch(e){ return res.status(500).send(e.message); }
    })();
    return;
  }
  if(!fs.existsSync(PUBLIC_FILE)) return res.status(404).send('No public flights available');
  try{
    const txt = fs.readFileSync(PUBLIC_FILE, 'utf8');
    res.type('application/json').send(txt);
  }catch(e){ res.status(500).send(e.message); }
});

async function main(){
  if(useAzure && containerClient){
    try{ await containerClient.createIfNotExists(); console.log('Azure container ready:', AZ_CONTAINER); }catch(e){ console.warn('Azure container create failed', e.message); }
  }
  app.listen(PORT, ()=>{
    console.log(`Backup server listening on port ${PORT}. BACKUP_KEY=${BACKUP_KEY} AZ=${useAzure}`);
  });
}

main().catch(e=>{ console.error(e); process.exit(1); });
