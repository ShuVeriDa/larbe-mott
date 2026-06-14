import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ChScript, Prisma, ProcessingStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { TransliterationService } from 'src/transliteration/transliteration.service';
import { ErrorCode } from 'src/common/errors/error-codes';

@Injectable()
export class TextScriptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transliteration: TransliterationService,
  ) {}

  // ─── Library texts ────────────────────────────────────────────────────────

  async generateTextScriptVersion(textId: string, script: ChScript): Promise<void> {
    console.log('[SCRIPT DEBUG] generateTextScriptVersion called, textId:', textId, 'script:', script);
    const text = await this.prisma.text.findUnique({ where: { id: textId } });
    if (!text) throw new NotFoundException({ code: ErrorCode.TEXT_NOT_FOUND, message: 'Text not found' });

    const existing = await this.prisma.textScriptVersion.findUnique({
      where: { textId_script: { textId, script } },
    });
    if (existing?.status === ProcessingStatus.RUNNING) {
      throw new ConflictException({ code: 'SCRIPT_VERSION_ALREADY_RUNNING', message: 'Generation already in progress' });
    }

    const version = existing
      ? await this.prisma.textScriptVersion.update({
          where: { textId_script: { textId, script } },
          data: { status: ProcessingStatus.RUNNING, errorMessage: null },
        })
      : await this.prisma.textScriptVersion.create({
          data: { textId, script, status: ProcessingStatus.RUNNING },
        });

    // Fire-and-forget — do not await
    void this.runTextTransliteration(version.id, textId, script).catch(() => {});
  }

  async getTextScriptVersions(textId: string) {
    const text = await this.prisma.text.findUnique({ where: { id: textId } });
    if (!text) throw new NotFoundException({ code: ErrorCode.TEXT_NOT_FOUND, message: 'Text not found' });

    return this.prisma.textScriptVersion.findMany({
      where: { textId },
      select: { script: true, status: true, errorMessage: true, updatedAt: true },
    });
  }

  async updateTextScriptPage(
    textId: string,
    script: ChScript,
    pageNumber: number,
    contentRich: Record<string, unknown>,
  ) {
    const version = await this.prisma.textScriptVersion.findUnique({
      where: { textId_script: { textId, script } },
    });
    if (!version) throw new NotFoundException({ code: 'SCRIPT_VERSION_NOT_FOUND', message: 'Script version not found' });

    return this.prisma.textScriptPage.upsert({
      where: { versionId_pageNumber: { versionId: version.id, pageNumber } },
      create: { versionId: version.id, pageNumber, contentRich: contentRich as Prisma.InputJsonValue },
      update: { contentRich: contentRich as Prisma.InputJsonValue },
    });
  }

  async deleteTextScriptVersion(textId: string, script: ChScript): Promise<void> {
    const version = await this.prisma.textScriptVersion.findUnique({
      where: { textId_script: { textId, script } },
    });
    if (!version) throw new NotFoundException({ code: 'SCRIPT_VERSION_NOT_FOUND', message: 'Script version not found' });

    await this.prisma.textScriptVersion.delete({
      where: { textId_script: { textId, script } },
    });
  }

  async getTextPageWithScript(
    textId: string,
    pageNumber: number,
    script: ChScript,
  ): Promise<{ contentRich: Prisma.JsonValue } | null> {
    const version = await this.prisma.textScriptVersion.findUnique({
      where: { textId_script: { textId, script } },
    });
    if (!version || version.status !== ProcessingStatus.COMPLETED) return null;

    return this.prisma.textScriptPage.findUnique({
      where: { versionId_pageNumber: { versionId: version.id, pageNumber } },
      select: { contentRich: true },
    });
  }

  // ─── User texts ───────────────────────────────────────────────────────────

  async generateUserTextScriptVersion(
    userTextId: string,
    userId: string,
    script: ChScript,
  ): Promise<void> {
    console.log('[SCRIPT DEBUG] generateUserTextScriptVersion called, userTextId:', userTextId, 'script:', script);
    const userText = await this.prisma.userText.findUnique({ where: { id: userTextId } });
    if (!userText) throw new NotFoundException({ code: 'USER_TEXT_NOT_FOUND', message: 'UserText not found' });
    if (userText.userId !== userId) throw new NotFoundException({ code: 'USER_TEXT_NOT_FOUND', message: 'UserText not found' });

    const existing = await this.prisma.userTextScriptVersion.findUnique({
      where: { userTextId_script: { userTextId, script } },
    });
    if (existing?.status === ProcessingStatus.RUNNING) {
      throw new ConflictException({ code: 'SCRIPT_VERSION_ALREADY_RUNNING', message: 'Generation already in progress' });
    }

    const version = existing
      ? await this.prisma.userTextScriptVersion.update({
          where: { userTextId_script: { userTextId, script } },
          data: { status: ProcessingStatus.RUNNING, errorMessage: null },
        })
      : await this.prisma.userTextScriptVersion.create({
          data: { userTextId, script, status: ProcessingStatus.RUNNING },
        });

    void this.runUserTextTransliteration(version.id, userTextId, script).catch(() => {});
  }

  async getUserTextScriptVersions(userTextId: string, userId: string) {
    const userText = await this.prisma.userText.findUnique({ where: { id: userTextId } });
    if (!userText || userText.userId !== userId) {
      throw new NotFoundException({ code: 'USER_TEXT_NOT_FOUND', message: 'UserText not found' });
    }

    return this.prisma.userTextScriptVersion.findMany({
      where: { userTextId },
      select: { script: true, status: true, errorMessage: true, updatedAt: true },
    });
  }

  async updateUserTextScriptPage(
    userTextId: string,
    userId: string,
    script: ChScript,
    pageNumber: number,
    contentRich: Record<string, unknown>,
  ) {
    const userText = await this.prisma.userText.findUnique({ where: { id: userTextId } });
    if (!userText || userText.userId !== userId) {
      throw new NotFoundException({ code: 'USER_TEXT_NOT_FOUND', message: 'UserText not found' });
    }

    const version = await this.prisma.userTextScriptVersion.findUnique({
      where: { userTextId_script: { userTextId, script } },
    });
    if (!version) throw new NotFoundException({ code: 'SCRIPT_VERSION_NOT_FOUND', message: 'Script version not found' });

    return this.prisma.userTextScriptPage.upsert({
      where: { versionId_pageNumber: { versionId: version.id, pageNumber } },
      create: { versionId: version.id, pageNumber, contentRich: contentRich as Prisma.InputJsonValue },
      update: { contentRich: contentRich as Prisma.InputJsonValue },
    });
  }

  async deleteUserTextScriptVersion(
    userTextId: string,
    userId: string,
    script: ChScript,
  ): Promise<void> {
    const userText = await this.prisma.userText.findUnique({ where: { id: userTextId } });
    if (!userText || userText.userId !== userId) {
      throw new NotFoundException({ code: 'USER_TEXT_NOT_FOUND', message: 'UserText not found' });
    }

    const version = await this.prisma.userTextScriptVersion.findUnique({
      where: { userTextId_script: { userTextId, script } },
    });
    if (!version) throw new NotFoundException({ code: 'SCRIPT_VERSION_NOT_FOUND', message: 'Script version not found' });

    await this.prisma.userTextScriptVersion.delete({
      where: { userTextId_script: { userTextId, script } },
    });
  }

  async getUserTextPageWithScript(
    userTextId: string,
    userId: string,
    pageNumber: number,
    script: ChScript,
  ): Promise<{ contentRich: Prisma.JsonValue } | null> {
    const userText = await this.prisma.userText.findUnique({ where: { id: userTextId } });
    if (!userText || userText.userId !== userId) return null;

    const version = await this.prisma.userTextScriptVersion.findUnique({
      where: { userTextId_script: { userTextId, script } },
    });
    if (!version || version.status !== ProcessingStatus.COMPLETED) return null;

    return this.prisma.userTextScriptPage.findUnique({
      where: { versionId_pageNumber: { versionId: version.id, pageNumber } },
      select: { contentRich: true },
    });
  }

  // ─── Background processing ────────────────────────────────────────────────

  private async runTextTransliteration(
    versionId: string,
    textId: string,
    script: ChScript,
  ): Promise<void> {
    try {
      const pages = await this.prisma.textPage.findMany({
        where: { textId },
        orderBy: { pageNumber: 'asc' },
        select: { pageNumber: true, contentRich: true },
      });

      console.log('[SCRIPT DEBUG] pages count:', pages.length, 'script:', script);
      for (const page of pages) {
        console.log('[SCRIPT DEBUG] transliterating page', page.pageNumber);
        const transliterated = this.transliteration.transliterateTiptapJson(
          page.contentRich as object,
          script,
        );
        await this.prisma.textScriptPage.upsert({
          where: { versionId_pageNumber: { versionId, pageNumber: page.pageNumber } },
          create: {
            versionId,
            pageNumber: page.pageNumber,
            contentRich: transliterated as Prisma.InputJsonValue,
          },
          update: { contentRich: transliterated as Prisma.InputJsonValue },
        });
      }

      await this.prisma.textScriptVersion.update({
        where: { id: versionId },
        data: { status: ProcessingStatus.COMPLETED },
      });
    } catch (err) {
      await this.prisma.textScriptVersion.update({
        where: { id: versionId },
        data: {
          status: ProcessingStatus.ERROR,
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  private async runUserTextTransliteration(
    versionId: string,
    userTextId: string,
    script: ChScript,
  ): Promise<void> {
    try {
      const userText = await this.prisma.userText.findUnique({
        where: { id: userTextId },
        select: { content: true },
      });
      if (!userText) throw new Error('UserText not found during transliteration');

      console.log('[SCRIPT DEBUG] userText transliteration, script:', script);
      // UserText stores content as a single TipTap doc (not paginated like Text)
      const transliterated = this.transliteration.transliterateTiptapJson(
        userText.content as object,
        script,
      );

      await this.prisma.userTextScriptPage.upsert({
        where: { versionId_pageNumber: { versionId, pageNumber: 1 } },
        create: {
          versionId,
          pageNumber: 1,
          contentRich: transliterated as Prisma.InputJsonValue,
        },
        update: { contentRich: transliterated as Prisma.InputJsonValue },
      });

      await this.prisma.userTextScriptVersion.update({
        where: { id: versionId },
        data: { status: ProcessingStatus.COMPLETED },
      });
    } catch (err) {
      await this.prisma.userTextScriptVersion.update({
        where: { id: versionId },
        data: {
          status: ProcessingStatus.ERROR,
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }
}
