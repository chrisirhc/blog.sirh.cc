import { getCollection } from "astro:content";
import { OGImageRoute } from "astro-og-canvas";

const collectionEntries = await getCollection("posts");

const pages: { [url: string]: any } = Object.fromEntries(
  collectionEntries.map(({ data }) => ["/post/" + data.slug, data])
);
console.log(pages);

export const { getStaticPaths, GET } = OGImageRoute({
  param: "route",
  pages: pages,
  getImageOptions: (path, page) => ({
    title: page.title,
    description: page.description,
  }),
});
