"use client";

import { useEffect, useState } from "react";
import { caseNotesService } from "@/services/database";
import { CaseNote } from "@/types/database";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface NotesPanelProps {
  caseId: string;
  open: boolean;
  onClose: () => void;
}

export default function NotesPanel({ caseId, open, onClose }: NotesPanelProps) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<CaseNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteType, setNoteType] = useState<CaseNote["note_type"]>("Observation");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!open) return;
      try {
        setLoading(true);
        setError(null);
        const data = await caseNotesService.getNotes(caseId);
        setNotes(data);
      } catch (e) {
        console.error("Failed to load notes", e);
        setError(e instanceof Error ? e.message : "Failed to load notes");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [open, caseId]);

  const handleAddNote = async () => {
    if (!content.trim()) return;
    if (!user?.id) {
      alert("Please sign in to add notes.");
      return;
    }
    try {
      setSubmitting(true);
      const created = await caseNotesService.addNote({
        caseId,
        note_type: noteType,
        content,
        attachments: null,
        userId: user.id,
      });
      setNotes((prev) => [created, ...prev]);
      setContent("");
      setNoteType("Observation");
    } catch (e) {
      console.error("Failed to add note", e);
      alert(e instanceof Error ? e.message : "Failed to add note");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:w-[480px]">
        <SheetHeader className="border-b border-gray-200">
          <SheetTitle>Case Notes</SheetTitle>
        </SheetHeader>

        {/* Composer */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <label className="text-sm text-gray-600">Type</label>
            <select
              className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white text-gray-700"
              value={noteType}
              onChange={(e) => setNoteType(e.target.value as CaseNote["note_type"])}
              disabled={!user?.id}
              title={user?.id ? undefined : "Sign in to add notes"}
            >
              <option value="Observation">Observation</option>
              <option value="Action">Action</option>
              <option value="Evidence">Evidence</option>
              <option value="Interview">Interview</option>
              <option value="Analysis">Analysis</option>
            </select>
          </div>
          <textarea
            className="w-full border border-gray-300 rounded-md p-2 text-sm focus:outline-none"
            rows={3}
            placeholder={user?.id ? "Write a note..." : "Sign in to write a note"}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={!user?.id}
          />
          <div className="mt-2 flex justify-end">
            <button
              className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-50"
              onClick={handleAddNote}
              disabled={!user?.id || submitting || !content.trim()}
            >
              {submitting ? "Adding..." : "Add Note"}
            </button>
          </div>
        </div>

        {/* Notes list */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-sm text-gray-500">Loading notes...</div>
          ) : error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : notes.length === 0 ? (
            <div className="text-sm text-gray-500">No notes yet.</div>
          ) : (
            <ul className="space-y-3">
              {notes.map((n) => (
                <li key={n.note_id} className="border border-gray-200 rounded-md p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-600">{n.note_type}</span>
                    <span className="text-[11px] text-gray-400">
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-sm text-gray-800 whitespace-pre-wrap">{n.content}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

