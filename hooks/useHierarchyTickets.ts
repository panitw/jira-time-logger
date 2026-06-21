import { useQuery } from '@tanstack/react-query';
import { fetchHierarchy } from '@/lib/hierarchy';
import { log } from '@/lib/log';

export function useHierarchyTickets() {
  return useQuery({
    queryKey: ['hierarchy-tickets'],
    queryFn: async () => {
      const result = await fetchHierarchy();
      if (result.kind !== 'ok') {
        log.warn('hierarchy.query.failed', { kind: result.kind });
        throw result;
      }
      return result.value;
    },
    staleTime: 5 * 60 * 1000,
  });
}
