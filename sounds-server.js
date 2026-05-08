const express = require('express');
const cors = require('cors');
const https = require('https');
const path = require('path');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(__dirname));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const CLOUDINARY_CLOUD = 'diado1bxi';
const CLOUDINARY_API_KEY = '117446111831141';
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_SECRET || 'biCrRU-O4tFt_icW8ONKE5POXJk';

const AMHARIC_NUMBERS = {
  1:'አንድ',2:'ሁለት',3:'ሶስት',4:'አራት',5:'አምስት',
  6:'ስድስት',7:'ሰባት',8:'ስምንት',9:'ዘጠኝ',10:'አስር',
  11:'አስራ አንድ',12:'አስራ ሁለት',13:'አስራ ሶስት',14:'አስራ አራት',15:'አስራ አምስት',
  16:'አስራ ስድስት',17:'አስራ ሰባት',18:'አስራ ስምንት',19:'አስራ ዘጠኝ',20:'ሃያ',
  21:'ሃያ አንድ',22:'ሃያ ሁለት',23:'ሃያ ሶስት',24:'ሃያ አራት',25:'ሃያ አምስት',
  26:'ሃያ ስድስት',27:'ሃያ ሰባት',28:'ሃያ ስምንት',29:'ሃያ ዘጠኝ',30:'ሰላሳ',
  31:'ሰላሳ አንድ',32:'ሰላሳ ሁለት',33:'ሰላሳ ሶስት',34:'ሰላሳ አራት',35:'ሰላሳ አምስት',
  36:'ሰላሳ ስድስት',37:'ሰላሳ ሰባት',38:'ሰላሳ ስምንት',39:'ሰላሳ ዘጠኝ',40:'አርባ',
  41:'አርባ አንድ',42:'አርባ ሁለት',43:'አርባ ሶስት',44:'አርባ አራት',45:'አርባ አምስት',
  46:'አርባ ስድስት',47:'አርባ ሰባት',48:'አርባ ስምንት',49:'አርባ ዘጠኝ',50:'ሃምሳ',
  51:'ሃምሳ አንድ',52:'ሃምሳ ሁለት',53:'ሃምሳ ሶስት',54:'ሃምሳ አራት',55:'ሃምሳ አምስት',
  56:'ሃምሳ ስድስት',57:'ሃምሳ ሰባት',58:'ሃምሳ ስምንት',59:'ሃምሳ ዘጠኝ',60:'ስልሳ',
  61:'ስልሳ አንድ',62:'ስልሳ ሁለት',63:'ስልሳ ሶስት',64:'ስልሳ አራት',65:'ስልሳ አምስት',
  66:'ስልሳ ስድስት',67:'ስልሳ ሰባት',68:'ስልሳ ስምንት',69:'ስልሳ ዘጠኝ',70:'ሰባ',
  71:'ሰባ አንድ',72:'ሰባ ሁለት',73:'ሰባ ሶስት',74:'ሰባ አራት',75:'ሰባ አምስት'
};

function getBingoLetter(n) {
  if (n <= 15) return 'ቢ';
  if (n <= 30) return 'አይ';
  if (n <= 45) return 'ኤን';
  if (n <= 60) return 'ጂ';
  return 'ኦ';
}

const ttsCache = {};

async function fetchTTS(text, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(
        'am-ET-AmehaNeural',
        OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
      );
      const result = await new Promise((resolve, reject) => {
        try {
          const readable = tts.toStream(text);
          const audioStream = readable.audioStream || readable;
          const chunks = [];
          audioStream.on('data', chunk => chunks.push(chunk));
          audioStream.on('end', () => {
            const buffer = Buffer.concat(chunks);
            if (buffer.length === 0) {
              reject(new Error('Empty audio buffer'));
              return;
            }
            console.log(`TTS success: "${text}" — ${buffer.length} bytes`);
            resolve({ buffer, type: 'audio/mpeg' });
          });
          audioStream.on('error', err => reject(err));
        } catch(e) {
          reject(e);
        }
      });
      return result;
    } catch(e) {
      console.error(`TTS attempt ${i+1}/${retries} failed: ${e.message}`);
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, 1500));
      } else {
        throw e;
      }
    }
  }
}

