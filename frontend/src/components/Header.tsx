"use client";

import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { useState } from "react";

export default function Header() {
  const { user, signOut } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    setIsDropdownOpen(false);
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">
                Bank Statement Analyzer
              </h1>
              <span className="ml-2 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                DGGI
              </span>
            </div>

            {user && (
              <nav className="hidden md:flex space-x-6">
                <Link
                  href="/"
                  className="text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Cases
                </Link>
                <Link
                  href="/settings"
                  className="text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Settings
                </Link>
              </nav>
            )}
          </div>

          <div className="flex items-center space-x-4">
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center space-x-2 text-sm text-gray-700 hover:text-gray-900 focus:outline-none"
                >
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-medium">
                      {user.is_anonymous
                        ? "G"
                        : user.user_metadata?.full_name?.charAt(0) ||
                          user.email?.charAt(0) ||
                          "U"}
                    </span>
                  </div>
                  <span className="hidden md:block">
                    {user.is_anonymous
                      ? "Guest User"
                      : user.user_metadata?.full_name || user.email}
                  </span>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {isDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-200">
                    <div className="px-4 py-2 text-sm text-gray-700 border-b border-gray-100">
                      <div className="font-medium">
                        {user.is_anonymous
                          ? "Guest User"
                          : user.user_metadata?.full_name || "User"}
                      </div>
                      <div className="text-gray-500">
                        {user.is_anonymous ? "Anonymous Session" : user.email}
                      </div>
                      {!user.is_anonymous && user.user_metadata?.agency && (
                        <div className="text-xs text-blue-600 mt-1">
                          {user.user_metadata.agency}
                          {user.user_metadata?.designation &&
                            ` - ${user.user_metadata.designation}`}
                        </div>
                      )}
                      {user.is_anonymous && (
                        <div className="text-xs text-orange-600 mt-1">
                          Temporary access - data may not persist
                        </div>
                      )}
                    </div>
                    {user.is_anonymous && (
                      <Link
                        href="/auth/signup"
                        className="block w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-gray-100"
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        Create Account
                      </Link>
                    )}
                    <button
                      onClick={handleSignOut}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      {user.is_anonymous ? "End Session" : "Sign out"}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <Link
                  href="/auth/login"
                  className="text-sm text-gray-700 hover:text-gray-900"
                >
                  Sign In
                </Link>
                <Link
                  href="/auth/signup"
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
