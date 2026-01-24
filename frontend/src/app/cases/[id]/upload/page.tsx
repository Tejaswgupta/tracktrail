"use client";

import UploadStatementModalWizard from "@/app/components/UploadStatementModalWizard";
import AppHeader from "@/app/components/AppHeader";
import { useParams, useRouter } from "next/navigation";

export default function UploadStatementPage() {
  const params = useParams();
  const caseId = params.id as string;
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <div className="px-4 sm:px-6 lg:px-8">
        <UploadStatementModalWizard
          caseId={caseId}
          variant="page"
          onClose={() => router.push(`/cases/${caseId}`)}
          onUploadComplete={() => {
            router.push(`/cases/${caseId}`);
            router.refresh();
          }}
        />
      </div>
    </div>
  );
}
