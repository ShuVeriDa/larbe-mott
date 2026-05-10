import { IsInt, IsString, Min } from 'class-validator';

export class CreatePageBookmarkDto {
  @IsString()
  textId: string;

  @IsInt()
  @Min(1)
  pageNumber: number;

  @IsString()
  snippet: string;
}
