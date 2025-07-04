import React, { useState, useRef, useEffect } from 'react';
import { Drawer, DrawerContent } from '../ui/drawer';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  FolderTreeIcon,
  BookmarkIcon,
  FilePenIcon,
  FolderIcon,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tab';
import { ITreeNode } from '@/types';
import { useRouter } from 'next/router';

interface NavLink {
  title: string;
  url: string;
  Icon: React.FC<React.SVGProps<SVGSVGElement>>;
}

interface MobileDrawerProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  navLinks: NavLink[];
  isActiveUrl: (url: string) => boolean;
  toggleTheme: () => void;
  isDark: boolean;
  directoryTree?: Record<string, ITreeNode>;
}

interface DirectoryTreeMenuProps {
  nodes: Record<string, ITreeNode>;
  onSelectNode: (node: ITreeNode) => void;
  onSelectLink: () => void;
  isActiveUrl: (url: string) => boolean;
  autoScrollRef: React.RefObject<HTMLAnchorElement | null>;
}

const DirectoryTreeMenu: React.FC<DirectoryTreeMenuProps> = ({
  nodes,
  onSelectNode,
  onSelectLink,
  isActiveUrl,
  autoScrollRef,
}) => {
  const sortedNodes = Object.values(nodes).sort((a, b) => {
    const aIsFolder = a.children && Object.keys(a.children).length > 0;
    const bIsFolder = b.children && Object.keys(b.children).length > 0;

    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;
    return a.label.localeCompare(b.label);
  });

  return (
    <nav className="flex flex-1 flex-col divide-y divide-[#dbdbdb] px-5 dark:divide-[var(--border)]">
      {sortedNodes.map(node => {
        const hasChildren =
          node.children && Object.keys(node.children).length > 0;
        const isLink = node.url && !hasChildren;

        if (isLink) {
          const isActive = isActiveUrl(node.url!);
          return (
            <Link
              key={node.url}
              href={node.url!}
              className={cn(
                'hover:bg-muted dark:hover:bg-muted flex items-center justify-start text-sm transition-colors',
                'justify-between px-2 py-2',
                {
                  'text-primary': isActive,
                },
              )}
              onClick={onSelectLink}
              data-path={node.url}
              ref={isActive ? autoScrollRef : null}
            >
              <div className="flex items-center">
                <FilePenIcon
                  className={cn('h-4 w-4 flex-none', {
                    'text-muted-foreground': !isActive,
                    'text-primary': isActive,
                  })}
                />
                <span className="ml-3 inline-block">{node.label}</span>
              </div>
            </Link>
          );
        } else if (hasChildren) {
          return (
            <button
              key={node.label}
              onClick={() => onSelectNode(node)}
              className={cn(
                'hover:bg-muted dark:hover:bg-muted flex items-center justify-start text-sm transition-colors',
                'w-full justify-between px-2 py-2',
              )}
            >
              <div className="flex items-center">
                <FolderIcon className="text-muted-foreground h-4 w-4 flex-none" />
                <span className="ml-3 inline-block">{node.label}</span>
              </div>
            </button>
          );
        }
        return null;
      })}
    </nav>
  );
};

const DEFAULT_ROOT = './';

