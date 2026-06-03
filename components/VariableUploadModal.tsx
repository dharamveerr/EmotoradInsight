"use client";

import { useState } from "react";

interface VariableUploadModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function VariableUploadModal({
  onClose,
  onSuccess,
}: VariableUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith(".csv") && !selectedFile.name.endsWith(".json")) {
        setError("File must be .csv or .json");
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/variables/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setResult(data);
        setTimeout(() => onSuccess(), 1500);
      } else {
        const data = await res.json();
        setError(data.error || "Upload failed");
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-96 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-white/10">
          <h3 className="font-bold text-white">Upload Variables</h3>
          <p className="text-xs text-gray-500 mt-1">CSV or JSON format</p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {!result ? (
            <>
              <div className="border-2 border-dashed border-white/20 rounded-lg p-4 text-center">
                <input
                  type="file"
                  accept=".csv,.json"
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-input"
                />
                <label htmlFor="file-input" className="cursor-pointer block">
                  <p className="text-sm text-gray-300 mb-2">
                    {file ? file.name : "Click to select CSV or JSON file"}
                  </p>
                  {!file && <p className="text-xs text-gray-500">or drag & drop</p>}
                </label>
              </div>

              {error && (
                <div className="p-2 bg-red-500/20 border border-red-500/30 rounded text-xs text-red-300">
                  {error}
                </div>
              )}

              <div className="text-xs text-gray-500 space-y-1">
                <p className="font-semibold text-gray-400">CSV Format:</p>
                <code className="block bg-white/5 p-2 rounded">
                  name,type,description
                  <br />
                  customer_age,number,Customer age
                </code>

                <p className="font-semibold text-gray-400 mt-2">JSON Format:</p>
                <code className="block bg-white/5 p-2 rounded text-xs">
                  [
                  <br />
                  &nbsp;&nbsp;{"{ name: 'var1', type: 'string', description: '...' }"}
                  <br />
                  ]
                </code>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-green-500/20 border border-green-500/30 rounded text-sm text-green-300">
                ✓ Successfully imported {result.imported} variables
              </div>

              {result.errors && result.errors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gray-400">Notices:</p>
                  <div className="bg-white/5 p-2 rounded max-h-32 overflow-y-auto space-y-1">
                    {result.errors.map((err: string, i: number) => (
                      <p key={i} className="text-xs text-gray-500">
                        • {err}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-500 text-center mt-2">
                Total processed: {result.total}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 p-4 flex gap-2">
          {!result ? (
            <>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-white/10 text-gray-300 rounded font-semibold text-xs hover:bg-white/20"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || !file}
                className="flex-1 px-4 py-2 bg-green-500/20 text-green-300 rounded font-semibold text-xs hover:bg-green-500/30 disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-green-500/20 text-green-300 rounded font-semibold text-xs hover:bg-green-500/30"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
