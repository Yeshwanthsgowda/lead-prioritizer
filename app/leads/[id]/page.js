// app/leads/[id]/page.js — STUB for Slice 3.
// Row clicks and "Open top lead" will navigate here. The real detail view
// (call brief, chat, post-call update) is built in Slice 3.

"use client";

import { useRouter } from "next/navigation";

export default function LeadDetailPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
      <p className="text-gray-500 text-sm">Lead detail coming in slice 3.</p>
      <button
        onClick={() => router.back()}
        className="text-indigo-600 text-sm font-medium hover:underline"
      >
        ← Back
      </button>
    </div>
  );
}
