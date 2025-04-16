# SpeakTospeakFront
這是一個使用 [Vite](https://vitejs.dev/) 建立的 React 專案，採用 TypeScript 架構，專案結構清晰，模組化設計，方便擴展與維護。

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