import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require("sharp") as typeof import("sharp");

export interface AvatarVariants {
  original: string;
  thumb: string;
  medium: string;
}

export interface OptimizedImage {
  imageUrl: string;
  imageUrlOptimized: string;
}

@Injectable()
export class ImageProcessingService {
  private ensureDir(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }

  private deleteSilently(filePath: string) {
    fs.unlink(filePath, () => {});
  }

  async processAvatar(
    inputPath: string,
    baseName: string,
    outputDir: string,
  ): Promise<AvatarVariants> {
    this.ensureDir(outputDir);

    const origFile = `${baseName}-orig.webp`;
    const thumbFile = `${baseName}-thumb.webp`;
    const mediumFile = `${baseName}-medium.webp`;

    const origOut = path.join(outputDir, origFile);
    const thumbOut = path.join(outputDir, thumbFile);
    const mediumOut = path.join(outputDir, mediumFile);

    const created: string[] = [];
    try {
      await sharp(inputPath).webp({ quality: 85 }).toFile(origOut);
      created.push(origOut);

      await sharp(inputPath)
        .resize(64, 64, { fit: "cover", position: "center" })
        .webp({ quality: 85 })
        .toFile(thumbOut);
      created.push(thumbOut);

      await sharp(inputPath)
        .resize(256, 256, { fit: "cover", position: "center" })
        .webp({ quality: 85 })
        .toFile(mediumOut);
      created.push(mediumOut);
    } catch (err) {
      for (const f of created) this.deleteSilently(f);
      throw err;
    } finally {
      this.deleteSilently(inputPath);
    }

    return {
      original: `/uploads/avatars/${origFile}`,
      thumb: `/uploads/avatars/${thumbFile}`,
      medium: `/uploads/avatars/${mediumFile}`,
    };
  }

  async processCover(
    inputPath: string,
    baseName: string,
    outputDir: string,
    originalsDir: string,
  ): Promise<OptimizedImage> {
    this.ensureDir(outputDir);
    this.ensureDir(originalsDir);

    const ext = path.extname(inputPath).toLowerCase() || ".jpg";
    const origFile = `${baseName}-orig${ext}`;
    const optimizedFile = `${baseName}.webp`;

    const origOut = path.join(originalsDir, origFile);
    const optimizedOut = path.join(outputDir, optimizedFile);

    try {
      fs.copyFileSync(inputPath, origOut);
      await sharp(inputPath)
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 90 })
        .toFile(optimizedOut);
    } catch (err) {
      this.deleteSilently(origOut);
      this.deleteSilently(optimizedOut);
      throw err;
    } finally {
      this.deleteSilently(inputPath);
    }

    return {
      imageUrl: `/uploads/covers/originals/${origFile}`,
      imageUrlOptimized: `/uploads/covers/${optimizedFile}`,
    };
  }

  async processEditorImage(
    inputPath: string,
    baseName: string,
    outputDir: string,
    originalsDir: string,
  ): Promise<OptimizedImage> {
    this.ensureDir(outputDir);
    this.ensureDir(originalsDir);

    const ext = path.extname(inputPath).toLowerCase() || ".jpg";
    const origFile = `${baseName}-orig${ext}`;
    const optimizedFile = `${baseName}.webp`;

    const origOut = path.join(originalsDir, origFile);
    const optimizedOut = path.join(outputDir, optimizedFile);

    try {
      fs.copyFileSync(inputPath, origOut);
      await sharp(inputPath)
        .resize({ width: 1920, withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(optimizedOut);
    } catch (err) {
      this.deleteSilently(origOut);
      this.deleteSilently(optimizedOut);
      throw err;
    } finally {
      this.deleteSilently(inputPath);
    }

    return {
      imageUrl: `/uploads/images/originals/${origFile}`,
      imageUrlOptimized: `/uploads/images/${optimizedFile}`,
    };
  }
}
