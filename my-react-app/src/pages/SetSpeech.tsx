import React, { useRef, useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/build/pdf.worker.entry';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const SetSpeechPage: React.FC = () => {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [notesByPage, setNotesByPage] = useState<Record<number, string>>({});
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  //recording part
  const [recording, setRecording] = useState(false);
  const [audioUrlsByPage, setAudioUrlsByPage] = useState<Record<number, string>>({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioDataRef = useRef<Float32Array[]>([]);

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
  
  const stopRecording = () => {
    scriptProcessorRef.current?.disconnect();
    mediaStreamSourceRef.current?.disconnect();
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
  
    const wavBlob = exportWAV(audioDataRef.current, audioContextRef.current!.sampleRate);
    const url = URL.createObjectURL(wavBlob);
  
    setAudioUrlsByPage((prev) => ({ ...prev, [pageNum]: url }));
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

          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            style={{
              marginTop: pdfDoc ? '10px' : '0px',
              padding: '10px 10px',
              fontSize: '1rem',
              borderRadius: '6px',
              border: '1px solid #ccc',
              cursor: 'pointer',
            }}
          />
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
            textAlign: 'center',
          }}
        >
          <h3>輸入你的簡報</h3>
          <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '-10px', marginBottom: '10px' }}>
            第 {pageNum} 頁
          </p>
          <textarea
            style={{ 
              width: '90%',
              flex: 1, 
              padding: '10px', 
              fontSize: '1rem', 
              marginBottom: '15px',
              resize: 'none' }}
            placeholder="在這裡輸入你的備註或筆記..."
            value={notesByPage[pageNum] || ''}
            onChange={(e) => {
              const newText = e.target.value;
              setNotesByPage((prev) => ({ ...prev, [pageNum]: newText }));
            }}
          />
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
            {/* 音軌 */}
            {audioUrlsByPage[pageNum] && (
                <div style={{ width: '200px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <audio src={audioUrlsByPage[pageNum]} controls style={{ width: '100%' }} />
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
          fontSize: '1.2rem', // 放大整體文字（包含中間頁碼資訊）
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

export default SetSpeechPage;