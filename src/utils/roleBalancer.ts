import { DEFAULT_SCENARIOS, ROLE_DEFINITIONS } from './scenarios';

// Dynamically generate full scenario roles map from all default scenarios
export const SCENARIO_ROLES_MAP: Record<string, string[]> = DEFAULT_SCENARIOS.reduce((acc, sc) => {
  acc[sc.id] = sc.roles;
  return acc;
}, {} as Record<string, string[]>);

export function isMafiaRole(r: string): boolean {
  if (!r) return false;
  return ROLE_DEFINITIONS[r]?.affiliation === 'MAFIA';
}

export function isCitizenRole(r: string): boolean {
  if (!r) return false;
  return ROLE_DEFINITIONS[r]?.affiliation === 'CITIZEN';
}

export function isIndependentRole(r: string): boolean {
  if (!r) return false;
  return ROLE_DEFINITIONS[r]?.affiliation === 'INDEPENDENT';
}

/**
 * Fisher-Yates uniform shuffle algorithm for mathematically fair role distribution.
 */
export function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const MULTI_ALLOWED_ROLES = new Set(['CITIZEN_SIMPLE', 'MAFIA_SIMPLE', 'CUSTOM']);

/**
 * Dynamic role balancer for tournament accuracy:
 * RULE 1: If player count matches deck size exactly, NEVER alter the pre-balanced scenario!
 * RULE 2: Uses real ROLE_DEFINITIONS affiliation (supports NATO, HOSTAGE_TAKER, SWEETHEART, etc.)
 * RULE 3: Never injects forced Godfather or Doctor into scenarios that don't have them.
 */
export function serverBalanceRoles(baseRoles: string[], targetCount: number): string[] {
  if (targetCount <= 0) return [];

  const defaultStarter = SCENARIO_ROLES_MAP['classic-9'] || [
    'GODFATHER', 'DOCTOR_LECTER', 'MAFIA_SIMPLE',
    'DOCTOR', 'DETECTIVE', 'SNIPER', 'ARMORED',
    'CITIZEN_SIMPLE', 'CITIZEN_SIMPLE'
  ];

  const sourceList = (baseRoles && baseRoles.length > 0) ? [...baseRoles] : defaultStarter;

  // Exact match: preserve handcrafted scenario balance 100% untouched
  if (sourceList.length === targetCount) {
    return [...sourceList];
  }

  // Sanitize duplicate unique roles
  const seenUnique = new Set<string>();
  const sanitized = sourceList.map(r => {
    if (!MULTI_ALLOWED_ROLES.has(r)) {
      if (seenUnique.has(r)) {
        return isMafiaRole(r) ? 'MAFIA_SIMPLE' : 'CITIZEN_SIMPLE';
      }
      seenUnique.add(r);
    }
    return r;
  });

  const list = [...sanitized];
  const targetMafia = Math.max(1, Math.floor(targetCount / 3));

  // Trim excess roles if room has fewer players than deck
  if (list.length > targetCount) {
    while (list.length > targetCount) {
      const currentMafia = list.filter(isMafiaRole).length;
      if (currentMafia > targetMafia) {
        const simpleMafiaIdx = list.lastIndexOf('MAFIA_SIMPLE');
        if (simpleMafiaIdx >= 0) {
          list.splice(simpleMafiaIdx, 1);
          continue;
        }
        const nonGfIdx = list.findIndex(r => isMafiaRole(r) && r !== 'GODFATHER' && r !== 'AL_CAPONE');
        if (nonGfIdx >= 0) {
          list.splice(nonGfIdx, 1);
          continue;
        }
      }
      const simpleCitIdx = list.lastIndexOf('CITIZEN_SIMPLE');
      if (simpleCitIdx >= 0) {
        list.splice(simpleCitIdx, 1);
        continue;
      }
      const nonEssentialCitIdx = list.findIndex(r => isCitizenRole(r) && r !== 'DOCTOR' && r !== 'DETECTIVE');
      if (nonEssentialCitIdx >= 0) {
        list.splice(nonEssentialCitIdx, 1);
        continue;
      }
      list.pop();
    }
  }

  // Expand with simple roles if room has more players than deck
  if (list.length < targetCount) {
    while (list.length < targetCount) {
      const currentMafia = list.filter(isMafiaRole).length;
      if (currentMafia < targetMafia) {
        list.push('MAFIA_SIMPLE');
      } else {
        list.push('CITIZEN_SIMPLE');
      }
    }
  }

  return list.slice(0, targetCount);
}
