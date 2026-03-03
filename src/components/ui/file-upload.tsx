"use client";

import * as React from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  maxSize?: number; // bytes
  className?: string;
  disabled?: boolean;
}

export function FileUpload({
  onFilesSelected,
  accept = ".pdf,.xlsx,.xls,.csv,.docx,.txt",
  multiple = true,
  maxSize = 100 * 1024 * 1024,
  className,
  disabled = false,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const validFiles = Array.from(files).filter((f) => f.size <= maxSize);
    if (validFiles.length > 0) {
      onFilesSelected(validFiles);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!disabled) handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={cn(
        "border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer",
        isDragging
          ? "border-blue-400 bg-blue-50"
          : "border-slate-300 hover:border-slate-400",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <Upload className="h-8 w-8 text-slate-400 mx-auto mb-3" />
      <p className="text-sm font-medium text-slate-700">
        Drag and drop files here, or click to browse
      </p>
      <p className="text-xs text-slate-500 mt-1">
        PDF, XLSX, CSV, DOCX, TXT up to {Math.round(maxSize / (1024 * 1024))}MB
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
        disabled={disabled}
      />
    </div>
  );
}
