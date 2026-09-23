import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type EditorRole, editorPermissions } from './roles';
import { usePostSnippets } from './use-post-snippets';

vi.mock('@tryghost/admin-x-framework/api/snippets', () => ({
  useBrowseSnippets: () => ({ data: { snippets: [] } }),
  useAddSnippet: () => ({ mutateAsync: vi.fn() }),
  useEditSnippet: () => ({ mutateAsync: vi.fn() }),
  useDeleteSnippet: () => ({ mutateAsync: vi.fn() }),
}));

describe('usePostSnippets', () => {
  it.each<[EditorRole, boolean]>([
    ['Owner', true],
    ['Administrator', true],
    ['Super Editor', true],
    ['Editor', true],
    ['Author', false],
    ['Contributor', false],
  ])('%s manages snippets: %s', (name, manages) => {
    const { manageSnippets } = editorPermissions({ roles: [{ name }] });
    const { result } = renderHook(() => usePostSnippets({ canManage: manageSnippets }));

    expect(result.current.createSnippet !== undefined).toBe(manages);
    expect(result.current.deleteSnippet !== undefined).toBe(manages);
  });
});
