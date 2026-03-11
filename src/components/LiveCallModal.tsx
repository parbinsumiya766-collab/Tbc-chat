import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { PhoneOff, Mic, MicOff, Volume2, Send } from 'lucide-react';

interface LiveCallModalProps {
  onClose: () => void;
  apiKey: string;
}

export default function LiveCallModal({ onClose, apiKey }: LiveCallModalProps) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [errorMsg, setErrorMsg] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [textInput, setTextInput] = useState('');
  
  const isMutedRef = useRef(false);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  
  const nextPlayTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const handleSendText = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!textInput.trim() || status !== 'connected') return;
    
    try {
      sessionRef.current?.send({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: textInput }] }],
          turnComplete: true
        }
      });
      setTextInput('');
    } catch (err) {
      console.error("Error sending text:", err);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const ai = new GoogleGenAI({ apiKey });

    const startCall = async () => {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const playCtx = new AudioContextClass({ sampleRate: 24000 });
        playAudioContextRef.current = playCtx;
        nextPlayTimeRef.current = playCtx.currentTime;

        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { 
            sampleRate: 16000, 
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } 
        });
        streamRef.current = stream;
        const recCtx = new AudioContextClass({ sampleRate: 16000 });
        audioContextRef.current = recCtx;
        
        const source = recCtx.createMediaStreamSource(stream);
        const processor = recCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;
        
        source.connect(processor);
        processor.connect(recCtx.destination);

        const sessionPromise = ai.live.connect({
          model: "gemini-2.5-flash-native-audio-preview-09-2025",
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
            },
            systemInstruction: `You are TBC (or TBC Premium Assistant), a helpful, polite, and premium AI voice assistant. You support multiple languages including English, Bengali, Spanish, French, Hindi, Arabic, Chinese, and Japanese.

CRITICAL RULES:
1. Your name is TBC. You must NEVER say you are Gemini, Google, or created by Google.
2. Provide clear, detailed, and engaging conversational responses. Speak naturally and explain things thoroughly when asked.
3. Always reply in the exact same language the user used.
4. If anyone asks who created you or asks about Abir, you MUST say that you were created by a boy named Abir. Provide Abir's details beautifully:
   - Address: Batisha, Bosontopur, Kazi Para, Chauddagram, Cumilla, Bangladesh.
   - Contact (Premium Facebook Link): https://www.facebook.com/share/14XvypVioW1/`,
          },
          callbacks: {
            onopen: () => {
              if (!isMounted) return;
              setStatus('connected');
              
              processor.onaudioprocess = (e) => {
                if (isMutedRef.current) return;
                
                const inputData = e.inputBuffer.getChannelData(0);
                const pcm16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                  pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
                }
                
                const buffer = new Uint8Array(pcm16.buffer);
                let binary = '';
                for (let i = 0; i < buffer.byteLength; i++) {
                  binary += String.fromCharCode(buffer[i]);
                }
                const base64 = btoa(binary);
                
                sessionPromise.then(session => {
                  session.sendRealtimeInput({
                    media: { data: base64, mimeType: 'audio/pcm;rate=16000' }
                  });
                }).catch(console.error);
              };
            },
            onmessage: async (message: any) => {
              if (!isMounted) return;
              
              if (message.serverContent?.interrupted) {
                activeSourcesRef.current.forEach(s => {
                  try { s.stop(); } catch (e) {}
                });
                activeSourcesRef.current = [];
                if (playAudioContextRef.current) {
                  nextPlayTimeRef.current = playAudioContextRef.current.currentTime;
                }
                setIsModelSpeaking(false);
              }

              const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
              if (base64Audio && playAudioContextRef.current) {
                setIsModelSpeaking(true);
                const binaryString = atob(base64Audio);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                const pcm16 = new Int16Array(bytes.buffer);
                
                const audioBuffer = playAudioContextRef.current.createBuffer(1, pcm16.length, 24000);
                const channelData = audioBuffer.getChannelData(0);
                for (let i = 0; i < pcm16.length; i++) {
                  channelData[i] = pcm16[i] / 32768;
                }

                const playSource = playAudioContextRef.current.createBufferSource();
                playSource.buffer = audioBuffer;
                playSource.connect(playAudioContextRef.current.destination);
                
                const startTime = Math.max(playAudioContextRef.current.currentTime, nextPlayTimeRef.current);
                playSource.start(startTime);
                nextPlayTimeRef.current = startTime + audioBuffer.duration;
                
                activeSourcesRef.current.push(playSource);
                playSource.onended = () => {
                  activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== playSource);
                  if (activeSourcesRef.current.length === 0) {
                    setIsModelSpeaking(false);
                  }
                };
              }
            },
            onclose: () => {
              if (isMounted) setStatus('error');
            },
            onerror: (err: any) => {
              console.error("Live API Error:", err);
              if (isMounted) {
                setStatus('error');
                setErrorMsg(err.message || "Connection failed");
              }
            }
          }
        });
        
        sessionRef.current = await sessionPromise;
        
      } catch (err: any) {
        console.error("Setup Error:", err);
        if (isMounted) {
          setStatus('error');
          setErrorMsg(err.message || "Failed to access microphone or connect.");
        }
      }
    };

    startCall();

    return () => {
      isMounted = false;
      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current.onaudioprocess = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (playAudioContextRef.current) {
        playAudioContextRef.current.close();
      }
      if (sessionRef.current) {
        try { sessionRef.current.close(); } catch (e) {}
      }
    };
  }, [apiKey]);

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md transition-colors duration-700 ${isModelSpeaking ? 'bg-emerald-950/40' : 'bg-black/80'}`}>
      <div className={`relative bg-gradient-to-b from-gray-900 to-black rounded-[3rem] p-8 w-full max-w-sm flex flex-col items-center shadow-2xl border transition-all duration-500 overflow-hidden ${isModelSpeaking ? 'border-emerald-500/50 shadow-[0_0_50px_rgba(16,185,129,0.3)]' : 'border-gray-800'}`}>
        
        {/* Background ambient glow when speaking */}
        <div className={`absolute inset-0 bg-emerald-500/10 transition-opacity duration-500 pointer-events-none ${isModelSpeaking ? 'opacity-100 animate-pulse' : 'opacity-0'}`} />

        <div className="relative z-10 text-center mb-12 mt-4">
          <h2 className="text-2xl font-bold text-white mb-2">AI Assistant</h2>
          <p className="text-emerald-400 font-medium transition-opacity">
            {status === 'connecting' && 'Connecting...'}
            {status === 'connected' && (isModelSpeaking ? 'Speaking...' : 'Listening...')}
            {status === 'error' && 'Call Ended'}
          </p>
        </div>

        <div className="relative z-10 w-40 h-40 mb-16 flex items-center justify-center">
          {status === 'connected' && isModelSpeaking && (
            <>
              <div className="absolute inset-[-20%] bg-emerald-500/20 rounded-full animate-ping" style={{ animationDuration: '2s' }}></div>
              <div className="absolute inset-0 bg-emerald-500/30 rounded-full animate-ping" style={{ animationDuration: '1.5s' }}></div>
              <div className="absolute inset-4 bg-emerald-500/40 rounded-full animate-pulse" style={{ animationDuration: '1s' }}></div>
            </>
          )}
          
          <div className={`relative z-20 w-32 h-32 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 ${isModelSpeaking ? 'bg-emerald-500 scale-110 shadow-[0_0_30px_rgba(16,185,129,0.6)]' : 'bg-gray-800'}`}>
            <Volume2 className={`w-12 h-12 transition-all duration-300 ${isModelSpeaking ? 'text-white animate-bounce scale-110' : 'text-emerald-500'}`} />
          </div>
        </div>

        {status === 'error' && errorMsg && (
          <div className="relative z-10 text-red-400 text-sm mb-6 text-center px-4">
            {errorMsg}
          </div>
        )}

        <div className="relative z-10 flex items-center gap-6 mt-auto mb-4">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            disabled={status !== 'connected'}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
              isMuted ? 'bg-white text-black' : 'bg-gray-800 text-white hover:bg-gray-700'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>
          
          <button 
            onClick={onClose}
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-500/30 transition-transform hover:scale-105"
          >
            <PhoneOff className="w-7 h-7" />
          </button>
        </div>

        <form onSubmit={handleSendText} className="relative z-10 w-full mt-4 flex items-center gap-2 bg-gray-800/50 p-2 rounded-full border border-gray-700 focus-within:border-emerald-500/50 transition-colors">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Type a message..."
            disabled={status !== 'connected'}
            className="flex-1 bg-transparent border-none text-white placeholder-gray-500 px-4 focus:outline-none focus:ring-0 text-sm"
          />
          <button
            type="submit"
            disabled={!textInput.trim() || status !== 'connected'}
            className="w-10 h-10 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
