import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as React from 'react';
import { cn } from './utils';

function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>): React.ReactElement {
  return (
    <TabsPrimitive.List
      className={cn('flex gap-0 border-b border-neutral-200', className)}
      {...props}
    />
  );
}
TabsList.displayName = TabsPrimitive.List.displayName;

function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>): React.ReactElement {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'px-3 py-2 text-sm font-medium text-neutral-500 transition-colors',
        'hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
        'data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:text-neutral-900',
        className,
      )}
      {...props}
    />
  );
}
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

function TabsContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>): React.ReactElement {
  return (
    <TabsPrimitive.Content
      className={cn('focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2', className)}
      {...props}
    />
  );
}
TabsContent.displayName = TabsPrimitive.Content.displayName;

export const Tabs = TabsPrimitive.Root;
export { TabsList, TabsTrigger, TabsContent };