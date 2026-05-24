import { existsSync, statSync } from "fs";
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

const DEFAULT_PATHS = [
  "/data/geoip/GeoLite2-City.mmdb",
  "/data/geoip/GeoLite2-Country.mmdb",
];

interface GeoIpStatus {
  configured: boolean;
  databasePath: string;
  databaseExists: boolean;
  databaseType: string | null;
  supportsCity: boolean;
  loadedAt: string | null;
  fileSize: number | null;
  buildEpoch: string | null;
}

/**
 * Graceful GeoIP stub — works without a real mmdb file.
 * When the file is present, delegates to maxmind.
 * Without the file, lookup() returns { country: null, city: null } silently.
 */
@Injectable()
export class GeoIpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GeoIpService.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private reader: any = null;
  private cachedStatus: GeoIpStatus | null = null;

  async onModuleInit(): Promise<void> {
    const candidates = this.pathCandidates();
    const found = candidates.find((p) => existsSync(p));

    if (!found) {
      this.logger.log(
        `GeoIP not configured (checked: ${candidates.join(", ")}). country/city will be null.`,
      );
      this.cachedStatus = {
        configured: false,
        databasePath: candidates[0],
        databaseExists: false,
        databaseType: null,
        supportsCity: false,
        loadedAt: null,
        fileSize: null,
        buildEpoch: null,
      };
      return;
    }

    try {
      // Dynamic import so the module still loads without maxmind installed.
      const maxmind = await import("maxmind");
      this.reader = await maxmind.open(found, { cache: { max: 4096 } });

      const databaseType = this.reader.metadata.databaseType as string;
      const supportsCity = /City/i.test(databaseType);
      const loadedAt = new Date().toISOString();
      const buildEpoch =
        this.reader.metadata.buildEpoch instanceof Date
          ? (this.reader.metadata.buildEpoch as Date).toISOString()
          : null;
      let fileSize: number | null = null;
      try { fileSize = statSync(found).size; } catch { /* ignore */ }

      this.cachedStatus = {
        configured: true,
        databasePath: found,
        databaseExists: true,
        databaseType,
        supportsCity,
        loadedAt,
        fileSize,
        buildEpoch,
      };

      this.logger.log(`GeoIP loaded: ${found} (${databaseType})`);
    } catch (err) {
      this.logger.warn(
        `GeoIP mmdb at ${found} present but failed to open: ${(err as Error).message}`,
      );
      this.cachedStatus = {
        configured: false,
        databasePath: found,
        databaseExists: true,
        databaseType: null,
        supportsCity: false,
        loadedAt: null,
        fileSize: null,
        buildEpoch: null,
      };
    }
  }

  onModuleDestroy(): void {
    this.reader = null;
  }

  lookup(ip: string): { country: string | null; city: string | null } {
    if (!this.reader || !ip) return { country: null, city: null };
    try {
      const r = this.reader.get(ip);
      if (!r) return { country: null, city: null };
      const country = r.country?.iso_code ?? null;
      const city = this.cachedStatus?.supportsCity ? (r.city?.names?.en ?? null) : null;
      return { country, city };
    } catch {
      return { country: null, city: null };
    }
  }

  getStatus(): GeoIpStatus {
    return this.cachedStatus ?? {
      configured: false,
      databasePath: this.pathCandidates()[0],
      databaseExists: false,
      databaseType: null,
      supportsCity: false,
      loadedAt: null,
      fileSize: null,
      buildEpoch: null,
    };
  }

  private pathCandidates(): string[] {
    const fromEnv = process.env.GEOIP_MMDB_PATH?.trim();
    if (fromEnv) return [fromEnv];
    return DEFAULT_PATHS;
  }
}
