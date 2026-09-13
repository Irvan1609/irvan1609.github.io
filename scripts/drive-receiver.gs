// Deploy manually as a Google Apps Script web app: execute as Me, access Anyone.
// This receiver is deliberately unauthenticated. Limits reduce storage consumption,
// but do NOT prevent abuse or exhaustion of Apps Script execution quotas.
const BACKUP_FOLDER_ID = '1lP_zy-noo1EtMmpQRFL1Hy27-i5T74rN';
const BACKUP_MAX_BYTES = 2 * 1024 * 1024;
const BACKUP_MAX_FILES_PER_DAY = 50;
const BACKUP_MAX_BYTES_PER_DAY = 10 * 1024 * 1024;

function doPost(e) {
  let lock;
  try {
    const text = e && e.postData && e.postData.contents;
    if (!text || text.length > Math.ceil(BACKUP_MAX_BYTES * 4 / 3) + 2048) throw Error('size');
    const input = JSON.parse(text);
    if (input.version !== 1 || typeof input.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.data)) throw Error('format');
    const bytes = Utilities.base64Decode(input.data);
    // A ZIP signature is only a basic filter, not full XLSX validation.
    if (bytes.length < 4 || bytes.length > BACKUP_MAX_BYTES || bytes[0] !== 80 || bytes[1] !== 75 || bytes[2] !== 3 || bytes[3] !== 4) throw Error('format');
    lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) throw Error('busy');
    const props = PropertiesService.getScriptProperties();
    const day = Utilities.formatDate(new Date(), 'Asia/Makassar', 'yyyy-MM-dd');
    const stored = JSON.parse(props.getProperty('backupDaily') || '{}');
    const usage = stored.day === day ? stored : {day:day, count:0, bytes:0};
    if (usage.count >= BACKUP_MAX_FILES_PER_DAY || usage.bytes + bytes.length > BACKUP_MAX_BYTES_PER_DAY) throw Error('quota');
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
    const folder = DriveApp.getFolderById(BACKUP_FOLDER_ID);
    // Deterministic filename prevents duplicate identical uploaded workbooks.
    const filename = 'data-mentah-' + digest + '.xlsx';
    if (folder.getFilesByName(filename).hasNext()) return reply_({ok:true,duplicate:true});
    // Reserve quota before the Drive write (a failed write can consume the reservation).
    usage.count++; usage.bytes += bytes.length;
    props.setProperty('backupDaily', JSON.stringify(usage));
    folder.createFile(Utilities.newBlob(bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename));
    return reply_({ok:true});
  } catch (error) {
    console.warn('Backup rejected or failed.');
    return reply_({ok:false});
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}
function doGet() { return reply_({service:'raw-data-upload',download:false}); }
function reply_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
