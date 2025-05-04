import React, { useState, useRef } from 'react';

const AudioTest: React.FC = () => {
  const [text, setText] = useState('');
  const [audioResult, setAudioResult] = useState('');
  const [isRecording, setRecording] = useState(false);
  const [statusText, setStatusText] = useState('尚未開始');

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioDataRef = useRef<Float32Array[]>([]);

  const startRecording = async () => {
    setStatusText('錄音中...');
    audioContextRef.current = new AudioContext();
    mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

    mediaStreamSourceRef.current = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
    scriptProcessorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);

    audioDataRef.current = [];
    scriptProcessorRef.current.onaudioprocess = e => {
      const input = e.inputBuffer.getChannelData(0);
      audioDataRef.current.push(new Float32Array(input));
    };

    mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
    scriptProcessorRef.current.connect(audioContextRef.current.destination);

    setRecording(true);
  };

  const stopRecording = async () => {
    setStatusText('處理中...');
    scriptProcessorRef.current?.disconnect();
    mediaStreamSourceRef.current?.disconnect();
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());

    const wavBlob = exportWAV(audioDataRef.current, audioContextRef.current!.sampleRate);
    setRecording(false);
    setStatusText('上傳中...');
    await uploadAudio(wavBlob);
    setStatusText('完成');
  };

  const exportWAV = (buffers: Float32Array[], sampleRate: number): Blob => {
    const bufferLength = buffers.reduce((acc, cur) => acc + cur.length, 0);
    const data = new Float32Array(bufferLength);
    let offset = 0;
    for (let b of buffers) {
      data.set(b, offset);
      offset += b.length;
    }
    const wavBuffer = encodeWAV(data, sampleRate);
    return new Blob([wavBuffer], { type: 'audio/wav' });
  };

  const encodeWAV = (samples: Float32Array, sampleRate: number): ArrayBuffer => {
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
  };

  const uploadAudio = async (audioBlob: Blob) => {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.wav');

    try {
      const response = await fetch('http://localhost:8888/api/agent/audioTest', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();
      setAudioResult(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('上傳失敗:', error);
      setAudioResult('上傳失敗');
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ flex: 1, padding: '20px', borderRight: '1px solid #ccc' }}>
        <h2>輸入區</h2>
        <textarea
          style={{ width: '100%', height: '90%' }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="請輸入內容..."
        />
      </div>
      <div style={{ flex: 1, padding: '20px' }}>
        <h2>右側區域</h2>
        <div style={{ marginBottom: '20px' }}>
          <label>錄音文字顯示：</label>
          <textarea
            readOnly
            value={audioResult}
            style={{ width: '100%', height: '100px', backgroundColor: '#f5f5f5', resize: 'none' }}
          />
        </div>
        <div>
          <button onClick={isRecording ? stopRecording : startRecording}>
            {isRecording ? '停止錄音' : '開始錄音'}
          </button>
          <p style={{ marginTop: '10px' }}>錄音狀態：{statusText}</p>
        </div>
      </div>
    </div>
  );
};

export default AudioTest;