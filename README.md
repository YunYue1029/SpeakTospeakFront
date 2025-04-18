# SpeakTospeakFront
這是一個使用 [Vite](https://vitejs.dev/) 建立的 React 專案，採用 TypeScript 架構，專案結構清晰，模組化設計，方便擴展與維護。

本專案為 **Speak2Speak 語音學習輔助系統**的前端介面，支援：
- PDF 頁面展示
- 每頁文字筆記輸入
- 錄製語音（每頁獨立）
- 播放及下載錄音
- 保留跨頁資料狀態

## 專案結構
```
my-react-app/
├── public/                   
├── src/                      
│   ├── assets/               # 靜態資源
│   ├── components/Navbar/    # 元件
│   ├── pages/                
│   ├── App.tsx               # App 主組件
│   ├── main.tsx              
│   ├── index.css             
│   └── vite-env.d.ts         
├── .gitignore
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── audio.html                # 音訊功能測試頁
├── PDFjsTest.html            # PDF.js 功能測試頁
├── test.html                 # 其他測試頁
└── README.md
```

## 啟動專案

### 安裝依賴

```bash
npm install
```

### 本地啟動開發伺服器
```
npm run dev
```

## 功能

### 製作PDF專屬的演講稿
- 使用者可為每一頁 PDF 簡報錄製專屬語音說明
- 支援原生錄音，錄製後自動生成 `.wav` 檔案
- 可即時播放
- 切換頁面時，筆記與音訊皆保留不消失
