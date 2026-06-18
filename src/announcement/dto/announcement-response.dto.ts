export class AnnouncementResponseDto {
  id: string;
  title: string;
  body: string | null;
  textId: string | null;
  textTitle: string | null;
  createdById: string;
  createdAt: Date;
}
