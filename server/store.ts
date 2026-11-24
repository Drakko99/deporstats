export interface Bucket {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  put(key: string, value: string): Promise<unknown>;
  list(options: { prefix: string }): Promise<{ objects: { key: string }[] }>;
}
export interface Environment { BUCKET?: Bucket; ODDSPAPI_API_KEY?: string; APP_PASSWORD?: string; SESSION_SECRET?: string; REQUIRE_AUTH?: boolean; ACCESS_MODE?: 'public' | 'private' }
export async function read<T>(env: Environment, key: string): Promise<T | null> {
  const obj = await env.BUCKET?.get(key); return obj ? JSON.parse(await obj.text()) as T : null;
}
export async function write(env: Environment, key: string, data: unknown): Promise<void> {
  if (!env.BUCKET) throw new Error('El almacenamiento del servidor no está configurado.');
  await env.BUCKET.put(key, JSON.stringify(data));
}
