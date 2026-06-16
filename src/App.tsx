import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import Playback from "@/pages/Playback";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/playback" element={<Playback />} />
      </Routes>
    </Router>
  );
}
