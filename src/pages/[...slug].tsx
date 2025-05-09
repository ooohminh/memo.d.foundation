import React, { useEffect } from 'react';
import fs from 'fs';
import path from 'path';
import { GetStaticProps, GetStaticPaths } from 'next';

// Import utility functions from lib directory
import { getAllMarkdownFiles } from '../lib/content/paths';
import { getMarkdownContent } from '../lib/content/markdown';
import { getBacklinks } from '../lib/content/backlinks';

// Import components
import { RootLayout, ContentLayout } from '../components';
import SubscriptionSection from '../components/layout/SubscriptionSection';
import {
  IBackLinkItem,
  IMemoItem,
  IMetadata,
  ITocItem,
  RootLayoutPageProps,
} from '@/types';
import UtterancComments from '@/components/layout/UtterancComments';
import { getRootLayoutPageProps } from '@/lib/content/utils';
import { getAllMarkdownContents } from '@/lib/content/memo';
import Link from 'next/link';
import { formatMemoPath, getFirstMemoImage } from '@/components/memo/utils';
import { slugToTitle } from '@/lib/utils';
import MintEntry from '@/components/MintEntry/MintEntry';
import { useThemeContext } from '@/contexts/theme';

interface ContentPageProps extends RootLayoutPageProps {
  content: string;
  // eslint-disable-next-line  @typescript-eslint/no-explicit-any
  frontmatter?: Record<string, any>;
  slug: string[];
  backlinks?: IBackLinkItem[];
  tocItems?: ITocItem[];
  metadata?: IMetadata;
  isListPage?: boolean;
  childMemos?: IMemoItem[];
}

/**
 * Gets all possible paths for static generation
 * @returns Object with paths and fallback setting
 */
export const getStaticPaths: GetStaticPaths = async () => {
  // This function is called at build time to generate all possible paths
  // When using "output: export" we need to pre-render all paths
  // that will be accessible in the exported static site
  const contentDir = path.join(process.cwd(), 'public/content');

  const paths = getAllMarkdownFiles(contentDir)
    .filter(
      slugArray =>
        !slugArray[0]?.toLowerCase()?.startsWith('contributor') &&
        !slugArray[0]?.toLowerCase()?.startsWith('tags'),
    )
    .map(slugArray => ({
      params: { slug: slugArray },
    }));

  return {
    paths,
    fallback: false, // Must be 'false' for static export
  };
};

/**
 * Gets static props for the content page
 */
export const getStaticProps: GetStaticProps = async ({ params }) => {
  try {
    const { slug } = params as { slug: string[] };
    // Pass includeContent: false as we only need metadata for layout props
    const allMemos = await getAllMarkdownContents('', {
      includeContent: false,
    });
    const layoutProps = await getRootLayoutPageProps(allMemos);
    // Try multiple file path options to support Hugo's _index.md convention
    let filePath = path.join(process.cwd(), 'public/content', ...slug) + '.md';

    // If the direct path doesn't exist, check if there's an _index.md or readme.md file in the directory
    if (!fs.existsSync(filePath)) {
      const indexFilePath = path.join(
        process.cwd(),
        'public/content',
        ...slug,
        '_index.md',
      );
      const readmeFilePath = path.join(
        process.cwd(),
        'public/content',
        ...slug,
        'readme.md',
      );
      const directoryPath = path.join(process.cwd(), 'public/content', ...slug);

      if (fs.existsSync(readmeFilePath)) {
        // Prioritize readme.md if it exists
        filePath = readmeFilePath;
      } else if (fs.existsSync(indexFilePath)) {
        filePath = indexFilePath;
      } else if (fs.existsSync(directoryPath)) {
        // Pass includeContent: false as list page only needs title/path
        const allMemos = await getAllMarkdownContents(slug.join('/'), {
          includeContent: false,
        });
        return {
          props: {
            ...layoutProps,
            slug,
            childMemos: allMemos,
            isListPage: true,
          },
        };
      } else {
        return { notFound: true };
      }
    }

    // Get markdown content and frontmatter
    const { content, frontmatter, tocItems, rawContent, blockCount } =
      await getMarkdownContent(filePath);

    // Get backlinks
    const backlinks = await getBacklinks(slug);
    const metadata = {
      created: frontmatter.date?.toString() || null,
      updated: frontmatter.lastmod?.toString() || null,
      author: frontmatter.authors?.[0] || '',
      coAuthors: frontmatter.authors?.slice(1) || [],
      tags: Array.isArray(frontmatter.tags)
        ? frontmatter.tags.filter(
            tag => tag !== null && tag !== undefined && tag !== '',
          )
        : [],
      folder: slug.slice(0, -1).join('/'),
      // Calculate reading time based on word count (average reading speed: 200 words per minute)
      wordCount: content.split(/\s+/).length ?? 0,
      readingTime: `${Math.ceil(content.split(/\s+/).length / 200)}m`,
      // Additional character and block counts for metadata
      characterCount: content.length ?? 0,
      blocksCount: blockCount ?? 0,

      // Mint entry metadata
      tokenId: frontmatter.token_id || '',
      permaStorageId: frontmatter.perma_storage_id || '',
      title: frontmatter.title || '',
      authorRole: frontmatter.author_role || '',
      image: frontmatter.img || '',
      firstImage: getFirstMemoImage(
        {
          content: rawContent,
          filePath: path.join(...slug) + '.md',
        },
        null,
      ),
    };
    return {
      props: {
        ...layoutProps,
        content,
        frontmatter: JSON.parse(JSON.stringify(frontmatter)), // Ensure serializable
        slug,
        backlinks,
        tocItems,
        metadata,
        isListPage: false,
      },
    };
  } catch (error) {
    console.error('Error in getStaticProps:', error);
    return { notFound: true };
  }
};

