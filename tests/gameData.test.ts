import { describe, expect, test } from 'vitest';
import {
  ROLE_DEFINITIONS,
  DEFAULT_SCENARIOS,
  ROLE_BUNDLES,
  ROLE_SEARCH_ALIASES,
  MULTI_INSTANCE_ROLE_IDS,
  validateScenario,
} from '../src/utils/scenarios';
import { COMPLETE_ROLES_DATABASE, getCompleteRoleInfo } from '../src/utils/rolesDatabase';
import { generateBalancedRoles, generateBotPlayers } from '../src/utils/testSimulator';
import { run18PlayerFullGameSimulation } from '../src/utils/fullGameSimulator';

const known = (id: string) => Boolean(ROLE_DEFINITIONS[id]);

describe('built-in scenarios', () => {
  test('ids are unique', () => {
    const ids = DEFAULT_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test.each(DEFAULT_SCENARIOS.map((s) => [s.id, s] as const))('%s is playable as shipped', (_id, s) => {
    expect(s.roles.length).toBe(s.recommendedPlayerCount);
    expect(s.roles.filter((r) => !known(r))).toEqual([]);
    const result = validateScenario(s.roles, s.recommendedPlayerCount);
    expect(result.errors).toEqual([]);
    expect(result.isValid).toBe(true);
    expect(result.roleCounts.mafia).toBeGreaterThan(0);
    expect(result.roleCounts.mafia).toBeLessThan(result.roleCounts.citizen);
  });
});

describe('role data', () => {
  test('every reference points at a defined role', () => {
    expect(Object.keys(COMPLETE_ROLES_DATABASE).filter((id) => !known(id))).toEqual([]);
    expect(Object.keys(ROLE_SEARCH_ALIASES).filter((id) => !known(id))).toEqual([]);
    expect([...MULTI_INSTANCE_ROLE_IDS].filter((id) => !known(id))).toEqual([]);
    for (const bundle of ROLE_BUNDLES) {
      expect(bundle.roles.filter((r) => !known(r)), `bundle ${bundle.id}`).toEqual([]);
    }
  });

  test('role guide entries always have both languages', () => {
    for (const [id, entry] of Object.entries(COMPLETE_ROLES_DATABASE)) {
      expect(entry.fa?.name, `${id} fa`).toBeTruthy();
      expect(entry.en?.name, `${id} en`).toBeTruthy();
    }
  });

  test('getCompleteRoleInfo never returns an empty name, in either language', () => {
    for (const id of Object.keys(ROLE_DEFINITIONS)) {
      expect(getCompleteRoleInfo(id, 'fa').localizedName, `${id} fa`).toBeTruthy();
      expect(getCompleteRoleInfo(id, 'en').localizedName, `${id} en`).toBeTruthy();
    }
  });

  test('an unknown role id falls back instead of crashing', () => {
    expect(getCompleteRoleInfo('NOT_A_ROLE', 'fa').id).toBe('CITIZEN_SIMPLE');
  });
});

describe('test-bench role generator', () => {
  test.each([9, 10, 11, 12, 14, 15, 18, 21])('%i players: one role each, mafia in the minority', (n) => {
    const roles = generateBalancedRoles(n);
    expect(roles.length).toBe(n);
    expect(roles.filter((r) => !known(r))).toEqual([]);
    const mafia = roles.filter((r) => ROLE_DEFINITIONS[r].affiliation === 'MAFIA').length;
    expect(mafia).toBeGreaterThan(0);
    expect(mafia * 2).toBeLessThan(n);
    expect(validateScenario(roles, n).errors).toEqual([]);
  });

  test('player count is clamped to 9..21', () => {
    expect(generateBalancedRoles(3).length).toBe(9);
    expect(generateBalancedRoles(40).length).toBe(21);
    expect(generateBotPlayers(3).length).toBe(9);
  });

  test('bots get unique seats and a role each', () => {
    const bots = generateBotPlayers(12);
    expect(new Set(bots.map((b) => b.seatNumber)).size).toBe(12);
    expect(bots.every((b) => known(b.role as string))).toBe(true);
  });
});

describe('full game simulation', () => {
  test('18-player run finishes without throwing', () => {
    const result = run18PlayerFullGameSimulation();
    expect(result).toBeTruthy();
  });
});
