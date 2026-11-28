import type { MetadataRoute } from "next";

// Private beta: ask every search engine to stay out. Flip to allow "/" when launching publicly.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
