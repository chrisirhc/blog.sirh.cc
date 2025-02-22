import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
	site: "https://blog.sirh.cc/",
	base: "/",
	integrations: [sitemap()],
	markdown: {
		syntaxHighlight: false,
	},
});
