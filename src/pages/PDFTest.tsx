import React, { useRef, useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useLocation } from "react-router-dom";
import 'pdfjs-dist/build/pdf.worker.entry';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

type SentenceResult = {
  spoken_text: string;
  differences: string[];
  accuracy: string;
  suggestion: string;
  audioUrl?: string;
};

type ResultsByPage = Record<number, Record<number, SentenceResult>>;

const PDFTest: React.FC = () => {
  const location = useLocation();
  const pdfBuffer: Uint8Array | undefined = location.state?.pdfBuffer;
  const translationsByPage = location.state?.translationsByPage || {};

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  //recording part
  const [isRecording, setRecording] = useState(false);
  const [statusText, setStatusText] = useState('尚未開始');
  const [audioUrlsByPage, setAudioUrlsByPage] = useState<Record<number, Record<number, string>>>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioDataRef = useRef<Float32Array[]>([]);

  const [resultsByPage, setResultsByPage] = useState<ResultsByPage>({});
  const [sentenceIndex, setSentenceIndex] = useState(0);

  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const currentResult: SentenceResult = resultsByPage[pageNum]?.[sentenceIndex] ?? {
    spoken_text: '',
    differences: [],
    accuracy: '',
    suggestion: '',
    audioUrl: '',
  };

  useEffect(() => {
    if (pdfBuffer) {
      (async () => {
        const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
        setPdfDoc(pdf);
        setPageCount(pdf.numPages);
        setPageNum(1);
      })();
    }
  }, [pdfBuffer]);

  const renderPage = async (num: number) => {
    if (!pdfDoc || !canvasRef.current) return;
  
    const page = await pdfDoc.getPage(num);
  
    const containerWidth = canvasRef.current.parentElement?.clientWidth || window.innerWidth * 0.6;
    const scale = containerWidth / page.getViewport({ scale: 1 }).width;
    const adjustedViewport = page.getViewport({ scale });
  
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
  
    canvas.width = adjustedViewport.width;
    canvas.height = adjustedViewport.height;
  
    page.render({
      canvasContext: context!,
      viewport: adjustedViewport,
    });
  };

  useEffect(() => {
    if (pdfDoc) {
      renderPage(pageNum);
    }
  }, [pdfDoc, pageNum]);
  //recording part
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
  
  const stopRecording = async () => {
    setStatusText('處理中...');
    scriptProcessorRef.current?.disconnect();
    mediaStreamSourceRef.current?.disconnect();
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
  
    const wavBlob = exportWAV(audioDataRef.current, audioContextRef.current!.sampleRate);
    const url = URL.createObjectURL(wavBlob);
  
    setAudioUrlsByPage(prev => ({
      ...prev,
      [pageNum]: {
        ...(prev[pageNum] || {}),
        [sentenceIndex]: url
      }
    }));
    setRecording(false);
    setStatusText('上傳中...');
    await uploadAudio(wavBlob);
    setStatusText('完成');
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

  const uploadAudio = async (audioBlob: Blob) => {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.wav');
    formData.append('inputText', translationsByPage[pageNum]?.[sentenceIndex] || '');

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
        differences = '',
        accuracy = '',
        suggestion = ''
      } = parsed;

      const url = URL.createObjectURL(audioBlob);

      setResultsByPage(prev => ({
        ...prev,
        [pageNum]: {
          ...(prev[pageNum] || {}),
          [sentenceIndex]: {
            spoken_text: String(spoken_text),
            differences: Array.isArray(differences) ? differences : [],
            accuracy: String(accuracy),
            suggestion: String(suggestion),
            audioUrl: url,
          }
        }
      }));
    } catch (error) {
      console.error('上傳失敗:', error);
      setResultsByPage(prev => ({
        ...prev,
        [pageNum]: {
          spoken_text: '',
          differences: [],
          accuracy: '',
          suggestion: '上傳失敗，請檢查網路連線或伺服器狀態。',
          audioUrl: '',
        }
      }));
    }
  };

  function escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  const highlightText = (text: string, differences: string[]): string => {
    let highlighted = escapeHtml(text);

    for (const word of differences) {
      const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b(${escapedWord})\\b`, 'gi');
      highlighted = highlighted.replace(regex, '<span style="color: red;">$1</span>');
    }

    return highlighted;
  };

  const handleTextToSpeech = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('http://localhost:8888/api/TTS/textToSpeachSlower', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text : translationsByPage[pageNum]?.[sentenceIndex] || '' }),
      });
  
      if (!response.ok) throw new Error('TTS 請求失敗');
  
      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      setTtsAudioUrl(audioUrl);
    } catch (err) {
      console.error('TTS 播放錯誤:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', gap: '30px',height: '100%', marginTop: 20 }}>
        <div
          style={{
            flex: 2,
            background: '#eee',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: pdfDoc ? 'space-between' : 'center', 
            padding: '10px',
            minHeight: '65vh',
          }}
        >
          {pdfDoc && (
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: 'auto', maxHeight: '70vh' }}
            />
          )}
          <div
          style={{
            width: '100%',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '10px',
            backgroundColor: '#f0f0f0',
            borderRadius: '8px',
          }}
        >
          <button
            onClick={handleTextToSpeech}
            disabled={isGenerating || !translationsByPage[pageNum]?.[sentenceIndex].trim()}
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
        

        {/* 右側文字輸入 */}
        <div
          style={{
            flex: 1,
            border: '1px solid #ccc',
            padding: '10px',
            background: '#fafafa',
            marginRight: '20px',
            boxShadow: '0 0 5px rgba(0,0,0,0.1)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <h3 style={{ "textAlign": "center" }}>你的英文講稿</h3>
          <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '-10px', marginBottom: '10px' , "textAlign": "center"}}>
            第 {pageNum} 頁
          </p>
          {Array.isArray(translationsByPage[pageNum]) && (
            <div style={{ marginBottom: '10px' }}>
              <label>選擇段落：</label>
              <select
                value={sentenceIndex}
                onChange={(e) => setSentenceIndex(Number(e.target.value))}
                style={{ padding: '5px', fontSize: '1rem' }}
              >
                {translationsByPage[pageNum].map((_, idx) => (
                  <option key={idx} value={idx}>第 {idx + 1} 段</option>
                ))}
              </select>
            </div>
          )}
          <label style={{ fontSize: '1.2rem', marginBottom: '10px' }}>錄音比較：</label>
          <div
            style={{
              width: '95%',
              height: '100px',
              fontSize: '1.1rem',
              padding: '10px',
              backgroundColor: '#f5f5f5',
              border: '1px solid #ccc',
              borderRadius: '6px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              resize: 'none'
            }}
            dangerouslySetInnerHTML={{
              __html: highlightText(translationsByPage[pageNum]?.[sentenceIndex] || '', currentResult.differences)
            }}
          />
          <textarea
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
            readOnly
            value={currentResult.spoken_text || '你的錄音結果將顯示在這裡。'}
          />
          <div style={{ marginBottom: '20px' ,textAlign: 'left'}}>
            <label style={{ fontSize: '1.2rem', marginBottom: '10px' }}>建議：</label>
            <textarea
              readOnly
              value={currentResult.suggestion}
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
          <div style={{ marginBottom: '10px', fontSize: '1.1rem', textAlign: 'left' }}>
            <h4>發音準確率：</h4>{currentResult.accuracy}
          </div>
          <div 
            style={{ 
              marginTop: '10px', 
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'flex-start',
              gap: '20px',
              width: '90%',
              margin: '0 auto'
            }}
          >
            {/* 錄音按鈕 */}
            <div style={{ width: '300px' }}>
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
            {/* 音軌 */}
            {audioUrlsByPage[pageNum] && (
              <div style={{ width: '200px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <audio src={audioUrlsByPage[pageNum][sentenceIndex]} controls style={{ width: '100%' }} />
              </div>
            )}
          </div>
        </div>
      </div>

      {pdfDoc && (
      <div
        style={{
          marginTop: 30,
          textAlign: 'center',
          fontSize: '1.2rem',
        }}
      >
        <button
          onClick={() => setPageNum((p) => Math.max(1, p - 1))}
          style={{
            padding: '10px 20px',
            fontSize: '1.1rem',
            marginRight: '10px',
            cursor: 'pointer',
          }}
        >
          上一頁
        </button>

        <span style={{ margin: '0 20px' }}>
          第 {pageNum} 頁 / 共 {pageCount} 頁
        </span>

        <button
          onClick={() => setPageNum((p) => Math.min(pageCount, p + 1))}
          style={{
            padding: '10px 20px',
            fontSize: '1.1rem',
            marginLeft: '10px',
            cursor: 'pointer',
          }}
        >
          下一頁
        </button>
      </div>
      )}
    </div>
  );
};

export default PDFTest;