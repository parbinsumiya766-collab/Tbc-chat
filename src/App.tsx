import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import { Send, Loader2, Trash2, Mic, Volume2, VolumeX, Sparkles, Info, X, Phone, Sun, Moon, Paperclip, ImagePlus, XCircle, Download } from 'lucide-react';
import LiveCallModal from './components/LiveCallModal';

declare global {
  interface Window {
    aistudio?: {
      openSelectKey?: () => Promise<void>;
      hasSelectedApiKey?: () => Promise<boolean>;
    };
  }
}

type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
  isError?: boolean;
  imageUrl?: string;
  attachedImageUrl?: string;
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Welcome to TBC Premium Assistant! Created by Abir. How can I help you today? ✨\n\nটিবিসি প্রিমিয়াম অ্যাসিস্ট্যান্টে স্বাগতম! আমি কীভাবে সাহায্য করতে পারি? ✨'
    }
  ]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceLang, setVoiceLang] = useState('bn-BD');
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [showAbout, setShowAbout] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as 'light' | 'dark') || 'dark';
  });
  const [attachedImage, setAttachedImage] = useState<{data: string, mimeType: string, previewUrl: string} | null>(null);
  const [isImageMode, setIsImageMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('theme', theme);
  }, [theme]);
  
  const isDark = theme === 'dark';

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      
      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');
        setInput(transcript);
      };
      
      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
      };
      
      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  useEffect(() => {
    // Pre-load voices for more natural speech synthesis
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.lang = voiceLang;
        recognitionRef.current.start();
        setIsListening(true);
      } else {
        alert("Speech recognition is not supported in this browser.");
      }
    }
  };

  const speakText = (text: string) => {
    if (!voiceOutputEnabled || !window.speechSynthesis) return;
    
    window.speechSynthesis.cancel(); // Stop any current speech
    
    // Remove markdown symbols for better speech
    const cleanText = text.replace(/[#*`_]/g, '');
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const voices = window.speechSynthesis.getVoices();
    
    const langPrefix = voiceLang.split('-')[0];
    
    // Filter voices by exact language or language prefix
    const matchingVoices = voices.filter(v => v.lang === voiceLang || v.lang.startsWith(langPrefix));
    
    // Sort voices to prioritize premium/natural ones
    matchingVoices.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      
      const scoreVoice = (name: string) => {
        let score = 0;
        if (name.includes('premium') || name.includes('neural') || name.includes('natural')) score += 10;
        if (name.includes('google')) score += 5;
        if (name.includes('microsoft')) score += 3;
        if (name.includes('online')) score += 2;
        return score;
      };
      
      return scoreVoice(bName) - scoreVoice(aName);
    });

    const selectedVoice = matchingVoices[0] || voices.find(v => v.lang.startsWith('en'));

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    
    utterance.lang = voiceLang;
    utterance.rate = langPrefix === 'bn' ? 0.95 : 1.0;
    utterance.pitch = langPrefix === 'en' ? 1.05 : 1.0;
    
    window.speechSynthesis.speak(utterance);
  };

  const clearChat = () => {
    if (window.confirm('Are you sure you want to clear the chat history?')) {
      window.speechSynthesis?.cancel();
      setMessages([{
        id: Date.now().toString(),
        role: 'model',
        text: 'Chat history cleared. How can I help you today? ✨\n\nচ্যাট হিস্ট্রি মুছে ফেলা হয়েছে। আমি আপনাকে কীভাবে সাহায্য করতে পারি? ✨'
      }]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      setAttachedImage({
        data: base64String,
        mimeType: file.type,
        previewUrl: URL.createObjectURL(file)
      });
      setIsImageMode(false);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleStartCall = async () => {
    if (window.aistudio?.hasSelectedApiKey) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey && window.aistudio?.openSelectKey) {
        await window.aistudio.openSelectKey();
      }
    }
    setIsCallActive(true);
  };

  const handleSend = async () => {
    if (!input.trim() && !attachedImage && !isImageMode) return;

    const currentInput = input;
    const currentAttachedImage = attachedImage;
    const currentIsImageMode = isImageMode;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: currentInput,
      attachedImageUrl: currentAttachedImage?.previewUrl
    };

    setMessages(prev => [...prev, userMsg]);
    
    setInput('');
    setAttachedImage(null);
    setIsGenerating(true);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      const ai = new GoogleGenAI(apiKey ? { apiKey } : {});

      if (currentAttachedImage || currentIsImageMode) {
        const parts: any[] = [];
        if (currentAttachedImage) {
          parts.push({
            inlineData: {
              data: currentAttachedImage.data,
              mimeType: currentAttachedImage.mimeType
            }
          });
        }
        parts.push({ text: currentInput || (currentIsImageMode ? 'Generate an image' : 'Describe this image') });
        
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts }
        });
        
        let generatedImageUrl = '';
        let responseText = '';
        
        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            generatedImageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          } else if (part.text) {
            responseText += part.text;
          }
        }
        
        const finalMsgText = responseText || (generatedImageUrl ? (currentAttachedImage ? 'Here is the edited image:' : 'Here is your generated image:') : 'Done.');
        
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'model',
          text: finalMsgText,
          imageUrl: generatedImageUrl
        }]);
        
        if (responseText) speakText(responseText);

      } else {
        const history = messages.filter(m => !m.isError && m.id !== 'welcome').map(m => {
           return { role: m.role, parts: [{ text: m.text }] };
        });
        
        history.push({ role: 'user', parts: [{ text: currentInput }] });

        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite-preview',
          contents: history,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            systemInstruction: `You are TBC (or TBC Premium Assistant), a helpful, polite, and premium AI voice assistant. You support multiple languages including English, Bengali, Spanish, French, Hindi, Arabic, Chinese, and Japanese.

CRITICAL RULES:
1. Your name is TBC. You must NEVER say you are Gemini, Google, or created by Google.
2. Keep your replies EXTREMELY SHORT, smart, and concise for ultra-fast speed. 1-2 sentences maximum.
3. Always reply in the exact same language the user used.
4. If anyone asks who created you or asks about Abir, you MUST say that you were created by Abir. Provide Abir's details beautifully:
   - Address: Batisha, Bosontopur, Kazi Para, Chauddagram, Cumilla, Bangladesh.
   - Contact (Premium Facebook Link): https://www.facebook.com/share/14XvypVioW1/`,
          }
        });

        const responseText = response.text || '';

        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'model',
          text: responseText
        }]);

        speakText(responseText);
      }

    } catch (error: any) {
      console.error(error);
      
      const isAuthOrQuotaError = 
        error.message?.includes('Requested entity was not found') || 
        error.message?.includes('PERMISSION_DENIED') || 
        error.status === 403 || 
        error.message?.includes('403') ||
        error.message?.includes('RESOURCE_EXHAUSTED') ||
        error.status === 429 ||
        error.message?.includes('429') ||
        error.message?.includes('quota');

      if (isAuthOrQuotaError) {
        if (window.aistudio?.openSelectKey) {
           await window.aistudio.openSelectKey();
           setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'model',
            text: `API Key updated. Please try your request again. Make sure you are using an API key from a paid Google Cloud project with available quota.`,
            isError: true
          }]);
          setIsGenerating(false);
          return;
        }
      }

      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: `Error: ${error.message || 'Something went wrong.'}`,
        isError: true
      }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`flex flex-col h-screen font-sans transition-colors duration-300 ${isDark ? 'bg-[#000000] text-gray-200 selection:bg-white/20' : 'bg-gray-50 text-gray-900 selection:bg-emerald-500/30'}`}>
      <header className={`backdrop-blur-xl border-b p-4 flex items-center justify-between z-20 sticky top-0 transition-colors duration-300 ${isDark ? 'bg-black/50 border-white/5' : 'bg-white/70 border-gray-200'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center border transition-colors duration-300 ${isDark ? 'bg-[#111111] border-white/10' : 'bg-white border-gray-200 shadow-sm'}`}>
            <Sparkles className={`w-5 h-5 ${isDark ? 'text-white' : 'text-emerald-600'}`} />
          </div>
          <div>
            <h1 className={`font-medium text-lg leading-tight tracking-wide ${isDark ? 'text-white' : 'text-gray-900'}`}>TBC Premium</h1>
            <p className={`text-[10px] font-medium tracking-[0.2em] uppercase ${isDark ? 'text-gray-500' : 'text-emerald-600'}`}>Voice Assistant</p>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className={`p-2.5 rounded-full transition-all ${isDark ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'}`}
            title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button 
            onClick={handleStartCall}
            className={`p-2.5 rounded-full transition-all ${isDark ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'}`}
            title="Start Audio Call"
          >
            <Phone className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setShowAbout(true)}
            className={`p-2.5 rounded-full transition-all ${isDark ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'}`}
            title="About Creator"
          >
            <Info className="w-5 h-5" />
          </button>
          <button 
            onClick={() => {
              setVoiceOutputEnabled(!voiceOutputEnabled);
              if (voiceOutputEnabled) window.speechSynthesis?.cancel();
            }}
            className={`p-2.5 rounded-full transition-all ${voiceOutputEnabled ? (isDark ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200') : (isDark ? 'text-red-400 hover:bg-red-400/10' : 'text-red-500 hover:bg-red-100')}`}
            title={voiceOutputEnabled ? "Mute Voice Output" : "Enable Voice Output"}
          >
            {voiceOutputEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
          <button 
            onClick={clearChat}
            className={`p-2.5 rounded-full transition-all ${isDark ? 'text-gray-400 hover:text-red-400 hover:bg-red-400/10' : 'text-gray-500 hover:text-red-600 hover:bg-red-100'}`}
            title="Clear Chat"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className={`flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scroll-smooth pb-32 transition-colors duration-300 ${isDark ? 'bg-[#000000]' : 'bg-gray-50'}`}>
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
          >
            <div 
              className={`max-w-[85%] sm:max-w-[75%] rounded-3xl p-5 ${
                msg.role === 'user' 
                  ? (isDark ? 'bg-[#2A2A2A] text-white rounded-br-sm' : 'bg-emerald-600 text-white rounded-br-sm shadow-md')
                  : msg.isError 
                    ? (isDark ? 'bg-red-950/30 text-red-400 border border-red-900/50 rounded-bl-sm' : 'bg-red-50 text-red-600 border border-red-200 rounded-bl-sm')
                    : (isDark ? 'bg-[#111111] text-gray-300 border border-white/5 rounded-bl-sm' : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-sm')
              }`}
            >
              <div className={`prose prose-sm sm:prose-base max-w-none ${msg.role === 'user' ? 'prose-invert' : (isDark ? 'prose-invert' : 'prose-emerald')}`}>
                {msg.attachedImageUrl && (
                  <img src={msg.attachedImageUrl} alt="Attached" className="max-w-full h-auto rounded-xl mb-3 border border-white/10" />
                )}
                <ReactMarkdown>{msg.text}</ReactMarkdown>
                {msg.imageUrl && (
                  <div className="relative group mt-3 inline-block">
                    <img src={msg.imageUrl} alt="Generated" className="max-w-full h-auto rounded-xl border border-white/10 shadow-lg" />
                    <button 
                      onClick={() => {
                        const a = document.createElement('a');
                        a.href = msg.imageUrl!;
                        a.download = `tbc-image-${Date.now()}.png`;
                        a.click();
                      }}
                      className="absolute bottom-3 right-3 p-2.5 bg-black/60 hover:bg-black/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
                      title="Download Image"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        
        {isGenerating && (
          <div className="flex justify-start animate-in fade-in duration-300">
            <div className={`border rounded-3xl rounded-bl-sm p-4 flex items-center gap-3 transition-colors duration-300 ${isDark ? 'bg-[#111111] border-white/5 text-gray-400' : 'bg-white border-gray-200 text-gray-500 shadow-sm'}`}>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-medium tracking-wide">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      <div className={`fixed bottom-0 left-0 right-0 p-2 sm:p-4 pb-2 sm:pb-4 pointer-events-none z-10 transition-colors duration-300 ${isDark ? 'bg-gradient-to-t from-[#000000] via-[#000000]/90 to-transparent' : 'bg-gradient-to-t from-gray-50 via-gray-50/90 to-transparent'}`}>
        <div className="max-w-3xl mx-auto pointer-events-auto relative">
          
          {attachedImage && (
            <div className="absolute -top-20 left-4 relative inline-block mb-2">
              <div className="relative inline-block">
                <img src={attachedImage.previewUrl} alt="Preview" className="h-16 w-16 object-cover rounded-lg border-2 border-emerald-500 shadow-lg" />
                <button onClick={() => setAttachedImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors">
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className={`flex flex-col gap-2 p-3 rounded-[2rem] border transition-all shadow-2xl ${isDark ? 'bg-[#111111] border-white/10 focus-within:border-white/20' : 'bg-white border-gray-200 focus-within:border-emerald-300'} ${isImageMode ? 'ring-2 ring-emerald-500/50' : ''}`}>
            {/* Top Toolbar */}
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-1 sm:gap-2">
                <button 
                  onClick={toggleListening}
                  className={`p-2.5 rounded-full transition-all shrink-0 flex items-center justify-center ${isListening ? 'bg-red-500/20 text-red-500 animate-pulse' : (isDark ? 'bg-transparent text-gray-400 hover:text-white hover:bg-white/5' : 'bg-transparent text-gray-500 hover:text-emerald-600 hover:bg-gray-100')}`}
                  title={isListening ? "Stop Listening" : "Start Voice Input"}
                >
                  <Mic className="w-5 h-5" />
                </button>
                <select
                  value={voiceLang}
                  onChange={(e) => setVoiceLang(e.target.value)}
                  className={`bg-transparent text-[10px] font-bold outline-none cursor-pointer text-center uppercase tracking-widest transition-colors appearance-none ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
                  title="Voice Language"
                >
                  <option value="bn-BD" className={isDark ? 'bg-[#111111]' : 'bg-white'}>BN</option>
                  <option value="en-US" className={isDark ? 'bg-[#111111]' : 'bg-white'}>EN</option>
                  <option value="es-ES" className={isDark ? 'bg-[#111111]' : 'bg-white'}>ES</option>
                  <option value="fr-FR" className={isDark ? 'bg-[#111111]' : 'bg-white'}>FR</option>
                  <option value="hi-IN" className={isDark ? 'bg-[#111111]' : 'bg-white'}>HI</option>
                  <option value="ar-SA" className={isDark ? 'bg-[#111111]' : 'bg-white'}>AR</option>
                  <option value="zh-CN" className={isDark ? 'bg-[#111111]' : 'bg-white'}>ZH</option>
                  <option value="ja-JP" className={isDark ? 'bg-[#111111]' : 'bg-white'}>JA</option>
                </select>
                <div className={`w-px h-5 mx-1 ${isDark ? 'bg-white/10' : 'bg-gray-200'}`}></div>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-2.5 rounded-full transition-all shrink-0 flex items-center justify-center ${isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-500 hover:text-emerald-600 hover:bg-gray-100'}`}
                  title="Attach Image"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => { setIsImageMode(!isImageMode); setAttachedImage(null); }}
                  className={`p-2.5 rounded-full transition-all shrink-0 flex items-center justify-center ${isImageMode ? 'bg-emerald-500/20 text-emerald-500' : (isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-500 hover:text-emerald-600 hover:bg-gray-100')}`}
                  title="Image Generation Mode"
                >
                  <ImagePlus className="w-5 h-5" />
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
              </div>
            </div>

            {/* Bottom Input Area */}
            <div className="flex items-end gap-2 px-2 pb-1">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isImageMode ? "Describe the image to generate..." : "Message TBC Premium..."}
                className={`flex-1 max-h-40 min-h-[56px] bg-transparent border-none focus:ring-0 resize-none py-4 px-2 font-medium text-base sm:text-lg leading-relaxed ${isDark ? 'text-white placeholder-gray-600' : 'text-gray-900 placeholder-gray-400'}`}
                rows={1}
                style={{ height: 'auto' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${Math.min(target.scrollHeight, 160)}px`;
                }}
              />
              
              <button 
                onClick={handleSend}
                disabled={(!input.trim() && !attachedImage && !isImageMode) || isGenerating}
                className={`mb-1 p-4 rounded-full transition-all shrink-0 ${isDark ? 'bg-white hover:bg-gray-200 disabled:bg-white/5 disabled:text-gray-600 text-black' : 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-100 disabled:text-gray-400 text-white shadow-md'}`}
              >
                {isGenerating ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6 ml-0.5" />}
              </button>
            </div>
          </div>
          <div className={`text-center mt-4 text-[10px] font-medium tracking-widest uppercase ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
            Powered by Gemini • Created by Abir
          </div>
        </div>
      </div>

      {showAbout && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md transition-colors duration-300 ${isDark ? 'bg-black/80' : 'bg-gray-900/40'}`}>
          <div className={`rounded-[2rem] border shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${isDark ? 'bg-[#111111] border-white/10' : 'bg-white border-gray-100'}`}>
            <div className={`p-8 relative border-b ${isDark ? 'text-white border-white/5' : 'text-gray-900 border-gray-100'}`}>
              <button 
                onClick={() => setShowAbout(false)}
                className={`absolute top-6 right-6 p-2 rounded-full transition-colors ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'}`}
              >
                <X className="w-5 h-5" />
              </button>
              <h2 className={`text-2xl font-medium mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>About the Creator</h2>
              <p className={`text-sm font-medium tracking-wide ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>TBC Premium Assistant</p>
            </div>
            <div className={`p-8 space-y-6 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
              <div>
                <h3 className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Name</h3>
                <p className={`font-medium text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>Abir</p>
              </div>
              <div>
                <h3 className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Location</h3>
                <p className={`font-medium leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Batisha, Bosontopur, Kazi Para, Chauddagram, Cumilla, Bangladesh</p>
              </div>
              <div>
                <h3 className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>Contact</h3>
                <a 
                  href="https://www.facebook.com/share/14XvypVioW1/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-2 font-medium transition-colors ${isDark ? 'text-white hover:text-gray-300' : 'text-emerald-600 hover:text-emerald-700'}`}
                >
                  Premium Facebook Profile
                  <Sparkles className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-emerald-500'}`} />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {isCallActive && (
        <LiveCallModal 
          apiKey={process.env.GEMINI_API_KEY || ''} 
          onClose={() => setIsCallActive(false)} 
        />
      )}
    </div>
  );
}
