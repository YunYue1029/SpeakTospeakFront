import { Link } from 'react-router-dom';
import './Navbar.css';

function Navbar() {
  return (
    <nav style={{ padding: '1rem', background: '#282c34', color: 'white' }}>
      <h2 style={{ display: 'inline', marginRight: '2rem' }}>Speak2Speack</h2>
      <Link to="/" style={{ color: 'white', marginRight: '1rem' }}>首頁</Link>
      <Link to="/SetSpeech" style={{ color: 'white', marginRight: '1rem' }}>開始</Link>
      <Link to="/audiotest" style={{ color: 'white', marginRight: '1rem' }}>語音測試</Link>
      <Link to="/about" style={{ color: 'white' }}>關於</Link>
      <Link to="/pdf" style={{ color: 'white', marginLeft: '2rem' }}>PDF測試</Link>
    </nav>
  );
}

export default Navbar;