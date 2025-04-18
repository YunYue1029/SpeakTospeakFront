import React from 'react';
import { useNavigate } from 'react-router-dom';

const HomePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', lineHeight: 1.6 }}>
      <h1 style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: '30px' }}>
        Welcome to Speak2Speak
      </h1>

      <p><strong>Speak2Speak</strong> 是一個設計給語言學習者的輔助工具，幫助使用者：</p>
      <ul style={{ paddingLeft: '1.5rem' }}>
        <li>📄 上傳 PDF 簡報並逐頁瀏覽</li>
        <li>📝 對每一頁簡報進行筆記與文字輸入</li>
        <li>🎙 為每一頁錄製語音紀錄</li>
        <li>🔁 在頁面間切換時，保留對應的筆記與錄音資料</li>
      </ul>

      <p>您可以在上方導覽列中點擊 <strong>Audio</strong> 或其他功能頁面來開始使用系統。</p>

      <div style={{ marginTop: '40px', textAlign: 'center' }}>
        <img
          src="https://cdn-icons-png.flaticon.com/512/2920/2920277.png"
          alt="microphone"
          style={{ width: '150px', opacity: 0.6 }}
        />
        <p style={{ marginTop: '10px', fontStyle: 'italic' }}>
          提升口說表達，從 Speak2Speak 開始。
        </p>

        <button
          onClick={() => navigate('/setspeech')}
          style={{
            marginTop: '30px',
            padding: '12px 24px',
            fontSize: '1.2rem',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Start
        </button>
      </div>
    </div>
  );
};

export default HomePage;