"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import imageCompression from "browser-image-compression";
import { CheckCircle2, ImagePlus, Loader2, TriangleAlert, X } from "lucide-react";

import { cn } from "@/lib/utils";

interface FileInputProps {
  value: File | null;
  onChange: (file: File | null) => void;
  label: string;
  hint?: string;
  /** Shown when the selected file exceeds `maxSizeMB`. */
  errorMessage?: string;
  accept?: string;
  maxSizeMB?: number;
  compress?: boolean;
  disabled?: boolean;
}

const COMPRESSION = {
  maxSizeMB: 0.5,
  maxWidthOrHeight: 1600,
  useWebp: true,
  initialQuality: 0.8,
  alwaysKeepResolution: true,
};

/**
 * Drag & drop file input that converts images to WebP **client-side**
 * before the caller uploads them (Agent.md §8 — compression must execute
 * prior to upload; low-bandwidth resiliency).
 */
export function FileInput({
  value,
  onChange,
  label,
  hint,
  errorMessage,
  accept = "image/*",
  maxSizeMB = 8,
  compress = true,
  disabled = false,
}: FileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;

      setError(null);

      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(errorMessage ?? `الحد الأقصى ${maxSizeMB} ميغابايت`);
        return;
      }

      if (!compress || !file.type.startsWith("image/")) {
        onChange(file);
        return;
      }

      setBusy(true);
      try {
        const compressed = await imageCompression(file, COMPRESSION);
        const asWebp =
          compressed.type === "image/webp"
            ? compressed
            : new File([compressed], file.name.replace(/\.\w+$/, ".webp"), {
                type: "image/webp",
                lastModified: Date.now(),
              });
        onChange(asWebp);
      } catch {
        // Compression failed (corrupt/unsupported file) — send the original.
        onChange(file);
      } finally {
        setBusy(false);
      }
    },
    [compress, errorMessage, maxSizeMB, onChange]
  );

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    void handleFiles(event.target.files);
    event.target.value = "";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    void handleFiles(event.dataTransfer.files);
  };

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-sarh-navy dark:text-slate-200">
        {label}
      </span>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "relative grid place-items-center rounded-2xl border-2 border-dashed p-6 text-center",
          "transition-colors focus-within:ring-2 focus-within:ring-sarh-teal/40",
          dragging
            ? "border-sarh-teal bg-sarh-teal/10"
            : "border-sarh-borderLight bg-sarh-bgLight hover:border-sarh-teal dark:border-sarh-borderDark dark:bg-sarh-bgDark",
          (disabled || busy) && "pointer-events-none opacity-60"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={onInputChange}
          disabled={disabled}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={label}
        />

        {previewUrl ? (
          <div className="flex flex-col items-center gap-3">
            <img
              src={previewUrl}
              alt={label}
              className="h-32 w-auto max-w-full rounded-xl object-contain shadow-soft"
            />
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2
                className="h-4 w-4 text-sarh-teal"
                aria-hidden="true"
              />
              <span className="text-slate-600 dark:text-slate-300">
                {value?.name}
              </span>
              <button
                type="button"
                onClick={() => onChange(null)}
                disabled={disabled}
                aria-label={label}
                className="grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-red-500/10 hover:text-red-500"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : (
          <>
            {busy ? (
              <Loader2
                className="h-8 w-8 animate-spin text-sarh-teal"
                aria-hidden="true"
              />
            ) : (
              <ImagePlus
                className="h-8 w-8 text-slate-400"
                aria-hidden="true"
              />
            )}
            <p className="mt-2 text-sm font-medium text-sarh-navy dark:text-slate-200">
              {busy ? "جارٍ ضغط الصورة…" : "اسحب الصورة هنا أو انقر للاختيار"}
            </p>
          </>
        )}
      </div>

      {hint && !error ? (
        <p className="text-xs leading-5 text-slate-400">{hint}</p>
      ) : null}

      {error ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-red-500">
          <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
