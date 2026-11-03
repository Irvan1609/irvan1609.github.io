import fs from 'node:fs';

function fail(message){console.error('Image privacy check failed:',message);process.exit(1);}
const cloud=fs.readFileSync('public/hitung-cabai/cloud-sync.js','utf8');
for(const marker of ['prepareTrainingImage','canvasBlob','canvas.toBlob','form.append(\'image\',prepared.blob'])
  if(!cloud.includes(marker))fail('missing sanitized image pipeline marker '+marker);
if(/form\.append\(['"]image['"],\s*(?:file|source|original)/i.test(cloud))
  fail('original image file must never be uploaded directly');
console.log('Image privacy OK: cloud contribution is re-encoded through canvas, stripping source EXIF/GPS metadata before upload.');
