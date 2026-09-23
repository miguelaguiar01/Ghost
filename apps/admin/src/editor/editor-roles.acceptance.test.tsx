import { describe, expect, it } from 'vitest';
import { type Locator, page, userEvent } from 'vitest/browser';
import { buildLexicalParagraph } from '@tryghost/test-data';
import type { Snippet } from '@tryghost/admin-x-framework/api/snippets';

import {
  currentRoute,
  currentUserResponse,
  fakeAdminEndpoint,
  fakeNewsletters,
  fakePages,
  fakePosts,
  fakeSnippets,
  fakeThemes,
  post,
  renderAdminApp,
  staffRole,
  theme,
  withoutAutosave,
} from '@test-utils/acceptance';
import { editorScreen } from '@/editor/editor.screen';
import { EDITOR_ROLE_PERMISSIONS, type EditorPermissions, type EditorRole } from '@/editor/roles';
import { SETTINGS_SECTION_ORDER, type SettingsSectionId } from '@/editor/settings/sections';

const POST_ID = 'abc123';
const CURRENT_USER_ID = '1';
const FLAG_ON = withoutAutosave({ labs: { editorReact: true } });

const POLL = { timeout: 10_000 };

/** One locator per section; a page is booted so the page-only section renders too. */
const SECTION_LOCATORS: Record<SettingsSectionId, () => Locator> = {
  url: () => editorScreen.settingsSlug(),
  'publish-date': () => editorScreen.settingsPublishDate(),
  tags: () => editorScreen.settingsTagsField(),
  access: () => editorScreen.settingsVisibility(),
  excerpt: () => editorScreen.settingsExcerpt(),
  authors: () => editorScreen.settingsAuthors(),
  template: () => editorScreen.settingsTemplate(),
  'show-title-and-feature-image': () => editorScreen.settingsShowTitle(),
  featured: () => editorScreen.settingsFeatured(),
  'post-history': () => editorScreen.settingsPostHistory(),
  'code-injection': () => editorScreen.settingsSubviewRow('Code injection'),
  'meta-data': () => editorScreen.settingsSubviewRow('Meta data'),
  'x-card': () => editorScreen.settingsSubviewRow('X card'),
  'facebook-card': () => editorScreen.settingsSubviewRow('Facebook card'),
  'keyboard-shortcuts': () => editorScreen.settingsSubviewRow('Keyboard shortcuts'),
  delete: () => editorScreen.settingsDelete(),
};

const ROLES = Object.entries(EDITOR_ROLE_PERMISSIONS) as Array<[EditorRole, EditorPermissions]>;

function asRole(name: EditorRole) {
  const me = currentUserResponse();
  me.users[0].roles = [staffRole({ name })];
  return { ...FLAG_ON, boot: { browseMe: { response: me } } };
}

function editorChrome(snippets: Snippet[] = []) {
  fakeSnippets(snippets);
  fakePosts([]);
  fakePages([]);
  // The header's publish inputs read the newsletter list.
  fakeNewsletters([]);
  fakeThemes([
    theme({
      name: 'edition',
      active: true,
      templates: [{ filename: 'custom-wide', name: 'Wide', for: ['page', 'post'], slug: null }],
    }),
  ]);
}

function fakeRecord(
  type: 'post' | 'page',
  overrides: Partial<ReturnType<typeof post>>,
  snippets: Snippet[] = [],
) {
  editorChrome(snippets);
  fakeAdminEndpoint('GET', new RegExp(`^/${type}s/${POST_ID}/\\?`), {
    [`${type}s`]: [
      post({
        id: POST_ID,
        title: 'Hello from React',
        slug: 'hello-from-react',
        status: 'draft',
        lexical: buildLexicalParagraph('Hello from React'),
        published_at: null,
        authors: [{ id: CURRENT_USER_ID }],
        tags: [],
        ...overrides,
      }),
    ],
  });
}

const SIGN_OFF: Snippet = {
  id: 'snippet-1',
  name: 'Sign-off',
  mobiledoc: '{}',
  lexical: buildLexicalParagraph('Best wishes'),
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: null,
};

/** Opens the card menu on a new paragraph, with the Sign-off snippet listed. */
async function openCardMenu() {
  await editorScreen.body().click();
  await userEvent.keyboard('{End}{Enter}/');
  await expect.element(page.getByRole('menuitem', { name: 'Sign-off' })).toBeInTheDocument();
}

async function expectEditorStays(type: 'post' | 'page') {
  await expect.element(editorScreen.titleInput()).toHaveValue('Hello from React');
  expect(currentRoute()).toBe(`/editor/${type}/${POST_ID}`);
}

