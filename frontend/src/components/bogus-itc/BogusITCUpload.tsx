"use client";
import { useState } from "react";
import { useBogusITC } from "@/hooks/useBogusITC";
import BogusITCResults from "./BogusITCResults";
import { Upload, FileText, AlertCircle, Loader2, Search, X, CheckCircle } from "lucide-react";

interface FileState {
  gstr1?: File;
  gstr2?: File;
  gstr3b?: File;
}

interface ValidationError {
  field: string;
  message: string;
}

export default function BogusITCUpload() {
  const [gstin, setGstin] = useState("");
  const [files, setFiles] = useState<FileState>({});
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

  const { analyze, loading, result, error, clearResult } = useBogusITC();

  const validateFile = (file: File, fileType: string): ValidationError | null => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return {
        field: fileType,
        message: `${fileType.toUpperCase()} file must be a CSV file`
      };
    }

    const maxSize = 10 * 1024 * 1024; 
    if (file.size > maxSize) {
      return {
        field: fileType,
        message: `${fileType.toUpperCase()} file must be less than 10MB`
      };
    }

    if (file.size === 0) {
      return {
        field: fileType,
        message: `${fileType.toUpperCase()} file cannot be empty`
      };
    }

    return null;
  };

  const validateForm = (): boolean => {
    const errors: ValidationError[] = [];

    if (!gstin.trim()) {
      errors.push({ field: 'gstin', message: 'GSTIN is required' });
    }

    const requiredFiles = ['gstr1', 'gstr2', 'gstr3b'] as const;
    requiredFiles.forEach(fileKey => {
      const file = files[fileKey];
      if (!file) {
        errors.push({ 
          field: fileKey, 
          message: `${fileKey.toUpperCase()} file is required` 
        });
      } else {
        const fileError = validateFile(file, fileKey);
        if (fileError) {
          errors.push(fileError);
        }
      }
    });

    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleFileChange = (fileKey: keyof FileState, selectedFile: File | undefined) => {
    if (!selectedFile) {
      setFiles(prevFiles => ({ ...prevFiles, [fileKey]: undefined }));
      return;
    }

    const fileError = validateFile(selectedFile, fileKey);

    setValidationErrors(prev => {
      const filtered = prev.filter(err => err.field !== fileKey);
      return fileError ? [...filtered, fileError] : filtered;
    });

    setFiles(prevFiles => ({ 
      ...prevFiles, 
      [fileKey]: selectedFile 
    }));
  };

  const handleGSTINChange = (value: string) => {
    const upperValue = value.toUpperCase();
    setGstin(upperValue);
    setValidationErrors(prev => prev.filter(err => err.field !== 'gstin'));
  };

  const onSubmit = () => {
    if (!validateForm()) return;

    if (result) {
      clearResult();
    }

    analyze(gstin.trim(), files as Required<FileState>);
  };

  const clearFile = (fileKey: keyof FileState) => {
    setFiles(prev => ({ ...prev, [fileKey]: undefined }));
    setValidationErrors(prev => prev.filter(err => err.field !== fileKey));
  };

  const resetForm = () => {
    setGstin("");
    setFiles({});
    setValidationErrors([]);
    if (result) {
      clearResult();
    }
  };

  const hasGstin = gstin.trim().length > 0;
  const hasAllFiles = files.gstr1 && files.gstr2 && files.gstr3b;
  const hasValidationErrors = validationErrors.length > 0;
  const isFormValid = hasGstin && hasAllFiles && !hasValidationErrors;

  const getFieldError = (field: string) => validationErrors.find(err => err.field === field);

  const FileUploadCard = ({ 
    label, 
    fileKey, 
    file 
  }: { 
    label: string; 
    fileKey: keyof FileState; 
    file?: File 
  }) => {
    const inputId = `file-upload-${fileKey}`;
    const fieldError = getFieldError(fileKey);
    const hasError = !!fieldError;

    return (
      <div className="w-full">
        <label 
          htmlFor={inputId}
          className="block text-sm font-semibold text-gray-800 mb-3"
        >
          {label}
        </label>
        <div className={`
          relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-300 min-h-[140px] flex items-center justify-center
          ${hasError 
            ? 'border-red-400 bg-red-50' 
            : file 
              ? 'border-emerald-400 bg-emerald-50 shadow-lg' 
              : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50 hover:shadow-md'
          }
        `}>
          <input
            id={inputId}
            type="file"
            accept=".csv"
            onChange={(e) => {
              const selectedFile = e.target.files?.[0];
              handleFileChange(fileKey, selectedFile);
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-describedby={`${inputId}-description`}
          />
          <div className="flex flex-col items-center w-full">
            {file && !hasError ? (
              <>
                <FileText className="w-10 h-10 text-emerald-600 mb-3" />
                <p className="text-sm font-semibold text-emerald-700 truncate max-w-full px-2 mb-1">
                  {file.name}
                </p>
                <p className="text-xs text-emerald-600 mb-2">
                  ✓ {(file.size / 1024).toFixed(1)}KB - Click to replace
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearFile(fileKey);
                  }}
                  className="text-xs text-red-600 hover:text-red-800 underline"
                  aria-label={`Remove ${label} file`}
                >
                  Remove file
                </button>
              </>
            ) : hasError ? (
              <>
                <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
                <p className="text-sm font-medium text-red-700 mb-1">Upload Failed</p>
                <p id={`${inputId}-description`} className="text-xs text-red-600 text-center">
                  {fieldError.message}
                </p>
              </>
            ) : (
              <>
                <Upload className="w-10 h-10 text-gray-400 mb-3" />
                <p className="text-sm font-medium text-gray-700 mb-1">Upload {label} CSV</p>
                <p id={`${inputId}-description`} className="text-xs text-gray-500">
                  Click or drag & drop (Max 10MB)
                </p>
              </>
            )}
          </div>
        </div>
        {hasError && (
          <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {fieldError.message}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div className="w-full">
        <label htmlFor="gstin-input" className="block text-sm font-semibold text-gray-800 mb-3">
          GSTIN Number
        </label>
        <div className="relative">
          <input
            id="gstin-input"
            type="text"
            className={`w-full px-6 py-4 text-lg border-2 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all duration-300 bg-white shadow-sm ${
              getFieldError('gstin') 
                ? 'border-red-300 focus:border-red-500' 
                : hasGstin 
                  ? 'border-emerald-300 focus:border-emerald-500'
                  : 'border-gray-300 focus:border-blue-500'
            }`}
            placeholder="Enter GSTIN"
            value={gstin}
            onChange={(e) => handleGSTINChange(e.target.value)}
          />
          {hasGstin && (
            <CheckCircle className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-emerald-500" />
          )}
        </div>
        {getFieldError('gstin') && (
          <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {getFieldError('gstin')?.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
        <FileUploadCard label="GSTR-1" fileKey="gstr1" file={files.gstr1} />
        <FileUploadCard label="GSTR-2B" fileKey="gstr2" file={files.gstr2} />
        <FileUploadCard label="GSTR-3B" fileKey="gstr3b" file={files.gstr3b} />
      </div>

      <div className="flex flex-col items-center space-y-4 pt-6">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={onSubmit}
            disabled={!isFormValid || loading}
            className={`
              relative px-8 py-4 rounded-xl font-semibold text-lg text-white transition-all duration-300 shadow-lg
              ${isFormValid && !loading 
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl cursor-pointer transform hover:scale-105' 
                : 'bg-gray-400 cursor-not-allowed opacity-70'
              }
            `}
          >
            <div className="flex items-center space-x-3">
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  <span>Detect Bogus ITC</span>
                </>
              )}
            </div>
          </button>

          {(gstin || hasAllFiles || result) && (
            <button
              type="button"
              onClick={resetForm}
              disabled={loading}
              className="px-6 py-4 rounded-xl font-semibold text-lg text-gray-700 border-2 border-gray-300 hover:border-gray-400 hover:bg-gray-50 transition-all duration-300"
              aria-label="Reset form and clear all data"
            >
              <div className="flex items-center space-x-2">
                <X className="w-5 h-5" />
                <span>Reset</span>
              </div>
            </button>
          )}
        </div>

        <div className="text-center">
          {!isFormValid ? (
            <p className="text-gray-600 font-medium mb-3">
              {hasValidationErrors 
                ? "Please fix the errors above" 
                : "Please complete all fields to proceed"
              }
            </p>
          ) : (
            <p className="text-green-600 font-medium mb-3">
              ✓ Ready to analyze!
            </p>
          )}

          <div className="flex justify-center space-x-2">
            <div 
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                hasGstin ? 'bg-green-500 scale-110' : 'bg-gray-300'
              }`}
              title="GSTIN"
            />
            <div 
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                files.gstr1 && !getFieldError('gstr1') ? 'bg-green-500 scale-110' : 'bg-gray-300'
              }`}
              title="GSTR-1"
            />
            <div 
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                files.gstr2 && !getFieldError('gstr2') ? 'bg-green-500 scale-110' : 'bg-gray-300'
              }`}
              title="GSTR-2B"
            />
            <div 
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                files.gstr3b && !getFieldError('gstr3b') ? 'bg-green-500 scale-110' : 'bg-gray-300'
              }`}
              title="GSTR-3B"
            />
          </div>
        </div>
      </div>

      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 flex items-center space-x-4">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-lg font-medium">Analyzing your data...</span>
          </div>
        </div>
      )}

      {error && (
        <div 
          className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 flex items-start space-x-3 shadow-sm"
          role="alert"
          aria-live="polite"
        >
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="text-red-800 font-semibold">Analysis Failed</h4>
            <p className="text-red-700 mt-1">{error}</p>
          </div>
          <button
            type="button"
            onClick={clearResult}
            className="text-red-600 hover:text-red-800"
            aria-label="Clear error message"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {result && <BogusITCResults result={result} />}
    </div>
  );
}
