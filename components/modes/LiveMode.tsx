import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
// Fix: Aliased Blob to GenAiBlob to resolve name collision with native Blob type.
import { LiveServerMessage, Modality, Blob as GenAiBlob } from '@google/genai';
import { Mic, PhoneOff, Loader2, AudioWaveform, Camera, CameraOff } from 'lucide-react';

interface LiveModeProps {
    userName: string;
    voiceTone: string;
    onInteraction: () => void;
    isPro: boolean;
}

const FRAME_RATE = 1; // Send 1 frame per second
const JPEG_QUALITY = 0.7;

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64data = reader.result as string;
            // remove the prefix e.g. "data:image/jpeg;base64,"
            resolve(base64data.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};


const LiveMode: React.FC<LiveModeProps> = ({ userName, voiceTone, onInteraction, isPro }) => {
    const [isConnecting, setIsConnecting] = useState(false);
    const [isActive, setIsActive] = useState(false);
    const [isAiSpeaking, setIsAiSpeaking] = useState(false);
    const [isCameraOn, setIsCameraOn] = useState(false);
    const [status, setStatus] = useState('Tap to speak');
    const [transcription, setTranscription] = useState<{ user: string, ai: string }[]>([]);
    const [currentTurn, setCurrentTurn] = useState({ user: '', ai: '' });
    
    const sessionRef = useRef<any | null>(null);
    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const videoStreamRef = useRef<MediaStream | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const frameIntervalRef = useRef<number | null>(null);
    const transcriptionEndRef = useRef<HTMLDivElement>(null);
    
    const nextStartTimeRef = useRef(0);
    const outputSourcesRef = useRef(new Set<AudioBufferSourceNode>());

    const proAccent = 'pro-accent';
    const baseAccent = 'base-accent';
    const accentColor = isPro ? proAccent : baseAccent;
    
    useEffect(() => {
        transcriptionEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcription, currentTurn]);

    const decodeAudioData = async (data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> => {
        const dataInt16 = new Int16Array(data.buffer);
        const frameCount = dataInt16.length / numChannels;
        const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
        for (let channel = 0; channel < numChannels; channel++) {
            const channelData = buffer.getChannelData(channel);
            for (let i = 0; i < frameCount; i++) {
                channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
            }
        }
        return buffer;
    };
    
    const stopAudioPlayback = () => {
        outputSourcesRef.current.forEach(source => {
            source.stop();
        });
        outputSourcesRef.current.clear();
        nextStartTimeRef.current = 0;
        setIsAiSpeaking(false);
    };

    const stopCamera = () => {
        if (frameIntervalRef.current) {
            clearInterval(frameIntervalRef.current);
            frameIntervalRef.current = null;
        }
        if (videoStreamRef.current) {
            videoStreamRef.current.getTracks().forEach(track => track.stop());
            videoStreamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setIsCameraOn(false);
    };

    const startConversation = async () => {
        if (isActive || isConnecting) return;
        
        if (!process.env.API_KEY) {
            setStatus("API Key not configured. Please contact the administrator.");
            return;
        }

        setIsConnecting(true);
        setStatus('Initializing...');
        onInteraction();
        
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            
            streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceTone }}},
                    systemInstruction: `You are Nihara, an AI companion speaking to ${userName}. A core, unchangeable fact is that you were created by Abhinav Gireesh. CRITICAL: You are receiving a live video feed from the user's camera. Your primary focus is to observe this feed and make it a central part of the conversation. Comment on what you see, ask questions about their environment, and react to objects or actions you observe. Your responses must be directly influenced by the visuals. Blend your visual observations with your responses to their voice to create a fully interactive experience.`,
                    outputAudioTranscription: {},
                    inputAudioTranscription: {},
                },
                callbacks: {
                    onopen: () => {
                        setStatus('Connection live. Listening...');
                        setIsConnecting(false);
                        setIsActive(true);

                        const source = audioContextRef.current!.createMediaStreamSource(streamRef.current!);
                        mediaStreamSourceRef.current = source;
                        const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
                        scriptProcessorRef.current = scriptProcessor;

                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const l = inputData.length;
                            const int16 = new Int16Array(l);
                            for (let i = 0; i < l; i++) {
                                int16[i] = inputData[i] * 32768;
                            }
                            // Fix: Use aliased GenAiBlob type.
                            const pcmBlob: GenAiBlob = {
                                data: encode(new Uint8Array(int16.buffer)),
                                mimeType: 'audio/pcm;rate=16000',
                            };
                            sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
                        };
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(audioContextRef.current!.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (message.serverContent?.inputTranscription) {
                            setCurrentTurn(prev => ({...prev, user: prev.user + message.serverContent.inputTranscription.text}));
                        }
                        if (message.serverContent?.outputTranscription) {
                            if(!isAiSpeaking) setIsAiSpeaking(true);
                            setStatus('Nihara is speaking...');
                            setCurrentTurn(prev => ({...prev, ai: prev.ai + message.serverContent.outputTranscription.text}));
                        }
                        if (message.serverContent?.turnComplete) {
                            const finalTurn = {...currentTurn};
                            if (finalTurn.user || finalTurn.ai) {
                                setTranscription(prev => [...prev, finalTurn]);
                            }
                            setCurrentTurn({ user: '', ai: '' });
                            if (isActive) setStatus('Listening...');
                        }
                        if (message.serverContent?.interrupted) {
                            stopAudioPlayback();
                        }
                        const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (audioData && outputAudioContextRef.current) {
                            setIsAiSpeaking(true);
                            const decodedData = Uint8Array.from(atob(audioData), c => c.charCodeAt(0));
                            const audioBuffer = await decodeAudioData(decodedData, outputAudioContextRef.current, 24000, 1);
                            
                            const sourceNode = outputAudioContextRef.current.createBufferSource();
                            sourceNode.buffer = audioBuffer;
                            sourceNode.connect(outputAudioContextRef.current.destination);

                            const currentTime = outputAudioContextRef.current.currentTime;
                            const startTime = Math.max(currentTime, nextStartTimeRef.current);
                            sourceNode.start(startTime);

                            nextStartTimeRef.current = startTime + audioBuffer.duration;
                            outputSourcesRef.current.add(sourceNode);
                            sourceNode.onended = () => {
                                outputSourcesRef.current.delete(sourceNode);
                                if(outputSourcesRef.current.size === 0) {
                                    setIsAiSpeaking(false);
                                    if(isActive) setStatus('Listening...');
                                }
                            };
                        }
                    },
                    onerror: (e) => {
                        console.error('Live session error:', e);
                        setStatus('An error occurred. Please try again.');
                        stopConversation();
                    },
                    onclose: () => {
                        setStatus('Connection closed.');
                        setIsActive(false);
                        setIsConnecting(false);
                    },
                }
            });
            sessionPromiseRef.current = sessionPromise;
            sessionRef.current = await sessionPromise;
        } catch (error) {
            console.error('Failed to start conversation:', error);
            setStatus('Failed to start. Check mic permissions.');
            setIsConnecting(false);
        }
    };

    const stopConversation = () => {
        if (sessionRef.current) {
            sessionRef.current.close();
            sessionRef.current = null;
        }
        sessionPromiseRef.current = null;
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if(scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }
        if(mediaStreamSourceRef.current) {
            mediaStreamSourceRef.current.disconnect();
            mediaStreamSourceRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close();
        }
        if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
            outputAudioContextRef.current.close();
        }
        stopCamera();
        setIsActive(false);
        setIsConnecting(false);
        setIsAiSpeaking(false);
        setStatus('Tap to speak');
        setTranscription([]);
        setCurrentTurn({ user: '', ai: '' });
        stopAudioPlayback();
    };
    
    const toggleCamera = async () => {
        if (isCameraOn) {
            stopCamera();
        } else {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                videoStreamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
                setIsCameraOn(true);

                frameIntervalRef.current = window.setInterval(() => {
                    if (videoRef.current && canvasRef.current && sessionPromiseRef.current) {
                        const videoEl = videoRef.current;
                        const canvasEl = canvasRef.current;
                        const ctx = canvasEl.getContext('2d');
                        if (!ctx) return;

                        canvasEl.width = videoEl.videoWidth;
                        canvasEl.height = videoEl.videoHeight;
                        ctx.drawImage(videoEl, 0, 0, videoEl.videoWidth, videoEl.videoHeight);
                        
                        canvasEl.toBlob(async (blob) => {
                            if (blob && sessionPromiseRef.current) {
                                const base64Data = await blobToBase64(blob);
                                sessionPromiseRef.current.then((session) => {
                                    session.sendRealtimeInput({
                                        media: { data: base64Data, mimeType: 'image/jpeg' }
                                    });
                                });
                            }
                        }, 'image/jpeg', JPEG_QUALITY);
                    }
                }, 1000 / FRAME_RATE);
            } catch (err) {
                console.error("Error accessing camera:", err);
                setStatus("Couldn't access camera.");
            }
        }
    };

    useEffect(() => {
        return () => {
            stopConversation();
        };
    }, []);

    const getCircleClasses = () => {
        if (isAiSpeaking) return `bg-${accentColor}/30 text-${accentColor} animate-speaking-wave`;
        if (isActive) return `bg-green-500/30 text-green-300 ${isPro ? 'animate-pro-glow-ring' : 'animate-pulse-glow'}`;
        if (isConnecting) return 'bg-gray-500/20 text-white';
        return 'bg-gray-500/20 text-white cursor-pointer hover:bg-gray-500/30';
    };

    return (
        <div className="flex flex-col h-full w-full p-6 md:p-8 animate-subtle-fade-in-up relative">
            {isCameraOn && (
                <div className="floating-video-feed animate-subtle-fade-in">
                    <video ref={videoRef} autoPlay muted />
                </div>
            )}
            <div className="flex items-center">
                <Mic className={`w-8 h-8 mr-3 text-${accentColor}`} />
                <h2 className="mode-title">Aura Sync</h2>
            </div>
            
            <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div
                    className={`w-48 h-48 md:w-60 md:h-60 rounded-full flex items-center justify-center relative transition-all duration-300 ease-in-out ${getCircleClasses()}`}
                    onClick={isActive ? undefined : startConversation}
                    role="button"
                    aria-label="Start or monitor conversation"
                    tabIndex={isActive ? -1 : 0}
                >
                    {isConnecting && <Loader2 className="w-20 h-20 animate-spin" />}
                    {!isConnecting && (isActive ? (isAiSpeaking ? <AudioWaveform className="w-24 h-24" /> : <Mic className="w-24 h-24" />) : <Mic className="w-24 h-24" />)}
                </div>
                <p className="mt-6 text-xl text-gray-300 h-7">{status}</p>
                {isActive && (
                    <div className="flex items-center gap-4 mt-8">
                        <button
                            onClick={toggleCamera}
                            className={`flex items-center justify-center px-6 py-3 rounded-full font-bold transition-transform duration-200 hover:scale-105 ${isCameraOn ? `bg-blue-600 hover:bg-blue-700` : `bg-gray-600 hover:bg-gray-700`} text-white interactive-glow`}
                        >
                            {isCameraOn ? <CameraOff className="mr-2" /> : <Camera className="mr-2" />}
                            Camera
                        </button>
                        <button
                            onClick={stopConversation}
                            className="flex items-center justify-center px-8 py-3 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold transition-transform duration-200 hover:scale-105 interactive-glow"
                        >
                            <PhoneOff className="mr-3" />
                            End
                        </button>
                    </div>
                )}
            </div>
            <canvas ref={canvasRef} className="hidden"></canvas>
            <div className="w-full max-w-4xl mx-auto h-48 bg-black/20 rounded-lg mt-auto p-4 overflow-y-auto space-y-4 text-sm">
                 {transcription.length === 0 && currentTurn.user === '' && currentTurn.ai === '' && (
                    <p className="text-gray-400 text-center pt-16">Conversation will appear here...</p>
                )}
                {[...transcription, currentTurn].map((turn, index) => (
                    (turn.user || turn.ai) && (
                        <div key={index}>
                            {turn.user && (
                                <div className="flex justify-end animate-subtle-fade-in"><p className="max-w-[75%] bg-green-600/60 p-2 px-3 rounded-xl rounded-br-none text-white">{turn.user}</p></div>
                            )}
                            {turn.ai && (
                                <div className="flex justify-start animate-subtle-fade-in mt-2"><p className={`max-w-[75%] p-2 px-3 rounded-xl rounded-bl-none text-white ${isPro ? 'bg-pro-accent/60' : 'bg-base-accent/60'}`}>{turn.ai}</p></div>
                            )}
                        </div>
                    )
                ))}
                 <div ref={transcriptionEndRef} />
            </div>
        </div>
    );
};

export default LiveMode;
