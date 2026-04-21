"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { acceptInvitation, declineInvitation } from "@/lib/actions";
import { useClientLocale } from "@/lib/i18n/useClientLocale";
import { tKey } from "@/lib/i18n/messages";

type Invitation = {
  id: string;
  token: string;
  email: string;
  expiresAt: Date;
  createdAt: Date;
  project: { id: string; name: string; description: string | null };
};

export function PendingInvitationsSection({
  invitations,
  userId,
}: {
  invitations: Invitation[];
  userId: string;
}) {
  const [list, setList] = useState(invitations);
  const [isPending, startTransition] = useTransition();
  const pathname = usePathname();
  const locale = useClientLocale(pathname);
  const router = useRouter();

  const handleAccept = (token: string) => {
    startTransition(async () => {
      const projectId = await acceptInvitation(token, userId);
      router.push(`/projects/${projectId}`);
    });
  };

  const handleDecline = (token: string) => {
    startTransition(async () => {
      await declineInvitation(token);
      setList((prev) => prev.filter((i) => i.token !== token));
    });
  };

  if (list.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
          {list.length}
        </span>
        {list.length > 1 ? tKey(locale, "home.pendingInvitations") : tKey(locale, "home.pendingInvitation")}
      </h2>
      <div className="space-y-3">
        {list.map((inv) => (
          <div
            key={inv.id}
            className="bg-white dark:bg-gray-800 border border-indigo-100 dark:border-indigo-900/50 rounded-xl px-4 py-3.5 flex items-center gap-4 shadow-sm"
          >
            {/* Icon */}
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">{inv.project.name}</p>
              {inv.project.description && (
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{inv.project.description}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => handleDecline(inv.token)}
                disabled={isPending}
                className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {tKey(locale, "home.decline")}
              </button>
              <button
                onClick={() => handleAccept(inv.token)}
                disabled={isPending}
                className="text-xs font-medium bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {tKey(locale, "home.join")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
