import { serializeJsonLd } from '@/lib/seo';

export function JsonLdScripts({ schemas }: { schemas: Array<Record<string, unknown> | null | undefined> }) {
  return (
    <>
      {schemas.filter(Boolean).map((schema, idx) => (
        <script
          key={idx}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema as Record<string, unknown>) }}
        />
      ))}
    </>
  );
}
