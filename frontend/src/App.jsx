import { useEffect, useRef, useState } from "react";
import {
  continueWithoutLocation,
  getCurrentLocation,
  referToMechanic,
  sendMessage,
  sendPhotoMessage,
  startSession,
  submitVehicleInfo,
  transcribeVoice,
} from "./api";
import "./App.css";

const ARABIC_TEXT = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u;

const UI_TEXT = {
  english: {
    assistant: "Mechanic AI",
    you: "You",
    newChat: "+ New chat",
    eyebrow: "AI Mechanic Assistant",
    welcome: "Having difficulties with your vehicle?",
    diagnosing: "Diagnosing",
    vehicleTitle: "Tell me which vehicle this is",
    vehicleHelp: "I will use these details before diagnosing the symptom or asking follow-up questions.",
    year: "Year",
    makeModel: "Make and model",
    continueDiagnosis: "Continue diagnosis",
    findMechanic: "Find a nearby mechanic?",
    locationHelp: "Your exact location is requested only if you choose to share it.",
    useLocation: "Use my location",
    notNow: "Not now",
    listening: "Listening",
    transcribing: "Transcribing speech…",
    addPhoto: "Add photo",
    dropPhoto: "Drop photo",
    remove: "Remove",
    send: "Send",
    placeholder: "Describe your car problem — noise, warning light, smell, vibration…",
    vehiclePlaceholder: "Add the vehicle details above to continue.",
    locationPlaceholder: "Choose a location option above to continue.",
    limitPlaceholder: "Turn limit reached. Start a new chat to continue.",
    startRecording: "Start voice recording",
    stopRecording: "Stop voice recording",
    speakMessage: "Speak your message",
    recordMinimum: "Please record for at least one second, then try again.",
    noAudio: "No audio was recorded. Please try again.",
    recordingFailed: "The voice recording failed. Please try again.",
    transcribeFailed: "Could not transcribe the voice recording.",
    microphoneDenied: "Microphone permission was not granted.",
    microphoneStartFailed: "Could not start voice recording.",
    unsupportedRecording: "Voice recording is not supported by this browser.",
    arabicVoiceMissing: "An Arabic read-aloud voice is not installed in this browser or Windows.",
    readAloud: "Read aloud",
    stopReadAloud: "Stop reading aloud",
    mechanicResults: "Mechanic search results",
    mapSearch: "Search Maps",
    openMaps: "Open in Maps",
    distanceAway: "km away",
    dropVehiclePhoto: "Drop your vehicle photo",
    photoRequirements: "JPEG, PNG, or WebP · up to 4 MB",
  },
  arabic: {
    assistant: "ميكانيكي MeChat",
    you: "أنت",
    newChat: "+ محادثة جديدة",
    eyebrow: "مساعد ميكانيكي بالذكاء الاصطناعي",
    welcome: "هل تواجه مشكلة في سيارتك؟",
    diagnosing: "السيارة قيد التشخيص",
    vehicleTitle: "أدخل بيانات السيارة",
    vehicleHelp: "سأستخدم هذه البيانات قبل تشخيص العطل أو طرح أسئلة المتابعة.",
    year: "سنة الصنع",
    makeModel: "الشركة والطراز",
    continueDiagnosis: "متابعة التشخيص",
    findMechanic: "هل تريد العثور على ميكانيكي قريب؟",
    locationHelp: "لن نطلب موقعك الدقيق إلا إذا اخترت مشاركته.",
    useLocation: "استخدام موقعي",
    notNow: "ليس الآن",
    listening: "جارٍ الاستماع",
    transcribing: "جارٍ تحويل الكلام إلى نص…",
    addPhoto: "إضافة صورة",
    dropPhoto: "أفلت الصورة",
    remove: "إزالة",
    send: "إرسال",
    placeholder: "صِف مشكلة سيارتك — صوت، لمبة تحذير، رائحة، اهتزاز…",
    vehiclePlaceholder: "أدخل بيانات السيارة أعلاه للمتابعة.",
    locationPlaceholder: "اختر أحد خيارات الموقع أعلاه للمتابعة.",
    limitPlaceholder: "وصلت المحادثة إلى الحد الأقصى. ابدأ محادثة جديدة.",
    startRecording: "بدء تسجيل صوتي",
    stopRecording: "إيقاف التسجيل الصوتي",
    speakMessage: "تحدث لوصف المشكلة",
    recordMinimum: "سجّل لمدة ثانية واحدة على الأقل ثم حاول مرة أخرى.",
    noAudio: "لم يتم تسجيل صوت. حاول مرة أخرى.",
    recordingFailed: "فشل التسجيل الصوتي. حاول مرة أخرى.",
    transcribeFailed: "تعذر تحويل التسجيل الصوتي إلى نص.",
    microphoneDenied: "لم يتم السماح باستخدام الميكروفون.",
    microphoneStartFailed: "تعذر بدء التسجيل الصوتي.",
    unsupportedRecording: "التسجيل الصوتي غير مدعوم في هذا المتصفح.",
    arabicVoiceMissing: "لا يوجد صوت عربي للقراءة مثبت في المتصفح أو نظام ويندوز.",
    readAloud: "قراءة الرد بصوت عالٍ",
    stopReadAloud: "إيقاف القراءة",
    mechanicResults: "نتائج البحث عن ميكانيكي",
    mapSearch: "البحث في الخرائط",
    openMaps: "فتح في الخرائط",
    distanceAway: "كم",
    dropVehiclePhoto: "أفلت صورة السيارة هنا",
    photoRequirements: "JPEG أو PNG أو WebP · بحد أقصى 4 ميجابايت",
  },
};

