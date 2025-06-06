import React, { useRef, useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/build/pdf.worker.entry';
import { useNavigate } from 'react-router-dom';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const SetSpeechPage: React.FC = () => {
  const navigate = useNavigate();
  const [pdfBuffer, setPdfBuffer] = useState<Uint8Array | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [notesByPage, setNotesByPage] = useState<Record<number, string>>({});
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [translationsByPage, setTranslationsByPage] = useState<Record<number, string[]>>({});
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

      setPdfBuffer(typedArray);
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
      const res = await fetch("http://localhost:8000/audioToText", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(`錄音上傳失敗: ${res.status}`);
      const result = await res.json();

      console.log("語音轉文字成功，頁面：", pageNum);
      console.log("結果：", result.transcript);

      // ✅ 將結果填入 notesByPage 對應頁
      setNotesByPage((prev) => ({
        ...prev,
        [pageNum]: result.transcript,
      }));

    } catch (error) {
      console.error("錄音上傳失敗:", error);
    }
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

  const handleCompleteCurrentPage = async () => {
    if (!pdfDoc) return;
    
    if (pageNum < pageCount) {
      setPageNum(pageNum + 1);
    } else {
      alert("✅ 所有頁面皆已完成！");
    }

    const currentNote = notesByPage[pageNum] || "";

    try {
      const res = await fetch("http://localhost:8888/api/gptTranslate/translateToEnglish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chineseSpeech: currentNote,
        }),
      });

      if (!res.ok) throw new Error(`翻譯失敗: ${res.status}`);
      const result = await res.json();
      console.log(`✅ 第 ${pageNum} 頁翻譯成功:`, result.translation);
      const cleanReply = result.reply.replace(/^"(.*)"$/, '$1');

      // 儲存翻譯結果
      const translatedLines = (cleanReply
        .split(/\n{2,}/) as string[])
        .filter(line => line.trim() !== '');

      setTranslationsByPage((prev) => ({
        ...prev,
        [pageNum]: translatedLines,
      }));
    } catch (err) {
      console.error(`❌ 第 ${pageNum} 頁翻譯失敗`, err);
    }

    if (pageNum < pageCount) {
      setPageNum(pageNum + 1);
    } else {
      alert("✅ 所有頁面皆已完成！稍等一下翻譯結果會顯示在右側區域。");
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
          <h3>輸入你的簡報演講稿</h3>
          <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '-10px', marginBottom: '10px' }}>
            第 {pageNum} 頁
          </p>
          <div style={{ width: '90%', flex: 1, marginBottom: '15px' }}>
            {/* 中文輸入區 */}
            <textarea
              style={{
                width: '100%',
                height: '120px',
                padding: '10px',
                fontSize: '1rem',
                resize: 'none',
                border: '1px solid #ccc',
                borderRadius: '4px',
                marginBottom: '10px',
              }}
              placeholder="輸入中文演講稿..."
              value={notesByPage[pageNum] || ''}
              onChange={(e) => {
                const newText = e.target.value;
                setNotesByPage((prev) => ({ ...prev, [pageNum]: newText }));
              }}
            />

            {/* 英文翻譯結果（唯讀） */}
            <textarea
              style={{
                width: '100%',
                height: '100px',
                padding: '10px',
                fontSize: '1rem',
                resize: 'none',
                backgroundColor: '#f1f1f1',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
              placeholder="翻譯結果將顯示於此..."
              value={translationsByPage[pageNum] || ''}
              readOnly
            />
          </div>
            <button
              onClick={handleCompleteCurrentPage}
              style={{
                padding: '10px',
                fontSize: '1rem',
                cursor: 'pointer',
                width: '90%',
                backgroundColor: '#17a2b8',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                marginBottom: '10px',
              }}
            >
              完成當前頁面
            </button>
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
      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <button
          onClick={() => {
            const missingPages: number[] = [];

            if (!pdfDoc || !pdfBuffer) {
              alert("⚠️ 請先上傳一份 PDF 檔案！");
              return;
            }

            for (let i = 1; i <= pageCount; i++) {
              if (!translationsByPage[i] || translationsByPage[i].length === 0) {
                missingPages.push(i);
              }
            }

            if (missingPages.length > 0) {
              alert(`⚠️ 以下頁面尚未完成翻譯：${missingPages.join(", ")}，請先完成再繼續。`);
              return;
            }

            navigate("/PDFTest", {
              state: {
                pdfBuffer,
                translationsByPage,
              },
            });
          }}
          style={{
            padding: '10px 20px',
            fontSize: '1rem',
            backgroundColor: '#007bff',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          下一步
        </button>
      </div>
    </div>
  );
};

export default SetSpeechPage;