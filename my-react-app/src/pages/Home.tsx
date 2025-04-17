import React, { useRef, useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/build/pdf.worker.entry';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const HomePage: React.FC = () => {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [notes, setNotes] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
    const viewport = page.getViewport({ scale: 1.0 });

    const scale = Math.min((window.innerWidth * 0.35) / viewport.width, (window.innerHeight * 0.8) / viewport.height);
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

  const handleDownload = () => {
    if (canvasRef.current) {
      const link = document.createElement('a');
      link.href = canvasRef.current.toDataURL('image/jpeg', 1.0);
      link.download = `PDF_Page_${pageNum}.jpg`;
      link.click();
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <input type="file" accept="application/pdf" onChange={handleFileChange} style={{ display: 'block', margin: '10px auto' }} />
      <div style={{ display: 'flex', gap: '20px', marginTop: 20 }}>
        {/* 左側 PDF 預覽 */}
        <div style={{ flex: 1, background: '#eee', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '80vh' }} />
        </div>

        {/* 右側文字輸入 */}
        <div style={{ flex: 1 }}>
          <h3>輸入區</h3>
          <textarea
            style={{ width: '100%', height: '70vh', padding: '10px', fontSize: '1rem' }}
            placeholder="在這裡輸入你的備註或筆記..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {/* 控制按鈕列 */}
      {pdfDoc && (
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button onClick={() => setPageNum((p) => Math.max(1, p - 1))}>上一頁</button>
          <span style={{ margin: '0 10px' }}>第 {pageNum} 頁 / 共 {pageCount} 頁</span>
          <button onClick={() => setPageNum((p) => Math.min(pageCount, p + 1))}>下一頁</button>
          <button onClick={handleDownload} style={{ marginLeft: 10 }}>下載 JPG</button>
        </div>
      )}
    </div>
  );
};

export default HomePage;