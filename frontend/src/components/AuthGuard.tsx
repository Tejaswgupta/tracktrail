"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Only redirect if not loading and no user at all
    // Allow anonymous users to access the app
    if (!loading && !user) {
      // For development, we'll allow access without authentication
      // You can uncomment the line below to enforce authentication
      // router.push("/auth/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Allow access even without user (anonymous access)
  // if (!user) {
  //   return fallback || null;
  // }

  return <>{children}</>;
}
