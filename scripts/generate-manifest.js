const fs = require('fs');
const path = require('path');

const imagesDir = path.join(__dirname, '..', 'assets', 'images');
const out = path.join(imagesDir, 'manifest.json');

fs.readdir(imagesDir, (err, files)=>{
  if(err){ console.error('Failed to read images directory', err); process.exit(1); }
  const list = files.filter(f=>{
    const l = f.toLowerCase();
    return f !== 'manifest.json' && (l.endsWith('.jpg')||l.endsWith('.jpeg')||l.endsWith('.png')||l.endsWith('.webp')||l.endsWith('.gif'));
  });
  fs.writeFile(out, JSON.stringify(list, null, 2), err2=>{
    if(err2){ console.error('Failed to write manifest', err2); process.exit(1); }
    console.log('Wrote', out, 'with', list.length, 'images');
  });
});
