import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "src/prisma.service";
import { CreateLegalDocumentDto } from "./dto/create-legal-document.dto";
import { FetchLegalDocumentsDto } from "./dto/fetch-legal-documents.dto";
import { UpdateLegalDocumentDto } from "./dto/update-legal-document.dto";

@Injectable()
export class AdminLegalService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: FetchLegalDocumentsDto) {
    return this.prisma.legalDocument.findMany({
      where: {
        ...(filter.slug ? { slug: filter.slug } : {}),
        ...(filter.lang ? { lang: filter.lang } : {}),
        ...(filter.isPublished !== undefined
          ? { isPublished: filter.isPublished }
          : {}),
      },
      orderBy: [{ slug: "asc" }, { lang: "asc" }],
    });
  }

  async getById(id: string) {
    const doc = await this.prisma.legalDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException("Legal document not found");
    return doc;
  }

  async create(dto: CreateLegalDocumentDto) {
    const isPublished = dto.isPublished ?? false;
    try {
      return await this.prisma.legalDocument.create({
        data: {
          slug: dto.slug,
          lang: dto.lang,
          title: dto.title,
          content: dto.content,
          isPublished,
          publishedAt: isPublished ? new Date() : null,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new ConflictException(
          `Legal document with slug "${dto.slug}" and lang "${dto.lang}" already exists`,
        );
      }
      throw e;
    }
  }

  /**
   * Изменения content поднимают version — это нужно для аудита (например, чтобы
   * отслеживать, какую редакцию ToS пользователь принял в момент регистрации).
   * Изменения только title не поднимают version.
   */
  async update(id: string, dto: UpdateLegalDocumentDto) {
    const current = await this.getById(id);

    const contentChanged =
      dto.content !== undefined && dto.content !== current.content;

    return this.prisma.legalDocument.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(contentChanged ? { version: { increment: 1 } } : {}),
      },
    });
  }

  async publish(id: string) {
    const current = await this.getById(id);
    if (current.isPublished) return current;
    return this.prisma.legalDocument.update({
      where: { id },
      data: { isPublished: true, publishedAt: new Date() },
    });
  }

  async unpublish(id: string) {
    const current = await this.getById(id);
    if (!current.isPublished) return current;
    return this.prisma.legalDocument.update({
      where: { id },
      data: { isPublished: false },
    });
  }

  async remove(id: string) {
    await this.getById(id);
    await this.prisma.legalDocument.delete({ where: { id } });
  }
}
