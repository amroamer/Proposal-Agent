import { useCallback, useRef, useState, type DragEvent } from "react";
import { Upload, FileText, X } from "lucide-react";

const ACCEPTED = [".pptx", ".docx", ".pdf"];
const ACCEPT_ATTR = ACCEPTED.join(",");

interface FileDropProps {
  file: File | null;
  onFile: (file: File | null) => void;
  disabled?: boolean;
  maxBytes?: number;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function isAccepted(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED.some(ext => name.endsWith(ext));
}

export function FileDrop({ file, onFile, disabled, maxBytes = 50 * 1024 * 1024 }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      setError(null);
      if (!files || files.length === 0) return;
      const f = files[0];
      if (!isAccepted(f)) {
        setError(`Unsupported file type. Accepted: ${ACCEPTED.join(", ")}`);
        return;
      }
      if (f.size > maxBytes) {
        setError(`File too large. Max ${fmtBytes(maxBytes)}.`);
        return;
      }
      onFile(f);
    },
    [onFile, maxBytes],
  );

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) setDragOver(true);
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(false)}
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
        className={[
          "border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors",
          disabled ? "opacity-50 cursor-not-allowed" : "",
          dragOver ? "border-kpmg-blue bg-kpmg-blue/5" : "border-kpmg-gray-200 hover:border-kpmg-blue/50 hover:bg-kpmg-gray-50",
        ].join(" ")}
      >
        {file ? (
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-kpmg-blue flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-kpmg-gray-800 truncate">{file.name}</div>
              <div className="text-xs text-kpmg-gray-500">{fmtBytes(file.size)}</div>
            </div>
            {!disabled && (
              <button
                type="button"
                onClick={clear}
                className="p-2 -m-2 rounded hover:bg-kpmg-gray-100"
                aria-label="Remove file"
              >
                <X className="h-4 w-4 text-kpmg-gray-500" />
              </button>
            )}
          </div>
        ) : (
          <div className="text-center py-2">
            <Upload className="h-8 w-8 text-kpmg-gray-400 mx-auto mb-2" />
            <div className="text-sm text-kpmg-gray-700 font-medium">
              Drop a file here, or click to browse
            </div>
            <div className="text-xs text-kpmg-gray-400 mt-1">
              {ACCEPTED.join(" · ")} · max {fmtBytes(maxBytes)}
            </div>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
        disabled={disabled}
      />

      {error && (
        <p className="mt-2 text-xs text-kpmg-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
