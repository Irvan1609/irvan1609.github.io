(() => {
  // Normalisasi CSV impor ke delimiter titik koma (;).
  // Jika file sumber memakai koma (,), koma pemisah kolom diubah menjadi (;),
  // sedangkan koma di dalam tanda kutip tetap dipertahankan.
  const originalText = File.prototype.text;

  function delimiterScore(text, delimiter) {
    const sample = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n').filter(line => line.trim()).slice(0, 20).join('\n');
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < sample.length; i++) {
      const ch = sample[i];
      if (ch === '"') {
        if (inQuotes && sample[i + 1] === '"') i++;
        else inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        count++;
      }
    }
    return count;
  }

  function convertCommaToSemicolon(text) {
    const commaCount = delimiterScore(text, ',');
    const semicolonCount = delimiterScore(text, ';');
    if (semicolonCount >= commaCount || commaCount === 0) return text;

    let result = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (inQuotes && text[i + 1] === '"') {
          result += '""';
          i++;
        } else {
          inQuotes = !inQuotes;
          result += ch;
        }
      } else if (ch === ',' && !inQuotes) {
        result += ';';
      } else {
        result += ch;
      }
    }
    return result;
  }

  File.prototype.text = function () {
    return originalText.call(this).then(convertCommaToSemicolon);
  };
})();
