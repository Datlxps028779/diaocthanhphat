import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();

  if (path === "robots.txt") {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const sitemapUrl = `${supabaseUrl}/functions/v1/sitemap/sitemap.xml`;
    const body = [
      "User-agent: *",
      "Allow: /",
      `Sitemap: ${sitemapUrl}`,
      "",
    ].join("\n");
    return new Response(body, {
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: properties } = await supabase
    .from("properties")
    .select("id, title, updated_at")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1000);

  const siteUrl = Deno.env.get("SITE_URL") || "https://bdsbinhduong.vn";

  const staticPages = [
    { loc: siteUrl, priority: "1.0", changefreq: "daily" },
    { loc: `${siteUrl}/?page=listings&type=mua_ban`, priority: "0.9", changefreq: "daily" },
    { loc: `${siteUrl}/?page=listings&type=cho_thue`, priority: "0.9", changefreq: "daily" },
    { loc: `${siteUrl}/?page=projects`, priority: "0.8", changefreq: "weekly" },
    { loc: `${siteUrl}/?page=news`, priority: "0.7", changefreq: "daily" },
    { loc: `${siteUrl}/?page=invest`, priority: "0.7", changefreq: "weekly" },
    { loc: `${siteUrl}/?page=about`, priority: "0.5", changefreq: "monthly" },
  ];

  const propertyUrls = (properties ?? []).map((p) => ({
    loc: `${siteUrl}/?page=property&id=${p.id}`,
    lastmod: new Date(p.updated_at).toISOString().slice(0, 10),
    priority: "0.8",
    changefreq: "weekly",
  }));

  const allUrls = [...staticPages, ...propertyUrls];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...allUrls.map((u) => [
      "  <url>",
      `    <loc>${u.loc}</loc>`,
      u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : "",
      `    <changefreq>${u.changefreq}</changefreq>`,
      `    <priority>${u.priority}</priority>`,
      "  </url>",
    ].filter(Boolean).join("\n")),
    "</urlset>",
  ].join("\n");

  return new Response(xml, {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
});
