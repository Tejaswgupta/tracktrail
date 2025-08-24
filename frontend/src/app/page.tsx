"use client";

import AuthGuard from "@/components/AuthGuard";
import Header from "@/components/Header";
import { useState } from "react";
import AppHeader from "./components/AppHeader";
import CaseList from "./components/CaseList";
import CreateCaseModal from "./components/CreateCaseModal";

export default function Home() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleCaseCreated = () => {
    setRefreshTrigger((prev) => prev + 1);
    setIsCreateModalOpen(false);
  };

  const headerActions = (
    <button
      onClick={() => setIsCreateModalOpen(true)}
      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
    >
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
          d="M12 4v16m8-8H4"
        />
      </svg>
      New Case
    </button>
  );

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Header />
        <AppHeader actions={headerActions} />

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <CaseList key={refreshTrigger} />
        </main>

        {/* Create Case Modal */}
        {isCreateModalOpen && (
          <CreateCaseModal
            onClose={() => setIsCreateModalOpen(false)}
            onCaseCreated={handleCaseCreated}
          />
        )}
      </div>
    </AuthGuard>
  );
}
