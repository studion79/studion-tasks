import { spawn } from "child_process";
import nodemailer from "nodemailer";
import type { AppLocale } from "@/i18n/config";

const FROM = (process.env.EMAIL_FROM ?? "Task App <contact@studio-n.fr>").trim();
const SENDMAIL_PATH = (process.env.SENDMAIL_PATH ?? "/usr/sbin/sendmail").trim();
const SMTP_HOST = process.env.SMTP_HOST?.trim();
const SMTP_PORT = Number(process.env.SMTP_PORT ?? "25");
const SMTP_SECURE = String(process.env.SMTP_SECURE ?? "false").toLowerCase() === "true";
const SMTP_USER = process.env.SMTP_USER?.trim();
const SMTP_PASS = process.env.SMTP_PASS?.trim();
const SMTP_TLS_SERVERNAME = process.env.SMTP_TLS_SERVERNAME?.trim();

function escapeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function buildRawMessage(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): string {
  const boundary = `taskapp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const to = escapeHeader(opts.to);
  const subject = escapeHeader(opts.subject);
  const text = opts.text ?? "Notification Task App";
  const html = opts.html;

  return [
    `From: ${FROM}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "",
    `--${boundary}--`,
    "",
  ].join("\n");
}

let smtpTransporter: nodemailer.Transporter | null = null;
function getSmtpTransporter(): nodemailer.Transporter | null {
  if (!SMTP_HOST) return null;
  if (smtpTransporter) return smtpTransporter;
  smtpTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number.isFinite(SMTP_PORT) ? SMTP_PORT : 25,
    secure: SMTP_SECURE,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    tls: SMTP_TLS_SERVERNAME ? { servername: SMTP_TLS_SERVERNAME } : undefined,
  });
  return smtpTransporter;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  const smtp = getSmtpTransporter();
  if (smtp) {
    await smtp.sendMail({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    return;
  }

  const raw = buildRawMessage(opts);

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(SENDMAIL_PATH, ["-t", "-i"], { stdio: ["pipe", "pipe", "pipe"] });

    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", (error) => {
      reject(new Error(`sendmail execution failed (${SENDMAIL_PATH}): ${error.message}`));
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`sendmail failed (code ${code}). ${stderr.trim()}`));
    });

    proc.stdin.write(raw);
    proc.stdin.end();
  });
}

export function invitationEmailHtml({
  locale,
  projectName,
  inviterName,
  inviteUrl,
  hasAccount,
}: {
  locale: AppLocale;
  projectName: string;
  inviterName: string;
  inviteUrl: string;
  hasAccount: boolean;
}): string {
  const isEn = locale === "en";
  const action = hasAccount
    ? (isEn ? "Accept invitation" : "Accepter l'invitation")
    : (isEn ? "Create account and join" : "Créer mon compte et rejoindre");

  return `
<!DOCTYPE html>
<html lang="${locale}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
    <div style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);padding:32px 40px;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${isEn ? "Project invitation" : "Invitation à rejoindre un projet"}</h1>
    </div>
    <div style="padding:32px 40px;">
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
        ${
          isEn
            ? `<strong>${inviterName}</strong> invited you to join project <strong>${projectName}</strong>.`
            : `<strong>${inviterName}</strong> vous invite à rejoindre le projet <strong>${projectName}</strong>.`
        }
      </p>
      ${
        !hasAccount
          ? `<p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6;">${
              isEn
                ? "You don't have an account yet. Click below to create one and join this project automatically."
                : "Vous n'avez pas encore de compte. Cliquez sur le bouton ci-dessous pour en créer un et rejoindre le projet automatiquement."
            }</p>`
          : `<p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6;">${
              isEn ? "Sign in to accept this invitation." : "Connectez-vous pour accepter l'invitation."
            }</p>`
      }
      <a href="${inviteUrl}"
         style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:600;">
        ${action}
      </a>
      <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;">
        ${
          isEn
            ? "This link is valid for 7 days. If you don't want to join this project, you can ignore this email."
            : "Ce lien est valable 7 jours. Si vous ne souhaitez pas rejoindre ce projet, ignorez cet email."
        }
      </p>
    </div>
  </div>
</body>
</html>`;
}
