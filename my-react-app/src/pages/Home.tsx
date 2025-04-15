import React, { useRef, useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/build/pdf.worker.entry';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const HomePage: React.FC = () => {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [pageCount, setPageCount] = useState(0);
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
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    const scale = Math.min((window.innerWidth * 0.8) / viewport.width, (window.innerHeight * 0.8) / viewport.height);
    const adjustedViewport = page.getViewport({ scale });

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
    <div style={{ textAlign: 'center' }}>
      <h2>PDF.js 內嵌 PDF 檢視器</h2>
      <input type="file" accept="application/pdf" onChange={handleFileChange} />
      <div style={{ background: '#eee', margin: '20px auto', width: '80vw', height: '80vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <canvas ref={canvasRef} style={{ maxWidth: '90%', maxHeight: '90%' }} />
      </div>
      {pdfDoc && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '10px' }}>
          <button onClick={() => setPageNum((p) => Math.max(1, p - 1))}>上一頁</button>
          <span>第 {pageNum} 頁 / 共 {pageCount} 頁</span>
          <button onClick={() => setPageNum((p) => Math.min(pageCount, p + 1))}>下一頁</button>
          <button onClick={handleDownload}>下載 JPG</button>
        </div>
      )}
    </div>
  );
};

export default HomePage;