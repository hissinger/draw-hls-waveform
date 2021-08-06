// workers.js

let audioBuffer = [];

onmessage = function (event) {
  if (event.data.type === "data") {
    audioBuffer.push(event.data.buffer);
  } else if (event.data.type === "end") {
    let totalLength = audioBuffer.reduce((prev, cur) => {
      return prev + cur.length;
    }, 0);

    // concat all arraybuffers
    let result = new Uint8Array(totalLength);
    let offset = 0;
    audioBuffer.forEach((element) => {
      result.set(element, offset);
      offset += element.length;
    });

    // make blob
    let blob = new Blob([result], {
      type: "application/octet-stream",
    });

    postMessage(blob);
  }
};
