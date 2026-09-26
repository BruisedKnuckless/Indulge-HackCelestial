import { useState, useRef, useEffect } from 'react';
import { Camera, X, RefreshCw, Upload, AlertCircle } from 'lucide-react';
import { Spinner } from '../ui';

export default function CameraCaptureModal({ isOpen, onClose, onCapture, parameterName }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  const [facingMode, setFacingMode] = useState('environment'); // 'environment' (back) or 'user' (front)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  // Check for camera devices
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    async function checkDevices() {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');
        if (isMounted) {
          setHasMultipleCameras(videoDevices.length > 1);
        }
      } catch {
        // ignore
      }
    }

    checkDevices();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Start camera stream when modal opens or facingMode changes
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    let isMounted = true;
    startCamera(facingMode);

    return () => {
      isMounted = false;
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const startCamera = async (mode) => {
    setLoading(true);
    setError(null);
    stopCamera();

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera API is not supported on this browser or connection (HTTPS/localhost required).');
      }

      let stream;
      try {
        // Try requested facing mode (ideal for phone back cameras)
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
      } catch (err) {
        // Fallback to any available video source (ideal for laptops or desktop webcams)
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setLoading(false);
    } catch (err) {
      console.error('Camera access error:', err);
      let msg = 'Could not access the camera.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission was denied. Please allow camera access in your browser settings.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No camera hardware found on this device.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'Camera is already in use by another application.';
      }
      setError(msg);
      setLoading(false);
    }
  };

  // Flip camera between front and back
  const handleToggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Take photo snapshot from active video stream
  const handleSnap = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    // If front facing mode, mirror horizontally for natural feel
    if (facingMode === 'user') {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `evidence-${Date.now()}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });
        stopCamera();
        onCapture(file);
        onClose();
      },
      'image/jpeg',
      0.92
    );
  };

  // Fallback to file picker
  const handleFilePicked = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopCamera();
    onCapture(file);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col justify-between animate-fadeIn">
      {/* Top Bar */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent text-white z-10">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/70 block">
            Camera Capture
          </span>
          <h3 className="font-extrabold text-sm sm:text-base text-white truncate max-w-xs sm:max-w-md">
            {parameterName || 'Evidence Photo'}
          </h3>
        </div>

        <button
          type="button"
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
          title="Close camera"
        >
          <X size={18} />
        </button>
      </div>

      {/* Main Viewfinder Area */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-3 z-10">
            <Spinner size="sm" label="Starting camera..." />
            <p className="text-xs text-white/80">Turning on camera...</p>
          </div>
        )}

        {error ? (
          <div className="p-6 max-w-sm text-center text-white space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center">
              <AlertCircle size={24} />
            </div>
            <p className="text-sm font-semibold text-white/90 leading-relaxed">
              {error}
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => startCamera(facingMode)}
                className="py-2.5 px-4 rounded-xl font-bold text-xs bg-white text-black hover:bg-white/90 transition-colors"
              >
                Retry Camera
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="py-2.5 px-4 rounded-xl font-bold text-xs bg-white/20 hover:bg-white/30 text-white transition-colors flex items-center justify-center gap-1.5"
              >
                <Upload size={14} />
                <span>Upload from Device Instead</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`w-full h-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`}
            />

            {/* Viewfinder Target Reticle */}
            <div className="absolute inset-8 sm:inset-16 pointer-events-none border-2 border-white/30 rounded-3xl flex items-center justify-center">
              <div className="w-8 h-8 border-t-2 border-l-2 border-white absolute top-0 left-0 rounded-tl-2xl" />
              <div className="w-8 h-8 border-t-2 border-r-2 border-white absolute top-0 right-0 rounded-tr-2xl" />
              <div className="w-8 h-8 border-b-2 border-l-2 border-white absolute bottom-0 left-0 rounded-bl-2xl" />
              <div className="w-8 h-8 border-b-2 border-r-2 border-white absolute bottom-0 right-0 rounded-br-2xl" />
            </div>
          </>
        )}
      </div>

      {/* Bottom Shutter & Controls Bar */}
      <div className="p-6 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-around z-10">
        {/* Gallery / File Picker Fallback */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 text-white flex flex-col items-center justify-center transition-colors"
          title="Upload from device gallery"
        >
          <Upload size={18} />
          <span className="text-[9px] font-bold mt-0.5">Gallery</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFilePicked}
        />

        {/* Large Round Shutter Button */}
        <button
          type="button"
          onClick={handleSnap}
          disabled={loading || Boolean(error)}
          className="w-18 h-18 rounded-full border-4 border-white bg-white/20 hover:bg-white/40 active:scale-95 flex items-center justify-center transition-all disabled:opacity-40 cursor-pointer shadow-lg shadow-white/10"
          title="Capture photo"
        >
          <div className="w-13 h-13 rounded-full bg-white transition-transform" />
        </button>

        {/* Flip Camera Button (if multiple cameras exist or toggle) */}
        <button
          type="button"
          onClick={handleToggleFacingMode}
          disabled={loading || Boolean(error)}
          className="w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 text-white flex flex-col items-center justify-center transition-colors disabled:opacity-40"
          title="Switch front/rear camera"
        >
          <RefreshCw size={18} />
          <span className="text-[9px] font-bold mt-0.5">Flip</span>
        </button>
      </div>
    </div>
  );
}
