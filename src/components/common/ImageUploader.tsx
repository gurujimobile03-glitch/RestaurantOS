import React, { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Loader2, RefreshCw } from 'lucide-react';
import { uploadImage } from '../../services/storageService';
import { Button } from './Button';

interface ImageUploaderProps {
  value: string | null;
  onChange: (url: string | null) => void;
  folderPath?: string;
  label?: string;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  value,
  onChange,
  folderPath = 'menu-items',
  label = 'Item Photo'
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setIsUploading(true);
    setProgress(0);

    try {
      const downloadUrl = await uploadImage(folderPath, file, (p) => {
        setProgress(p);
      });
      onChange(downloadUrl);
    } catch (err: any) {
      console.error('Upload failed:', err);
      setError(err.message || 'Failed to upload image. Please try again.');
    } finally {
      setIsUploading(false);
      setProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
          {label}
        </label>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png, image/jpeg, image/webp"
        className="hidden"
        onChange={handleInputChange}
      />

      {value ? (
        <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 group shadow-xs">
          <div className="h-44 w-full bg-slate-100 flex items-center justify-center overflow-hidden">
            <img
              src={value}
              alt="Uploaded photo"
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>

          {/* Action overlay */}
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              disabled={isUploading}
            >
              Replace
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={() => onChange(null)}
              leftIcon={<X className="w-3.5 h-3.5" />}
              disabled={isUploading}
            >
              Remove
            </Button>
          </div>

          {isUploading && (
            <div className="absolute inset-0 bg-white/90 flex flex-col items-center justify-center p-4">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mb-2" />
              <p className="text-xs font-semibold text-slate-700">Uploading {progress}%</p>
              <div className="w-32 bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-indigo-600 h-full transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`h-40 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-colors duration-150 ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50/50'
              : 'border-slate-300 hover:border-indigo-400 bg-slate-50/70 hover:bg-white'
          }`}
        >
          {isUploading ? (
            <div className="flex flex-col items-center">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mb-2" />
              <p className="text-xs font-semibold text-slate-700">Uploading photo... {progress}%</p>
              <div className="w-36 bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-indigo-600 h-full transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2.5 shadow-xs">
                <Upload className="w-5 h-5" />
              </div>
              <p className="text-sm font-semibold text-slate-800">
                Click to upload <span className="font-normal text-slate-500">or drag & drop</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">
                PNG, JPG or WebP up to 5MB
              </p>
            </>
          )}
        </div>
      )}

      {error && (
        <p className="mt-1.5 text-xs text-rose-600 flex items-center gap-1 font-medium">
          {error}
        </p>
      )}
    </div>
  );
};
