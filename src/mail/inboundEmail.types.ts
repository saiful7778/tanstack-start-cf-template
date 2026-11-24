/**
 * Inbound mail payload, modelled on Resend's receiving webhook.
 *
 * Only Resend delivers inbound mail, so this shape doubles as the webhook
 * contract; SMTP transports only send.
 */
export interface InboundEmailAttachment {
  id: string;
  filename: string | null;
  size: number;
  content_type: string;
  content_id: string | null;
  content_disposition: string | null;
}

export interface InboundEmailPayload {
  object: "email";
  id: string;
  to: string[];
  from: string;
  created_at: string;
  subject: string;
  bcc: string[] | null;
  cc: string[] | null;
  reply_to: string[] | null;
  received_for: string[];
  html: string | null;
  text: string | null;
  headers: Record<string, string> | null;
  message_id: string;
  raw?: { download_url: string; expires_at: string } | null;
  attachments: InboundEmailAttachment[];
}

export interface InboundEmailResult {
  success: boolean;
  emailId?: string;
  threadId?: string;
  error?: string;
}