async function expectReturnedToList() {
  await expect.poll(currentRoute, POLL).toBe('/posts');
  await expect(editorScreen.root()).toHaveCount(0);
}

/** The role table is the expectation: every cell below is read from it. */
describe('Editor role permissions', () => {
  it.each(ROLES)(
    'gives %s the sections and header actions in its row',
    async (role, permissions) => {
      fakeRecord('page', {});
      await renderAdminApp(`/editor/page/${POST_ID}`, asRole(role));
      await editorScreen.settingsToggle().click();
      await expect.element(editorScreen.settingsSidebar()).toBeVisible();

      const shown = SETTINGS_SECTION_ORDER.filter((id) => permissions.sections[id]);
      const hidden = SETTINGS_SECTION_ORDER.filter((id) => !permissions.sections[id]);

      for (const id of shown) {
        await expect.element(SECTION_LOCATORS[id](), { message: id }).toBeVisible();
      }
      // Every shown section has rendered, so an absent one is not still loading.
      for (const id of hidden) {
        await expect(SECTION_LOCATORS[id](), id).toHaveCount(0);
      }

      const actions = permissions.headerActions;
      await expect(editorScreen.previewButton()).toHaveCount(actions.includes('preview') ? 1 : 0);
      await expect(editorScreen.publishButton()).toHaveCount(actions.includes('publish') ? 1 : 0);
      await expect(editorScreen.saveButton()).toHaveCount(actions.includes('save') ? 1 : 0);
    },
  );

  it.each(ROLES)(
    'applies the %s rule to a published post they wrote',
    async (role, permissions) => {
      fakeRecord('post', { status: 'published', published_at: '2025-12-01T10:00:00.000Z' });
      await renderAdminApp(`/editor/post/${POST_ID}`, asRole(role));

      await (permissions.returnToList.nonDraft
        ? expectReturnedToList()
        : expectEditorStays('post'));
    },
  );

  it.each(ROLES)('applies the %s rule to a draft someone else wrote', async (role, permissions) => {
    fakeRecord('post', { authors: [{ id: 'other-user' }] });
    await renderAdminApp(`/editor/post/${POST_ID}`, asRole(role));

    await (permissions.returnToList.unauthored
      ? expectReturnedToList()
      : expectEditorStays('post'));
  });
});

/** Hard-coded expectations, so a changed cell in the table fails here. */
describe('Editor role rules', () => {
  it('gives a Super Editor the staff-only settings and Publish', async () => {
    fakeRecord('page', {});
    await renderAdminApp(`/editor/page/${POST_ID}`, asRole('Super Editor'));
    await editorScreen.settingsToggle().click();

    await expect.element(editorScreen.settingsTagsField()).toBeVisible();
    await expect.element(editorScreen.settingsAuthors()).toBeVisible();
    await expect.element(editorScreen.settingsFeatured()).toBeVisible();
    await expect.element(editorScreen.settingsVisibility()).toBeVisible();
    await expect.element(editorScreen.publishButton()).toBeVisible();
    await expect(editorScreen.saveButton()).toHaveCount(0);
  });

  it('lets a Super Editor remove a snippet from the card menu', async () => {
    fakeRecord('post', {}, [SIGN_OFF]);
    await renderAdminApp(`/editor/post/${POST_ID}`, asRole('Super Editor'));
    await openCardMenu();

    await expect.element(page.getByTitle('Remove snippet')).toBeInTheDocument();
  });

  it('keeps Featured, Access and Authors from an Author but offers Preview and Publish', async () => {
    fakeRecord('page', {});
    await renderAdminApp(`/editor/page/${POST_ID}`, asRole('Author'));
    await editorScreen.settingsToggle().click();

    await expect.element(editorScreen.settingsTagsField()).toBeVisible();
    await expect.element(editorScreen.settingsDelete()).toBeVisible();
    await expect(editorScreen.settingsFeatured()).toHaveCount(0);
    await expect(editorScreen.settingsVisibility()).toHaveCount(0);
    await expect(editorScreen.settingsAuthors()).toHaveCount(0);
    await expect.element(editorScreen.previewButton()).toBeVisible();
    await expect.element(editorScreen.publishButton()).toBeVisible();
    await expect(editorScreen.saveButton()).toHaveCount(0);
  });

  it('lists snippets for a Contributor without letting them remove one', async () => {
    fakeRecord('post', {}, [SIGN_OFF]);
    await renderAdminApp(`/editor/post/${POST_ID}`, asRole('Contributor'));
    await openCardMenu();

    await expect(page.getByTitle('Remove snippet')).toHaveCount(0);
  });
});
