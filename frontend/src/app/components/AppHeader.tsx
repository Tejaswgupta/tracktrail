"use client";

import { usePathname, useRouter } from "next/navigation";

interface AppHeaderProps {
  title?: string;
  subtitle?: React.ReactNode;
  showBackButton?: boolean;
  actions?: React.ReactNode;
}

export default function AppHeader({
  title = "Bank Statement Analyzer",
  subtitle,
  showBackButton = false,
  actions,
}: AppHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  const isHomePage = pathname === "/";

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-4">
            {showBackButton && !isHomePage && (
              <button
                onClick={() => router.push("/")}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                aria-label="Go back to home"
                title="Go back to home"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
            )}
            <div>
              <div className="flex items-center">
                <h1 className="text-xl font-bold text-gray-900">{title}</h1>
                {isHomePage && (
                  <span className="ml-3 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                    DGGI
                  </span>
                )}
              </div>
              {subtitle && (
                <div className="text-sm text-gray-600 mt-1">{subtitle}</div>
              )}
            </div>
          </div>
          {actions && (
            <div className="flex items-center space-x-3">{actions}</div>
          )}
        </div>
      </div>
    </header>
  );
}
