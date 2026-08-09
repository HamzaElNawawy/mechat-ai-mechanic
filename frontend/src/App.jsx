import { useEffect, useRef, useState } from "react";
import {
  continueWithoutLocation,
  getCurrentLocation,
  referToMechanic,
  sendMessage,
  sendPhotoMessage,
  startSession,
  submitVehicleInfo,
} from "./api";
import "./App.css";

function TypingIndicator() {
  return (
    <div className="message assistant" style={{ padding: "0.6rem 1rem" }}>
      <span className="message-label">Mechanic AI</span>
      <div className="typing-indicator" aria-label="Mechanic AI is responding">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  );
}

function MechanicCard({ mechanic }) {
  return (
    <article className="mechanic-card">
      <div>
        <h3>{mechanic.name}</h3>
        <p>{mechanic.address}</p>
        {Number.isFinite(mechanic.distanceKm) && (
          <p className="distance">📍 {mechanic.distanceKm} km away</p>
        )}
        {mechanic.phone && <p className="phone">📞 {mechanic.phone}</p>}
      </div>
      <a href={mechanic.mapsUrl} target="_blank" rel="noreferrer">
        {mechanic.resultType === "map_search" ? "Search Maps" : "Open in Maps"}
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
  const messagesEndRef = useRef(null);
  const formRef = useRef(null);
  const photoInputRef = useRef(null);
  const photoDragDepthRef = useRef(0);

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

  async function handleSend(event) {
    event?.preventDefault();
    const trimmed = input.trim();
    if (
      (!trimmed && !selectedPhoto) ||
      loading ||
      !sessionId ||
      status === "needs_location" ||
      status === "needs_vehicle_info" ||
      status === "limit"
    ) {
      return;
    }

    const photo = selectedPhoto;
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

  async function handleFindMechanics() {
    if (!sessionId || loading) return;
    setLoading(true);
    setError("");

    try {
      const location = await getCurrentLocation();
      const data = await referToMechanic({ sessionId, location });
      setStatus(data.status);
      setMechanics(data.mechanics || []);
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
    setLoading(true);
    setError("");
    setMechanics([]);
    setStatus("active");
    setVehicle(null);
    setVehicleYear("");
    setVehicleMakeModel("");
    setSelectedPhoto(null);
    setMessages([]);
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
  const photoUploadDisabled = loading || isLocked || needsLocation || needsVehicleInfo;
  const isWelcomeScreen = messages.length === 0 && !needsLocation && !needsVehicleInfo;

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
            <p className="eyebrow">AI Mechanic Assistant</p>
            <h1>MeChat</h1>
          </div>
        </div>
        <button type="button" className="ghost-button" onClick={handleNewChat} disabled={loading}>
          + New chat
        </button>
      </header>

      {vehicle && (
        <p className="vehicle-badge" aria-label="Vehicle used for this diagnosis">
          Diagnosing: {vehicle.year} {vehicle.makeModel}
        </p>
      )}

      <main className={`chat-panel${isWelcomeScreen ? " welcome-mode" : ""}`}>
        <div className="messages" aria-live="polite">
          {isWelcomeScreen && (
            <section className="welcome-prompt">
              <h2>Having difficulties with your vehicle?</h2>
            </section>
          )}
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`message ${message.role}`}>
              <span className="message-label">{message.role === "user" ? "You" : "Mechanic AI"}</span>
              {message.imageUrl && (
                <img className="message-photo" src={message.imageUrl} alt="Vehicle uploaded by user" />
              )}
              <p>{message.content}</p>
            </div>
          ))}

          {mechanics.length > 0 && (
            <section className="mechanic-results">
              <h2>Mechanic search results</h2>
              <div className="mechanic-grid">
                {mechanics.map((mechanic) => (
                  <MechanicCard key={`${mechanic.name}-${mechanic.mapsUrl}`} mechanic={mechanic} />
                ))}
              </div>
              {mechanics.some((mechanic) => mechanic.dataSource?.includes("OpenStreetMap")) && (
                <p className="map-attribution">© OpenStreetMap contributors</p>
              )}
            </section>
          )}

          {loading && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {error && <p className="error-banner" role="alert">{error}</p>}

        {needsVehicleInfo && (
          <form className="vehicle-intake" onSubmit={handleVehicleSubmit}>
            <div>
              <strong>Tell me which vehicle this is</strong>
              <p>I will use these details before diagnosing the symptom or asking follow-up questions.</p>
            </div>
            <div className="vehicle-fields">
              <label>
                Year
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
                Make and model
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
                Continue diagnosis
              </button>
            </div>
          </form>
        )}

        {needsLocation && (
          <section className="location-consent" aria-label="Location sharing choice">
            <div>
              <strong>Find a nearby mechanic?</strong>
              <p>Your exact location is requested only if you choose to share it.</p>
            </div>
            <div className="consent-actions">
              <button type="button" onClick={handleFindMechanics} disabled={loading}>
                Use my location
              </button>
              <button type="button" className="secondary-button" onClick={handleContinueWithoutLocation} disabled={loading}>
                Not now
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
                Remove
              </button>
            </div>
          )}
          <label className="photo-upload-button" aria-label="Add a vehicle photo">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4.75 5.75h14.5v12.5H4.75z" />
              <path d="m7.25 15 3.1-3.2 2.45 2.35 1.7-1.7 2.25 2.55" />
              <circle cx="15.5" cy="9.25" r="1.25" />
            </svg>
            <span>{isDraggingPhoto ? "Drop photo" : "Add photo"}</span>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoSelection}
              disabled={photoUploadDisabled}
            />
          </label>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isLocked
                ? "Turn limit reached. Start a new chat to continue."
                : needsLocation
                  ? "Choose a location option above to continue."
                  : needsVehicleInfo
                    ? "Add the vehicle details above to continue."
                  : "Describe your car problem — noise, warning light, smell, vibration…"
            }
            rows={3}
            maxLength={2000}
            disabled={loading || isLocked || needsLocation || needsVehicleInfo}
          />
          <button
            type="submit"
            disabled={
              loading ||
              isLocked ||
              needsLocation ||
              needsVehicleInfo ||
              (!input.trim() && !selectedPhoto)
            }
          >
            Send
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
            <strong>Drop your vehicle photo</strong>
            <span>JPEG, PNG, or WebP · up to 4 MB</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
