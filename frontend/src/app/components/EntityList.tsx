"use client";

import { entitiesService } from "@/services/database";
import { EntityWithAccounts } from "@/types/database";
import { useEffect, useState } from "react";
import EntityCard from "./EntityCard";

interface EntityListProps {
  caseId: string;
  onEntityDeleted?: () => void;
  onEntityUpdated?: () => void;
}

export default function EntityList({
  caseId,
  onEntityDeleted,
  onEntityUpdated,
}: EntityListProps) {
  const [entities, setEntities] = useState<EntityWithAccounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const fetchEntities = async () => {
      try {
        setLoading(true);
        setError(null);
        const entitiesData = await entitiesService.getByCaseId(caseId);
        setEntities(entitiesData);
      } catch (error) {
        console.error("Error fetching entities:", error);
        setError(
          error instanceof Error ? error.message : "Failed to fetch entities"
        );
        setEntities([]);
      } finally {
        setLoading(false);
      }
    };

    fetchEntities();
  }, [caseId, refreshTrigger]);

  const handleEntityDeleted = () => {
    setRefreshTrigger((prev) => prev + 1);
    onEntityDeleted?.();
  };

  const handleEntityUpdated = () => {
    setRefreshTrigger((prev) => prev + 1);
    onEntityUpdated?.();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <svg
          className="mx-auto h-12 w-12 text-red-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">
          Error loading entities
        </h3>
        <p className="mt-1 text-sm text-gray-500">{error}</p>
      </div>
    );
  }

  if (entities.length === 0) {
    return (
      <div className="text-center py-8">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">
          No entities found
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Add entities to start organizing bank accounts and statements.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {entities.map((entity) => (
        <EntityCard
          key={entity.entity_id}
          entity={entity}
          caseId={caseId}
          onEntityDeleted={handleEntityDeleted}
          onEntityUpdated={handleEntityUpdated}
        />
      ))}
    </div>
  );
}
