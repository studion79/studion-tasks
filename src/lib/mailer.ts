/**
 * Mailer — wrapper Resend
 *
 * Config via env vars :
 *   RESEND_API_KEY  — clé API Resend (obligatoire pour l'envoi réel)
 *   EMAIL_FROM      — adresse expéditeur (ex: "Studio N Tasks <onboarding@resend.dev>")
 *   NEXT_PUBLIC_APP_URL — URL de base de l'app (ex: http://localhost:3000)
 *
 * Sans RESEND_API_KEY, les emails sont loggués en console (mode dev).
 */

import { Resend } from "resend";

const FROM =
  process.env.EMAIL_FROM ?? "Task App <onboarding@resend.dev>";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  const resend = getResend();

  if (!resend) {
    // Dev fallback — afficher dans la console
    console.log("📧  [MAIL — dev mode, non envoyé]");
    console.log("   To     :", opts.to);
    console.log("   Subject:", opts.subject);
    console.log("   ---");
    console.log(opts.text ?? opts.html);
    console.log("   ---");
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });

  if (error) {
    console.error("❌  Resend error:", error);
    throw new Error(`Resend: ${error.message}`);
  }
}

export function invitationEmailHtml({
  projectName,
  inviterName,
  inviteUrl,
  hasAccount,
}: {
  projectName: string;
  inviterName: string;
  inviteUrl: string;
  hasAccount: boolean;
}): string {
  const action = hasAccount
    ? "Accepter l'invitation"
    : "Créer mon compte et rejoindre";

  return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
    <div style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);padding:32px 40px;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Invitation à rejoindre un projet</h1>
    </div>
    <div style="padding:32px 40px;">
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
        <strong>${inviterName}</strong> vous invite à rejoindre le projet
        <strong>${projectName}</strong>.
      </p>
      ${
        !hasAccount
          ? `<p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6;">
          Vous n'avez pas encore de compte. Cliquez sur le bouton ci-dessous pour en créer un et rejoindre le projet automatiquement.
        </p>`
          : `<p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6;">
          Connectez-vous pour accepter l'invitation.
        </p>`
      }
      <a href="${inviteUrl}"
         style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:600;">
        ${action}
      </a>
      <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;">
        Ce lien est valable 7 jours. Si vous ne souhaitez pas rejoindre ce projet, ignorez cet email.
      </p>
    </div>
  </div>
</body>
</html>`;
}
