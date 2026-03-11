"use client";

import { useCallback, useState } from "react";
import { Upload, FileCode } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConversionStore } from "@/lib/store";
import { buttonVariants } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function FileUpload() {
  const [dragOver, setDragOver] = useState(false);
  const setBicepContent = useConversionStore((s) => s.setBicepContent);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".bicep")) {
        toast.error("Invalid file type", {
          description: "Please upload a .bicep file",
        });
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error("File too large", {
          description: "Maximum file size is 5MB",
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setBicepContent(content, file.name);
        toast.success("File loaded", { description: file.name });
      };
      reader.onerror = () => {
        toast.error("Failed to read file", {
          description: "An error occurred while reading the file",
        });
      };
      reader.readAsText(file);
    },
    [setBicepContent]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div
      role="region"
      aria-label="File upload"
      className={cn(
        "flex h-full flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-8 transition-colors",
        dragOver
          ? "border-primary bg-primary/5"
          : "border-border hover:border-muted-foreground/50"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="rounded-full bg-muted p-4">
        {dragOver ? (
          <FileCode className="h-8 w-8 text-primary" />
        ) : (
          <Upload className="h-8 w-8 text-muted-foreground" />
        )}
      </div>
      <div className="text-center">
        <p className="font-medium">Drop a .bicep file here</p>
        <p className="mt-1 text-sm text-muted-foreground">
          or click to browse
        </p>
      </div>
      <label className={cn(buttonVariants(), "cursor-pointer")}>
        Browse Files
        <input
          type="file"
          accept=".bicep"
          className="hidden"
          onChange={handleChange}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Or paste Bicep code directly in the editor
      </p>
    </div>
  );
}
