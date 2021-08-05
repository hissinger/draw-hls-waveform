let audio = document.getElementById("audio");
let audioUrl =
  "http://127.0.0.1:8080/625306f8-f5b8-11eb-912e-0241da8f597e_bridge.m3u8";
let keyUrl = "http://127.0.0.1:8080/qybczk-hls.ssl";
let audioBuffer = [];

// wavesurfer
let wavesurfer = WaveSurfer.create({
  container: document.querySelector("#waveform"),
  waveColor: "#333533",
  interact: false,
  splitChannels: true,
  responsive: true,
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

// hls
function injectDecryptionKey(playlist) {
  return playlist.replace("{url}", keyUrl);
}
class pLoader extends Hls.DefaultConfig.loader {
  constructor(config) {
    super(config);
    let load = this.load.bind(this);
    this.load = (context, config, callbacks) => {
      if (context.type == "manifest") {
        let onSuccess = callbacks.onSuccess;
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
  var hls = new Hls({
    pLoader: pLoader,
  });
  hls.attachMedia(audio);

  hls.on(Hls.Events.MEDIA_ATTACHED, () => {
    hls.loadSource(audioUrl);
    console.log("Hls.Events.MEDIA_ATTACHED");
  });
  hls.on(Hls.Events.ERROR, (event, data) => {
    console.log("Hls.Events.ERROR", event, data);
  });
  hls.on(Hls.Events.BUFFER_APPENDING, (event, data) => {
    audioBuffer.push(data.data);
  });
  hls.on(Hls.Events.BUFFER_EOS, (event, data) => {
    console.log("Hls.Events.BUFFER_EOS");
    let blob = makeBlob(audioBuffer);
    wavesurfer.loadBlob(blob);
  });
}

function makeBlob(data) {
  console.log("make blob...");
  return new Blob([arrayConcat(data)], {
    type: "application/octet-stream",
  });
}

function arrayConcat(inputArray) {
  let totalLength = inputArray.reduce((prev, cur) => {
    return prev + cur.length;
  }, 0);
  let result = new Uint8Array(totalLength);
  let offset = 0;
  inputArray.forEach((element) => {
    result.set(element, offset);
    offset += element.length;
  });
  return result;
}