export default function ContentPage({
  content,
  frontmatter,
  slug,
  backlinks,
  tocItems,
  metadata,
  directoryTree,
  searchIndex,
  isListPage,
  childMemos,
}: ContentPageProps) {
  const { theme, isThemeLoaded } = useThemeContext();

  useEffect(() => {
    // Only run mermaid initialization on the client side for content pages
    // and after the theme context has loaded
    if (
      typeof window !== 'undefined' &&
      !isListPage &&
      frontmatter &&
      isThemeLoaded
    ) {
      import('mermaid').then(mermaid => {
        try {
          // Determine Mermaid theme based on the application theme
          const mermaidTheme = theme === 'dark' ? 'dark' : 'neutral'; // Use 'neutral' or 'default' for light mode

          mermaid.default.initialize({
            startOnLoad: false, // We manually trigger rendering
            theme: mermaidTheme,
            // You can add more config options here if needed
          });

          // Find all elements that need Mermaid rendering
          const elements = document.querySelectorAll<HTMLElement>(
            'code.language-mermaid',
          );
          if (elements.length > 0) {
            // Convert NodeList to Array of HTMLElement for type compatibility
            const elementsArray = Array.from(elements);
            mermaid.default.run({ nodes: elementsArray });
          }
        } catch (error) {
          console.error('Failed to initialize or run Mermaid:', error);
        }
      });
    }
    // Rerun if content, page type, frontmatter, or theme changes
  }, [content, isListPage, frontmatter, theme, isThemeLoaded]);

  // Format metadata for display

  // Don't show subscription for certain pages
  const shouldShowSubscription =
    !frontmatter?.hide_subscription &&
    !['home', 'tags', 'contributor'].some(path => slug.includes(path));
  if (isListPage || !frontmatter) {
    const title = slug.map(slugToTitle).join(' > ');
    return (
      <RootLayout
        title={title}
        searchIndex={searchIndex}
        directoryTree={directoryTree}
      >
        <div className="flex items-center justify-center">
          {childMemos && (
            <div className="flex w-fit flex-col gap-4">
              <h1 className="text-2xl font-bold">{title}</h1>
              <ul className="list-disc pl-5">
                {childMemos.map(memo => (
                  <li key={memo.filePath} className="text-lg">
                    <Link
                      href={formatMemoPath(memo.filePath)}
                      className="hover:text-primary hover:decoration-primary dark:hover:text-primary line-clamp-3 text-[1.0625rem] -tracking-[0.0125rem] underline decoration-neutral-100 transition-colors duration-200 ease-in-out dark:text-neutral-300"
                    >
                      {memo.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </RootLayout>
    );
  }
  return (
    <RootLayout
      title={frontmatter.title || 'Dwarves Memo'}
      description={frontmatter.description}
      image={frontmatter.image}
      tocItems={tocItems}
      metadata={metadata}
      directoryTree={directoryTree}
      searchIndex={searchIndex}
    >
      <div className="content-wrapper">
        <ContentLayout
          title={frontmatter.title}
          description={frontmatter.description}
          backlinks={backlinks}
          hideFrontmatter={frontmatter.hide_frontmatter}
          hideTitle={frontmatter.hide_title}
        >
          {/* Render the HTML content safely */}
          <div
            className="article-content"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        </ContentLayout>

        {/* Only show subscription section on content pages, not special pages */}
        {shouldShowSubscription && <SubscriptionSection />}
        {!!metadata?.tokenId && <MintEntry metadata={metadata} />}
        <UtterancComments />
      </div>
    </RootLayout>
  );
}
