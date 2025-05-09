import { RootLayout } from '@/components';
import { getAllMarkdownContents } from '@/lib/content/memo';
import { getRootLayoutPageProps } from '@/lib/content/utils';
import { RootLayoutPageProps } from '@/types';
import { GetStaticProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router'; // Import useRouter
import React, { useEffect, useState } from 'react'; // Import useEffect, useState

export const getStaticProps: GetStaticProps = async () => {
  try {
    const allMemos = await getAllMarkdownContents();
    const layoutProps = await getRootLayoutPageProps(allMemos);

    return {
      props: layoutProps,
    };
  } catch (error) {
    console.error('Error in getStaticProps:', error);
    return {
      props: {
        featuredPosts: [],
      },
    };
  }
};

const NotFound = (props: RootLayoutPageProps) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [redirectChecked, setRedirectChecked] = useState(false);

  useEffect(() => {
    // Only run on the client side
    if (typeof window !== 'undefined') {
      const requestedPath = router.asPath; // Get the path the user tried to access

      console.log(`Checking for redirect for path: ${requestedPath}`);

      fetch('/content/redirects.json')
        .then(response => {
          if (!response.ok) {
            throw new Error('Redirects file not found or failed to load');
          }
          return response.json();
        })
        .then((redirects: Record<string, string>) => {
          const targetPath = redirects[requestedPath];
          if (targetPath) {
            console.log(`Redirect found: ${requestedPath} -> ${targetPath}`);
            // Use replace to avoid adding the 404 page to history
            router.replace(targetPath);
            // Keep loading state until redirect happens
          } else {
            console.log(`No redirect found for ${requestedPath}. Showing 404.`);
            // No redirect found, stop loading and show 404 content
            setIsLoading(false);
            setRedirectChecked(true);
          }
        })
        .catch(error => {
          console.log('Failed to load or parse redirects.json:', error);
          // Failed to load redirects, stop loading and show 404 content
          setIsLoading(false);
          setRedirectChecked(true);
        });
    }
  }, [router]); // Re-run if router object changes (though asPath is the key)

  // Show loading indicator or null while checking/redirecting
  if (isLoading || !redirectChecked) {
    // Optional: Add a loading spinner or message here
    return (
      <RootLayout {...props} title="Loading...">
        <div className="flex h-[calc(100vh-60px-24px-10rem)] w-full items-center justify-center">
          Loading...
        </div>
      </RootLayout>
    );
  }

  // If loading is finished and no redirect happened, show the 404 content
  return (
    <RootLayout {...props} title="404 - Page Not Found">
      <div className="font-charter flex h-[calc(100vh-60px-24px-10rem)] w-full flex-col items-center justify-center text-center">
        <h1 className="mt-0 flex items-end gap-[22px]">
          <span className="xs:text-[140px] border-none text-[100px] leading-[90%] font-normal tracking-[-3.04px]">
            4
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="dark:first:[&>path]:fill-background xs:h-[120px] xs:w-[120px] h-[80px] w-[80px] border-none"
            viewBox="0 0 138 138"
            fill="none"
          >
            <path
              d="M46.4107 6.16064H58.7321L62.8393 29.9821H94.875V10.2678L98.9821 6.16064H111.304L124.857 19.7142L133.071 35.7321L131.839 111.714L124.857 124.857L113.357 126.911L110.893 134.714H41.4821L17.25 108.839V47.6428L24.2321 43.1249L26.2857 32.8571L31.625 32.4464V20.9464L46.4107 6.16064Z"
              fill="#FAFAFA"
              className="dark:fill-background"
            />
            <path
              d="M96.1071 91.1786H115.821V97.75H96.1071V91.1786Z"
              fill="currentColor"
            />
            <path
              d="M96.1071 104.321H109.25V110.893H96.1071V104.321Z"
              fill="currentColor"
            />
            <path
              d="M65.7143 84.6071V91.1786H52.5714V84.6071H65.7143Z"
              fill="currentColor"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M46 0V6.57143H39.4286V13.1429H32.8571V19.7143H26.2857V32.8571H19.7143V46H13.1429V92H0V98.5714H13.1429V105.143H6.57143V111.714H19.7143V118.286H25.4643V124.857H32.0357V131.429H38.6071V138H111.714V131.429H124.857V124.857H131.429V111.714H138V32.8571H131.429V19.7143H124.857V13.1429H118.286V6.57143H111.714V0H98.5714V6.57143H92V26.2857H65.7143V6.57143H59.1429V0H46ZM59.1429 6.57143V32.8571H98.5714V6.57143H111.714V13.1429H118.286V19.7143H124.857V32.8571H131.429V111.714H124.857V124.857H111.714V131.429H38.6071V124.857H32.0357V118.286H26.2857V111.714H19.7143V46H26.2857V32.8571H32.8571V19.7143H39.4286V13.1429H46V6.57143H59.1429Z"
              fill="currentColor"
            />
            <rect
              x="35.3223"
              y="64.8931"
              width="6.57143"
              height="6.57143"
              fill="currentColor"
            />
            <rect
              x="41.8926"
              y="71.4644"
              width="6.57143"
              height="6.57143"
              fill="currentColor"
            />
            <rect
              x="28.75"
              y="58.3213"
              width="6.57143"
              height="6.57143"
              fill="currentColor"
            />
            <rect
              x="41.8926"
              y="58.3213"
              width="6.57143"
              height="6.57143"
              fill="currentColor"
            />
            <rect
              x="28.75"
              y="71.4644"
              width="6.57143"
              height="6.57143"
              fill="currentColor"
            />
            <rect
              x="85.4297"
              y="64.8931"
              width="6.57143"
              height="6.57143"
              fill="currentColor"
            />
            <rect
              x={92}
              y="71.4648"
              width="6.57143"
              height="6.57143"
              fill="currentColor"
            />
            <rect
              x="78.8574"
              y="58.3218"
              width="6.57143"
              height="6.57143"
              fill="currentColor"
            />
            <rect
              x={92}
              y="58.3218"
              width="6.57143"
              height="6.57143"
              fill="currentColor"
            />
            <rect
              x="78.8574"
              y="71.4648"
              width="6.57143"
              height="6.57143"
              fill="currentColor"
            />
          </svg>
          <span className="xs:text-[140px] border-none text-[100px] leading-[90%] font-normal tracking-[-3.04px]">
            4
          </span>
        </h1>

        <h2 className="mt-[18px] text-lg leading-[90%] font-normal tracking-[-0.64px] sm:mt-14 sm:text-2xl">
          UH...OH!
        </h2>

        <p className="mt-4 text-lg leading-[140%] font-normal tracking-[-0.2px] italic sm:mt-5 sm:text-2xl">
          &quot;Can a computer think? Can a submarine swim? Maybe that&apos;s
          why you&rsquo;re lost here.&rdquo;
        </p>

        <p className="mt-3.5 text-sm leading-6 font-normal sm:mt-5 sm:text-lg">
          It looks like you&apos;ve drifted into uncharted waters. Return to{' '}
          <Link href="/" className="text-primary hover:underline">
            homepage
          </Link>{' '}
          or search again
        </p>
      </div>
    </RootLayout>
  );
};

export default NotFound;
