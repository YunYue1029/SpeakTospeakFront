import React, { useRef, useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/build/pdf.worker.entry';
import WaveSurfer from 'wavesurfer.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

type PageResult = {
  speech: string;
  predict: string;
  suggestion: string;
  differences?: string[];
};

const Rehearsals: React.FC = () => {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  //recording part
  const [recording, setRecording] = useState(false);
  const [audioUrlsByPage, setAudioUrlsByPage] = useState<Record<number, string>>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioDataRef = useRef<Float32Array[]>([]);

  const [PageResults, setPageResults] = useState<Record<number, PageResult>>({});

  const currentPage: PageResult = PageResults[pageNum] || {
    speech: '',
    predict: '',
    suggestion: '',
    differences: [],
  };

  const waveformRef = useRef<HTMLDivElement | null>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  useEffect(() => {
    if (!audioUrlsByPage[pageNum]) return;

    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current!,
      waveColor: '#ccc',
      progressColor: '#007bff',
      cursorColor: '#000',
      barWidth: 2,
      height: 60,
    });

    wavesurfer.load(audioUrlsByPage[pageNum]);
    wavesurferRef.current = wavesurfer;

    return () => {
      wavesurfer.destroy();
    };
  }, [audioUrlsByPage, pageNum]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function () {
        const typedArray = new Uint8Array(this.result as ArrayBuffer);

        loadPDF(typedArray);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const loadPDF = async (data: Uint8Array) => {
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    setPdfDoc(pdf);
    setPageCount(pdf.numPages);
    setPageNum(1);
  };

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
    scriptProcessorRef.current?.disconnect();
    mediaStreamSourceRef.current?.disconnect();
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());

    const wavBlob = exportWAV(audioDataRef.current, audioContextRef.current!.sampleRate);
    const url = URL.createObjectURL(wavBlob);
    setAudioUrlsByPage((prev) => ({ ...prev, [pageNum]: url }));
    setRecording(false);

    const formData = new FormData();
    formData.append("file", wavBlob, "recording.wav");

    try {
      const response = await fetch('http://localhost:8888/api/agent/rehearsals_agent', {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();

      const parsed = typeof result.reply === 'string'
        ? JSON.parse(result.reply.content?.replace(/```json\s*|\s*```/g, '') || '{}')
        : result;

      setPageResults((prev) => ({
        ...prev,
        [pageNum]: {
          speech: parsed.speech || '',
          predict: parsed.predict || '',
          suggestion: parsed.suggestion || '',
          differences: parsed.differences || [],
        }
      }));

    } catch (error) {
      console.error("錄音上傳失敗:", error);
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

          {!pdfDoc && (
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              style={{
                marginTop: '10px',
                padding: '10px 10px',
                fontSize: '1rem',
                borderRadius: '6px',
                border: '1px solid #ccc',
                cursor: 'pointer',
              }}
            />
          )}

          <div style={{ display: 'flex', gap: '30px',width: '100%', marginTop: 20, background: 'white'}}>
            {/* 音軌 */}
            {audioUrlsByPage[pageNum] && (
              <div
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'flex-start',
                }}
              >
                <button
                  onClick={() => wavesurferRef.current?.playPause()}
                  style={{
                    marginTop: '10px',
                    padding: '6px 14px',
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                  }}
                >
                  ▶️ 播放 / 暫停
                </button>
                <div ref={waveformRef} style={{ width: '80%', height: '60px', marginTop: '10px' }} />
              </div>
            )}
          </div>
        </div>

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
            textAlign: 'center',
          }}
        >
          <h3>輸入</h3>
          <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '-10px', marginBottom: '10px' }}>
            第 {pageNum} 頁
          </p>
          <div style={{ width: '90%', flex: 1, marginBottom: '15px' }}>
            {/* 中文輸入區 */}
            <textarea
              style={{
                width: '100%',
                height: '150px',
                padding: '10px',
                fontSize: '1rem',
                resize: 'none',
                backgroundColor: '#f1f1f1',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
              placeholder="你的口說"
              value={currentPage.speech}
              readOnly
            />

            <div
            style={{
                width: '100%',
                height: '150px',
                padding: '10px',
                fontSize: '1rem',
                resize: 'none',
                backgroundColor: '#f1f1f1',
                border: '1px solid #ccc',
                borderRadius: '4px',
                textAlign: 'left',
              }}
            dangerouslySetInnerHTML={{
              __html: highlightText(currentPage.predict || '', currentPage.differences || []),
            }}
          />

            <textarea
              style={{
                width: '100%',
                height: '150px',
                padding: '10px',
                fontSize: '1rem',
                resize: 'none',
                backgroundColor: '#f1f1f1',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
              placeholder="建議"
              value={currentPage.suggestion}
              readOnly
            />
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
            <div style={{ width: '200px' }}>
              <button
                onClick={recording ? stopRecording : startRecording}
                style={{
                  padding: '10px',
                  fontSize: '1rem',
                  cursor: 'pointer',
                  width: '90%',
                  backgroundColor: recording ? '#dc3545' : '#007bff',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                }}
              >
                {recording ? '⏹ 停止錄音' : '🎙 開始錄音'}
              </button>
            </div>
            
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

export default Rehearsals;