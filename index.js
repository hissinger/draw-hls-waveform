const audio = document.getElementById("audio");
const audioUrl =
  "http://127.0.0.1:8080/sample/625306f8-f5b8-11eb-912e-0241da8f597e_bridge.m3u8";
const keyUrl = "http://127.0.0.1:8080/sample/qybczk-hls.ssl";
let segments = [];
let initialSegment;
let startTime, endTime;

// wavesurfer
const wavesurfer = WaveSurfer.create({
  container: document.querySelector("#waveform"),
  waveColor: "#333533",
  interact: false,
  splitChannels: true,
  responsive: true,
  barWidth: 3,
  partialRender: true,
  plugins: [
    WaveSurfer.timeline.create({
      container: "#wave-timeline",
    }),
    WaveSurfer.cursor.create({
      showTime: true,
      opacity: 1,
      customShowTimeStyle: {
        "background-color": "#000",
        color: "#fff",
        padding: "2px",
        "font-size": "10px",
      },
    }),
  ],
});
wavesurfer.on("error", (error) => {
  console.log("wavesurfer error:", error);
});
wavesurfer.on("ready", () => {
  console.log("wavesurfer ready");
  endTime = new Date();
  let timeDiff = endTime - startTime; //in ms
  // strip the ms
  timeDiff /= 1000;

  // get seconds
  let seconds = Math.round(timeDiff);
  console.log(`elaped time: ${seconds} seconds`);
});

// hls
function injectDecryptionKey(playlist) {
  return playlist.replace("{url}", keyUrl);
}
class pLoader extends Hls.DefaultConfig.loader {
  constructor(config) {
    super(config);
    const load = this.load.bind(this);
    this.load = (context, config, callbacks) => {
      if (context.type == "manifest") {
        const onSuccess = callbacks.onSuccess;
        callbacks.onSuccess = (response, stats, context) => {
          response.data = injectDecryptionKey(response.data);
          onSuccess(response, stats, context);
        };
      }
      load(context, config, callbacks);
    };
  }
}
if (Hls.isSupported()) {
  const hls = new Hls({
    enableWorker: true,
    startFragPrefetch: true,
    progressive: true,
    pLoader: pLoader,
  });
  hls.attachMedia(audio);
  hls.on(Hls.Events.MEDIA_ATTACHED, () => {
    startTime = new Date();
    hls.loadSource(audioUrl);
    console.log("Hls.Events.MEDIA_ATTACHED");
  });
  hls.on(Hls.Events.ERROR, (event, data) => {
    if (data.details != "bufferAppendError") {
      console.log("Hls.Events.ERROR", event, data);
    }
  });
  hls.on(Hls.Events.BUFFER_CREATED, (event, data) => {
    console.log("Hls.BUFFER_CREATED: ", data.tracks.audio.buffer);
  });
  hls.on(Hls.Events.BUFFER_APPENDED, (event, data) => {
    console.log("Hls.BUFFER_APPENDED: ", data);
  });
  hls.on(Hls.Events.BUFFER_APPENDING, (event, data) => {
    console.log(
      `Hls.BUFFER_APPENDING: sn:${data.frag.sn} duration: ${data.frag.duration}`
    );

    if (!initialSegment) {
      initialSegment = data.data;
    }

    if (!segments[data.frag.sn]) {
      segments[data.frag.sn] = {
        sn: data.frag.sn,
        duration: data.frag.duration,
        totalBufferLength: 0,
        buffers: [],
      };
    }
    segments[data.frag.sn].totalBufferLength += data.data.length;
    segments[data.frag.sn].buffers.push(data.data);

    // 실제 play를 하는 것이 아니기 때문에 buffer full 발생. ts 파일을 다운 받아오지 않음.
    // audio buffer를 reload
    audio.pause();
    audio.currentTime = 0;
    audio.load();
  });
  hls.on(Hls.Events.BUFFER_EOS, async (event, data) => {
    console.log("Hls.Events.BUFFER_EOS");

    const maxDuration = 3600 * 3;

    // extract arraybuffer from segments
    let arrayBufferList = makeArrayBufferList(maxDuration);
    console.log(`arraybuffer count:${arrayBufferList.length}`);

    // decode audio
    let audioBuffer = await decodeAudio(arrayBufferList);

    // load audiobuffer and draw waveform
    console.log("load audioBuffer");
    wavesurfer.loadDecodedBuffer(audioBuffer);

    segments = null;
    arrayBufferList = null;
    audioBuffer = null;
  });
}

function makeArrayBufferList(maxDuration) {
  let duration = 0;
  let arrayBufferList = [];
  for (const seg of segments) {
    duration = duration + seg.duration;
    if (duration > maxDuration) {
      break;
    }

    const arraybuffer = getArrayBufferFromSegment(seg);
    arrayBufferList.push(arraybuffer);
  }

  return arrayBufferList;
}

async function decodeAudio(arraybuffers) {
  const audioContext = new AudioContext();
  const decodedAudioBuffers = [];
  let audioBufferTotalLength = 0;

  for (let arraybuf of arraybuffers) {
    // decoding segment(mp4)
    console.log(`decoding segment`);
    const audioBuf = await audioContext.decodeAudioData(arraybuf.buffer);
    decodedAudioBuffers.push(audioBuf);
    audioBufferTotalLength = audioBufferTotalLength + audioBuf.length;
  }

  console.log(
    `audioBufferTotalLength: ${audioBufferTotalLength} count:${decodedAudioBuffers.length}`
  );

  const audioBuffer = concatAudioBuffers(
    audioContext,
    decodedAudioBuffers,
    audioBufferTotalLength
  );

  return audioBuffer;
}

function getArrayBufferFromSegment(segment) {
  const arraybuffer = new Uint8Array(
    segment.totalBufferLength + initialSegment.length
  );
  let offset = 0;

  arraybuffer.set(new Uint8Array(initialSegment), 0);
  offset += initialSegment.length;

  for (const buf of segment.buffers) {
    arraybuffer.set(new Uint8Array(buf), offset);
    offset += buf.length;
  }

  return arraybuffer;
}

function concatAudioBuffers(audioContext, buffers, length) {
  const numberOfChannels = 2;
  const audioBuffer = audioContext.createBuffer(
    numberOfChannels,
    length,
    48000
  );
  let offset = Array.from({ length: numberOfChannels }, () => 0);
  buffers.forEach((buf) => {
    for (let i = 0; i < numberOfChannels; i++) {
      const channel = audioBuffer.getChannelData(i);
      channel.set(buf.getChannelData(i), offset[i]);
      offset[i] = offset[i] + buf.length;
    }
  });
  return audioBuffer;
}
