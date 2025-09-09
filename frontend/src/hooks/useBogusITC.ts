import { useState } from "react";
import { analyzeBogusITC } from "@/services/bogusITCService";

export function useBogusITC() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const analyze = async (gstin: string, files: { gstr1: File; gstr2: File; gstr3b: File }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await analyzeBogusITC(gstin, files);
      setResult(res);
    } catch (e: any) {
      setError(e.message || "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  // Add clearResult function
  const clearResult = () => {
    setResult(null);
    setError(null);
  };

  return { analyze, loading, result, error, clearResult };
}
