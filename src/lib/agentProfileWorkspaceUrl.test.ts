import { describe, expect, it } from 'vitest';
import {
  parseAgentProfileWorkspaceSearch,
  updateAgentProfileWorkspaceSearch,
} from './agentProfileWorkspaceUrl';

describe('agent profile workspace URL state', () => {
  it('parses an authorized workspace profile and tab', () => {
    expect(parseAgentProfileWorkspaceSearch('?profile=profile-1&workspaceTab=history')).toEqual({
      profileId: 'profile-1',
      tab: 'history',
    });
  });

  it('falls back to overview for missing or unsupported tabs', () => {
    expect(parseAgentProfileWorkspaceSearch('?profile=profile-1')).toEqual({ profileId: 'profile-1', tab: 'overview' });
    expect(parseAgentProfileWorkspaceSearch('?profile=profile-1&workspaceTab=admin')).toEqual({ profileId: 'profile-1', tab: 'overview' });
  });

  it('preserves unrelated query state while updating workspace state', () => {
    expect(updateAgentProfileWorkspaceSearch('?q=customer&page=2', 'profile-1', 'activity'))
      .toBe('?q=customer&page=2&profile=profile-1&workspaceTab=activity');
    expect(updateAgentProfileWorkspaceSearch('?q=customer&profile=profile-1&workspaceTab=history', null))
      .toBe('?q=customer');
  });
});
