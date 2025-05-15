import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar/Navbar';

import Home from './pages/Home';
import About from './pages/About';
import Audio from './pages/Audio';
import SetSpeech from './pages/SetSpeech';
import AudioTest from './pages/audioTest';
import PDFTest from './pages/PDFTest';

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/audio" element={<Audio />} />
        <Route path="/setspeech" element={<SetSpeech />} />
        <Route path="/audiotest" element={<AudioTest />} />
        <Route path="/PDFTest" element={<PDFTest />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;