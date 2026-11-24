import type { DatabaseType } from "#/db/clients/drizzle-client";
import { EmailThreadTable, type InsertEmailThread } from "#/db/schemas";
import { eq } from "drizzle-orm";

import { MailError } from "../mail.error";

export interface IEmailThreadService {
  findOrCreateThread: (
    params: {
      threadId?: string | undefined;
      subject: string;
      contactEmail: string;
      contactName?: string | undefined;
    },
    database?: DatabaseType | undefined
  ) => Promise<string>;
}

export class EmailThreadService implements IEmailThreadService {
  constructor(private readonly database: DatabaseType) {}

  private resolveDB(database?: DatabaseType): DatabaseType {
    return database ?? this.database;
  }

  public async findOrCreateThread(
    params: {
      threadId?: string;
      subject: string;
      contactEmail: string;
      contactName?: string;
    },
    database?: DatabaseType
  ): Promise<string> {
    const db = this.resolveDB(database);

    if (params.threadId) {
      const [existThread] = await db
        .select({ id: EmailThreadTable.id })
        .from(EmailThreadTable)
        .where(eq(EmailThreadTable.id, params.threadId))
        .limit(1)
        .catch((error: unknown) => {
          throw new MailError(
            error instanceof Error
              ? error.message
              : "Failed to read mail thread",
            "MAIL_PERSISTENCE_FAILED",
            500,
            { threadId: params.threadId }
          );
        });

      if (!existThread) {
        throw new MailError(
          "Thread is not found",
          "MAIL_THREAD_NOT_FOUND",
          404,
          {
            threadId: params.threadId,
          }
        );
      }

      return existThread.id;
    }

    const [thread] = await db
      .insert(EmailThreadTable)
      .values({
        subject: params.subject,
        contactEmail: params.contactEmail,
        contactName: params.contactName,
      } satisfies InsertEmailThread)
      .returning({ id: EmailThreadTable.id })
      .catch((error: unknown) => {
        if (error instanceof MailError) throw error;

        throw new MailError(
          error instanceof Error ? error.message : "Failed to create thread",
          "MAIL_THREAD_CREATE_FAILED",
          500,
          { contactEmail: params.contactEmail }
        );
      });

    if (!thread) {
      throw new MailError(
        "Failed to create thread",
        "MAIL_THREAD_CREATE_FAILED",
        500,
        {
          contactEmail: params.contactEmail,
        }
      );
    }

    return thread.id;
  }
}
