const textToSpeech = require('@google-cloud/text-to-speech');
const path = require('path');
const fs = require('fs');

async function test() {
  const ttsClient = new textToSpeech.TextToSpeechClient({
    keyFilename: path.join(process.cwd(), 'credentials.json'),
  });

  const ssml = `<speak>
    <voice language="ta-IN" name="ta-IN-Wavenet-B">வணக்கம். அகரம் எழுத்துக்களுக்கு முதன்மை.</voice>
    <break time="1s"/>
    <voice language="en-US" name="en-US-Wavenet-D">Hello. A is the first letter.</voice>
  </speak>`;

  const request = {
    input: { ssml },
    voice: { languageCode: 'ta-IN', name: 'ta-IN-Wavenet-B' },
    audioConfig: { audioEncoding: 'MP3' },
  };

  try {
    const [response] = await ttsClient.synthesizeSpeech(request);
    fs.writeFileSync('test_tts.mp3', response.audioContent, 'binary');
    console.log('Success!');
  } catch (err) {
    console.error('Failed:', err.message);
  }
}

test();
