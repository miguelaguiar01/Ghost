import {
  isAdminUser,
  isAuthorUser,
  isContributorUser,
  isEditorUser,
  isOwnerUser,
  isSuperEditorUser,
} from '@tryghost/admin-x-framework/api/users';
import type { SettingsSectionId } from './settings/sections';

export type EditorRole =
  | 'Owner'
  | 'Administrator'
  | 'Super Editor'
  | 'Editor'
  | 'Author'
  | 'Contributor';

/** `publish` is the Publish, Update and Unpublish controls; `save` is a plain Save button. */
export type EditorHeaderAction = 'preview' | 'save' | 'publish';

export interface EditorPermissions {
  /** Whether the role sees each settings section; post type and labs flags can still hide one. */
  sections: Readonly<Record<SettingsSectionId, boolean>>;
  headerActions: readonly EditorHeaderAction[];
  /** Offers the email tab in the preview. */
  previewEmail: boolean;
  sendTestEmail: boolean;
  manageSnippets: boolean;
  /** Member labels in cards need `labels: browse`. */
  cardLabels: boolean;
  /** The show-title warning reads the active theme, which needs `theme: readActive`. */
  showTitleThemeWarning: boolean;
  /** Which opened posts send the user back to the list instead. */
  returnToList: { unauthored: boolean; nonDraft: boolean };
}

// Each row spells out every section, so a new section id fails to compile until
// every row decides on it.
const STAFF_SECTIONS: Readonly<Record<SettingsSectionId, boolean>> = {
  url: true,
  'publish-date': true,
  tags: true,
  access: true,
  excerpt: true,
  authors: true,
  template: true,
  'show-title-and-feature-image': true,
  featured: true,
  'post-history': true,
  'code-injection': true,
  'meta-data': true,
  'x-card': true,
  'facebook-card': true,
  'keyboard-shortcuts': true,
  delete: true,
};

const AUTHOR_SECTIONS: Readonly<Record<SettingsSectionId, boolean>> = {
  url: true,
  'publish-date': true,
  tags: true,
  access: false,
  excerpt: true,
  authors: false,
  template: true,
  'show-title-and-feature-image': true,
  featured: false,
  'post-history': true,
  'code-injection': true,
  'meta-data': true,
  'x-card': true,
  'facebook-card': true,
  'keyboard-shortcuts': true,
  delete: true,
};

const CONTRIBUTOR_SECTIONS: Readonly<Record<SettingsSectionId, boolean>> = {
  url: true,
  'publish-date': true,
  tags: false,
  access: false,
  excerpt: true,
  authors: false,
  template: true,
  'show-title-and-feature-image': true,
  featured: false,
  'post-history': true,
  'code-injection': true,
  'meta-data': true,
  'x-card': true,
  'facebook-card': true,
  'keyboard-shortcuts': true,
  delete: true,
};

const STAFF: EditorPermissions = {
  sections: STAFF_SECTIONS,
  headerActions: ['preview', 'publish'],
  previewEmail: true,
  sendTestEmail: true,
  manageSnippets: true,
  cardLabels: true,
  showTitleThemeWarning: true,
  returnToList: { unauthored: false, nonDraft: false },
};

export const EDITOR_ROLE_PERMISSIONS: Readonly<Record<EditorRole, EditorPermissions>> = {
  Owner: STAFF,
  Administrator: STAFF,
  'Super Editor': STAFF,
  Editor: STAFF,
  Author: {
    sections: AUTHOR_SECTIONS,
    headerActions: ['preview', 'publish'],
    previewEmail: true,
    sendTestEmail: false,
    manageSnippets: false,
    cardLabels: true,
    showTitleThemeWarning: true,
    returnToList: { unauthored: true, nonDraft: false },
  },
  Contributor: {
    sections: CONTRIBUTOR_SECTIONS,
    headerActions: ['preview', 'save'],
    previewEmail: false,
    sendTestEmail: false,
    manageSnippets: false,
    cardLabels: false,
    showTitleThemeWarning: false,
    returnToList: { unauthored: true, nonDraft: true },
  },
};

export type EditorUser = Parameters<typeof isOwnerUser>[0];

// Super Editor precedes Editor because the framework's editor check matches both.
const ROLE_PRECEDENCE: ReadonlyArray<[EditorRole, (user: EditorUser) => boolean]> = [
  ['Owner', isOwnerUser],
  ['Administrator', isAdminUser],
  ['Super Editor', isSuperEditorUser],
  ['Editor', isEditorUser],
  ['Author', isAuthorUser],
  ['Contributor', isContributorUser],
];

/** A user whose role is unknown, or not loaded yet, gets the most restricted row. */
export function editorPermissions(user: EditorUser | undefined): EditorPermissions {
  const role = user && ROLE_PRECEDENCE.find(([, matches]) => matches(user))?.[0];
  return EDITOR_ROLE_PERMISSIONS[role ?? 'Contributor'];
}
