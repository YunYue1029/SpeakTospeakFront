import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar/Navbar';

import Home from './pages/Home';
import About from './pages/About';
import Audio from './pages/Audio';

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/audio" element={<Audio />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;