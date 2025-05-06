import React, { useState, useRef } from 'react';

const AudioTest: React.FC = () => {
  const [text, setText] = useState('');
  //const [audioResult, setAudioResult] = useState('');
  const [spoken_text, setSpokenText] = useState('');
  const [compare_result, setCompareResult] = useState('');
  const [correction, setCorrection] = useState('');
  const [accuracy, setAccuracy] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [isRecording, setRecording] = useState(false);
  const [statusText, setStatusText] = useState('尚未開始');
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

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
    formData.append('inputText', text);

    try {
      const response = await fetch('http://localhost:8888/api/agent/audioTest', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();

      const parsed = typeof result.reply === 'string'
      ? JSON.parse(result.reply.content?.replace(/```json\s*|\s*```/g, '') || '{}')
      : result;

      const {
        spoken_text = '',
        compare_result = '',
        correction = '',
        accuracy = '',
        suggestion = ''
      } = parsed;

      setSpokenText(String(spoken_text));
      setCompareResult(String(compare_result));
      setCorrection(String(correction));
      setAccuracy(String(accuracy));
      setSuggestion(String(suggestion));
    } catch (error) {
      console.error('上傳失敗:', error);
      setSuggestion('上傳失敗，請檢查網路連線或伺服器狀態。');
    }
  };

  const handleTextToSpeech = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('http://localhost:8888/api/TTS/textToSpeachSlower', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
  
      if (!response.ok) throw new Error('TTS 請求失敗');
  
      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      setTtsAudioUrl(audioUrl);
    } catch (err) {
      console.error('TTS 播放錯誤:', err);
      setSuggestion('無法朗讀文字，請確認後端狀態。');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ flex: 1, padding: '20px', borderRight: '1px solid #ccc', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <h2>輸入區</h2>
        <textarea
          style={{
          width: '90%',
          height: '60%',
          fontSize: '1.2rem',
          padding: '10px',
          border: '1px solid #999',
          borderRadius: '6px',
          resize: 'none',
          }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="請輸入內容..."
        />
        <div style={{ marginTop: '20px', width: '100%' ,flexDirection: 'row' ,display: 'flex' ,padding: '10px' }}>
          <button
            onClick={handleTextToSpeech}
            disabled={isGenerating || !text.trim()}
            style={{
              padding: '10px',
              fontSize: '1rem',
              cursor: 'pointer',
              height: '50px',
              width: '40%',
              marginRight: '20px',
              backgroundColor: isGenerating ? '#dc3545' : '#007bff',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
            }}
          >
            {isGenerating ? '生成中...' : '生成語音'}
          </button>
            {ttsAudioUrl && (
              <div style={{ width: '200px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <audio controls src={ttsAudioUrl}/>
              </div>
            )}
        </div>
      </div>
      <div style={{ flex: 1, padding: '20px' }}>
        <h2>錄音區</h2>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '1.2rem', marginBottom: '10px' }}>你的錄音：</label>
          <textarea
            readOnly
            value={spoken_text}
            style={{
                width: '95%',
                height: '100px',
                fontSize: '1.1rem',
                padding: '10px',
                backgroundColor: '#f5f5f5',
                border: '1px solid #ccc',
                borderRadius: '6px',
                resize: 'none'
            }}
            />
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '1.2rem', marginBottom: '10px' }}>錄音比較：</label>
          <textarea
            readOnly
            value={compare_result}
            style={{
                width: '95%',
                height: '100px',
                fontSize: '1.1rem',
                padding: '10px',
                backgroundColor: '#f5f5f5',
                border: '1px solid #ccc',
                borderRadius: '6px',
                resize: 'none'
            }}
            />
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '1.2rem', marginBottom: '10px' }}>建議：</label>
          <textarea
            readOnly
            value={suggestion}
            style={{
                width: '95%',
                height: '100px',
                fontSize: '1.1rem',
                padding: '10px',
                backgroundColor: '#f5f5f5',
                border: '1px solid #ccc',
                borderRadius: '6px',
                resize: 'none'
            }}
            />
        </div>
        <div style={{ marginBottom: '10px', fontSize: '1.1rem' }}>
          <h4>準確率：</h4>{accuracy}
          <h4>修正單字：</h4>{correction}
        </div>
        <div>
          <button onClick={isRecording ? stopRecording : startRecording}
            style={{
              padding: '10px',
              fontSize: '1rem',
              cursor: 'pointer',
              height: '50px',
              width: '40%',
              backgroundColor: isRecording ? '#dc3545' : '#007bff',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
            }}>
            {isRecording ? '停止錄音' : '開始錄音'}
          </button>
          <p style={{ marginTop: '10px' }}>錄音狀態：{statusText}</p>
        </div>
      </div>
    </div>
  );
};

export default AudioTest;