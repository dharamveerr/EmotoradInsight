"use client";

import { useState, useRef, useEffect } from "react";
import { CurrentUser } from "@/lib/useCurrentUser";
import { mutate } from "swr";

interface ProfileEditModalProps {
  user: CurrentUser;
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileEditModal({ user, isOpen, onClose }: ProfileEditModalProps) {
  const [formData, setFormData] = useState({
    name: user.name || "",
    email: user.email || "",
    phone_number: user.phone_number || "",
    picture: user.picture || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState(user.picture || "");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setFormData({
      name: user.name || "",
      email: user.email || "",
      phone_number: user.phone_number || "",
      picture: user.picture || "",
    });
    setPreviewUrl(user.picture || "");
  }, [user, isOpen]);

  // Handle camera stream attachment
  useEffect(() => {
    if (!cameraOpen || !videoRef.current) return;

    const video = videoRef.current;
    const startStream = async () => {
      try {
        if (streamRef.current) {
          video.srcObject = streamRef.current;
          try {
            await video.play();
            console.log("Video playing successfully");
          } catch (playErr) {
            console.error("Play failed:", playErr);
            setCameraError("Failed to play video");
          }
        }
      } catch (err) {
        console.error("Stream attachment error:", err);
      }
    };

    startStream();

    return () => {
      // Cleanup on unmount
      if (video.srcObject) {
        video.srcObject = null;
      }
    };
  }, [cameraOpen, videoRef]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setFormData((prev) => ({ ...prev, picture: base64 }));
      setPreviewUrl(base64);
    };
    reader.readAsDataURL(file);
  };

  const startCamera = async () => {
    setCameraLoading(true);
    setCameraError(null);
    try {
      const constraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user"
        },
        audio: false
      };
      
      console.log("Requesting camera access...");
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("Camera access granted, stream:", stream);
      
      streamRef.current = stream;
      setCameraOpen(true);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("Camera error:", errMsg);
      
      if (errMsg.includes("NotAllowedError") || errMsg.includes("Permission")) {
        setCameraError("Camera permission denied. Check browser settings.");
      } else if (errMsg.includes("NotFoundError")) {
        setCameraError("No camera found on this device.");
      } else if (errMsg.includes("NotReadableError")) {
        setCameraError("Camera is in use by another app.");
      } else {
        setCameraError(`Camera error: ${errMsg}`);
      }
      setCameraOpen(false);
    } finally {
      setCameraLoading(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
        console.log("Track stopped");
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOpen(false);
    setCameraError(null);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      try {
        const context = canvasRef.current.getContext("2d");
        if (context && videoRef.current.videoWidth > 0) {
          canvasRef.current.width = videoRef.current.videoWidth;
          canvasRef.current.height = videoRef.current.videoHeight;
          context.drawImage(videoRef.current, 0, 0);
          const base64 = canvasRef.current.toDataURL("image/jpeg", 0.9);
          setFormData((prev) => ({ ...prev, picture: base64 }));
          setPreviewUrl(base64);
          console.log("Photo captured");
          stopCamera();
        } else {
          setCameraError("Video not ready. Please wait a moment.");
        }
      } catch (err) {
        console.error("Capture error:", err);
        setCameraError("Failed to capture photo");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update profile");
      }

      await mutate("/api/me");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error updating profile");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-2xl border border-white/10 shadow-2xl max-w-md w-full overflow-hidden animate-fade-in">
        <div className="p-6 border-b border-white/5">
          <h2 className="text-lg font-bold text-white">Edit Profile</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Camera capture modal */}
          {cameraOpen && (
            <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
              <div className="bg-slate-900 rounded-2xl overflow-hidden w-full max-w-sm">
                <div className="relative bg-black aspect-square">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </div>
                <canvas ref={canvasRef} className="hidden" />
                
                {cameraError && (
                  <div className="px-4 pt-3 text-sm text-red-400 text-center">
                    {cameraError}
                  </div>
                )}
                
                <div className="p-4 flex gap-2">
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="flex-1 px-3 py-2 rounded-lg bg-gray-600 hover:bg-gray-700 text-white font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={capturePhoto}
                    className="flex-1 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium"
                  >
                    Capture
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Profile picture */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-24 h-24 rounded-full bg-slate-800 border border-white/10 overflow-hidden flex items-center justify-center">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white text-sm font-bold">
                  {formData.name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2) || "?"}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-sm text-blue-400 hover:text-blue-300 font-medium px-3 py-1 rounded bg-blue-500/10 hover:bg-blue-500/20 transition"
              >
                Upload
              </button>
              <button
                type="button"
                onClick={startCamera}
                disabled={cameraLoading}
                className="text-sm text-blue-400 hover:text-blue-300 font-medium px-3 py-1 rounded bg-blue-500/10 hover:bg-blue-500/20 transition disabled:opacity-50"
              >
                {cameraLoading ? "Opening..." : "Camera"}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
            />
          </div>

          {/* Form fields */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">
                Name
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/10"
                placeholder="Your name"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/10"
                placeholder="your.email@example.com"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1">
                Phone
              </label>
              <input
                type="tel"
                name="phone_number"
                value={formData.phone_number}
                onChange={handleChange}
                className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/10"
                placeholder="+1 (555) 123-4567"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2 pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium transition-colors"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