app.get('/tts/number/:n', async (req, res) => {
  const n = parseInt(req.params.n);

  if (isNaN(n) || n < 1 || n > 75) {
    console.warn('TTS invalid number:', req.params.n);
    return res.status(400).json({ error: 'Invalid number (1-75 only)' });
  }

  const key = 'num_' + n;

  if (ttsCache[key]) {
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(ttsCache[key]);
  }

  try {
    const letter = getBingoLetter(n);
    const numWord = AMHARIC_NUMBERS[n];
    const text = `${letter}... ${numWord}`;
    console.log(`TTS generating: ${text}`);
    const { buffer, type } = await fetchTTS(text);
    ttsCache[key] = buffer;
    res.set('Content-Type', type);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (e) {
    console.error('TTS number error:', e.message, '|', e.stack?.split('\n')[0]);
    res.status(500).json({ error: 'TTS failed', detail: e.message });
  }
});

app.get('/tts/winner', async (req, res) => {
  if (ttsCache['winner']) {
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(ttsCache['winner']);
  }
  try {
    const { buffer, type } = await fetchTTS('ቢንጎ! አሸናፊ ተገኘ!');
    ttsCache['winner'] = buffer;
    res.set('Content-Type', type);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (e) {
    console.error('TTS winner error:', e.message);
    res.status(500).json({ error: 'TTS failed', detail: e.message });
  }
});

app.get('/tts/warmup', async (req, res) => {
  res.json({ ok: true, message: 'Warmup started' });
  (async () => {
    console.log('TTS Warmup starting...');
    for (let n = 1; n <= 75; n++) {
      const key = 'num_' + n;
      if (ttsCache[key]) continue;
      try {
        const letter = getBingoLetter(n);
        const numWord = AMHARIC_NUMBERS[n];
        const text = `${letter}... ${numWord}`;
        const { buffer } = await fetchTTS(text);
        ttsCache[key] = buffer;
        console.log(`Warmup cached: ${n}`);
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.error(`Warmup failed: ${n} — ${e.message}`);
      }
    }
    try {
      if (!ttsCache['winner']) {
        const { buffer } = await fetchTTS('ቢንጎ! አሸናፊ ተገኘ!');
        ttsCache['winner'] = buffer;
        console.log('Warmup cached: winner');
      }
    } catch(e) {}
    console.log('Warmup complete!');
  })();
});

let soundsMap = {};

function loadCloudinarySounds() {
  return new Promise((resolve) => {
    const auth = Buffer.from(`${CLOUDINARY_API_KEY}:${CLOUDINARY_API_SECRET}`).toString('base64');
    const options = {
      hostname: 'api.cloudinary.com',
      path: `/v1_1/${CLOUDINARY_CLOUD}/resources/video?max_results=100`,
      method: 'GET',
      headers: { 'Authorization': `Basic ${auth}` }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          soundsMap = {};
          (json.resources || []).forEach(r => {
            const match = r.public_id.match(/^([A-Z]+\d+)/);
            const key = match ? match[1] : r.public_id;
            soundsMap[key] = r.secure_url;
          });
          console.log(`Loaded ${Object.keys(soundsMap).length} sounds`);
        } catch (e) {
          console.error('Cloudinary parse error:', e.message);
        }
        resolve();
      });
    });
    req.on('error', (e) => { console.error('Cloudinary error:', e.message); resolve(); });
    req.end();
  });
}

app.get('/sounds-map', (req, res) => res.json(soundsMap));
app.post('/sounds-reload', async (req, res) => {
  await loadCloudinarySounds();
  res.json({ ok: true, count: Object.keys(soundsMap).length });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    voice: 'am-ET-AmehaNeural',
    ttsCache: Object.keys(ttsCache).length,
    cachedNumbers: Object.keys(ttsCache).filter(k => k.startsWith('num_')).length,
    sounds: Object.keys(soundsMap).length
  });
});

const PORT = process.env.PORT || 3001;
loadCloudinarySounds().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server on port ${PORT}`);
    console.log(`🎙️ Voice: am-ET-AmehaNeural`);
  });
});
