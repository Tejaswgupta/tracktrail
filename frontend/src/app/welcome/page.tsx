"use client";

import { createClient } from "@/utils/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function WelcomePage() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleAnonymousAccess = async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInAnonymously();

      if (error) {
        console.error("Anonymous sign-in failed:", error);
        alert("Failed to start anonymous session. Please try again.");
      } else {
        router.push("/");
      }
    } catch (err) {
      console.error("Error:", err);
      alert("An unexpected error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="flex flex-col justify-center items-center min-h-screen px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 text-center">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Bank Statement Analyzer
            </h1>
            <p className="text-lg text-gray-600 mb-2">
              Financial Investigation Tool
            </p>
            <span className="inline-block px-3 py-1 text-sm font-medium bg-blue-100 text-blue-800 rounded-full">
              DGGI & Law Enforcement Agencies
            </span>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Get Started
              </h2>

              <div className="space-y-3">
                <Link
                  href="/auth/login"
                  className="w-full inline-flex justify-center items-center px-4 py-3 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Sign In to Your Account
                </Link>

                <Link
                  href="/auth/signup"
                  className="w-full inline-flex justify-center items-center px-4 py-3 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Create New Account
                </Link>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">Or</span>
                  </div>
                </div>

                <button
                  onClick={handleAnonymousAccess}
                  disabled={isLoading}
                  className="w-full inline-flex justify-center items-center px-4 py-3 border border-orange-300 text-sm font-medium rounded-md text-orange-700 bg-orange-50 hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Starting session...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4 mr-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                        />
                      </svg>
                      Try as Guest (Temporary Access)
                    </>
                  )}
                </button>
              </div>

              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-xs text-yellow-800">
                  <strong>Guest Access:</strong> Temporary session for testing.
                  Data may not persist after session ends.
                </p>
              </div>
            </div>

            <div className="text-sm text-gray-500">
              <p>
                Secure financial analysis for law enforcement investigations
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
