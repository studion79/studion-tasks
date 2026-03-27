import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getInvitationByToken, acceptInvitation } from "@/lib/actions";
import InviteClient from "./InviteClient";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  const invitation = await getInvitationByToken(token);

  if (!invitation) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-8 w-full max-w-sm text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50 mb-2">Invitation invalide</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Ce lien d&apos;invitation est invalide ou a expiré.
          </p>
          <a href="/" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
            Retour à l&apos;accueil
          </a>
        </div>
      </div>
    );
  }

  if (invitation.acceptedAt) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-8 w-full max-w-sm text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M5 13l4 4L19 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50 mb-2">Déjà acceptée</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Cette invitation a déjà été acceptée.
          </p>
          <a href={`/projects/${invitation.projectId}`} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
            Ouvrir le projet
          </a>
        </div>
      </div>
    );
  }

  if (invitation.expiresAt < new Date()) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-8 w-full max-w-sm text-center">
          <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50 mb-2">Invitation expirée</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Ce lien d&apos;invitation a expiré. Demandez à être réinvité.
          </p>
          <a href="/" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
            Retour à l&apos;accueil
          </a>
        </div>
      </div>
    );
  }

  // L'invitation est valide — vérifier si l'utilisateur est connecté
  const session = await auth();

  if (session?.user?.id) {
    // Utilisateur connecté : on accepte directement côté serveur
    // si son email correspond à l'invitation
    const emailMatch = session.user.email?.toLowerCase() === invitation.email.toLowerCase();

    if (emailMatch) {
      const projectId = await acceptInvitation(token, session.user.id);
      redirect(`/projects/${projectId}`);
    }

    // Connecté mais email différent → afficher l'UI
    return (
      <InviteClient
        token={token}
        projectName={invitation.project.name}
        invitedEmail={invitation.email}
        isLoggedIn={true}
        loggedInEmail={session.user.email ?? ""}
        loggedInUserId={session.user.id}
        emailMatch={false}
      />
    );
  }

  // Non connecté
  return (
    <InviteClient
      token={token}
      projectName={invitation.project.name}
      invitedEmail={invitation.email}
      isLoggedIn={false}
      loggedInEmail=""
      loggedInUserId=""
      emailMatch={false}
    />
  );
}
