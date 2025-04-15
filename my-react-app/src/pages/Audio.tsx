import { useRef, useState } from 'react';

export default function Audio() {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioDataRef = useRef<Float32Array[]>([]);

  const startRecording = async () => {
    audioContextRef.current = new AudioContext();
    mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

    mediaStreamSourceRef.current = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
    scriptProcessorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);

    audioDataRef.current = []; // reset buffer before starting
    scriptProcessorRef.current.onaudioprocess = e => {
      const input = e.inputBuffer.getChannelData(0);
      audioDataRef.current.push(new Float32Array(input));
    };

    mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
    scriptProcessorRef.current.connect(audioContextRef.current.destination);

    setRecording(true);
  };

  const stopRecording = () => {
    scriptProcessorRef.current?.disconnect();
    mediaStreamSourceRef.current?.disconnect();
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());

    const wavBlob = exportWAV(audioDataRef.current, audioContextRef.current!.sampleRate);
    const url = URL.createObjectURL(wavBlob);
    setAudioUrl(url);

    setRecording(false);
  };

  function exportWAV(buffers: Float32Array[], sampleRate: number): Blob {
    const bufferLength = buffers.reduce((acc, cur) => acc + cur.length, 0);
    const data = new Float32Array(bufferLength);
    let offset = 0;
    for (let b of buffers) {
      data.set(b, offset);
      offset += b.length;
    }
    const wavBuffer = encodeWAV(data, sampleRate);
    return new Blob([wavBuffer], { type: 'audio/wav' });
  }

  function encodeWAV(samples: Float32Array, sampleRate: number): ArrayBuffer {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return view.buffer;
  }

  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <h1>錄音頁面</h1>
      <button onClick={startRecording} disabled={recording}>開始錄音</button>
      <button onClick={stopRecording} disabled={!recording}>停止錄音</button>

      {audioUrl && (
        <>
          <div style={{ marginTop: '1rem' }}>
            <audio src={audioUrl} controls />
          </div>
          <a
            href={audioUrl}
            download="recording.wav"
            style={{ display: 'block', marginTop: '1rem' }}
          >
            下載 WAV
          </a>
        </>
      )}
    </div>
  );
}