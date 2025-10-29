// AudioToggle.tsx
import React, { useState, useEffect } from "react";
import { Mic, MicOff } from "lucide-react";

interface AudioToggleProps {
  className?: string;
}

export const AudioToggle: React.FC<AudioToggleProps> = ({ className }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const cleanups = [
      window.electronAPI.onRecordingStarted(() => setIsRecording(true)),
      window.electronAPI.onRecordingStopped(() => {
        setIsRecording(false);
        setDuration(0);
      }),
    ];

    return () => cleanups.forEach(c => c());
  }, []);

  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(interval);
  }, [isRecording]);

  const toggle = async () => {
    if (isRecording) {
      await window.electronAPI.stopRecording();
    } else {
      await window.electronAPI.startRecording();
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
        isRecording
          ? "bg-red-500/20 border border-red-500/50 text-red-400 animate-pulse"
          : "bg-white/5 border border-white/10 text-white/70 hover:bg-white/10"
      } ${className}`}
    >
      {isRecording ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
      {isRecording && <span className="text-xs">{formatTime(duration)}</span>}
    </button>
  );
};
