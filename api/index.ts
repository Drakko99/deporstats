import { handleApi } from '../server/api';
import { createBlobBucket } from '../server/blob-store';

/** Entrada única para Vercel Functions. No escribe en el disco efímero de la función. */
export default {
  async fetch(request: Request): Promise<Response> {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const environment = process.env.VERCEL_ENV === 'production' ? 'production' : 'preview';
    return handleApi(request, {
      BUCKET: token ? createBlobBucket(token, `deporstats/${environment}/`) : undefined,
      ODDSPAPI_API_KEY: process.env.ODDSPAPI_API_KEY,
      APP_PASSWORD: process.env.APP_PASSWORD,
      ACCESS_MODE: process.env.ACCESS_MODE === 'private' ? 'private' : 'public',
      SESSION_SECRET: process.env.SESSION_SECRET,
      REQUIRE_AUTH: true
    });
  }
};