const MobileDrawer = ({
  isOpen,
  setIsOpen,
  handleKeyDown,
  navLinks,
  isActiveUrl,
  toggleTheme,
  isDark,
  directoryTree,
}: MobileDrawerProps) => {
  const router = useRouter();
  const isInitializedRef = useRef(false);
  const autoScrollRef = useRef<HTMLAnchorElement>(null);

  const [currentTreeLevel, setCurrentTreeLevel] = useState<
    Record<string, ITreeNode> | undefined
  >(directoryTree);
  const navigationStack = useRef<
    { level: Record<string, ITreeNode>; title: string }[]
  >([]);
  const [currentTitle, setCurrentTitle] = useState<string>(DEFAULT_ROOT);
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('mobileDrawerTab') || 'main';
    }
    return 'main';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('mobileDrawerTab', activeTab);
    }
  }, [activeTab]);

  const findPathInTree = (
    nodes: Record<string, ITreeNode>,
    targetPath: string,
    parentPaths: ITreeNode[] = [],
  ): { pathSegments: ITreeNode[]; leafNode: ITreeNode } | null => {
    for (const node of Object.values(nodes)) {
      if (node.url === targetPath) {
        return { pathSegments: [...parentPaths, node], leafNode: node };
      }

      if (node.children && Object.keys(node.children).length > 0) {
        const result = findPathInTree(node.children, targetPath, [
          ...parentPaths,
          node,
        ]);
        if (result) return result;
      }
    }
    return null;
  };

  const findFolderByPath = (
    nodes: Record<string, ITreeNode>,
    targetPathSegments: string[],
    currentSegmentIndex: number = 0,
    parentPaths: ITreeNode[] = [],
  ): { pathSegments: ITreeNode[]; folderNode: ITreeNode } | null => {
    if (currentSegmentIndex >= targetPathSegments.length) {
      return null; // Path segments exhausted, no folder found
    }

    const segmentLabel = targetPathSegments[currentSegmentIndex];

    for (const node of Object.values(nodes)) {
      if (node.label === segmentLabel) {
        const newParentPaths = [...parentPaths, node];
        if (currentSegmentIndex === targetPathSegments.length - 1) {
          // This is the last segment, check if it's a folder
          if (node.children && Object.keys(node.children).length > 0) {
            return { pathSegments: newParentPaths, folderNode: node };
          }
        } else if (node.children && Object.keys(node.children).length > 0) {
          // Not the last segment, but it's a folder, continue searching in children
          const result = findFolderByPath(
            node.children,
            targetPathSegments,
            currentSegmentIndex + 1,
            newParentPaths,
          );
          if (result) return result;
        }
      }
    }
    return null;
  };

  useEffect(() => {
    if (!directoryTree || !isOpen) return;

    const currentPath = router.asPath.endsWith('/')
      ? router.asPath.slice(0, -1)
      : router.asPath;

    const pathResult = findPathInTree(directoryTree, currentPath);

    if (pathResult) {
      // Case 1: A node with a URL matching the current path was found
      const { pathSegments, leafNode } = pathResult;

      const newNavigationStack: {
        level: Record<string, ITreeNode>;
        title: string;
      }[] = [];
      let tempCurrentTreeLevel: Record<string, ITreeNode> | undefined =
        directoryTree;
      let tempCurrentTitle: string = DEFAULT_ROOT;

      const leafNodeHasChildren =
        leafNode.children && Object.keys(leafNode.children).length > 0;

      if (leafNodeHasChildren) {
        // If the matched node is a folder (has children), navigate into it.
        // The navigation stack should include all parents up to this folder.
        for (let i = 0; i < pathSegments.length; i++) {
          const segment = pathSegments[i];
          newNavigationStack.push({
            level: tempCurrentTreeLevel!,
            title: tempCurrentTitle,
          });
          tempCurrentTreeLevel = segment.children;
          tempCurrentTitle = segment.label;
        }
      } else {
        // If the matched node is a file (no children), navigate to its parent's level.
        // The navigation stack should include all parents up to the parent of the leaf node.
        for (let i = 0; i < pathSegments.length - 1; i++) {
          const segment = pathSegments[i];
          newNavigationStack.push({
            level: tempCurrentTreeLevel!,
            title: tempCurrentTitle,
          });
          tempCurrentTreeLevel = segment.children;
          tempCurrentTitle = segment.label;
        }
      }

      setCurrentTreeLevel(tempCurrentTreeLevel);
      navigationStack.current = newNavigationStack;
      setCurrentTitle(tempCurrentTitle);

      // Auto-scroll the active link into view (only for actual links/files)
      setTimeout(() => {
        if (autoScrollRef.current) {
          let block: ScrollLogicalPosition = 'nearest';
          if (
            !isInitializedRef.current &&
            !checkInView(autoScrollRef.current)
          ) {
            block = 'center';
          }
          autoScrollRef.current.scrollIntoView({
            behavior: 'smooth',
            block,
            inline: 'start',
          });
        }
        isInitializedRef.current = true;
      }, 500);
    } else {
      // Case 2: No node with a URL was found. Check if the path corresponds to a folder node (without a URL).
      const pathSegments = currentPath.split('/').filter(s => s !== '');
      const folderResult = findFolderByPath(directoryTree, pathSegments);

      if (folderResult) {
        const { pathSegments: folderPathSegments } = folderResult;
        const newNavigationStack: {
          level: Record<string, ITreeNode>;
          title: string;
        }[] = [];
        let tempCurrentTreeLevel: Record<string, ITreeNode> | undefined =
          directoryTree;
        let tempCurrentTitle: string = DEFAULT_ROOT;

        // Navigate into the found folder
        for (let i = 0; i < folderPathSegments.length; i++) {
          const segment = folderPathSegments[i];
          newNavigationStack.push({
            level: tempCurrentTreeLevel!,
            title: tempCurrentTitle,
          });
          tempCurrentTreeLevel = segment.children;
          tempCurrentTitle = segment.label;
        }

        setCurrentTreeLevel(tempCurrentTreeLevel);
        navigationStack.current = newNavigationStack;
        setCurrentTitle(tempCurrentTitle);

        // No auto-scroll for folders, as per "only set the active node that contain the node that having no child"
      } else {
        // Case 3: No path found (neither file nor folder), reset to root
        setCurrentTreeLevel(directoryTree);
        navigationStack.current = [];
        setCurrentTitle(DEFAULT_ROOT);
      }
    }
  }, [isOpen, directoryTree, router.asPath]);

  const handleSelectNode = (node: ITreeNode) => {
    if (node.children) {
      navigationStack.current.push({
        level: currentTreeLevel!,
        title: currentTitle,
      }); // Store current level and its title
      setCurrentTreeLevel(node.children);
      setCurrentTitle(node.label);
    }
  };

  const handleBack = () => {
    if (navigationStack.current.length > 0) {
      const previousState = navigationStack.current.pop();
      setCurrentTreeLevel(previousState!.level);
      setCurrentTitle(previousState!.title); // Restore previous title
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={setIsOpen} direction="bottom">
      <DrawerContent
        hideHandle
        // height = search command palette height
        className="flex h-full !max-h-[538px] flex-col border"
        onKeyDown={handleKeyDown}
        role="navigation"
        style={{
          background: 'color-mix(in oklab, var(--background) 75%, transparent)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <div className="flex h-full flex-col justify-between">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex max-h-[calc(100%-66px)] flex-1 flex-col"
          >
            <div className="border-b border-[#dbdbdb] p-1 dark:border-[var(--border)]">
              <TabsList className="grid w-full grid-cols-2 !bg-transparent">
                <TabsTrigger className="!shadow-none" value="main">
                  <BookmarkIcon className="mr-2 h-4 w-4" /> Main
                </TabsTrigger>
                <TabsTrigger className="!shadow-none" value="tree">
                  <FolderTreeIcon className="mr-2 h-4 w-4" /> All pages
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent
              value="main"
              className="flex flex-1 flex-col overflow-y-auto"
            >
              {/* Navigation items */}
              <nav className="px-4 py-1">
                {navLinks.map(item => (
                  <Link
                    key={item.url}
                    href={item.url}
                    className={cn('flex items-center p-2 text-sm', {
                      'text-primary': isActiveUrl(item.url),
                    })}
                    onClick={() => setIsOpen(false)}
                  >
                    {item.Icon && (
                      <div className="cmd-idle-icon bg-primary/10 mr-3 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg">
                        <item.Icon className="text-primary h-4 w-4" />
                      </div>
                    )}
                    <span className="inline-block">{item.title}</span>
                  </Link>
                ))}
              </nav>
            </TabsContent>
            <TabsContent
              value="tree"
              className="m-0 flex flex-1 flex-col overflow-y-auto"
            >
              <div className="mx-4 flex items-center py-3">
                {navigationStack.current.length > 0 ? (
                  <button
                    onClick={handleBack}
                    className="text-muted-foreground m-0 flex items-center space-x-2 rounded-md p-0 leading-0"
                  >
                    ./
                    <span className="text-muted-foreground font-sans !text-sm font-medium">
                      {currentTitle}
                    </span>
                  </button>
                ) : (
                  <span className="text-muted-foreground font-sans !text-sm font-medium">
                    {currentTitle}
                  </span>
                )}
              </div>
              {currentTreeLevel && (
                <div className="flex-1 overflow-y-auto">
                  <DirectoryTreeMenu
                    nodes={currentTreeLevel}
                    onSelectNode={handleSelectNode}
                    onSelectLink={() => setIsOpen(false)}
                    isActiveUrl={isActiveUrl}
                    autoScrollRef={autoScrollRef}
                  />
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Theme toggle and Close Menu */}
          <div className="flex-none space-y-2 border border-t-[#dbdbdb] p-3 dark:border-[var(--border)]">
            <button
              className="bg-muted flex h-10 w-full items-center justify-center rounded-lg border text-sm font-medium"
              onClick={toggleTheme}
            >
              {isDark ? 'Turn Light Mode On' : 'Turn Dark Mode On'}
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default MobileDrawer;

function checkInView(element: Element | null) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  const inView =
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <=
      (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth);

  return inView;
}