function detectUiLanguage(text, fallback = "english") {
  const value = String(text || "");
  if (ARABIC_TEXT.test(value)) return "arabic";
  return /[A-Za-z]/u.test(value) ? "english" : fallback;
}

function TypingIndicator({ text }) {
  return (
    <div className="message assistant" style={{ padding: "0.6rem 1rem" }}>
      <span className="message-label">{text.assistant}</span>
      <div className="typing-indicator" aria-label={text.assistant}>
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  );
}

function MechanicCard({ mechanic, text }) {
  return (
    <article className="mechanic-card">
      <div>
        <h3>{mechanic.name}</h3>
        <p>{mechanic.address}</p>
        {Number.isFinite(mechanic.distanceKm) && (
          <p className="distance">📍 {mechanic.distanceKm} {text.distanceAway}</p>
        )}
        {mechanic.phone && <p className="phone">📞 {mechanic.phone}</p>}
      </div>
      <a href={mechanic.mapsUrl} target="_blank" rel="noreferrer">
        {mechanic.resultType === "map_search" ? text.mapSearch : text.openMaps}
      </a>
    </article>
  );
}

function App() {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("active");
  const [mechanics, setMechanics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [vehicle, setVehicle] = useState(null);
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleMakeModel, setVehicleMakeModel] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [speakingMessageIndex, setSpeakingMessageIndex] = useState(null);
  const [uiLanguage, setUiLanguage] = useState("english");
  const messagesEndRef = useRef(null);
  const formRef = useRef(null);
  const photoInputRef = useRef(null);
  const textInputRef = useRef(null);
  const photoDragDepthRef = useRef(0);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const discardRecordingRef = useRef(false);

  useEffect(() => {
    async function boot() {
      try {
        const data = await startSession();
        setSessionId(data.sessionId);
        setMessages([]);
      } catch (bootError) {
        setError("Could not connect to the mechanic assistant. Please try again later.");
        console.error(bootError);
      }
    }
    boot();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, mechanics, loading]);

  useEffect(
    () => () => {
      discardRecordingRef.current = true;
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      window.speechSynthesis?.cancel();
    },
    []
  );

  async function handleSend(event) {
    event?.preventDefault();
    const trimmed = input.trim();
    if (
      (!trimmed && !selectedPhoto) ||
      loading ||
      transcribing ||
      isRecording ||
      !sessionId ||
      status === "needs_location" ||
      status === "needs_vehicle_info" ||
      status === "limit"
    ) {
      return;
    }

    const photo = selectedPhoto;
    const outgoingLanguage = trimmed ? detectUiLanguage(trimmed, uiLanguage) : uiLanguage;
    setUiLanguage(outgoingLanguage);
    setError("");
    setLoading(true);
    setInput("");
    setSelectedPhoto(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
    setMessages((current) => [
      ...current,
      {
        role: "user",
        content: trimmed || "Uploaded a vehicle photo.",
        imageUrl: photo?.dataUrl || null,
      },
    ]);

    try {
      const data = photo
        ? await sendPhotoMessage({
            sessionId,
            message: trimmed,
            imageDataUrl: photo.dataUrl,
          })
        : await sendMessage({ sessionId, message: trimmed });
      setStatus(data.status);
      setMechanics(data.mechanics || []);
      setUiLanguage(detectUiLanguage(data.reply, outgoingLanguage));
      setMessages((current) => [...current, { role: "assistant", content: data.reply }]);
    } catch (sendError) {
      setStatus(sendError.data?.status || status);
      setError(sendError.message || "Something went wrong while sending your message.");
      console.error(sendError);
    } finally {
      setLoading(false);
    }
  }

  function selectPhoto(file) {
    if (!file) return;

    const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!supportedTypes.has(file.type)) {
      setError("Choose a JPEG, PNG, or WebP photo.");
      if (photoInputRef.current) photoInputRef.current.value = "";
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("Photo must be 4 MB or smaller.");
      if (photoInputRef.current) photoInputRef.current.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedPhoto({ name: file.name, dataUrl: reader.result });
      setError("");
    };
    reader.onerror = () => setError("Could not read that photo.");
    reader.readAsDataURL(file);
  }

  function handlePhotoSelection(event) {
    selectPhoto(event.target.files?.[0]);
  }

  function handlePhotoDragEnter(event) {
    if (!Array.from(event.dataTransfer.types || []).includes("Files")) return;
    event.preventDefault();
    photoDragDepthRef.current += 1;
    if (!photoUploadDisabled) setIsDraggingPhoto(true);
  }

  function handlePhotoDragOver(event) {
    if (!Array.from(event.dataTransfer.types || []).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = photoUploadDisabled ? "none" : "copy";
  }

  function handlePhotoDragLeave(event) {
    event.preventDefault();
    photoDragDepthRef.current = Math.max(0, photoDragDepthRef.current - 1);
    if (photoDragDepthRef.current === 0) setIsDraggingPhoto(false);
  }

  function handlePhotoDrop(event) {
    event.preventDefault();
    photoDragDepthRef.current = 0;
    setIsDraggingPhoto(false);
    if (photoUploadDisabled) return;
    selectPhoto(event.dataTransfer.files?.[0]);
  }

  function removeSelectedPhoto() {
    setSelectedPhoto(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  function stopVoiceRecording() {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }

  async function handleVoiceRecording() {
    if (isRecording) {
      stopVoiceRecording();
      return;
    }
    if (!sessionId || loading || transcribing || !navigator.mediaDevices || !window.MediaRecorder) {
      if (!navigator.mediaDevices || !window.MediaRecorder) {
        setError(t.unsupportedRecording);
      }
      return;
    }

    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      discardRecordingRef.current = false;
      const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type)) || "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size) audioChunksRef.current.push(event.data);
      };
      recorder.onerror = () => setError(t.recordingFailed);
      recorder.onstop = async () => {
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
        setIsRecording(false);
        setRecordingSeconds(0);
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        if (discardRecordingRef.current) {
          audioChunksRef.current = [];
          discardRecordingRef.current = false;
          return;
        }

        if (Date.now() - startedAt < 1000) {
          audioChunksRef.current = [];
          setError(t.recordMinimum);
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        audioChunksRef.current = [];
        if (!audioBlob.size) {
          setError(t.noAudio);
          return;
        }
        if (audioBlob.size > 4 * 1024 * 1024) {
          setError("Voice recording must be 4 MB or smaller.");
          return;
        }

        setTranscribing(true);
        try {
          const audioDataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("Could not read the voice recording"));
            reader.readAsDataURL(audioBlob);
          });
          const data = await transcribeVoice({ sessionId, audioDataUrl });
          setUiLanguage(data.language === "arabic" ? "arabic" : "english");
          setInput((current) => [current.trim(), data.transcript].filter(Boolean).join(" "));
          requestAnimationFrame(() => textInputRef.current?.focus());
        } catch (voiceError) {
          setError(voiceError.message || t.transcribeFailed);
          console.error(voiceError);
        } finally {
          setTranscribing(false);
        }
      };

      // A single finalized recording is more reliable for Whisper than a set of
      // very small timeslice chunks, especially in Chromium-based browsers.
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      const startedAt = Date.now();
      recordingTimerRef.current = setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAt) / 1000);
        setRecordingSeconds(seconds);
        if (seconds >= 30) stopVoiceRecording();
      }, 250);
    } catch (voiceError) {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      setError(
        voiceError.name === "NotAllowedError"
          ? t.microphoneDenied
          : t.microphoneStartFailed
      );
    }
  }

  function handleReadAloud(text, index) {
    if (!window.speechSynthesis) {
      setError("Read aloud is not supported by this browser.");
      return;
    }
    if (speakingMessageIndex === index) {
      window.speechSynthesis.cancel();
      setSpeakingMessageIndex(null);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const isArabic = ARABIC_TEXT.test(text);
    utterance.lang = isArabic ? "ar-EG" : "en-US";
    const matchingVoice = window.speechSynthesis
      .getVoices()
      .find((voice) => voice.lang.toLowerCase().startsWith(isArabic ? "ar" : "en"));
    if (matchingVoice) utterance.voice = matchingVoice;
    if (isArabic && !matchingVoice && window.speechSynthesis.getVoices().length) {
      setError(UI_TEXT.arabic.arabicVoiceMissing);
      return;
    }
    utterance.rate = 1;
    utterance.onend = () => setSpeakingMessageIndex(null);
    utterance.onerror = () => setSpeakingMessageIndex(null);
    setSpeakingMessageIndex(index);
    window.speechSynthesis.speak(utterance);
  }

  async function handleFindMechanics() {
    if (!sessionId || loading) return;
    setLoading(true);
    setError("");

    try {
      const location = await getCurrentLocation();
      const data = await referToMechanic({ sessionId, location });
      setStatus(data.status);
      setMechanics(data.mechanics || []);
      setUiLanguage(detectUiLanguage(data.reply, uiLanguage));
      setMessages((current) => [...current, { role: "assistant", content: data.reply }]);
    } catch (locationError) {
      const locationDenied = typeof locationError.code === "number";
      setError(
        locationDenied
          ? "Location was not shared. Choose Not now if you want to continue without it."
          : locationError.message || "Could not find nearby mechanics."
      );
      console.error(locationError);
    } finally {
      setLoading(false);
    }
  }

  async function handleVehicleSubmit(event) {
    event.preventDefault();
    if (!sessionId || loading || !vehicleYear || !vehicleMakeModel.trim()) return;
    setLoading(true);
    setError("");

    try {
      const data = await submitVehicleInfo({
        sessionId,
        year: vehicleYear,
        makeModel: vehicleMakeModel.trim(),
      });
      setVehicle(data.vehicle || { year: Number(vehicleYear), makeModel: vehicleMakeModel.trim() });
      setStatus(data.status);
      setUiLanguage(detectUiLanguage(data.reply, uiLanguage));
      setMessages((current) => [...current, { role: "assistant", content: data.reply }]);
    } catch (vehicleError) {
      setError(vehicleError.message || "Could not save the vehicle information.");
      console.error(vehicleError);
    } finally {
      setLoading(false);
    }
  }

  async function handleContinueWithoutLocation() {
    if (!sessionId || loading) return;
    setLoading(true);
    setError("");
    try {
      const data = await continueWithoutLocation(sessionId);
      setStatus(data.status);
      setUiLanguage(detectUiLanguage(data.reply, uiLanguage));
      setMessages((current) => [...current, { role: "assistant", content: data.reply }]);
    } catch (continueError) {
      setError(continueError.message || "Could not continue the chat.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  async function handleNewChat() {
    discardRecordingRef.current = true;
    stopVoiceRecording();
    window.speechSynthesis?.cancel();
    setSpeakingMessageIndex(null);
    setTranscribing(false);
    setLoading(true);
    setError("");
    setMechanics([]);
    setStatus("active");
    setVehicle(null);
    setVehicleYear("");
    setVehicleMakeModel("");
    setSelectedPhoto(null);
    setMessages([]);
    setUiLanguage("english");
    if (photoInputRef.current) photoInputRef.current.value = "";
    try {
      const data = await startSession();
      setSessionId(data.sessionId);
      setMessages([]);
    } catch (bootError) {
      setError("Could not start a new chat session.");
      console.error(bootError);
    } finally {
      setLoading(false);
    }
  }

  const isLocked = status === "limit";
  const needsLocation = status === "needs_location";
  const needsVehicleInfo = status === "needs_vehicle_info";
  const photoUploadDisabled =
    loading || transcribing || isRecording || isLocked || needsLocation || needsVehicleInfo;
  const voiceInputDisabled = loading || transcribing || isLocked || needsLocation || needsVehicleInfo;
  const isWelcomeScreen = messages.length === 0 && !needsLocation && !needsVehicleInfo;
  const t = UI_TEXT[uiLanguage];
  const interfaceDirection = uiLanguage === "arabic" ? "rtl" : "ltr";

  return (
    <div
      className="page-drop-zone"
      onDragEnter={handlePhotoDragEnter}
      onDragOver={handlePhotoDragOver}
      onDragLeave={handlePhotoDragLeave}
      onDrop={handlePhotoDrop}
    >
      <div className="app-shell">
      <header className="top-bar">
        <div className="top-bar-brand">
          <div className="brand-icon" aria-hidden="true">
            <img src="/favicon.svg" alt="" />
          </div>
          <div>
            <p className="eyebrow">{t.eyebrow}</p>
            <h1>MeChat</h1>
          </div>
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={handleNewChat}
          disabled={loading || transcribing}
        >
          {t.newChat}
        </button>
      </header>

      {vehicle && (
        <p className="vehicle-badge" dir={interfaceDirection}>
          {t.diagnosing}: {vehicle.year} {vehicle.makeModel}
        </p>
      )}

      <main className={`chat-panel${isWelcomeScreen ? " welcome-mode" : ""}`}>
        <div className="messages" aria-live="polite">
          {isWelcomeScreen && (
            <section className="welcome-prompt">
              <h2>{t.welcome}</h2>
            </section>
          )}
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`message ${message.role}`}
              dir="auto"
            >
              <span className="message-label">{message.role === "user" ? t.you : t.assistant}</span>
              {message.imageUrl && (
                <img className="message-photo" src={message.imageUrl} alt="Vehicle uploaded by user" />
              )}
              <p dir="auto">{message.content}</p>
              {message.role === "assistant" && (
                <button
                  type="button"
                  className="read-aloud-button"
                  onClick={() => handleReadAloud(message.content, index)}
                  aria-label={speakingMessageIndex === index ? t.stopReadAloud : t.readAloud}
                  title={speakingMessageIndex === index ? t.stopReadAloud : t.readAloud}
                >
                  {speakingMessageIndex === index ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M7 7h10v10H7z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 10v4h3l4 3V7L8 10H5z" />
                      <path d="M15 9.5a4 4 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          ))}

          {mechanics.length > 0 && (
            <section className="mechanic-results">
              <h2>{t.mechanicResults}</h2>
              <div className="mechanic-grid">
                {mechanics.map((mechanic) => (
                  <MechanicCard key={`${mechanic.name}-${mechanic.mapsUrl}`} mechanic={mechanic} text={t} />
                ))}
              </div>
              {mechanics.some((mechanic) => mechanic.dataSource?.includes("OpenStreetMap")) && (
                <p className="map-attribution">© OpenStreetMap contributors</p>
              )}
            </section>
          )}

          {loading && <TypingIndicator text={t} />}
          <div ref={messagesEndRef} />
        </div>

        {error && <p className="error-banner" role="alert">{error}</p>}

        {needsVehicleInfo && (
          <form className="vehicle-intake" dir={interfaceDirection} onSubmit={handleVehicleSubmit}>
            <div>
              <strong>{t.vehicleTitle}</strong>
              <p>{t.vehicleHelp}</p>
            </div>
            <div className="vehicle-fields">
              <label>
                {t.year}
                <input
                  type="number"
                  min="1886"
                  max={new Date().getFullYear() + 1}
                  value={vehicleYear}
                  onChange={(event) => setVehicleYear(event.target.value)}
                  placeholder="2018"
                  required
                />
              </label>
              <label>
                {t.makeModel}
                <input
                  type="text"
                  maxLength={100}
                  value={vehicleMakeModel}
                  onChange={(event) => setVehicleMakeModel(event.target.value)}
                  placeholder="Toyota Corolla"
                  required
                />
              </label>
              <button type="submit" disabled={loading || !vehicleYear || !vehicleMakeModel.trim()}>
                {t.continueDiagnosis}
              </button>
            </div>
          </form>
        )}

        {needsLocation && (
          <section className="location-consent" dir={interfaceDirection} aria-label={t.findMechanic}>
            <div>
              <strong>{t.findMechanic}</strong>
              <p>{t.locationHelp}</p>
            </div>
            <div className="consent-actions">
              <button type="button" onClick={handleFindMechanics} disabled={loading}>
                {t.useLocation}
              </button>
              <button type="button" className="secondary-button" onClick={handleContinueWithoutLocation} disabled={loading}>
                {t.notNow}
              </button>
            </div>
          </section>
        )}

        <form
          ref={formRef}
          className="composer"
          onSubmit={handleSend}
        >
          {selectedPhoto && (
            <div className="selected-photo">
              <img src={selectedPhoto.dataUrl} alt="Selected vehicle upload preview" />
              <span>{selectedPhoto.name}</span>
              <button type="button" onClick={removeSelectedPhoto} aria-label="Remove selected photo">
                {t.remove}
              </button>
            </div>
          )}
          {(isRecording || transcribing) && (
            <div className={`voice-status${isRecording ? " recording" : ""}`} role="status">
              <span className="voice-status-dot" />
              {isRecording
                ? `${t.listening}… ${Math.min(recordingSeconds, 30)}s / 30s`
                : t.transcribing}
            </div>
          )}
          <div className="composer-tools">
            <label className="photo-upload-button" aria-label={t.addPhoto}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4.75 5.75h14.5v12.5H4.75z" />
                <path d="m7.25 15 3.1-3.2 2.45 2.35 1.7-1.7 2.25 2.55" />
                <circle cx="15.5" cy="9.25" r="1.25" />
              </svg>
              <span>{isDraggingPhoto ? t.dropPhoto : t.addPhoto}</span>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoSelection}
                disabled={photoUploadDisabled}
              />
            </label>
            <button
              type="button"
              className={`voice-input-button${isRecording ? " recording" : ""}`}
              onClick={handleVoiceRecording}
              disabled={voiceInputDisabled && !isRecording}
              aria-label={isRecording ? t.stopRecording : t.startRecording}
              title={isRecording ? t.stopRecording : t.speakMessage}
            >
              {isRecording ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 7h10v10H7z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M6.5 11a5.5 5.5 0 0 0 11 0M12 16.5V21M9 21h6" />
                </svg>
              )}
            </button>
          </div>
          <textarea
            ref={textInputRef}
            dir="auto"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isLocked
                ? t.limitPlaceholder
                : needsLocation
                  ? t.locationPlaceholder
                  : needsVehicleInfo
                    ? t.vehiclePlaceholder
                    : t.placeholder
            }
            rows={3}
            maxLength={2000}
            disabled={
              loading || transcribing || isRecording || isLocked || needsLocation || needsVehicleInfo
            }
          />
          <button
            type="submit"
            disabled={
              loading ||
              transcribing ||
              isRecording ||
              isLocked ||
              needsLocation ||
              needsVehicleInfo ||
              (!input.trim() && !selectedPhoto)
            }
          >
            {t.send}
          </button>
        </form>
      </main>
      </div>
      {isDraggingPhoto && (
        <div className="photo-drop-overlay" role="status" aria-live="polite">
          <div>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
              <path d="M5 14v4.25A1.75 1.75 0 0 0 6.75 20h10.5A1.75 1.75 0 0 0 19 18.25V14" />
            </svg>
            <strong>{t.dropVehiclePhoto}</strong>
            <span>{t.photoRequirements}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
